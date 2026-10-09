/*
 * ra-guard: tell LAN hosts that an old IPv6 prefix and its router are gone
 * once the mobile network hands the modem a new one.
 *
 * QCMAP's radish relays the router advertisement of the mobile network to
 * bridge0 unchanged: the /64 comes with infinite valid and preferred
 * lifetimes, the router (the PGW link-local address, a different one for
 * every PDN session) with a lifetime of 65535 s. When the session comes
 * back with another prefix radish just starts relaying the new one, so the
 * hosts keep the old prefix as valid and preferred forever, keep sourcing
 * traffic from an address the operator no longer routes, and keep the old
 * router, now unreachable, as a default router for up to 18 hours.
 *
 * ra-guard watches the prefixes radish routes on bridge0 and learns the
 * router of each from the advertisements it sees. When a prefix goes away
 * and another one takes its place, the old prefix and router become stale:
 * for a week ra-guard advertises them on the LAN with lifetime 0 (prefix
 * deprecated at once and dropped by the hosts within two hours, RFC 4862
 * 5.5.3; router timed out at once, RFC 4861 6.3.4), three times in a row,
 * then every five minutes and in answer to every router solicitation.
 * The current router is never withdrawn. Stale entries survive a reboot in
 * the state file.
 *
 * It keeps multicast snooping off on the bridge. The firmware leaves it on,
 * with bridge0 as the MLD querier, but no LAN host ever shows up in its
 * group table, so multicast to a group it has not registered (the
 * solicited-node address of a neighbor, in every neighbor solicitation)
 * never leaves through eth0: the modem cannot resolve the IPv6 addresses
 * of the LAN hosts and drops the traffic coming back to them. A udev rule
 * (deploy/ra-guard/udev) turns it off when the bridge is created; ra-guard
 * puts it back off if anything turns it on later.
 *
 *   ra-guard run  [-i IFACE] [-s STATE] [-w WINDOW_S] [-t INTERVAL_S]
 *   ra-guard dump [-i IFACE]   print every RA/RS seen (IFACE "any": all)
 *   ra-guard rs   [-i IFACE]   send one router solicitation on IFACE
 */
#include <arpa/inet.h>
#include <errno.h>
#include <linux/filter.h>
#include <linux/if_packet.h>
#include <net/ethernet.h>
#include <net/if.h>
#include <netinet/icmp6.h>
#include <netinet/ip6.h>
#include <poll.h>
#include <signal.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <time.h>
#include <unistd.h>

#define MAX_PREFIXES 8
#define MAX_STALE 8
#define POLL_S 15
#define BURST 3
#define BURST_GAP_S 4
/* 2024-01-01: earlier means the clock has not been set since boot */
#define SANE_CLOCK 1704067200

/* Source of the advertisements that withdraw no router: a link-local
 * address nobody uses, so that its router lifetime of 0 touches no entry
 * of the hosts' default router lists. */
static const char *NEUTRAL_SRC = "fe80::5241:4744";

static const char *iface = "bridge0";
static const char *state_path = "/data/simpleadmin/ra-guard.state";
static long window_s = 7 * 24 * 3600;
static long interval_s = 300;

struct prefix {
    struct in6_addr addr;
    unsigned int len;
};

struct stale {
    struct prefix pfx;
    struct in6_addr router; /* unspecified when never learned */
    time_t since;           /* 0 while the clock was not set yet */
    int burst;              /* advertisements still owed in the burst */
    time_t next;
};

static struct prefix cur[MAX_PREFIXES];
static int ncur;
static struct in6_addr cur_router[MAX_PREFIXES];
static struct stale stale[MAX_STALE];
static int nstale;

static void logmsg(const char *fmt, ...) __attribute__((format(printf, 1, 2)));
static void logmsg(const char *fmt, ...)
{
    va_list ap;
    va_start(ap, fmt);
    vprintf(fmt, ap);
    va_end(ap);
    putchar('\n');
    fflush(stdout);
}

static const char *ntop(const struct in6_addr *a)
{
    static char buf[4][INET6_ADDRSTRLEN];
    static int i;
    i = (i + 1) % 4;
    inet_ntop(AF_INET6, a, buf[i], sizeof(buf[i]));
    return buf[i];
}

static int is_unspec(const struct in6_addr *a)
{
    return IN6_IS_ADDR_UNSPECIFIED(a);
}

static int same_prefix(const struct prefix *a, const struct prefix *b)
{
    return a->len == b->len && memcmp(&a->addr, &b->addr, 16) == 0;
}

static void mask_prefix(struct prefix *p)
{
    unsigned int i;
    for (i = 0; i < 128; i++)
        if (i >= p->len)
            p->addr.s6_addr[i / 8] &= (uint8_t)~(0x80 >> (i % 8));
}

/* ---------------------------------------------------------------- state */

static void save_state(void)
{
    char tmp[256];
    FILE *f;
    int i;

    snprintf(tmp, sizeof(tmp), "%s.tmp", state_path);
    f = fopen(tmp, "w");
    if (!f) {
        logmsg("⚠️  cannot write %s: %s", tmp, strerror(errno));
        return;
    }
    for (i = 0; i < ncur; i++)
        fprintf(f, "current %s/%u %s\n", ntop(&cur[i].addr), cur[i].len,
                is_unspec(&cur_router[i]) ? "-" : ntop(&cur_router[i]));
    for (i = 0; i < nstale; i++)
        fprintf(f, "stale %s/%u %s %ld\n", ntop(&stale[i].pfx.addr),
                stale[i].pfx.len,
                is_unspec(&stale[i].router) ? "-" : ntop(&stale[i].router),
                (long)stale[i].since);
    if (fclose(f) != 0 || rename(tmp, state_path) != 0)
        logmsg("⚠️  cannot write %s: %s", state_path, strerror(errno));
}

static int parse_prefix(const char *s, struct prefix *p)
{
    char buf[64];
    char *slash;

    snprintf(buf, sizeof(buf), "%s", s);
    slash = strchr(buf, '/');
    if (!slash)
        return -1;
    *slash = 0;
    p->len = (unsigned int)atoi(slash + 1);
    if (p->len > 128 || inet_pton(AF_INET6, buf, &p->addr) != 1)
        return -1;
    mask_prefix(p);
    return 0;
}

static void load_state(void)
{
    char line[256], kind[16], pfx[64], rtr[64];
    long since;
    FILE *f = fopen(state_path, "r");

    if (!f)
        return;
    while (fgets(line, sizeof(line), f)) {
        struct prefix p;
        struct in6_addr r = IN6ADDR_ANY_INIT;
        int n = sscanf(line, "%15s %63s %63s %ld", kind, pfx, rtr, &since);

        /* only /64s: older versions also recorded radish's aggregates */
        if (n < 3 || parse_prefix(pfx, &p) != 0 || p.len != 64)
            continue;
        if (strcmp(rtr, "-") != 0 && inet_pton(AF_INET6, rtr, &r) != 1)
            continue;
        if (strcmp(kind, "current") == 0 && ncur < MAX_PREFIXES) {
            cur[ncur] = p;
            cur_router[ncur++] = r;
        } else if (strcmp(kind, "stale") == 0 && n == 4 && nstale < MAX_STALE) {
            struct stale *s = &stale[nstale++];
            s->pfx = p;
            s->router = r;
            s->since = (time_t)since;
            s->burst = BURST;
            s->next = 0;
        }
    }
    fclose(f);
}

/* ------------------------------------------------- prefixes and routers */

/* The global prefixes radish routes on IFACE, from /proc/net/ipv6_route. */
static int read_prefixes(struct prefix *out)
{
    char line[512], dst[33], dev[IF_NAMESIZE + 1];
    unsigned int plen;
    int n = 0;
    FILE *f = fopen("/proc/net/ipv6_route", "r");

    if (!f)
        return -1;
    while (fgets(line, sizeof(line), f) && n < MAX_PREFIXES) {
        struct prefix p;
        int i;

        if (sscanf(line, "%32s %x %*s %*s %*s %*s %*s %*s %*s %16s",
                   dst, &plen, dev) != 3 || strcmp(dev, iface) != 0)
            continue;
        for (i = 0; i < 16; i++) {
            unsigned int b;
            sscanf(dst + 2 * i, "%2x", &b);
            p.addr.s6_addr[i] = (uint8_t)b;
        }
        p.len = plen;
        /* only on-link global unicast /64s (2000::/3): no default, no
         * link-local, no ULA, no host routes, and none of the shorter
         * aggregates radish sometimes adds next to the /64 */
        if (plen != 64 || (p.addr.s6_addr[0] & 0xe0) != 0x20)
            continue;
        for (i = 0; i < n; i++)
            if (same_prefix(&out[i], &p))
                break;
        if (i == n)
            out[n++] = p;
    }
    fclose(f);
    return n;
}

static int find_cur(const struct prefix *p)
{
    int i;
    for (i = 0; i < ncur; i++)
        if (same_prefix(&cur[i], p))
            return i;
    return -1;
}

/* True when R may be one of the current routers: it is, or a current
 * router is still unknown (it may turn out to be R). */
static int maybe_cur_router(const struct in6_addr *r)
{
    int i;
    for (i = 0; i < ncur; i++)
        if (is_unspec(&cur_router[i]) || memcmp(&cur_router[i], r, 16) == 0)
            return 1;
    return 0;
}

static void add_stale(const struct prefix *p, const struct in6_addr *router)
{
    struct stale *s;
    int i;

    for (i = 0; i < nstale; i++)
        if (same_prefix(&stale[i].pfx, p))
            break;
    if (i == nstale) {
        if (nstale == MAX_STALE) {
            /* drop the oldest */
            memmove(&stale[0], &stale[1], sizeof(stale[0]) * (MAX_STALE - 1));
            nstale--;
        }
        i = nstale++;
    }
    s = &stale[i];
    s->pfx = *p;
    s->router = *router;
    s->since = time(NULL) >= SANE_CLOCK ? time(NULL) : 0;
    s->burst = BURST;
    s->next = 0;
    logmsg("🧹 %s/%u is stale (router %s): deprecating it on %s",
           ntop(&p->addr), p->len, is_unspec(router) ? "unknown" : ntop(router),
           iface);
}

static void drop_stale(int i)
{
    memmove(&stale[i], &stale[i + 1], sizeof(stale[0]) * (size_t)(nstale - i - 1));
    nstale--;
}

/* Returns 1 when the state changed. */
static int refresh_prefixes(int *changed_prefix)
{
    struct prefix now[MAX_PREFIXES];
    struct in6_addr now_router[MAX_PREFIXES];
    int n = read_prefixes(now), i, j, changed = 0, added = 0;

    *changed_prefix = 0;
    /* A prefix is replaced only when a new one shows up: a prefix that just
     * disappears belongs to a session that is down or restarting, and may
     * come back as it was. */
    for (i = 0; i < n; i++)
        if (find_cur(&now[i]) < 0)
            added++;
    if (n <= 0 || added == 0)
        return 0;
    for (i = 0; i < n; i++) {
        j = find_cur(&now[i]);
        memset(&now_router[i], 0, 16);
        if (j >= 0)
            now_router[i] = cur_router[j];
        else
            changed = 1;
        /* a prefix that came back is not stale any more */
        for (j = 0; j < nstale; j++)
            if (same_prefix(&stale[j].pfx, &now[i])) {
                logmsg("✅ %s/%u is current again", ntop(&now[i].addr), now[i].len);
                drop_stale(j);
                break;
            }
    }
    for (i = 0; i < ncur; i++) {
        for (j = 0; j < n; j++)
            if (same_prefix(&cur[i], &now[j]))
                break;
        if (j == n) {
            add_stale(&cur[i], &cur_router[i]);
            changed = 1;
        }
    }
    if (changed) {
        memcpy(cur, now, sizeof(now[0]) * (size_t)n);
        memcpy(cur_router, now_router, sizeof(now_router[0]) * (size_t)n);
        ncur = n;
        for (i = 0; i < ncur; i++)
            logmsg("🌐 current prefix %s/%u", ntop(&cur[i].addr), cur[i].len);
        *changed_prefix = 1;
    }
    return changed;
}

/* ------------------------------------------------------------- packets */

static uint16_t icmp6_csum(const struct in6_addr *src, const struct in6_addr *dst,
                           const uint8_t *data, size_t len)
{
    uint32_t sum = 0;
    size_t i;

    for (i = 0; i < 16; i += 2) {
        sum += (uint32_t)(src->s6_addr[i] << 8 | src->s6_addr[i + 1]);
        sum += (uint32_t)(dst->s6_addr[i] << 8 | dst->s6_addr[i + 1]);
    }
    sum += (uint32_t)len;
    sum += IPPROTO_ICMPV6;
    for (i = 0; i + 1 < len; i += 2)
        sum += (uint32_t)(data[i] << 8 | data[i + 1]);
    if (len & 1)
        sum += (uint32_t)(data[len - 1] << 8);
    while (sum >> 16)
        sum = (sum & 0xffff) + (sum >> 16);
    return htons((uint16_t)~sum);
}

/* Only ICMPv6 router solicitations and advertisements without extension
 * headers reach the socket: the forwarded IPv6 traffic costs nothing. */
static int attach_filter(int fd)
{
    struct sock_filter code[] = {
        BPF_STMT(BPF_LD | BPF_H | BPF_ABS, SKF_AD_OFF + SKF_AD_PROTOCOL),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, ETH_P_IPV6, 0, 6),
        BPF_STMT(BPF_LD | BPF_B | BPF_ABS, 6),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, IPPROTO_ICMPV6, 0, 4),
        BPF_STMT(BPF_LD | BPF_B | BPF_ABS, 40),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, ND_ROUTER_SOLICIT, 1, 0),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, ND_ROUTER_ADVERT, 0, 1),
        BPF_STMT(BPF_RET | BPF_K, 0xffff),
        BPF_STMT(BPF_RET | BPF_K, 0),
    };
    struct sock_fprog prog = { sizeof(code) / sizeof(code[0]), code };
    return setsockopt(fd, SOL_SOCKET, SO_ATTACH_FILTER, &prog, sizeof(prog));
}

/* PROTO ETH_P_IPV6 sees received packets only; ETH_P_ALL sees the sent
 * ones too. */
static int open_packet(unsigned int ifindex, int proto)
{
    struct sockaddr_ll sll = { 0 };
    int fd = socket(AF_PACKET, SOCK_DGRAM, htons(proto));

    if (fd < 0)
        return -1;
    if (attach_filter(fd) < 0) {
        close(fd);
        return -1;
    }
    sll.sll_family = AF_PACKET;
    sll.sll_protocol = htons(proto);
    sll.sll_ifindex = (int)ifindex;
    if (bind(fd, (struct sockaddr *)&sll, sizeof(sll)) < 0) {
        close(fd);
        return -1;
    }
    return fd;
}

/* Sends one RA to all nodes on IFINDEX: FLAGS (M/O) and ROUTER_LIFETIME,
 * an MTU option unless MTU is 0, a prefix information option (on-link,
 * autonomous) unless PFX is NULL. */
static int send_ra(int fd, unsigned int ifindex, const struct in6_addr *src,
                   uint8_t flags, uint16_t router_lifetime, uint32_t mtu,
                   const struct prefix *pfx, uint32_t valid, uint32_t preferred)
{
    uint8_t pkt[40 + 16 + 8 + 32];
    struct ip6_hdr *h = (struct ip6_hdr *)pkt;
    struct nd_router_advert *ra = (struct nd_router_advert *)(pkt + 40);
    uint8_t *opt = (uint8_t *)(ra + 1);
    struct sockaddr_ll to = { 0 };
    size_t icmp_len;

    memset(pkt, 0, sizeof(pkt));
    ra->nd_ra_type = ND_ROUTER_ADVERT;
    ra->nd_ra_flags_reserved = flags;
    ra->nd_ra_router_lifetime = htons(router_lifetime);
    if (mtu) {
        struct nd_opt_mtu *m = (struct nd_opt_mtu *)opt;
        m->nd_opt_mtu_type = ND_OPT_MTU;
        m->nd_opt_mtu_len = 1;
        m->nd_opt_mtu_mtu = htonl(mtu);
        opt += sizeof(*m);
    }
    if (pfx) {
        struct nd_opt_prefix_info *pi = (struct nd_opt_prefix_info *)opt;
        pi->nd_opt_pi_type = ND_OPT_PREFIX_INFORMATION;
        pi->nd_opt_pi_len = 4;
        pi->nd_opt_pi_prefix_len = (uint8_t)pfx->len;
        pi->nd_opt_pi_flags_reserved = ND_OPT_PI_FLAG_ONLINK | ND_OPT_PI_FLAG_AUTO;
        pi->nd_opt_pi_valid_time = htonl(valid);
        pi->nd_opt_pi_preferred_time = htonl(preferred);
        pi->nd_opt_pi_prefix = pfx->addr;
        opt += sizeof(*pi);
    }
    icmp_len = (size_t)(opt - (uint8_t *)ra);

    h->ip6_flow = htonl(6u << 28);
    h->ip6_plen = htons((uint16_t)icmp_len);
    h->ip6_nxt = IPPROTO_ICMPV6;
    h->ip6_hlim = 255;
    h->ip6_src = *src;
    inet_pton(AF_INET6, "ff02::1", &h->ip6_dst);
    ra->nd_ra_cksum = icmp6_csum(&h->ip6_src, &h->ip6_dst, (uint8_t *)ra, icmp_len);

    to.sll_family = AF_PACKET;
    to.sll_protocol = htons(ETH_P_IPV6);
    to.sll_ifindex = (int)ifindex;
    to.sll_halen = 6;
    memcpy(to.sll_addr, "\x33\x33\x00\x00\x00\x01", 6);
    if (sendto(fd, pkt, 40 + icmp_len, 0, (struct sockaddr *)&to, sizeof(to)) < 0) {
        logmsg("⚠️  sending on %s: %s", iface, strerror(errno));
        return -1;
    }
    return 0;
}

/* One RA with router lifetime 0 and a prefix information option with both
 * lifetimes 0. */
static void send_stale(int fd, unsigned int ifindex, const struct stale *s)
{
    struct in6_addr src;

    /* withdraw the old router under its own address, unless it may be a
     * current router too: then the RA must not speak for it */
    if (!is_unspec(&s->router) && !maybe_cur_router(&s->router))
        src = s->router;
    else
        inet_pton(AF_INET6, NEUTRAL_SRC, &src);
    send_ra(fd, ifindex, &src, 0, 0, 0, &s->pfx, 0, 0);
}

static int send_rs(const char *ifname)
{
    struct sockaddr_in6 dst = { 0 };
    struct nd_router_solicit rs = { 0 };
    unsigned int idx = if_nametoindex(ifname);
    int fd, hops = 255, rc;

    if (idx == 0)
        return -1;
    fd = socket(AF_INET6, SOCK_RAW, IPPROTO_ICMPV6);
    if (fd < 0)
        return -1;
    setsockopt(fd, IPPROTO_IPV6, IPV6_MULTICAST_HOPS, &hops, sizeof(hops));
    setsockopt(fd, IPPROTO_IPV6, IPV6_MULTICAST_IF, &idx, sizeof(idx));
    rs.nd_rs_type = ND_ROUTER_SOLICIT;
    dst.sin6_family = AF_INET6;
    dst.sin6_scope_id = idx;
    inet_pton(AF_INET6, "ff02::2", &dst.sin6_addr);
    rc = sendto(fd, &rs, sizeof(rs), 0, (struct sockaddr *)&dst, sizeof(dst)) < 0 ? -1 : 0;
    close(fd);
    return rc;
}

/* Turns multicast snooping off on IFACE when it is on (see the top). */
static void snooping_off(void)
{
    char path[128], v = 0;
    FILE *f;

    snprintf(path, sizeof(path), "/sys/class/net/%s/bridge/multicast_snooping", iface);
    f = fopen(path, "r");
    if (!f)
        return;
    if (fread(&v, 1, 1, f) != 1)
        v = 0;
    fclose(f);
    if (v != '1')
        return;
    f = fopen(path, "w");
    if (f && fputs("0", f) >= 0 && fclose(f) == 0)
        logmsg("📣 multicast snooping turned off on %s", iface);
    else
        logmsg("⚠️  cannot turn multicast snooping off on %s", iface);
}

/* The interface of the IPv6 default route: the mobile data interface. */
static int wan_iface(char *out)
{
    char line[512], dst[33], dev[IF_NAMESIZE + 1];
    unsigned int plen;
    FILE *f = fopen("/proc/net/ipv6_route", "r");
    int found = 0;

    if (!f)
        return 0;
    while (!found && fgets(line, sizeof(line), f))
        if (sscanf(line, "%32s %x %*s %*s %*s %*s %*s %*s %*s %16s",
                   dst, &plen, dev) == 3 && plen == 0 &&
            strcmp(dst, "00000000000000000000000000000000") == 0 &&
            strcmp(dev, "lo") != 0) {
            strcpy(out, dev);
            found = 1;
        }
    fclose(f);
    return found;
}

/* Parsed view of a router advertisement or solicitation. */
struct nd_msg {
    int type;
    struct in6_addr src;
    uint16_t router_lifetime;
    uint8_t flags;
    int npfx;
    struct prefix pfx[MAX_PREFIXES];
    uint32_t valid[MAX_PREFIXES], preferred[MAX_PREFIXES];
};

static int parse_nd(const uint8_t *ip, size_t len, struct nd_msg *m)
{
    const struct ip6_hdr *h = (const struct ip6_hdr *)ip;
    const uint8_t *opt, *end;

    memset(m, 0, sizeof(*m));
    if (len < sizeof(*h) + 8 || (ip[0] >> 4) != 6 || h->ip6_nxt != IPPROTO_ICMPV6)
        return -1;
    m->type = ip[40];
    m->src = h->ip6_src;
    end = ip + sizeof(*h) + ntohs(h->ip6_plen);
    if (end > ip + len)
        end = ip + len;
    if (m->type == ND_ROUTER_SOLICIT)
        return 0;
    if (m->type != ND_ROUTER_ADVERT || ip + 40 + sizeof(struct nd_router_advert) > end)
        return -1;
    {
        const struct nd_router_advert *ra = (const struct nd_router_advert *)(ip + 40);
        m->router_lifetime = ntohs(ra->nd_ra_router_lifetime);
        m->flags = ra->nd_ra_flags_reserved;
        opt = (const uint8_t *)(ra + 1);
    }
    while (opt + 2 <= end && opt[1] != 0 && opt + opt[1] * 8 <= end) {
        if (opt[0] == ND_OPT_PREFIX_INFORMATION && opt[1] == 4 &&
            m->npfx < MAX_PREFIXES) {
            const struct nd_opt_prefix_info *p = (const struct nd_opt_prefix_info *)opt;
            m->pfx[m->npfx].addr = p->nd_opt_pi_prefix;
            m->pfx[m->npfx].len = p->nd_opt_pi_prefix_len;
            mask_prefix(&m->pfx[m->npfx]);
            m->valid[m->npfx] = ntohl(p->nd_opt_pi_valid_time);
            m->preferred[m->npfx] = ntohl(p->nd_opt_pi_preferred_time);
            m->npfx++;
        }
        opt += opt[1] * 8;
    }
    return 0;
}

static void print_lifetime(const char *name, uint32_t v)
{
    if (v == 0xffffffffu)
        printf(" %s=forever", name);
    else
        printf(" %s=%u", name, v);
}

/* ------------------------------------------------------------ commands */

static int cmd_dump(void)
{
    unsigned int idx = strcmp(iface, "any") == 0 ? 0 : if_nametoindex(iface);
    uint8_t buf[2048];
    int fd;

    if (idx == 0 && strcmp(iface, "any") != 0) {
        fprintf(stderr, "no interface %s\n", iface);
        return 1;
    }
    fd = open_packet(idx, ETH_P_ALL);
    if (fd < 0) {
        perror("packet socket");
        return 1;
    }
    for (;;) {
        struct sockaddr_ll from;
        socklen_t flen = sizeof(from);
        char name[IF_NAMESIZE] = "?";
        struct nd_msg m;
        ssize_t n = recvfrom(fd, buf, sizeof(buf), 0, (struct sockaddr *)&from, &flen);
        int i;

        if (n < 0) {
            if (errno == EINTR)
                continue;
            perror("recvfrom");
            return 1;
        }
        if (parse_nd(buf, (size_t)n, &m) != 0)
            continue;
        if_indextoname((unsigned int)from.sll_ifindex, name);
        printf("%s %s %s from %s", name,
               from.sll_pkttype == PACKET_OUTGOING ? "out" : "in",
               m.type == ND_ROUTER_SOLICIT ? "RS" : "RA", ntop(&m.src));
        if (m.type == ND_ROUTER_ADVERT)
            printf(" flags=0x%02x router_lifetime=%u", m.flags, m.router_lifetime);
        printf("\n");
        for (i = 0; i < m.npfx; i++) {
            printf("  prefix %s/%u", ntop(&m.pfx[i].addr), m.pfx[i].len);
            print_lifetime("valid", m.valid[i]);
            print_lifetime("preferred", m.preferred[i]);
            printf("\n");
        }
        fflush(stdout);
    }
}

static volatile sig_atomic_t stop;

static void on_signal(int sig)
{
    (void)sig;
    stop = 1;
}

static int cmd_run(void)
{
    unsigned int lan = if_nametoindex(iface);
    int fd, changed_prefix, i;
    time_t next_poll = 0;
    uint8_t buf[2048];

    if (lan == 0) {
        logmsg("❌ no interface %s", iface);
        return 1;
    }
    /* bound to no interface, received packets only: the advertisements
     * of the mobile network and the solicitations of the LAN hosts */
    fd = open_packet(0, ETH_P_IPV6);
    if (fd < 0) {
        logmsg("❌ packet socket: %s", strerror(errno));
        return 1;
    }
    signal(SIGTERM, on_signal);
    signal(SIGINT, on_signal);
    load_state();
    logmsg("🛡️  ra-guard on %s: %d current, %d stale prefix(es), window %lds",
           iface, ncur, nstale, window_s);

    while (!stop) {
        time_t now = time(NULL);
        struct pollfd pfd = { fd, POLLIN, 0 };
        time_t wake = next_poll;
        int dirty = 0;

        if (now >= next_poll) {
            dirty |= refresh_prefixes(&changed_prefix);
            snooping_off();
            if (changed_prefix) {
                char wan[IF_NAMESIZE + 1];
                /* learn the new router now instead of at its next RA */
                if (wan_iface(wan) && send_rs(wan) == 0)
                    logmsg("📨 router solicitation sent on %s", wan);
            }
            next_poll = now + POLL_S;
            wake = next_poll;
        }
        for (i = 0; i < nstale; i++) {
            struct stale *s = &stale[i];
            /* the window is wall-clock time, so it starts and runs only
             * once the clock has been set after boot */
            if (now >= SANE_CLOCK && s->since == 0) {
                s->since = now;
                dirty = 1;
            }
            if (now >= SANE_CLOCK && s->since != 0 && now - s->since > window_s) {
                logmsg("⏳ %s/%u: window over, no longer advertised",
                       ntop(&s->pfx.addr), s->pfx.len);
                drop_stale(i--);
                dirty = 1;
                continue;
            }
            if (now >= s->next) {
                send_stale(fd, lan, s);
                if (s->burst > 0)
                    s->burst--;
                s->next = now + (s->burst > 0 ? BURST_GAP_S : interval_s);
            }
            if (s->next < wake)
                wake = s->next;
        }
        if (dirty)
            save_state();

        if (poll(&pfd, 1, (int)((wake > now ? wake - now : 1) * 1000)) <= 0)
            continue;
        for (;;) {
            struct sockaddr_ll from;
            socklen_t flen = sizeof(from);
            struct nd_msg m;
            ssize_t n = recvfrom(fd, buf, sizeof(buf), MSG_DONTWAIT,
                                 (struct sockaddr *)&from, &flen);
            int j;

            if (n < 0)
                break;
            if (parse_nd(buf, (size_t)n, &m) != 0)
                continue;
            if (m.type == ND_ROUTER_SOLICIT) {
                /* a LAN host is (re)joining: answer with the stale set */
                if ((unsigned int)from.sll_ifindex == lan &&
                    from.sll_pkttype != PACKET_OUTGOING)
                    for (j = 0; j < nstale; j++)
                        send_stale(fd, lan, &stale[j]);
                continue;
            }
            /* learn the router of each current prefix from the
             * advertisements of the mobile network announcing it: received
             * on the interface of the default route, never from the LAN */
            {
                char wan[IF_NAMESIZE + 1];
                if (!wan_iface(wan) ||
                    (unsigned int)from.sll_ifindex != if_nametoindex(wan))
                    continue;
            }
            if (m.router_lifetime == 0 || !IN6_IS_ADDR_LINKLOCAL(&m.src))
                continue;
            for (j = 0; j < m.npfx; j++) {
                int k = find_cur(&m.pfx[j]);
                if (k >= 0 && m.valid[j] > 0 &&
                    memcmp(&cur_router[k], &m.src, 16) != 0) {
                    cur_router[k] = m.src;
                    logmsg("🧭 router of %s/%u is %s", ntop(&cur[k].addr),
                           cur[k].len, ntop(&m.src));
                    save_state();
                }
            }
        }
    }
    logmsg("👋 ra-guard stopped");
    return 0;
}

static int cmd_rs(void)
{
    if (send_rs(iface) != 0) {
        fprintf(stderr, "cannot send on %s: %s\n", iface, strerror(errno));
        return 1;
    }
    printf("router solicitation sent on %s\n", iface);
    return 0;
}

static void usage(int code)
{
    fprintf(code == 0 ? stdout : stderr,
            "usage: ra-guard run  [-i IFACE] [-s STATE] [-w WINDOW_S] [-t INTERVAL_S]\n"
            "       ra-guard dump [-i IFACE|any]\n"
            "       ra-guard rs   [-i IFACE]\n");
    exit(code);
}

int main(int argc, char **argv)
{
    int i;

    if (argc < 2)
        usage(2);
    if (strcmp(argv[1], "-h") == 0)
        usage(0);
    for (i = 2; i < argc; i++) {
        if (i + 1 >= argc)
            usage(2);
        if (strcmp(argv[i], "-i") == 0)
            iface = argv[++i];
        else if (strcmp(argv[i], "-s") == 0)
            state_path = argv[++i];
        else if (strcmp(argv[i], "-w") == 0)
            window_s = atol(argv[++i]);
        else if (strcmp(argv[i], "-t") == 0)
            interval_s = atol(argv[++i]);
        else
            usage(2);
    }
    if (window_s <= 0 || interval_s <= 0)
        usage(2);
    if (strcmp(argv[1], "run") == 0)
        return cmd_run();
    if (strcmp(argv[1], "dump") == 0)
        return cmd_dump();
    if (strcmp(argv[1], "rs") == 0)
        return cmd_rs();
    usage(2);
    return 2;
}
