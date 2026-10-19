/*
 * system_bridge - modem and system status for SimpleAdmin over a WebSocket
 * (port 9002), without the AT channel.
 *
 * Modem data comes from QMI over QRTR (AF_QIPCRTR), the same services the
 * firmware's own daemons use:
 *   NAS  signal info, TX/RX chains, serving system, CA cells, cell location
 *   DMS  IMEI, firmware, manufacturer
 *   UIM  card and slot status (SIM state, active slot, ICCID), IMSI (EF_IMSI)
 *   WDS  APN of profile 1
 *   TS   temperature sensors
 * System data comes from /proc, /sys, uname and statvfs (/data), the age of
 * the data session from rtnetlink; connectivity from ICMP echo, DNS
 * queries and an HTTP captive portal probe to the targets in
 * simpleadmin.conf.
 *
 * While a WebSocket client is connected the modem is polled for the
 * snapshot pushed every 2 s: radio every 2 s, serving system / CA /
 * temperatures every 10 s, identity every 60 s, connectivity every 10 s.
 * Radio data here is the fallback of the dashboard: diag_bridge (port 9001)
 * is the primary radio source. With or without clients it keeps the
 * histories a new client receives at once (latency of every 10 s ping round
 * for 24 h, QMI signal every 10 s for 30 min) and the persistent data
 * counter.
 *
 * The same binary is the serialized AT client: called as atcli_smd8 (the
 * firmware's client is replaced by a link to it) or as "system_bridge at",
 * it takes an exclusive lock on the AT channel, drains whatever an earlier
 * caller left unread, sends the command and returns everything up to the
 * final result code. Without the lock, concurrent callers interleave on the
 * channel and every later command reads the previous one's answer.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <stdarg.h>
#include <errno.h>
#include <fcntl.h>
#include <unistd.h>
#include <signal.h>
#include <time.h>
#include <poll.h>
#include <arpa/inet.h>
#include <netinet/in.h>
#include <netinet/ip.h>
#include <netinet/ip_icmp.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/statvfs.h>
#include <sys/utsname.h>
#include <sys/time.h>
#include <sys/wait.h>
#include <netdb.h>
#include <ifaddrs.h>
#include <strings.h>
#include <net/if.h>
#include <linux/qrtr.h>
#include <linux/netlink.h>
#include <linux/rtnetlink.h>
#include <sys/file.h>
#include <libgen.h>

#include "ws.h"
#include "bands.h"
#include "auth.h"

#define WS_PORT_DEFAULT   9002
#define CONF_FILE_DEFAULT "/WEBSERVER/www/config/simpleadmin.conf"
#define QMI_TIMEOUT_MS    500    /* answers take a few ms */
#define LOOKUP_RETRY_MS   10000
#define PUSH_MS           2000
#define RADIO_MS          2000
#define SERVING_MS        10000
#define IDENTITY_MS       60000
#define CONN_MS           10000
#define SIGNAL_MS         10000
#define PING_TIMEOUT_MS   1500
#define DNS_TIMEOUT_MS    2000
#define MAX_TARGETS       4

static int debug_mode;
static volatile sig_atomic_t running = 1;
static const char *conf_file = CONF_FILE_DEFAULT;

static void dbg(const char *fmt, ...) {
    if (!debug_mode) return;
    va_list ap;
    va_start(ap, fmt);
    vfprintf(stderr, fmt, ap);
    va_end(ap);
}

static uint16_t le16(const uint8_t *p) { return (uint16_t)(p[0] | p[1] << 8); }
static int16_t sle16(const uint8_t *p) { return (int16_t)le16(p); }
static uint32_t le32(const uint8_t *p) { return (uint32_t)p[0] | (uint32_t)p[1] << 8 | (uint32_t)p[2] << 16 | (uint32_t)p[3] << 24; }

/* ============= JSON ============= */

struct jbuf { char *b; size_t n, cap; };

static void jcat(struct jbuf *j, const char *fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    int w = vsnprintf(j->b + j->n, j->cap - j->n, fmt, ap);
    va_end(ap);
    if (w > 0) j->n = (size_t)w < j->cap - j->n ? j->n + (size_t)w : j->cap - 1;
}

/* Quoted JSON string, control characters dropped. */
static void jstr(struct jbuf *j, const char *s) {
    jcat(j, "\"");
    for (; s && *s && j->n + 8 < j->cap; s++) {
        unsigned char c = (unsigned char)*s;
        if (c == '"' || c == '\\') jcat(j, "\\%c", c);
        else if (c >= 0x20) jcat(j, "%c", c);
    }
    jcat(j, "\"");
}

/* ============= QMI over QRTR ============= */

enum { SVC_WDS = 1, SVC_DMS = 2, SVC_NAS = 3, SVC_UIM = 11, SVC_TS = 23 };

struct qmi_svc { uint32_t service, node, port; int ok; };
static struct qmi_svc svcs[] = { { SVC_WDS, 0, 0, 0 }, { SVC_DMS, 0, 0, 0 }, { SVC_NAS, 0, 0, 0 },
                                 { SVC_UIM, 0, 0, 0 }, { SVC_TS, 0, 0, 0 } };
static int qmi_fd = -1;
static uint32_t qmi_local_node;
static uint16_t qmi_txn = 1;

struct qmi_msg { uint8_t buf[8192]; size_t len; };   /* QMI header + TLVs */

static struct qmi_svc *svc(uint32_t service) {
    for (size_t i = 0; i < sizeof(svcs) / sizeof(svcs[0]); i++)
        if (svcs[i].service == service) return &svcs[i];
    return NULL;
}

static void ts_indication(const struct qmi_msg *m);
static unsigned ts_reports;   /* temperature reports received so far */
static void poll_sim(void);

/* Asks the QRTR name service for every server, keeps the ones we use. */
static int qmi_lookup(void) {
    struct qrtr_ctrl_pkt pkt;
    memset(&pkt, 0, sizeof(pkt));
    pkt.cmd = QRTR_TYPE_NEW_LOOKUP;
    struct sockaddr_qrtr sq = { AF_QIPCRTR, qmi_local_node, QRTR_PORT_CTRL };
    if (sendto(qmi_fd, &pkt, sizeof(pkt), 0, (struct sockaddr *)&sq, sizeof(sq)) < 0) return -1;
    int found = 0;
    uint64_t deadline = monotonic_ms() + 3000;
    while (monotonic_ms() < deadline) {
        struct pollfd p = { qmi_fd, POLLIN, 0 };
        if (poll(&p, 1, 500) <= 0) continue;
        struct qrtr_ctrl_pkt r;
        ssize_t n = recv(qmi_fd, &r, sizeof(r), 0);
        if (n < (ssize_t)sizeof(r) || r.cmd != QRTR_TYPE_NEW_SERVER) continue;
        if (!r.server.service && !r.server.node && !r.server.port) break;   /* end of list */
        struct qmi_svc *s = svc(r.server.service);
        if (s && !s->ok) {
            s->node = r.server.node; s->port = r.server.port; s->ok = 1; found++;
            dbg("[qmi] service %u at %u:%u\n", s->service, s->node, s->port);
        }
    }
    return found;
}

static int qmi_open(void) {
    qmi_fd = socket(AF_QIPCRTR, SOCK_DGRAM, 0);
    if (qmi_fd < 0) return -1;
    struct sockaddr_qrtr me;
    socklen_t ml = sizeof(me);
    if (getsockname(qmi_fd, (struct sockaddr *)&me, &ml) < 0) return -1;
    qmi_local_node = me.sq_node;
    return qmi_lookup() > 0 ? 0 : -1;
}

/* One request, waiting for its response. Indications that arrive meanwhile
   (temperature reports) are handled on the way. Returns 0 when the QMI
   result TLV says success. */
static int qmi_request(uint32_t service, uint16_t msg_id, const uint8_t *tlvs, size_t tlv_len,
                       struct qmi_msg *rsp) {
    struct qmi_svc *s = svc(service);
    if (!s || !s->ok || qmi_fd < 0 || tlv_len > 1000) return -1;
    uint8_t req[1024];
    uint16_t txn = qmi_txn++;
    if (!qmi_txn) qmi_txn = 1;
    req[0] = 0; req[1] = txn & 0xff; req[2] = txn >> 8;
    req[3] = msg_id & 0xff; req[4] = msg_id >> 8;
    req[5] = tlv_len & 0xff; req[6] = (uint8_t)(tlv_len >> 8);
    if (tlv_len) memcpy(req + 7, tlvs, tlv_len);
    struct sockaddr_qrtr to = { AF_QIPCRTR, s->node, s->port };
    if (sendto(qmi_fd, req, 7 + tlv_len, 0, (struct sockaddr *)&to, sizeof(to)) < 0) return -1;
    uint64_t deadline = monotonic_ms() + QMI_TIMEOUT_MS;
    for (;;) {
        uint64_t now = monotonic_ms();
        if (now >= deadline) {
            /* The service stopped answering (modem restart: it comes back
               on another port). Requests to it now fail at once instead of
               stalling the loop, until the next lookup finds it again. */
            dbg("[qmi] timeout svc %u msg 0x%04x, service marked down\n", service, msg_id);
            s->ok = 0;
            return -1;
        }
        struct pollfd p = { qmi_fd, POLLIN, 0 };
        if (poll(&p, 1, (int)(deadline - now)) <= 0) continue;
        struct sockaddr_qrtr from;
        socklen_t fl = sizeof(from);
        ssize_t n = recvfrom(qmi_fd, rsp->buf, sizeof(rsp->buf), 0, (struct sockaddr *)&from, &fl);
        if (n < 7) continue;
        rsp->len = (size_t)n;
        if (rsp->buf[0] == 4) {   /* indication */
            if (from.sq_port == svc(SVC_TS)->port && le16(rsp->buf + 3) == 0x0022) ts_indication(rsp);
            continue;
        }
        if (rsp->buf[0] != 2 || le16(rsp->buf + 1) != txn || le16(rsp->buf + 3) != msg_id) continue;
        break;
    }
    return 0;
}

/* TLV lookup in a QMI message; NULL when absent. */
static const uint8_t *tlv(const struct qmi_msg *m, uint8_t type, uint16_t *len) {
    size_t end = 7 + le16(m->buf + 5);
    if (end > m->len) end = m->len;
    for (size_t o = 7; o + 3 <= end; ) {
        uint16_t l = le16(m->buf + o + 1);
        if (o + 3 + l > end) return NULL;
        if (m->buf[o] == type) { if (len) *len = l; return m->buf + o + 3; }
        o += 3 + l;
    }
    return NULL;
}

static int qmi_ok(const struct qmi_msg *m) {
    uint16_t l;
    const uint8_t *r = tlv(m, 0x02, &l);
    return r && l >= 4 && le16(r) == 0;
}

/* ============= MODEM STATE ============= */

#define INVALID_DB (-32768)

struct chain { int valid; int rsrp_x10; };

static struct {
    /* identity (60 s) */
    char manufacturer[32], model[32], firmware[64], imei[24], imsi[24], iccid[24], apn[64];
    char sim_state[24];
    int sim_slot;
    /* serving system (10 s) */
    int registered;
    int mcc, mnc, mnc_digits;
    char operator_name[64];
    uint32_t cell_id;
    int tac;
    int endc;
    /* temperatures (10 s), tenths of degree, INT32_MIN when unknown */
    struct { const char *sensor, *key; int t_x10; } temps[5];
    /* radio (2 s) */
    struct { int valid, rsrp, rsrq, rssi, snr_x10, earfcn, pci, bw_mhz_x10; struct chain chains[4]; int tx_pwr_x10; } lte;
    struct { int valid, rsrp, rsrq, snr_x10, pci; uint32_t arfcn; struct chain chains[4]; } nr;
    struct { int pci, earfcn, bw_mhz_x10, idx; } scells[7];
    int nscells;
    time_t radio_at, serving_at, identity_at;
} md = {
    .temps = { { "modem_tsens", "modem", INT32_MIN }, { "pa", "pa", INT32_MIN }, { "xo_therm", "xo", INT32_MIN },
               { "sys_therm1", "sys1", INT32_MIN }, { "sys_therm2", "sys2", INT32_MIN } },
};

/* LTE/QMI dl bandwidth enum -> MHz x10. */
static int bw_enum_x10(uint32_t e) {
    static const int t[] = { 14, 30, 50, 100, 150, 200 };
    return e < 6 ? t[e] : 0;
}

static void copy_str(char *dst, size_t cap, const uint8_t *src, size_t len) {
    size_t k = 0;
    for (size_t i = 0; i < len && k + 1 < cap; i++)
        if (src[i] >= 0x20 && src[i] < 0x7f) dst[k++] = (char)src[i];
    dst[k] = 0;
}

static void poll_radio(void) {
    struct qmi_msg m;
    uint16_t l;
    const uint8_t *v;
    md.lte.valid = md.nr.valid = 0;
    if (qmi_request(SVC_NAS, 0x004F, NULL, 0, &m) == 0 && qmi_ok(&m)) {
        if ((v = tlv(&m, 0x14, &l)) && l >= 6) {
            md.lte.valid = 1;
            md.lte.rssi = (int8_t)v[0]; md.lte.rsrq = (int8_t)v[1];
            md.lte.rsrp = sle16(v + 2); md.lte.snr_x10 = sle16(v + 4);
        }
        if ((v = tlv(&m, 0x17, &l)) && l >= 4 && sle16(v) != INVALID_DB) {
            md.nr.valid = 1;
            md.nr.rsrp = sle16(v); md.nr.snr_x10 = sle16(v + 2);
        }
        md.nr.rsrq = INVALID_DB;
        if ((v = tlv(&m, 0x18, &l)) && l >= 2) md.nr.rsrq = sle16(v);
    }
    /* RX chains (0x10, 0x11, 0x15, 0x16) and TX power (0x12). */
    static const uint8_t chain_tlv[4] = { 0x10, 0x11, 0x15, 0x16 };
    for (int rat = 0; rat < 2; rat++) {
        uint8_t req[] = { 0x01, 0x01, 0x00, rat ? 0x0C : 0x08 };
        struct chain *ch = rat ? md.nr.chains : md.lte.chains;
        memset(ch, 0, sizeof(struct chain) * 4);
        if (qmi_request(SVC_NAS, 0x005A, req, sizeof(req), &m) < 0 || !qmi_ok(&m)) continue;
        for (int k = 0; k < 4; k++) {
            if (!(v = tlv(&m, chain_tlv[k], &l)) || l < 21 || !v[0]) continue;
            int32_t rsrp = (int32_t)le32(v + 13);
            if (rsrp == INT32_MIN || rsrp < -1560 || rsrp > -300) continue;
            ch[k].valid = 1; ch[k].rsrp_x10 = rsrp;
        }
        if (!rat) {
            md.lte.tx_pwr_x10 = INT32_MIN;
            if ((v = tlv(&m, 0x12, &l)) && l >= 5 && v[0]) md.lte.tx_pwr_x10 = (int32_t)le32(v + 1);
        }
    }
    md.radio_at = time(NULL);
}

static void poll_serving(void) {
    struct qmi_msg m;
    uint16_t l;
    const uint8_t *v;
    if (qmi_request(SVC_NAS, 0x0024, NULL, 0, &m) == 0 && qmi_ok(&m)) {
        md.registered = (v = tlv(&m, 0x01, &l)) && l >= 1 && v[0] == 1;
        if ((v = tlv(&m, 0x12, &l)) && l >= 5) {
            md.mcc = le16(v); md.mnc = le16(v + 2);
            copy_str(md.operator_name, sizeof(md.operator_name), v + 5, l - 5 < v[4] ? l - 5u : v[4]);
        }
        md.mnc_digits = 2;
        if ((v = tlv(&m, 0x27, &l)) && l >= 5 && v[4]) md.mnc_digits = 3;
        if ((v = tlv(&m, 0x1D, &l)) && l >= 4) md.cell_id = le32(v);
        if ((v = tlv(&m, 0x24, &l)) && l >= 2) md.tac = le16(v);
    }
    /* NR PCI and EN-DC from the system info. */
    md.nr.pci = -1;
    if (qmi_request(SVC_NAS, 0x004D, NULL, 0, &m) == 0 && qmi_ok(&m)) {
        if ((v = tlv(&m, 0x54, &l)) && l >= 2 && le16(v) <= 1007) md.nr.pci = le16(v);
        md.endc = (v = tlv(&m, 0x55, &l)) && l >= 1 && v[0];
    }
    /* PCell and active SCells. */
    md.nscells = 0;
    md.lte.earfcn = md.lte.pci = -1; md.lte.bw_mhz_x10 = 0;
    if (qmi_request(SVC_NAS, 0x00AC, NULL, 0, &m) == 0 && qmi_ok(&m)) {
        if ((v = tlv(&m, 0x13, &l)) && l >= 8) {
            md.lte.pci = le16(v); md.lte.earfcn = le16(v + 2); md.lte.bw_mhz_x10 = bw_enum_x10(le32(v + 4));
        }
        if ((v = tlv(&m, 0x15, &l)) && l >= 1) {
            int n = v[0];
            for (int k = 0; k < n && md.nscells < 7 && 1 + (size_t)(k + 1) * 15 <= l; k++) {
                const uint8_t *e = v + 1 + k * 15;
                md.scells[md.nscells].pci = le16(e);
                md.scells[md.nscells].earfcn = le16(e + 2);
                md.scells[md.nscells].bw_mhz_x10 = bw_enum_x10(le32(e + 4));
                md.scells[md.nscells].idx = e[14];
                md.nscells++;
            }
        }
    }
    /* NR ARFCN, and the LTE serving cell when there is no CA report. */
    md.nr.arfcn = 0;
    if (qmi_request(SVC_NAS, 0x0043, NULL, 0, &m) == 0 && qmi_ok(&m)) {
        if ((v = tlv(&m, 0x2E, &l)) && l >= 4) md.nr.arfcn = le32(v);
        if (md.lte.earfcn < 0 && (v = tlv(&m, 0x13, &l)) && l >= 14) {
            md.lte.earfcn = le16(v + 10); md.lte.pci = le16(v + 12);
        }
    }
    /* Temperatures: each register request answers with a report indication. */
    for (size_t k = 0; k < sizeof(md.temps) / sizeof(md.temps[0]); k++) {
        uint8_t req[40];
        size_t nl = strlen(md.temps[k].sensor);
        req[0] = 0x01; req[1] = (uint8_t)(nl + 1); req[2] = 0; req[3] = (uint8_t)nl;
        memcpy(req + 4, md.temps[k].sensor, nl);
        req[4 + nl] = 0x02; req[5 + nl] = 1; req[6 + nl] = 0; req[7 + nl] = 1;
        unsigned before = ts_reports;
        if (qmi_request(SVC_TS, 0x0021, req, 8 + nl, &m) == 0) {
            /* The report usually follows the response: give it a moment,
               unless it already came in with it. */
            uint64_t until = monotonic_ms() + 200;
            while (ts_reports == before && monotonic_ms() < until) {
                struct pollfd p = { qmi_fd, POLLIN, 0 };
                if (poll(&p, 1, 50) <= 0) continue;
                struct qmi_msg ind;
                ssize_t n = recv(qmi_fd, ind.buf, sizeof(ind.buf), 0);
                if (n < 7) continue;
                ind.len = (size_t)n;
                if (ind.buf[0] == 4 && le16(ind.buf + 3) == 0x0022) {
                    ts_indication(&ind);
                    break;
                }
            }
        }
    }
    poll_sim();
    md.serving_at = time(NULL);
}

static void ts_indication(const struct qmi_msg *m) {
    uint16_t l, tl;
    const uint8_t *id = tlv(m, 0x01, &l), *t = tlv(m, 0x10, &tl);
    if (!id || l < 1 || !t || tl < 4 || id[0] + 1u > l) return;
    float f;
    memcpy(&f, t, 4);
    ts_reports++;
    for (size_t k = 0; k < sizeof(md.temps) / sizeof(md.temps[0]); k++)
        if (strlen(md.temps[k].sensor) == id[0] && !memcmp(md.temps[k].sensor, id + 1, id[0]) && f > -40 && f < 150)
            md.temps[k].t_x10 = (int)(f * 10.0f + (f >= 0 ? 0.5f : -0.5f));
}

/* ICCID from the SIM is BCD with swapped nibbles; trailing F is padding. */
static void bcd_iccid(const uint8_t *b, size_t n, char *out, size_t cap) {
    size_t k = 0;
    for (size_t i = 0; i < n && k + 2 < cap; i++) {
        uint8_t lo = b[i] & 0x0f, hi = b[i] >> 4;
        if (lo <= 9) out[k++] = (char)('0' + lo);
        if (hi <= 9) out[k++] = (char)('0' + hi);
    }
    out[k] = 0;
}

/* SIM: slot status gives the active slot and its ICCID, card status the
   application state. Every 10 s, so an unlocked or swapped SIM shows soon. */
static void poll_sim(void) {
    struct qmi_msg m;
    uint16_t l;
    const uint8_t *v;
    md.sim_slot = 0;
    md.iccid[0] = 0;
    if (qmi_request(SVC_UIM, 0x0047, NULL, 0, &m) == 0 && qmi_ok(&m) && (v = tlv(&m, 0x10, &l)) && l >= 1) {
        size_t o = 1;
        for (int s = 0; s < v[0] && o + 10 <= l; s++) {
            uint32_t slot_state = le32(v + o + 4);
            uint8_t iccid_len = v[o + 9];
            if (o + 10 + iccid_len > l) break;
            if (slot_state == 1) {
                md.sim_slot = s + 1;
                bcd_iccid(v + o + 10, iccid_len, md.iccid, sizeof(md.iccid));
            }
            o += 10 + iccid_len;
        }
    }
    snprintf(md.sim_state, sizeof(md.sim_state), "No SIM");
    if (qmi_request(SVC_UIM, 0x002F, NULL, 0, &m) == 0 && qmi_ok(&m) && (v = tlv(&m, 0x10, &l)) && l >= 9) {
        uint8_t ncards = v[8];
        size_t o = 9;
        if (ncards >= 1 && o + 6 <= l && v[o] == 1) {          /* card present */
            uint8_t napps = v[o + 5];
            o += 6;
            if (napps >= 1 && o + 7 <= l) {
                uint8_t app_state = v[o + 1];
                static const char *states[] = { "Unknown", "Detected", "PIN Locked", "PUK Locked",
                                                "Personalization", "PIN Blocked", "Illegal", "Active" };
                snprintf(md.sim_state, sizeof(md.sim_state), "%s", app_state < 8 ? states[app_state] : "Unknown");
            }
        } else if (ncards >= 1 && o < l && v[o] == 2) {
            snprintf(md.sim_state, sizeof(md.sim_state), "SIM Error");
        }
    }
}

static void poll_identity(void) {
    struct qmi_msg m;
    uint16_t l;
    const uint8_t *v;
    if (qmi_request(SVC_DMS, 0x0025, NULL, 0, &m) == 0 && qmi_ok(&m) && (v = tlv(&m, 0x11, &l)))
        copy_str(md.imei, sizeof(md.imei), v, l);
    if (qmi_request(SVC_DMS, 0x0021, NULL, 0, &m) == 0 && qmi_ok(&m) && (v = tlv(&m, 0x01, &l)))
        copy_str(md.manufacturer, sizeof(md.manufacturer), v, l);
    if (qmi_request(SVC_DMS, 0x0023, NULL, 0, &m) == 0 && qmi_ok(&m) && (v = tlv(&m, 0x01, &l))) {
        /* "T99W175.F0.6.0.0.6.GC.004\n056  1  [date]": firmware is the first
           line plus the build number, the model its first component. */
        char rev[128];
        copy_str(rev, sizeof(rev), v, l);           /* drops the newline */
        const uint8_t *nlp = memchr(v, '\n', l);
        char line1[64], build[16] = "";
        size_t l1 = nlp ? (size_t)(nlp - v) : l;
        copy_str(line1, sizeof(line1), v, l1);
        if (nlp) {
            size_t b = 0;
            for (const uint8_t *q = nlp + 1; q < v + l && *q >= '0' && *q <= '9' && b + 1 < sizeof(build); q++)
                build[b++] = (char)*q;
            build[b] = 0;
        }
        snprintf(md.firmware, sizeof(md.firmware), "%s%s%s", line1, build[0] ? "." : "", build);
        snprintf(md.model, sizeof(md.model), "%.*s", (int)strcspn(line1, "."), line1);
    }
    /* IMSI from EF_IMSI (3F00/7FFF/6F07); TLV 0x18 is the decoded form
       (MCC, MNC, MSIN as ASCII). */
    md.imsi[0] = 0;
    {
        static const uint8_t req[] = { 0x01, 0x02, 0x00, 0x00, 0x00,
                                       0x02, 0x07, 0x00, 0x07, 0x6f, 0x04, 0x00, 0x3f, 0xff, 0x7f,
                                       0x03, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00 };
        if (qmi_request(SVC_UIM, 0x0020, req, sizeof(req), &m) == 0 && qmi_ok(&m) &&
            (v = tlv(&m, 0x18, &l)) && l >= 5) {
            size_t o = 3, k = 0;
            for (size_t i = 0; i < 3 && k + 1 < sizeof(md.imsi); i++) md.imsi[k++] = (char)v[i];
            for (int part = 0; part < 2 && o < l; part++) {
                uint8_t pl = v[o++];
                for (uint8_t i = 0; i < pl && o < l && k + 1 < sizeof(md.imsi); i++, o++) md.imsi[k++] = (char)v[o];
            }
            md.imsi[k] = 0;
            for (size_t i = 0; i < k; i++) if (md.imsi[i] < '0' || md.imsi[i] > '9') { md.imsi[0] = 0; break; }
        }
    }
    /* APN of profile 1 (3GPP), the one the data call uses. */
    {
        static const uint8_t req[] = { 0x01, 0x02, 0x00, 0x00, 0x01 };
        if (qmi_request(SVC_WDS, 0x002B, req, sizeof(req), &m) == 0 && qmi_ok(&m) && (v = tlv(&m, 0x14, &l)))
            copy_str(md.apn, sizeof(md.apn), v, l);
    }
    md.identity_at = time(NULL);
}

/* ============= SYSTEM ============= */

static struct {
    double uptime, load[3];
    int cpu_pct;
    long mem_total, mem_avail;
    char eth_speed[16], eth_duplex[16];
    char wan_ip[48], dns[2][48];
    uint64_t cpu_prev_total, cpu_prev_idle;
    char hostname[65], kernel[65];
    int data_fs_ok;                      /* /data (UBIFS usrfs), KiB */
    uint64_t data_total_kb, data_used_kb, data_avail_kb;
    long conn_up_s;                      /* -1: no data session */
} sys;

static int read_file(const char *path, char *buf, size_t cap) {
    int fd = open(path, O_RDONLY);
    if (fd < 0) return -1;
    ssize_t n = read(fd, buf, cap - 1);
    close(fd);
    if (n < 0) return -1;
    buf[n] = 0;
    return (int)n;
}

/* WAN address: the cellular interface's own IPv4, or with IP passthrough the
   address the LAN client got for it (the modem keeps only a link-local on
   rmnet). */
static void wan_ip(void) {
    sys.wan_ip[0] = 0;
    struct ifaddrs *ifa, *i;
    if (getifaddrs(&ifa) == 0) {
        for (i = ifa; i; i = i->ifa_next) {
            if (!i->ifa_addr || i->ifa_addr->sa_family != AF_INET || strncmp(i->ifa_name, "rmnet", 5)) continue;
            struct in_addr a = ((struct sockaddr_in *)i->ifa_addr)->sin_addr;
            if ((ntohl(a.s_addr) >> 16) == 0xA9FE) continue;   /* 169.254/16 */
            inet_ntop(AF_INET, &a, sys.wan_ip, sizeof(sys.wan_ip));
            break;
        }
        freeifaddrs(ifa);
    }
    if (sys.wan_ip[0]) return;
    /* IP passthrough: dhcp_hosts holds "mac,ip" for the passthrough client. */
    char cfg[65536], mac[24] = "";
    if (read_file("/etc/data/mobileap_cfg.xml", cfg, sizeof(cfg)) > 0) {
        const char *p = strstr(cfg, "<IPPassthroughEnable>1<");
        const char *m = strstr(cfg, "<IPPassthroughMacAddr>");
        if (p && m) sscanf(m + 22, "%17[0-9A-Fa-f:]", mac);
    }
    if (!mac[0]) return;
    char hosts[4096];
    if (read_file("/etc/data/dhcp_hosts", hosts, sizeof(hosts)) <= 0) return;
    for (char *line = strtok(hosts, "\n"); line; line = strtok(NULL, "\n")) {
        char lm[24], ip[48];
        if (sscanf(line, "%23[^,],%47s", lm, ip) == 2 && !strcasecmp(lm, mac)) {
            snprintf(sys.wan_ip, sizeof(sys.wan_ip), "%s", ip);
            return;
        }
    }
}

/* Seconds since the data session came up: the age of the address the
   network gave the cellular interface. The kernel stamps every address with
   its creation time (IFA_CACHEINFO cstamp, hundredths of a second since
   boot, counted in jiffies like CLOCK_MONOTONIC), and netmgr adds it when
   the call comes up and removes it when the call drops, so the age survives
   a restart of this daemon. Preference: a routable IPv4 on rmnet*, else a
   global IPv6 there (IPv6-only call), else any IPv4 (IP passthrough keeps
   only a link-local on rmnet). -1 without a data session. */
static long conn_uptime(void) {
    int fd = socket(AF_NETLINK, SOCK_RAW | SOCK_CLOEXEC, NETLINK_ROUTE);
    if (fd < 0) return -1;
    struct { struct nlmsghdr nh; struct ifaddrmsg ifa; } req;
    memset(&req, 0, sizeof(req));
    req.nh.nlmsg_len = sizeof(req);
    req.nh.nlmsg_type = RTM_GETADDR;
    req.nh.nlmsg_flags = NLM_F_REQUEST | NLM_F_DUMP;
    req.nh.nlmsg_seq = 1;
    req.ifa.ifa_family = AF_UNSPEC;
    struct sockaddr_nl to = { .nl_family = AF_NETLINK };
    if (sendto(fd, &req, sizeof(req), 0, (struct sockaddr *)&to, sizeof(to)) < 0) { close(fd); return -1; }
    long cstamp[3] = { -1, -1, -1 };     /* hundredths, by preference */
    static uint32_t buf[4096];           /* 16 KiB, netlink-aligned */
    for (int done = 0; !done; ) {
        struct pollfd p = { fd, POLLIN, 0 };
        if (poll(&p, 1, 200) <= 0) break;
        ssize_t n = recv(fd, buf, sizeof(buf), 0);
        if (n <= 0) break;
        for (size_t o = 0; o + sizeof(struct nlmsghdr) <= (size_t)n; ) {
            struct nlmsghdr *h = (struct nlmsghdr *)((char *)buf + o);
            if (h->nlmsg_len < sizeof(*h) || o + h->nlmsg_len > (size_t)n) break;
            o += NLMSG_ALIGN(h->nlmsg_len);
            if (h->nlmsg_type == NLMSG_DONE || h->nlmsg_type == NLMSG_ERROR) { done = 1; break; }
            if (h->nlmsg_type != RTM_NEWADDR || h->nlmsg_len < NLMSG_LENGTH(sizeof(struct ifaddrmsg))) continue;
            struct ifaddrmsg *ifa = NLMSG_DATA(h);
            char name[IF_NAMESIZE];
            if (!if_indextoname(ifa->ifa_index, name) || strncmp(name, "rmnet", 5)) continue;
            const uint8_t *addr = NULL;
            long cs = -1;
            for (size_t ao = NLMSG_LENGTH(sizeof(struct ifaddrmsg)); ao + sizeof(struct rtattr) <= h->nlmsg_len; ) {
                struct rtattr *a = (struct rtattr *)((char *)h + ao);
                if (a->rta_len < sizeof(*a) || ao + a->rta_len > h->nlmsg_len) break;
                ao += RTA_ALIGN(a->rta_len);
                if ((a->rta_type == IFA_ADDRESS || a->rta_type == IFA_LOCAL) && !addr) addr = RTA_DATA(a);
                if (a->rta_type == IFA_CACHEINFO && RTA_PAYLOAD(a) >= sizeof(struct ifa_cacheinfo))
                    cs = (long)((struct ifa_cacheinfo *)RTA_DATA(a))->cstamp;
            }
            if (!addr || cs < 0) continue;
            int rank;
            if (ifa->ifa_family == AF_INET) rank = (addr[0] == 169 && addr[1] == 254) ? 2 : 0;
            else if (ifa->ifa_family == AF_INET6 && ifa->ifa_scope == RT_SCOPE_UNIVERSE) rank = 1;
            else continue;
            if (cstamp[rank] < 0) cstamp[rank] = cs;
        }
    }
    close(fd);
    for (int r = 0; r < 3; r++) {
        if (cstamp[r] < 0) continue;
        long up = (long)(monotonic_ms() / 1000) - cstamp[r] / 100;
        return up > 0 ? up : 0;
    }
    return -1;
}

static void poll_system(void) {
    char b[4096];
    struct utsname u;
    if (uname(&u) == 0) {
        snprintf(sys.hostname, sizeof(sys.hostname), "%s", u.nodename);
        snprintf(sys.kernel, sizeof(sys.kernel), "%s", u.release);
    }
    struct statvfs vfs;
    sys.data_fs_ok = statvfs("/data", &vfs) == 0 && vfs.f_blocks > 0;
    if (sys.data_fs_ok) {
        uint64_t k = vfs.f_frsize ? vfs.f_frsize : vfs.f_bsize;
        sys.data_total_kb = (uint64_t)vfs.f_blocks * k / 1024;
        sys.data_used_kb = (uint64_t)(vfs.f_blocks - vfs.f_bfree) * k / 1024;
        sys.data_avail_kb = (uint64_t)vfs.f_bavail * k / 1024;
    }
    sys.conn_up_s = conn_uptime();
    if (read_file("/proc/uptime", b, sizeof(b)) > 0) sys.uptime = strtod(b, NULL);
    if (read_file("/proc/loadavg", b, sizeof(b)) > 0) sscanf(b, "%lf %lf %lf", &sys.load[0], &sys.load[1], &sys.load[2]);
    if (read_file("/proc/stat", b, sizeof(b)) > 0) {
        unsigned long long u, n, s, idle, io, irq, sirq;
        if (sscanf(b, "cpu %llu %llu %llu %llu %llu %llu %llu", &u, &n, &s, &idle, &io, &irq, &sirq) == 7) {
            uint64_t total = u + n + s + idle + io + irq + sirq, id = idle + io;
            if (sys.cpu_prev_total && total > sys.cpu_prev_total)
                sys.cpu_pct = (int)(100 * ((total - sys.cpu_prev_total) - (id - sys.cpu_prev_idle)) /
                                    (total - sys.cpu_prev_total));
            sys.cpu_prev_total = total; sys.cpu_prev_idle = id;
        }
    }
    if (read_file("/proc/meminfo", b, sizeof(b)) > 0) {
        char *p = strstr(b, "MemTotal:"), *q = strstr(b, "MemAvailable:");
        if (p) sys.mem_total = strtol(p + 9, NULL, 10);
        if (q) sys.mem_avail = strtol(q + 13, NULL, 10);
    }
    if (read_file("/sys/class/net/eth0/speed", b, sizeof(b)) > 0 && atoi(b) > 0)
        snprintf(sys.eth_speed, sizeof(sys.eth_speed), "%dMb/s", atoi(b));
    else
        snprintf(sys.eth_speed, sizeof(sys.eth_speed), "Unknown");
    if (read_file("/sys/class/net/eth0/duplex", b, sizeof(b)) > 0 && b[0])
        snprintf(sys.eth_duplex, sizeof(sys.eth_duplex), "%c%.*s", b[0] - 32 * (b[0] >= 'a'), (int)strcspn(b + 1, "\n"), b + 1);
    else
        snprintf(sys.eth_duplex, sizeof(sys.eth_duplex), "Unknown");
    wan_ip();
    sys.dns[0][0] = sys.dns[1][0] = 0;
    if (read_file("/etc/resolv.conf", b, sizeof(b)) > 0) {
        int k = 0;
        for (char *line = strtok(b, "\n"); line && k < 2; line = strtok(NULL, "\n"))
            if (sscanf(line, "nameserver %47s", sys.dns[k]) == 1) k++;
    }
}

/* ============= DATA COUNTER ============= */

/* Bytes through the cellular data path, kept across reboots, daemon
   restarts and counter restarts in DATA_FILE_DEFAULT (UBIFS: written every
   DATA_SAVE_MS when it changed, on SIGTERM and on a reset, never more).

   Source: the kernel counters of rmnet_ipa0, the IPA netdev that every data
   call's rmnet_dataN rides on, so the sum over all calls, IPv4 and IPv6
   (plus the 8-byte QMAP header of each packet, under 1 %). They restart at
   0 at boot and when the IPA driver re-creates the interface (modem
   restart: new ifindex), and they are unsigned long: on this 32-bit kernel
   they wrap at 4 GiB.

   What they miss: flows the IPA forwards in hardware between eth0 and the
   modem (eth0 offload is "Ready" in /sys/kernel/debug/ipa/ethernet) never
   reach the kernel. Read on the modem on 2026-10-19: rmnet_ipa0 RX was
   exactly the rmnet_dataN RX plus 8 bytes per packet, so nothing offloaded
   is folded into it (QManager's claim that IPA flushes offloaded bytes into
   the netdev counters does not hold here), and eth0's own counters do not
   even see local LAN traffic. The counts that include offloaded traffic
   live on the modem side and none is reachable from here as-is: QMI WDS Get
   Packet Statistics answers only for the data port, mux and IP family a
   client is bound to (QCMAP binds its own clients through the IPA endpoint
   ioctls), the Q6 tethering statistics need /dev/wwan_ioctl, and
   diag_bridge's transport-block rates count MAC bytes (retransmissions
   included) and only while it is subscribed. So this counts the traffic of
   the modem itself and of the LAN flows the kernel routes, which is what
   the "rmnet_ipa0" counter name in the snapshot stands for. */

#define DATA_FILE_DEFAULT "/data/simpleadmin/data_usage"
#define DATA_IFACE        "rmnet_ipa0"
#define DATA_SAMPLE_MS    10000
#define DATA_SAVE_MS      600000

/* Interface counters of one sample: bytes and packets, RX and TX. */
enum { DU_RX, DU_TX, DU_RX_PKT, DU_TX_PKT, DU_N };
static const char *const du_stat[DU_N] = { "rx_bytes", "tx_bytes", "rx_packets", "tx_packets" };

static struct {
    uint64_t rx, tx;              /* accumulated since reset_at */
    uint64_t raw[DU_N];           /* interface counters at the last sample */
    int ifindex;                  /* of DATA_IFACE then; 0 no baseline yet,
                                     -1 counters since this boot's start */
    time_t sampled_at, reset_at, saved_at;
    unsigned resets;              /* counter restarts since reset_at */
    int ok;                       /* the last read succeeded */
    int dirty;                    /* changed since the last save */
    int loaded;                   /* the file was read */
} du;
static const char *data_file = DATA_FILE_DEFAULT;
static char boot_id[40];
static volatile sig_atomic_t data_reset_req;

static int read_u64(const char *path, uint64_t *v) {
    char b[32];
    if (read_file(path, b, sizeof(b)) <= 0) return -1;
    *v = strtoull(b, NULL, 10);
    return 0;
}

/* Growth of a byte counter between two samples of the same interface.
   Backwards is a 32-bit wrap or a restart; the packet counter tells them
   apart: bytes cannot wrap without packets moving forward, while a restart
   takes the packets back too. (A packet counter wrapping in the same
   interval reads as a restart: one interval lost, never phantom bytes.) */
static uint64_t counter_delta(uint64_t prev, uint64_t now, uint64_t prev_pkt, uint64_t now_pkt, int *restarted) {
    if (now >= prev) return now - prev;
    if (now_pkt > prev_pkt && prev <= 0xFFFFFFFFULL) return now + (0x100000000ULL - prev);
    *restarted = 1;
    return now;
}

static void data_sample(void) {
    char b[16], path[64];
    uint64_t c[DU_N];
    int idx = read_file("/sys/class/net/" DATA_IFACE "/ifindex", b, sizeof(b)) > 0 ? atoi(b) : 0;
    du.ok = idx > 0;
    for (int k = 0; k < DU_N && du.ok; k++) {
        snprintf(path, sizeof(path), "/sys/class/net/" DATA_IFACE "/statistics/%s", du_stat[k]);
        du.ok = read_u64(path, &c[k]) == 0;
    }
    if (!du.ok) return;
    if (!du.ifindex) {
        /* No baseline (first run, or a reset without a sample): count
           from now on. */
    } else if (du.ifindex < 0) {
        /* First sample of a new boot: the counters started at 0. */
        du.rx += c[DU_RX]; du.tx += c[DU_TX];
    } else if (idx != du.ifindex) {
        /* Re-created interface: its counters started again from 0. */
        du.rx += c[DU_RX]; du.tx += c[DU_TX]; du.resets++;
    } else {
        int restarted = 0;
        du.rx += counter_delta(du.raw[DU_RX], c[DU_RX], du.raw[DU_RX_PKT], c[DU_RX_PKT], &restarted);
        du.tx += counter_delta(du.raw[DU_TX], c[DU_TX], du.raw[DU_TX_PKT], c[DU_TX_PKT], &restarted);
        if (restarted) du.resets++;
    }
    if (memcmp(c, du.raw, sizeof(c)) || idx != du.ifindex) du.dirty = 1;
    memcpy(du.raw, c, sizeof(c));
    du.ifindex = idx;
    du.sampled_at = time(NULL);
}

/* key=value lines; the interface baseline only counts within the boot that
   wrote it. After a reboot the counters started from 0 at boot, so the
   first sample adds all of them. */
static void data_load(void) {
    char b[1024];
    if (read_file("/proc/sys/kernel/random/boot_id", boot_id, sizeof(boot_id)) > 0)
        boot_id[strcspn(boot_id, "\n")] = 0;
    du.reset_at = time(NULL);
    if (read_file(data_file, b, sizeof(b)) <= 0) { du.dirty = 1; return; }
    char file_boot[40] = "", key[24];
    unsigned long long v;
    int idx = 0, have_idx = 0;
    uint64_t raw[DU_N] = { 0 };
    for (char *line = strtok(b, "\n"); line; line = strtok(NULL, "\n")) {
        if (sscanf(line, "boot_id=%39s", file_boot) == 1) continue;
        if (sscanf(line, "ifindex=%d", &idx) == 1) { have_idx = 1; continue; }   /* may be -1 */
        if (sscanf(line, "%23[a-z_]=%llu", key, &v) != 2) continue;
        if (!strcmp(key, "rx")) du.rx = v;
        else if (!strcmp(key, "tx")) du.tx = v;
        else if (!strcmp(key, "reset_at")) du.reset_at = (time_t)v;
        else if (!strcmp(key, "resets")) du.resets = (unsigned)v;
        else if (!strcmp(key, "saved_at")) du.saved_at = (time_t)v;
        else if (!strncmp(key, "raw_", 4))
            for (int k = 0; k < DU_N; k++) if (!strcmp(key + 4, du_stat[k])) raw[k] = v;
    }
    du.loaded = 1;
    if (boot_id[0] && !strcmp(file_boot, boot_id)) {
        /* Same boot: the kernel kept counting while this daemon was down. */
        du.ifindex = have_idx ? idx : 0;
        memcpy(du.raw, raw, sizeof(raw));
    } else {
        /* Bytes after the last save of the previous boot are lost: on a
           clean reboot systemd's SIGTERM saved them. */
        du.ifindex = -1;
        du.resets++;
        du.dirty = 1;
    }
}

/* Written beside the file and renamed over it, then the directory synced,
   so a power cut leaves the old or the new copy, never half of one, and a
   saved reset is not undone. */
static void data_save(void) {
    char tmp[256], dir[256];
    snprintf(tmp, sizeof(tmp), "%s.tmp", data_file);
    FILE *f = fopen(tmp, "w");
    if (!f) { dbg("[data] cannot write %s: %s\n", tmp, strerror(errno)); return; }
    time_t now = time(NULL);
    fprintf(f, "boot_id=%s\nifindex=%d\n", boot_id, du.ifindex);
    for (int k = 0; k < DU_N; k++) fprintf(f, "raw_%s=%llu\n", du_stat[k], (unsigned long long)du.raw[k]);
    fprintf(f, "rx=%llu\ntx=%llu\nreset_at=%lld\nresets=%u\nsaved_at=%lld\n",
            (unsigned long long)du.rx, (unsigned long long)du.tx,
            (long long)du.reset_at, du.resets, (long long)now);
    int bad = fflush(f) != 0 || fsync(fileno(f)) != 0;
    if (fclose(f) != 0 || bad || rename(tmp, data_file) != 0) {
        dbg("[data] cannot write %s: %s\n", data_file, strerror(errno));
        unlink(tmp);
        return;
    }
    snprintf(dir, sizeof(dir), "%s", data_file);
    int dfd = open(dirname(dir), O_RDONLY);
    if (dfd >= 0) { fsync(dfd); close(dfd); }
    du.saved_at = now;
    du.dirty = 0;
}

/* SIGUSR1 (cgi-bin/reset_data_usage): zero and save at once. Without a
   fresh sample the old baseline would bring pre-reset bytes back: count
   from the next sample instead. */
static void data_reset(void) {
    data_sample();
    if (!du.ok) du.ifindex = 0;
    du.rx = du.tx = 0;
    du.resets = 0;
    du.reset_at = time(NULL);
    data_save();
}

/* ============= CONNECTIVITY ============= */

/* The checks run in rounds every CONN_MS, with or without clients: pings
   only while nobody is connected (they feed the latency history), pings,
   DNS and the captive portal probe while someone is. `state` is the round
   in flight, `shown` the last finished round, which is what the snapshot
   publishes. */
struct ping_target { char host[64]; struct in_addr addr; int state, shown; double ms, shown_ms; uint16_t seq; uint64_t sent_ms; };
struct dns_target { char server[64], domain[128]; int state, shown; uint16_t id; uint64_t sent_ms; int fd; };
enum { CK_IDLE, CK_WAIT, CK_OK, CK_FAILED, CK_PORTAL };

static struct ping_target pings[MAX_TARGETS];
static struct dns_target dnss[MAX_TARGETS];
static int npings, ndns;
static int icmp_fd = -1;
static uint16_t echo_id;
static time_t conf_mtime;
static int round_open, round_full;   /* a round is in flight; it runs DNS too */
static uint64_t round_start_ms;

/* Captive portal probe (SIMPLEADMIN_HTTP_PROBE, empty disables it): an
   http:// URL that answers 204 No Content. A redirect, or any other answer
   but a 200 with an empty body, means something on the path intercepts web
   traffic: a captive, billing or activation page. No answer is a failed
   check like a lost ping. */
#define HTTP_PROBE_DEFAULT "http://connectivitycheck.gstatic.com/generate_204"
struct http_result { int state, code, ms; char reason[12], location[160]; };
static struct {
    char url[256], host[128], path[256];
    uint16_t port;
    int timeout_s;                   /* SIMPLEADMIN_HTTP_PROBE_TIMEOUT, 1..9 */
    int url_ok;
    struct http_result live, shown;
    pid_t pid;                       /* the child doing the request */
    int fd;                          /* its pipe, -1 when none */
    uint64_t sent_ms;
} hp = { .pid = -1, .fd = -1, .timeout_s = 5 };

/* "http://host[:port][/path]" into hp. */
static int http_parse_url(void) {
    const char *h = hp.url + 7;
    if (strncmp(hp.url, "http://", 7)) return -1;
    size_t hl = strcspn(h, ":/?");
    if (!hl || hl >= sizeof(hp.host)) return -1;
    memcpy(hp.host, h, hl);
    hp.host[hl] = 0;
    h += hl;
    hp.port = 80;
    if (*h == ':') {
        char *end;
        long v = strtol(h + 1, &end, 10);
        if (v < 1 || v > 65535 || end == h + 1) return -1;
        hp.port = (uint16_t)v;
        h = end;
    }
    snprintf(hp.path, sizeof(hp.path), "%s%s", *h == '/' ? "" : "/", h);
    return 0;
}

/* Latency history: the average RTT of every round of the last 24 h, in ms,
   -1 when no target answered. 17 KiB. */
#define LAT_HISTORY  (24 * 3600 * 1000 / CONN_MS)
static int16_t lat_hist[LAT_HISTORY];
static int lat_n, lat_head;           /* head: next slot */
static uint64_t lat_last_ms;          /* monotonic time of the newest */
static uint32_t conn_seq;             /* rounds recorded so far */

static void lat_push(int ms) {
    lat_hist[lat_head] = (int16_t)(ms > 30000 ? 30000 : ms);
    lat_head = (lat_head + 1) % LAT_HISTORY;
    if (lat_n < LAT_HISTORY) lat_n++;
    lat_last_ms = monotonic_ms();
    conn_seq++;
}

/* SIMPLEADMIN_PING_TARGETS="a,b", SIMPLEADMIN_DNS_TESTS="server:domain,...",
   SIMPLEADMIN_HTTP_PROBE="http://..." and SIMPLEADMIN_HTTP_PROBE_TIMEOUT=s */
static void load_conf(void) {
    struct stat st;
    if (stat(conf_file, &st) == 0 && st.st_mtime == conf_mtime && (npings || ndns)) return;
    conf_mtime = st.st_mtime;
    char ping_list[256] = "8.8.8.8,1.1.1.1", dns_list[512] = "8.8.8.8:www.google.com,1.1.1.1:www.google.com";
    char b[8192];
    snprintf(hp.url, sizeof(hp.url), "%s", HTTP_PROBE_DEFAULT);
    hp.timeout_s = 5;
    if (read_file(conf_file, b, sizeof(b)) > 0) {
        for (char *line = strtok(b, "\n"); line; line = strtok(NULL, "\n")) {
            if (!strncmp(line, "SIMPLEADMIN_PING_TARGETS=", 25)) sscanf(line + 25, "\"%255[^\"]\"", ping_list);
            if (!strncmp(line, "SIMPLEADMIN_DNS_TESTS=", 22)) sscanf(line + 22, "\"%511[^\"]\"", dns_list);
            if (!strncmp(line, "SIMPLEADMIN_HTTP_PROBE=", 23)) {
                hp.url[0] = 0;          /* present but empty: disabled */
                if (line[23] == '"') sscanf(line + 23, "\"%255[^\"]\"", hp.url);
                else sscanf(line + 23, "%255s", hp.url);
            }
            if (!strncmp(line, "SIMPLEADMIN_HTTP_PROBE_TIMEOUT=", 31))
                hp.timeout_s = atoi(line + 31 + (line[31] == '"'));
        }
    }
    if (hp.timeout_s < 1 || hp.timeout_s > 9) hp.timeout_s = 5;
    hp.url_ok = hp.url[0] && http_parse_url() == 0;
    npings = ndns = 0;
    for (char *t = strtok(ping_list, ","); t && npings < MAX_TARGETS; t = strtok(NULL, ",")) {
        while (*t == ' ') t++;
        struct ping_target *p = &pings[npings];
        memset(p, 0, sizeof(*p));
        snprintf(p->host, sizeof(p->host), "%s", t);
        if (inet_pton(AF_INET, p->host, &p->addr) == 1) npings++;
    }
    for (char *t = strtok(dns_list, ","); t && ndns < MAX_TARGETS; t = strtok(NULL, ",")) {
        while (*t == ' ') t++;
        struct dns_target *d = &dnss[ndns];
        memset(d, 0, sizeof(*d));
        d->fd = -1;
        if (sscanf(t, "%63[^:]:%127s", d->server, d->domain) == 2) ndns++;
    }
}

static uint16_t icmp_checksum(const void *data, size_t len) {
    const uint8_t *p = data;
    uint32_t sum = 0;
    for (size_t i = 0; i + 1 < len; i += 2) sum += (uint32_t)(p[i] << 8 | p[i + 1]);
    if (len & 1) sum += (uint32_t)p[len - 1] << 8;
    while (sum >> 16) sum = (sum & 0xffff) + (sum >> 16);
    return htons((uint16_t)~sum);
}

static int write_all(int fd, const char *b, size_t n);

/* Value of a response header (case-insensitive name with its colon), NULL
   when absent. hend: the blank line ending the headers. */
static const char *http_header(const char *rsp, const char *hend, const char *name) {
    size_t nl = strlen(name);
    for (const char *l = strstr(rsp, "\r\n"); l && l < hend; l = strstr(l + 2, "\r\n"))
        if (!strncasecmp(l + 2, name, nl)) {
            const char *v = l + 2 + nl;
            while (*v == ' ') v++;
            return v;
        }
    return NULL;
}

/* The probe runs in a child, so a slow resolver or server never stalls the
   main loop: one HTTP/1.1 GET over IPv4, the name resolved by getaddrinfo
   (the modem's resolver). The answer goes to the pipe as one line:
   "<ok|dns|connect|timeout|malformed> <code> <ms> <body bytes, -1 unknown>
   <Location or ->". */
static void http_child(int wfd) {
    for (int fd = 3; fd < 1024; fd++) if (fd != wfd) close(fd);
    signal(SIGALRM, SIG_DFL);
    alarm((unsigned)hp.timeout_s + 1);       /* the parent kills it anyway */
    uint64_t t0 = monotonic_ms();
    const char *reason = "dns";
    int code = 0;
    long body = -1;
    char loc[160] = "-", port[8];
    snprintf(port, sizeof(port), "%u", hp.port);
    struct addrinfo hints, *ai = NULL;
    memset(&hints, 0, sizeof(hints));
    hints.ai_family = AF_INET;
    hints.ai_socktype = SOCK_STREAM;
    if (getaddrinfo(hp.host, port, &hints, &ai) == 0 && ai) {
        reason = "connect";
        int s = socket(AF_INET, SOCK_STREAM, 0);
        struct timeval tv = { hp.timeout_s, 0 };
        if (s >= 0) {
            setsockopt(s, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));   /* connect too */
            setsockopt(s, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
        }
        if (s >= 0 && connect(s, ai->ai_addr, ai->ai_addrlen) == 0) {
            reason = "timeout";
            char req[640], hosthdr[136];
            if (hp.port == 80) snprintf(hosthdr, sizeof(hosthdr), "%s", hp.host);
            else snprintf(hosthdr, sizeof(hosthdr), "%s:%u", hp.host, hp.port);
            int n = snprintf(req, sizeof(req), "GET %s HTTP/1.1\r\nHost: %s\r\nUser-Agent: SimpleAdmin\r\n"
                                               "Accept: */*\r\nConnection: close\r\n\r\n", hp.path, hosthdr);
            static char rsp[4096];
            size_t len = 0;
            int major, minor;
            const char *hend = NULL;
            if (n > 0 && (size_t)n < sizeof(req) && write_all(s, req, (size_t)n) == 0) {
                /* Until the headers are in, and for a 200 without a length
                   the start of a body, which tells a page from nothing. */
                for (;;) {
                    ssize_t r = read(s, rsp + len, sizeof(rsp) - 1 - len);
                    if (r <= 0) break;
                    len += (size_t)r;
                    rsp[len] = 0;
                    if (!(hend = strstr(rsp, "\r\n\r\n"))) { if (len >= sizeof(rsp) - 1) break; continue; }
                    if (sscanf(rsp, "HTTP/%d.%d %d", &major, &minor, &code) != 3 || code != 200 ||
                        hend + 4 < rsp + len || http_header(rsp, hend, "Content-Length:") || len >= sizeof(rsp) - 1)
                        break;
                }
            }
            if (len && sscanf(rsp, "HTTP/%d.%d %d", &major, &minor, &code) == 3) {
                reason = "ok";
                if (!hend) hend = rsp + len;            /* cut short: headers so far */
                else body = (long)(len - (size_t)(hend + 4 - rsp));
                const char *v = http_header(rsp, hend, "Content-Length:");
                if (v) body = strtol(v, NULL, 10);
                if ((v = http_header(rsp, hend, "Location:"))) {
                    size_t k = 0;
                    for (; v[k] > ' ' && v[k] < 0x7f && k + 1 < sizeof(loc); k++) loc[k] = v[k];
                    if (k) loc[k] = 0;
                }
            } else if (len) {
                reason = "malformed";
            }
        }
        if (s >= 0) close(s);
        freeaddrinfo(ai);
    }
    dprintf(wfd, "%s %d %llu %ld %s\n", reason, code, (unsigned long long)(monotonic_ms() - t0), body, loc);
    _exit(0);
}

static void http_stop(void) {
    if (hp.fd >= 0) { close(hp.fd); hp.fd = -1; }
    if (hp.pid > 0) { kill(hp.pid, SIGKILL); waitpid(hp.pid, NULL, 0); hp.pid = -1; }
}

static void http_start(void) {
    http_stop();
    memset(&hp.live, 0, sizeof(hp.live));
    hp.live.state = CK_FAILED;
    if (!hp.url_ok) { snprintf(hp.live.reason, sizeof(hp.live.reason), "url"); return; }
    snprintf(hp.live.reason, sizeof(hp.live.reason), "internal");
    int p[2];
    if (pipe(p) < 0) return;
    pid_t pid = fork();
    if (pid < 0) { close(p[0]); close(p[1]); return; }
    if (pid == 0) { close(p[0]); http_child(p[1]); }
    close(p[1]);
    fcntl(p[0], F_SETFL, O_NONBLOCK);
    fcntl(p[0], F_SETFD, FD_CLOEXEC);
    hp.pid = pid;
    hp.fd = p[0];
    hp.sent_ms = monotonic_ms();
    hp.live.state = CK_WAIT;
}

/* The child's line: 204, or 200 with an empty body, is the open internet;
   any other answer an interception. */
static void http_read(void) {
    char b[256];
    ssize_t n = read(hp.fd, b, sizeof(b) - 1);
    if (n < 0 && (errno == EAGAIN || errno == EINTR)) return;
    struct http_result *h = &hp.live;
    h->state = CK_FAILED;
    snprintf(h->reason, sizeof(h->reason), "timeout");    /* killed by its alarm */
    if (n > 0) {
        b[n] = 0;
        char reason[12], loc[160];
        unsigned long long ms;
        long body;
        int code;
        if (sscanf(b, "%11s %d %llu %ld %159s", reason, &code, &ms, &body, loc) == 5) {
            snprintf(h->reason, sizeof(h->reason), "%s", reason);
            h->code = code;
            h->ms = (int)ms;
            snprintf(h->location, sizeof(h->location), "%s", strcmp(loc, "-") ? loc : "");
            if (!strcmp(reason, "ok")) h->state = code == 204 || (code == 200 && body == 0) ? CK_OK : CK_PORTAL;
        }
    }
    http_stop();
}

static void conn_start(int full) {
    load_conf();
    uint64_t now = monotonic_ms();
    round_open = 1;
    round_full = full;
    round_start_ms = now;
    for (int i = 0; i < npings; i++) {
        struct ping_target *p = &pings[i];
        uint8_t pkt[64];
        memset(pkt, 0, sizeof(pkt));
        struct icmphdr *h = (struct icmphdr *)pkt;
        h->type = ICMP_ECHO;
        h->un.echo.id = htons(echo_id);
        h->un.echo.sequence = htons(++p->seq);
        h->checksum = icmp_checksum(pkt, sizeof(pkt));
        struct sockaddr_in to = { .sin_family = AF_INET, .sin_addr = p->addr };
        p->state = (icmp_fd >= 0 && sendto(icmp_fd, pkt, sizeof(pkt), 0, (struct sockaddr *)&to, sizeof(to)) > 0)
                   ? CK_WAIT : CK_FAILED;
        p->sent_ms = now;
    }
    for (int i = 0; i < ndns; i++) {
        struct dns_target *d = &dnss[i];
        if (d->fd >= 0) close(d->fd);
        d->fd = -1;
        d->state = CK_IDLE;
        if (!full) continue;
        d->fd = socket(AF_INET, SOCK_DGRAM | SOCK_NONBLOCK, 0);
        struct sockaddr_in to = { .sin_family = AF_INET, .sin_port = htons(53) };
        uint8_t q[300];
        size_t n = 12;
        d->id = (uint16_t)(rand() & 0xffff);
        memset(q, 0, 12);
        q[0] = d->id >> 8; q[1] = d->id & 0xff; q[2] = 0x01; q[5] = 1;   /* RD, one question */
        for (char *lab = d->domain; *lab && n < sizeof(q) - 70; ) {
            size_t ll = strcspn(lab, ".");
            if (!ll || ll > 63) break;
            q[n++] = (uint8_t)ll; memcpy(q + n, lab, ll); n += ll;
            lab += ll; if (*lab == '.') lab++;
        }
        q[n++] = 0; q[n++] = 0; q[n++] = 1; q[n++] = 0; q[n++] = 1;      /* A, IN */
        d->state = (d->fd >= 0 && inet_pton(AF_INET, d->server, &to.sin_addr) == 1 &&
                    sendto(d->fd, q, n, 0, (struct sockaddr *)&to, sizeof(to)) > 0) ? CK_WAIT : CK_FAILED;
        d->sent_ms = now;
    }
    if (full && hp.url[0]) {
        http_start();
    } else {
        http_stop();
        memset(&hp.live, 0, sizeof(hp.live));       /* CK_IDLE */
    }
}

static void icmp_read(void) {
    uint8_t buf[512];
    struct sockaddr_in from;
    socklen_t fl = sizeof(from);
    ssize_t n = recvfrom(icmp_fd, buf, sizeof(buf), 0, (struct sockaddr *)&from, &fl);
    if (n < (ssize_t)sizeof(struct iphdr)) return;
    size_t ihl = (buf[0] & 0x0f) * 4u;
    if ((size_t)n < ihl + sizeof(struct icmphdr)) return;
    struct icmphdr *h = (struct icmphdr *)(buf + ihl);
    if (h->type != ICMP_ECHOREPLY || ntohs(h->un.echo.id) != echo_id) return;
    for (int i = 0; i < npings; i++) {
        struct ping_target *p = &pings[i];
        if (p->state == CK_WAIT && p->addr.s_addr == from.sin_addr.s_addr && ntohs(h->un.echo.sequence) == p->seq) {
            p->ms = (double)(monotonic_ms() - p->sent_ms);
            p->state = CK_OK;
        }
    }
}

static void dns_read(struct dns_target *d) {
    uint8_t buf[512];
    ssize_t n = recv(d->fd, buf, sizeof(buf), 0);
    if (n < 12 || ((buf[0] << 8) | buf[1]) != d->id) return;
    d->state = ((buf[3] & 0x0f) == 0 && ((buf[6] << 8) | buf[7]) > 0) ? CK_OK : CK_FAILED;
    close(d->fd);
    d->fd = -1;
}

/* Timeouts; with force, everything still in flight fails now. */
static void conn_expire(int force) {
    uint64_t now = monotonic_ms();
    for (int i = 0; i < npings; i++)
        if (pings[i].state == CK_WAIT && (force || now - pings[i].sent_ms > PING_TIMEOUT_MS)) pings[i].state = CK_FAILED;
    for (int i = 0; i < ndns; i++)
        if (dnss[i].state == CK_WAIT && (force || now - dnss[i].sent_ms > DNS_TIMEOUT_MS)) {
            dnss[i].state = CK_FAILED;
            if (dnss[i].fd >= 0) { close(dnss[i].fd); dnss[i].fd = -1; }
        }
    if (hp.live.state == CK_WAIT && (force || now - hp.sent_ms > (uint64_t)hp.timeout_s * 1000 + 500)) {
        http_stop();
        hp.live.state = CK_FAILED;
        snprintf(hp.live.reason, sizeof(hp.live.reason), "timeout");
    }
}

/* Once nothing is in flight the round's results are published and its
   average RTT goes into the latency history. A round without DNS and probe
   leaves their results unknown rather than showing old ones. */
static void conn_finish(void) {
    if (!round_open) return;
    for (int i = 0; i < npings; i++) if (pings[i].state == CK_WAIT) return;
    for (int i = 0; i < ndns; i++) if (dnss[i].state == CK_WAIT) return;
    if (hp.live.state == CK_WAIT) return;
    round_open = 0;
    hp.shown = hp.live;
    int pass = 0;
    double sum = 0;
    for (int i = 0; i < npings; i++) {
        pings[i].shown = pings[i].state;
        pings[i].shown_ms = pings[i].ms;
        if (pings[i].state == CK_OK) { pass++; sum += pings[i].ms; }
    }
    for (int i = 0; i < ndns; i++) dnss[i].shown = round_full ? dnss[i].state : CK_IDLE;
    if (npings) lat_push(pass ? (int)(sum / pass + 0.5) : -1);
}

/* ============= SIGNAL HISTORY ============= */

/* One QMI radio sample every SIGNAL_MS for the last 30 min, with or
   without clients, so the dashboard's signal chart starts full. Values are
   tenths of dB(m), SIG_NONE where unknown: per-chain RSRP, RSRQ and SINR
   for LTE (PCell) then NR. QMI has no per-chain SINR. */
#define SIG_HISTORY  (30 * 60 * 1000 / SIGNAL_MS)
#define SIG_NONE     INT16_MIN
enum { SIG_LTE_RSRP = 0, SIG_LTE_RSRQ = 4, SIG_LTE_SINR, SIG_NR_RSRP, SIG_NR_RSRQ = 10, SIG_NR_SINR, SIG_COLS };

struct sig_row { uint32_t t_s; int16_t v[SIG_COLS]; };   /* t_s: monotonic seconds */
static struct sig_row sig_hist[SIG_HISTORY];
static int sig_n, sig_head;

static int16_t x10(int v) { return v == INT32_MIN || v == INVALID_DB || v < -32000 || v > 32000 ? SIG_NONE : (int16_t)v; }

static void sig_chains(int16_t *out, const struct chain *c, int fallback_db) {
    int any = 0;
    for (int k = 0; k < 4; k++) {
        out[k] = c[k].valid ? x10(c[k].rsrp_x10) : SIG_NONE;
        any |= out[k] != SIG_NONE;
    }
    if (!any && fallback_db != INVALID_DB) out[0] = x10(fallback_db * 10);
}

static void sig_push(void) {
    if (!md.radio_at || time(NULL) - md.radio_at > 5 || (!md.lte.valid && !md.nr.valid)) return;
    struct sig_row *r = &sig_hist[sig_head];
    for (int k = 0; k < SIG_COLS; k++) r->v[k] = SIG_NONE;
    r->t_s = (uint32_t)(monotonic_ms() / 1000);
    if (md.lte.valid) {
        sig_chains(r->v + SIG_LTE_RSRP, md.lte.chains, md.lte.rsrp);
        r->v[SIG_LTE_RSRQ] = x10(md.lte.rsrq * 10);
        r->v[SIG_LTE_SINR] = x10(md.lte.snr_x10);
    }
    if (md.nr.valid) {
        sig_chains(r->v + SIG_NR_RSRP, md.nr.chains, md.nr.rsrp);
        if (md.nr.rsrq != INVALID_DB) r->v[SIG_NR_RSRQ] = x10(md.nr.rsrq * 10);
        if (md.nr.snr_x10 != INVALID_DB) r->v[SIG_NR_SINR] = x10(md.nr.snr_x10);
    }
    sig_head = (sig_head + 1) % SIG_HISTORY;
    if (sig_n < SIG_HISTORY) sig_n++;
}

/* The one-time message a new client gets before its first snapshot:
     {"history":{"seq":N,
       "latency":{"interval_s":10,"age_s":A,"rtt":[ms|null,...]},
       "signal":{"interval_s":10,"rows":[[age_s, lte_rsrp x4, lte_rsrq,
                 lte_sinr, nr_rsrp x4, nr_rsrq, nr_sinr],...]}}}
   oldest first. rtt holds one value per round, age_s is the age of the
   newest; seq is the conn.seq of that round, so the client appends only
   later rounds. About 45 KB when full. */
static size_t serialize_history(char *out, size_t cap) {
    struct jbuf j = { out, 0, cap };
    uint64_t now = monotonic_ms();
    jcat(&j, "{\"history\":{\"seq\":%u,\"latency\":{\"interval_s\":%d,\"age_s\":%ld,\"rtt\":[",
         conn_seq, CONN_MS / 1000, lat_n ? (long)((now - lat_last_ms) / 1000) : -1L);
    for (int k = 0; k < lat_n; k++) {
        int16_t v = lat_hist[(lat_head - lat_n + k + LAT_HISTORY) % LAT_HISTORY];
        if (v < 0) jcat(&j, "%snull", k ? "," : ""); else jcat(&j, "%s%d", k ? "," : "", v);
    }
    jcat(&j, "]},\"signal\":{\"interval_s\":%d,\"rows\":[", SIGNAL_MS / 1000);
    uint32_t now_s = (uint32_t)(now / 1000);
    for (int k = 0; k < sig_n; k++) {
        const struct sig_row *r = &sig_hist[(sig_head - sig_n + k + SIG_HISTORY) % SIG_HISTORY];
        jcat(&j, "%s[%u", k ? "," : "", now_s - r->t_s);
        for (int c = 0; c < SIG_COLS; c++) {
            int16_t v = r->v[c];
            if (v == SIG_NONE) jcat(&j, ",null");
            else if (c == SIG_LTE_SINR || c == SIG_NR_SINR) jcat(&j, ",%.1f", v / 10.0);
            else jcat(&j, ",%d", (v + (v < 0 ? -5 : 5)) / 10);   /* whole dB(m) */
        }
        jcat(&j, "]");
    }
    jcat(&j, "]}}}");
    return j.n;
}

/* ============= SERIALIZATION ============= */

static void json_x10(struct jbuf *j, const char *key, int v) {
    if (v == INT32_MIN || v == INVALID_DB) jcat(j, ",\"%s\":null", key);
    else jcat(j, ",\"%s\":%.1f", key, v / 10.0);
}

static void json_chains(struct jbuf *j, const struct chain *c) {
    jcat(j, ",\"rsrp_rx\":[");
    for (int k = 0; k < 4; k++) {
        if (k) jcat(j, ",");
        if (c[k].valid) jcat(j, "%.1f", c[k].rsrp_x10 / 10.0); else jcat(j, "null");
    }
    jcat(j, "]");
}

static size_t serialize(char *out, size_t cap) {
    struct jbuf j = { out, 0, cap };
    long used = sys.mem_total - sys.mem_avail;
    jcat(&j, "{\"sys\":{\"uptime_s\":%.0f,\"load\":[%.2f,%.2f,%.2f],\"cpu_pct\":%d,"
             "\"mem_total_kb\":%ld,\"mem_used_kb\":%ld,\"mem_pct\":%ld,\"eth\":{\"speed\":",
         sys.uptime, sys.load[0], sys.load[1], sys.load[2], sys.cpu_pct,
         sys.mem_total, used, sys.mem_total ? 100 * used / sys.mem_total : 0);
    jstr(&j, sys.eth_speed); jcat(&j, ",\"duplex\":"); jstr(&j, sys.eth_duplex);
    jcat(&j, "},\"hostname\":"); jstr(&j, sys.hostname);
    jcat(&j, ",\"kernel\":"); jstr(&j, sys.kernel);
    if (sys.data_fs_ok)
        jcat(&j, ",\"data_fs\":{\"total_kb\":%llu,\"used_kb\":%llu,\"avail_kb\":%llu}",
             (unsigned long long)sys.data_total_kb, (unsigned long long)sys.data_used_kb,
             (unsigned long long)sys.data_avail_kb);
    else
        jcat(&j, ",\"data_fs\":null");
    jcat(&j, "},\"net\":{\"wan_ip\":"); jstr(&j, sys.wan_ip);
    if (sys.conn_up_s >= 0) jcat(&j, ",\"conn_uptime_s\":%ld", sys.conn_up_s);
    else jcat(&j, ",\"conn_uptime_s\":null");
    jcat(&j, ",\"dns\":["); jstr(&j, sys.dns[0]); if (sys.dns[1][0]) { jcat(&j, ","); jstr(&j, sys.dns[1]); }
    jcat(&j, "],\"apn\":"); jstr(&j, md.apn);
    jcat(&j, "},\"data\":{\"counter\":\"" DATA_IFACE "\",\"ok\":%s,\"rx\":%llu,\"tx\":%llu,"
             "\"sampled_at\":%lld,\"reset_at\":%lld,\"resets\":%u,\"saved_at\":%lld",
         du.ok ? "true" : "false", (unsigned long long)du.rx, (unsigned long long)du.tx,
         (long long)du.sampled_at, (long long)du.reset_at, du.resets, (long long)du.saved_at);

    /* Connectivity: the last finished round, same shape as cgi-bin/get_ping.
       The status counts the checks that ran: all passed "ok", some
       "warning", none "error", "pending" before any finished; a captive
       portal makes it "warning" with portal true whatever the rest says.
       seq counts the rounds in the latency history. */
    int pass_p = 0, pass_d = 0, done = 0, pending = 0, nt = 0;
    double sum = 0;
    for (int i = 0; i < npings; i++) {
        if (pings[i].shown == CK_OK) { pass_p++; sum += pings[i].shown_ms; nt++; }
        if (pings[i].shown == CK_IDLE) pending++; else done++;
    }
    for (int i = 0; i < ndns; i++) {
        if (dnss[i].shown == CK_OK) pass_d++;
        if (dnss[i].shown == CK_IDLE) pending++; else done++;
    }
    const struct http_result *h = &hp.shown;
    int pass_h = 0, portal = hp.url[0] && h->state == CK_PORTAL;
    if (hp.url[0]) {
        if (h->state == CK_OK) pass_h = 1;
        if (h->state == CK_IDLE) pending++; else done++;
    }
    int pass = pass_p + pass_d + pass_h;
    const char *status = !done ? "pending" : portal ? "warning" : pass == done ? "ok" : pass ? "warning" : "error";
    jcat(&j, "},\"conn\":{\"status\":\"%s\",\"pending\":%s,\"portal\":%s,\"seq\":%u,"
             "\"ping\":{\"total\":%d,\"passed\":%d,\"avg_ms\":",
         status, pending ? "true" : "false", portal ? "true" : "false", conn_seq, npings, pass_p);
    if (nt) jcat(&j, "%.1f", sum / nt); else jcat(&j, "null");
    jcat(&j, ",\"results\":[");
    for (int i = 0; i < npings; i++) {
        jcat(&j, "%s{\"host\":", i ? "," : ""); jstr(&j, pings[i].host);
        jcat(&j, ",\"status\":\"%s\"", pings[i].shown == CK_OK ? "ok" : pings[i].shown == CK_FAILED ? "failed" : "pending");
        if (pings[i].shown == CK_OK) jcat(&j, ",\"time\":%.1f", pings[i].shown_ms);
        jcat(&j, "}");
    }
    jcat(&j, "]},\"dns\":{\"total\":%d,\"passed\":%d,\"results\":[", ndns, pass_d);
    for (int i = 0; i < ndns; i++) {
        jcat(&j, "%s{\"server\":", i ? "," : ""); jstr(&j, dnss[i].server);
        jcat(&j, ",\"domain\":"); jstr(&j, dnss[i].domain);
        jcat(&j, ",\"status\":\"%s\"}", dnss[i].shown == CK_OK ? "ok" : dnss[i].shown == CK_FAILED ? "failed" : "pending");
    }
    jcat(&j, "]},\"http\":");
    if (hp.url[0]) {
        jcat(&j, "{\"url\":"); jstr(&j, hp.url);
        jcat(&j, ",\"status\":\"%s\"", h->state == CK_OK ? "ok" : h->state == CK_PORTAL ? "portal"
                                       : h->state == CK_FAILED ? "failed" : "pending");
        if (h->state == CK_OK || h->state == CK_PORTAL) jcat(&j, ",\"code\":%d,\"time\":%d", h->code, h->ms);
        if (h->state == CK_FAILED) { jcat(&j, ",\"reason\":"); jstr(&j, h->reason); }
        if (h->state == CK_PORTAL && h->location[0]) { jcat(&j, ",\"location\":"); jstr(&j, h->location); }
        jcat(&j, "}");
    } else {
        jcat(&j, "null");
    }
    jcat(&j, "}");

    /* Modem identity, SIM, network. */
    jcat(&j, ",\"modem\":{\"manufacturer\":"); jstr(&j, md.manufacturer);
    jcat(&j, ",\"model\":"); jstr(&j, md.model);
    jcat(&j, ",\"firmware\":"); jstr(&j, md.firmware);
    jcat(&j, ",\"imei\":"); jstr(&j, md.imei);
    jcat(&j, ",\"imsi\":"); jstr(&j, md.imsi);
    jcat(&j, ",\"iccid\":"); jstr(&j, md.iccid);
    jcat(&j, ",\"sim\":{\"state\":"); jstr(&j, md.sim_state);
    jcat(&j, ",\"slot\":%d},\"registered\":%s,\"operator\":", md.sim_slot, md.registered ? "true" : "false");
    jstr(&j, md.operator_name);
    jcat(&j, ",\"mcc\":%d,\"mnc\":\"%0*d\",\"temperature\":{", md.mcc, md.mnc_digits, md.mnc);
    for (size_t k = 0; k < sizeof(md.temps) / sizeof(md.temps[0]); k++) {
        jcat(&j, "%s\"%s\":", k ? "," : "", md.temps[k].key);
        if (md.temps[k].t_x10 == INT32_MIN) jcat(&j, "null"); else jcat(&j, "%.1f", md.temps[k].t_x10 / 10.0);
    }
    jcat(&j, "}}");

    /* Radio (fallback when diag_bridge is not connected). */
    jcat(&j, ",\"radio\":{\"age_s\":%ld,\"endc\":%s,\"lte\":",
         md.radio_at ? (long)(time(NULL) - md.radio_at) : -1L, md.endc ? "true" : "false");
    if (md.lte.valid) {
        jcat(&j, "{\"earfcn\":%d,\"pci\":%d,\"band\":%u", md.lte.earfcn, md.lte.pci,
             md.lte.earfcn >= 0 ? earfcn_to_band((uint32_t)md.lte.earfcn) : 0);
        if (md.lte.bw_mhz_x10) jcat(&j, ",\"bandwidth_mhz\":%.1f", md.lte.bw_mhz_x10 / 10.0);
        jcat(&j, ",\"rsrp\":%d,\"rsrq\":%d,\"rssi\":%d", md.lte.rsrp, md.lte.rsrq, md.lte.rssi);
        json_x10(&j, "sinr", md.lte.snr_x10);
        json_x10(&j, "tx_power_dbm", md.lte.tx_pwr_x10);
        jcat(&j, ",\"cell_id\":%u,\"tac\":%d", md.cell_id, md.tac);
        json_chains(&j, md.lte.chains);
        jcat(&j, ",\"scells\":[");
        for (int k = 0; k < md.nscells; k++)
            jcat(&j, "%s{\"scell_idx\":%d,\"earfcn\":%d,\"pci\":%d,\"band\":%u,\"bandwidth_mhz\":%.1f}", k ? "," : "",
                 md.scells[k].idx, md.scells[k].earfcn, md.scells[k].pci,
                 earfcn_to_band((uint32_t)md.scells[k].earfcn), md.scells[k].bw_mhz_x10 / 10.0);
        jcat(&j, "]}");
    } else {
        jcat(&j, "null");
    }
    jcat(&j, ",\"nr\":");
    if (md.nr.valid) {
        jcat(&j, "{\"arfcn\":%u,\"pci\":%d,\"band\":%u,\"rsrp\":%d", md.nr.arfcn, md.nr.pci,
             md.nr.arfcn ? nrarfcn_to_band(md.nr.arfcn) : 0, md.nr.rsrp);
        if (md.nr.rsrq == INVALID_DB) jcat(&j, ",\"rsrq\":null"); else jcat(&j, ",\"rsrq\":%d", md.nr.rsrq);
        json_x10(&j, "sinr", md.nr.snr_x10);
        json_chains(&j, md.nr.chains);
        jcat(&j, "}");
    } else {
        jcat(&j, "null");
    }
    jcat(&j, "}}");
    return j.n;
}

/* ============= AT CLIENT ============= */

#define AT_DEVICE        "/dev/smd8"
#define AT_TIMEOUT_S     30
#define AT_MAX_RESPONSE  65536

/* Final result codes (V.250 and 27.007): the response is complete. */
static int at_final(const char *line, size_t len) {
    return (len == 2 && !memcmp(line, "OK", 2)) || (len == 5 && !memcmp(line, "ERROR", 5)) ||
           (len >= 11 && !memcmp(line, "+CME ERROR:", 11)) || (len >= 11 && !memcmp(line, "+CMS ERROR:", 11)) ||
           (len == 10 && !memcmp(line, "NO CARRIER", 10));
}

/* Reads and discards what is pending until the channel stays quiet for
   quiet_ms: an answer an earlier caller gave up on must not be taken for
   ours. */
static void at_drain(int fd, int quiet_ms) {
    char junk[4096];
    for (int rounds = 0; rounds < 50; rounds++) {
        struct pollfd p = { fd, POLLIN, 0 };
        if (poll(&p, 1, quiet_ms) <= 0 || read(fd, junk, sizeof(junk)) <= 0) return;
    }
}

/* The SMD driver refuses non-blocking writes (EBUSY): the device is opened
   blocking and every read is preceded by poll(). */
static int write_all(int fd, const char *b, size_t n) {
    while (n) {
        ssize_t w = write(fd, b, n);
        if (w > 0) { b += w; n -= (size_t)w; continue; }
        if (w < 0 && errno == EINTR) continue;
        return -1;
    }
    return 0;
}

/* Runs one AT command line; with payload, sends it plus Ctrl-Z at the "> "
   prompt (AT+CMGS). Writes the raw exchange (echo included) to stdout, like
   the firmware's client. Returns 0 with a final result code, 1 on timeout
   or I/O error. */
static int at_exec(const char *cmd, const char *payload, int timeout_s) {
    uint64_t deadline = monotonic_ms() + (uint64_t)timeout_s * 1000u;
    int fd = open(AT_DEVICE, O_RDWR | O_NOCTTY | O_CLOEXEC);
    if (fd < 0) { fprintf(stderr, "atcli: %s: %s\n", AT_DEVICE, strerror(errno)); return 1; }
    /* One caller at a time on the channel. */
    while (flock(fd, LOCK_EX | LOCK_NB) < 0) {
        if (monotonic_ms() >= deadline) { fprintf(stderr, "atcli: channel busy\n"); close(fd); return 1; }
        usleep(20000);
    }
    at_drain(fd, 30);
    char line[2056];
    snprintf(line, sizeof(line), "%s\r", cmd);
    if (write_all(fd, line, strlen(line)) < 0) {
        fprintf(stderr, "atcli: write: %s\n", strerror(errno));
        close(fd);
        return 1;
    }
    static char rsp[AT_MAX_RESPONSE];
    size_t n = 0, scan = 0;
    int done = 0, sent_payload = payload == NULL;
    while (!done) {
        uint64_t now = monotonic_ms();
        if (now >= deadline) break;
        struct pollfd p = { fd, POLLIN, 0 };
        if (poll(&p, 1, (int)(deadline - now)) <= 0) continue;
        ssize_t r = read(fd, rsp + n, sizeof(rsp) - 1 - n);
        if (r <= 0) { if (r < 0 && errno != EINTR) break; continue; }
        n += (size_t)r;
        rsp[n] = 0;
        if (!sent_payload && strstr(rsp, "> ")) {
            size_t pl = strlen(payload);
            char *msg = malloc(pl + 1);
            if (!msg) break;
            memcpy(msg, payload, pl);
            msg[pl] = 0x1a;
            int w = write_all(fd, msg, pl + 1);
            free(msg);
            if (w < 0) break;
            sent_payload = 1;
        }
        /* Complete lines since the last scan. */
        for (;;) {
            char *nl = memchr(rsp + scan, '\n', n - scan);
            if (!nl) break;
            size_t len = (size_t)(nl - (rsp + scan));
            char *l = rsp + scan;
            while (len && (l[len - 1] == '\r' || l[len - 1] == ' ')) len--;
            while (len && (*l == '\r' || *l == ' ')) { l++; len--; }
            /* A final code before the prompt is the command's error. */
            if (at_final(l, len)) done = 1;
            scan = (size_t)(nl - rsp) + 1;
        }
        if (n >= sizeof(rsp) - 1) break;
    }
    fwrite(rsp, 1, n, stdout);
    fflush(stdout);
    close(fd);   /* releases the lock */
    if (!done) { fprintf(stderr, "atcli: no final result code within %d s\n", timeout_s); return 1; }
    return 0;
}

static int at_main(int argc, char **argv) {
    int timeout_s = AT_TIMEOUT_S;
    const char *payload = NULL;
    int i = 1;
    if (argc > 1 && !strcmp(argv[1], "at")) i = 2;     /* "system_bridge at ..." */
    for (; i < argc && argv[i][0] == '-' && argv[i][1]; i++) {
        if (!strcmp(argv[i], "-t") && i + 1 < argc) timeout_s = atoi(argv[++i]);
        else if (!strcmp(argv[i], "-p") && i + 1 < argc) payload = argv[++i];
        else if (!strcmp(argv[i], "-V")) { puts("atcli_smd8 (system_bridge, serialized)"); return 0; }
        else break;
    }
    if (i >= argc) {
        fprintf(stderr, "Usage: atcli_smd8 [-t SECONDS] [-p PAYLOAD] COMMAND...\n"
                        "  -t SECONDS  give up after SECONDS (default %d)\n"
                        "  -p PAYLOAD  text sent with Ctrl-Z at the \"> \" prompt (AT+CMGS)\n"
                        "  -V          identify this client\n", AT_TIMEOUT_S);
        return 2;
    }
    if (timeout_s < 1) timeout_s = 1;
    /* Words of an unquoted command line are joined back with spaces. */
    char cmd[2048];
    size_t k = 0;
    for (; i < argc && k + 2 < sizeof(cmd); i++) {
        if (k) cmd[k++] = ' ';
        k += (size_t)snprintf(cmd + k, sizeof(cmd) - k, "%s", argv[i]);
        if (k >= sizeof(cmd)) k = sizeof(cmd) - 1;
    }
    cmd[k] = 0;
    signal(SIGPIPE, SIG_IGN);
    return at_exec(cmd, payload, timeout_s);
}

/* ============= MAIN ============= */

static void on_signal(int s) { (void)s; running = 0; }
static void on_usr1(int s) { (void)s; data_reset_req = 1; }

/* A new client gets the histories before its first snapshot; -1 drops it
   when they cannot be sent whole. */
static int send_history(int fd) {
    static char hist[98304];
    size_t n = serialize_history(hist, sizeof(hist));
    return ws_send_text(fd, hist, n);
}

static void usage(const char *prog) {
    fprintf(stderr, "Usage: %s [-d] [-1] [-p PORT] [-i IFACE] [-C CONF] [-D FILE]\n"
                    "  -d        debug: foreground, log to stderr\n"
                    "  -1        print one JSON snapshot on stdout and exit\n"
                    "  -p PORT   WebSocket port (default %d)\n"
                    "  -i IFACE  accept clients only on IFACE (e.g. bridge0)\n"
                    "  -C CONF   simpleadmin.conf with the ping/DNS/HTTP targets (default %s)\n"
                    "  -D FILE   persistent data counter (default %s; SIGUSR1 zeroes it)\n",
            prog, WS_PORT_DEFAULT, CONF_FILE_DEFAULT, DATA_FILE_DEFAULT);
}

int main(int argc, char **argv) {
    char *self = strdup(argv[0]);
    if ((self && !strcmp(basename(self), "atcli_smd8")) || (argc > 1 && !strcmp(argv[1], "at")))
        return at_main(argc, argv);
    free(self);
    uint16_t port = WS_PORT_DEFAULT;
    const char *iface = NULL;
    int once = 0;
    for (int i = 1; i < argc; i++) {
        if (!strcmp(argv[i], "-d")) debug_mode = 1;
        else if (!strcmp(argv[i], "-1")) once = 1;
        else if (!strcmp(argv[i], "-p") && i + 1 < argc) port = (uint16_t)atoi(argv[++i]);
        else if (!strcmp(argv[i], "-i") && i + 1 < argc) iface = argv[++i];
        else if (!strcmp(argv[i], "-C") && i + 1 < argc) conf_file = ws_conf_file = argv[++i];
        else if (!strcmp(argv[i], "-D") && i + 1 < argc) data_file = argv[++i];
        else { usage(argv[0]); return strcmp(argv[i], "-h") ? 1 : 0; }
    }
    signal(SIGINT, on_signal);
    signal(SIGTERM, on_signal);
    signal(SIGUSR1, on_usr1);
    signal(SIGPIPE, SIG_IGN);
    srand((unsigned)time(NULL) ^ (unsigned)getpid());
    echo_id = (uint16_t)(getpid() & 0xffff);

    if (qmi_open() < 0) fprintf(stderr, "WARN: QMI over QRTR not available, modem data will be empty\n");
    icmp_fd = socket(AF_INET, SOCK_RAW | SOCK_NONBLOCK, IPPROTO_ICMP);
    if (icmp_fd < 0) fprintf(stderr, "WARN: no ICMP socket (%s), ping reported as failed\n", strerror(errno));

    data_load();
    static char out[16384];
    if (once) {
        data_sample();      /* shown, not saved */
        poll_identity(); poll_serving(); poll_radio(); poll_system();
        conn_start(1);
        uint64_t wait_ms = (uint64_t)hp.timeout_s * 1000 + 500;
        uint64_t until = monotonic_ms() + (wait_ms > DNS_TIMEOUT_MS ? wait_ms : DNS_TIMEOUT_MS) + 100;
        while (round_open && monotonic_ms() < until) {
            struct pollfd p[2 + MAX_TARGETS];
            int n = 0;
            if (icmp_fd >= 0) { p[n].fd = icmp_fd; p[n++].events = POLLIN; }
            for (int i = 0; i < ndns; i++) if (dnss[i].fd >= 0) { p[n].fd = dnss[i].fd; p[n++].events = POLLIN; }
            if (hp.fd >= 0) { p[n].fd = hp.fd; p[n++].events = POLLIN; }
            if (poll(p, (nfds_t)n, 100) > 0) {
                if (icmp_fd >= 0 && (p[0].revents & POLLIN)) icmp_read();
                for (int i = 0; i < ndns; i++) if (dnss[i].fd >= 0) dns_read(&dnss[i]);
                if (hp.fd >= 0 && (p[n - 1].revents & (POLLIN | POLLHUP))) http_read();
            }
            conn_expire(0);
            conn_finish();
        }
        conn_expire(1);
        conn_finish();
        poll_system();
        size_t n = serialize(out, sizeof(out));
        fwrite(out, 1, n, stdout);
        putchar('\n');
        return 0;
    }

    if (ws_start(port, iface) < 0) {
        fprintf(stderr, "FAIL: ws_start on port %u: %s\n", port, strerror(errno));
        return 1;
    }
    if (!debug_mode && daemon(0, 0) < 0) return 1;
    FILE *pf = fopen("/run/system_bridge.pid", "w");
    if (pf) { fprintf(pf, "%d\n", getpid()); fclose(pf); }

    data_sample();
    if (!du.loaded) data_save();      /* first run: create the file */
    uint64_t next_push = 0, next_radio = 0, next_serving = 0, next_identity = 0, next_conn = 0, next_signal = 0;
    uint64_t next_data = monotonic_ms() + DATA_SAMPLE_MS, next_save = monotonic_ms() + DATA_SAVE_MS;
    int had_clients = 0;
    ws_on_open = send_history;
    while (running) {
        struct pollfd fds[3 + WS_MAX_CLIENTS + WS_MAX_PENDING + MAX_TARGETS];
        int nfds = 0, base_clients, base_pending, base_dns;
        fds[nfds].fd = ws_listen_fd; fds[nfds++].events = POLLIN;
        int icmp_slot = -1;
        if (icmp_fd >= 0) { icmp_slot = nfds; fds[nfds].fd = icmp_fd; fds[nfds++].events = POLLIN; }
        base_clients = nfds;
        int pc = ws_nclients;
        for (int i = 0; i < pc; i++) { fds[nfds].fd = ws_clients[i]; fds[nfds++].events = POLLIN; }
        base_pending = nfds;
        int pp = ws_npending;
        for (int i = 0; i < pp; i++) { fds[nfds].fd = ws_pending[i].fd; fds[nfds++].events = POLLIN; }
        base_dns = nfds;
        for (int i = 0; i < ndns; i++) { fds[nfds].fd = dnss[i].fd; fds[nfds++].events = dnss[i].fd >= 0 ? POLLIN : 0; }
        int http_slot = -1;
        if (hp.fd >= 0) { http_slot = nfds; fds[nfds].fd = hp.fd; fds[nfds++].events = POLLIN; }

        int pr = poll(fds, (nfds_t)nfds, 200);
        if (pr < 0 && errno != EINTR) break;
        if (pr > 0) {
            for (int k = pc - 1; k >= 0; k--)
                if ((fds[base_clients + k].revents & (POLLIN | POLLHUP | POLLERR)) && k < ws_nclients) ws_handle_client(k);
            for (int k = pp - 1; k >= 0; k--)
                if ((fds[base_pending + k].revents & (POLLIN | POLLHUP | POLLERR)) && k < ws_npending) ws_pending_read(k);
            if (fds[0].revents & POLLIN) ws_accept();
            if (icmp_slot >= 0 && (fds[icmp_slot].revents & POLLIN)) icmp_read();
            for (int i = 0; i < ndns; i++)
                if (dnss[i].fd >= 0 && (fds[base_dns + i].revents & POLLIN)) dns_read(&dnss[i]);
            if (http_slot >= 0 && hp.fd >= 0 && (fds[http_slot].revents & (POLLIN | POLLHUP))) http_read();
        }
        ws_pending_expire();
        conn_expire(0);
        conn_finish();

        uint64_t now = monotonic_ms();
        /* QMI services are looked up again if the modem restarted. */
        static uint64_t next_lookup;
        int down = 0;
        for (size_t i = 0; i < sizeof(svcs) / sizeof(svcs[0]); i++) down |= !svcs[i].ok;
        if (down && qmi_fd >= 0 && now >= next_lookup) {
            qmi_lookup();
            next_lookup = now + LOOKUP_RETRY_MS;
            next_identity = 0;      /* re-read everything from the new endpoints */
        }

        /* With or without clients: the data counter, the check rounds and
           the signal samples. A first client gets a full round at once,
           after the pings in flight. Rounds keep their cadence on average
           (the latency history assumes one per CONN_MS). */
        if (data_reset_req) { data_reset_req = 0; data_reset(); }
        if (now >= next_data) { data_sample(); next_data = now + DATA_SAMPLE_MS; }
        if (now >= next_save) {
            if (du.dirty) data_save();
            next_save = now + DATA_SAVE_MS;
        }
        if (ws_nclients && !had_clients) next_conn = now;
        had_clients = ws_nclients > 0;
        if (now >= next_conn && (!round_open || now - round_start_ms >= CONN_MS)) {
            if (round_open) { conn_expire(1); conn_finish(); }
            conn_start(ws_nclients > 0);
            next_conn = next_conn && now - next_conn < CONN_MS ? next_conn + CONN_MS : now + CONN_MS;
        }
        if (now >= next_signal) {
            if (!ws_nclients) poll_radio();          /* with clients it runs every RADIO_MS */
            sig_push();
            next_signal = next_signal && now - next_signal < SIGNAL_MS ? next_signal + SIGNAL_MS : now + SIGNAL_MS;
        }
        if (ws_nclients == 0) { next_push = next_radio = next_serving = 0; continue; }

        /* A new client gets data at once. */
        if (now >= next_identity) { poll_identity(); next_identity = now + IDENTITY_MS; }
        if (now >= next_serving) { poll_serving(); next_serving = now + SERVING_MS; }
        if (now >= next_radio) { poll_radio(); next_radio = now + RADIO_MS; }
        if (now >= next_push) {
            poll_system();
            data_sample();
            size_t n = serialize(out, sizeof(out));
            ws_broadcast(out, n);
            next_push = now + PUSH_MS;
        }
    }
    ws_stop();
    http_stop();
    data_sample();
    data_save();
    unlink("/run/system_bridge.pid");
    return 0;
}
