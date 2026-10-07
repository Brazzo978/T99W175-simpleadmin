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
 * System data comes from /proc and /sys; connectivity from ICMP echo and DNS
 * queries to the targets in simpleadmin.conf.
 *
 * The modem is only polled while a WebSocket client is connected: radio
 * every 2 s, serving system / CA / temperatures every 10 s, identity every
 * 60 s, connectivity every 10 s. Radio data here is the fallback of the
 * dashboard: diag_bridge (port 9001) is the primary radio source.
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
#include <ifaddrs.h>
#include <strings.h>
#include <net/if.h>
#include <linux/qrtr.h>
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

static void poll_system(void) {
    char b[4096];
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

/* ============= CONNECTIVITY ============= */

struct ping_target { char host[64]; struct in_addr addr; int state; double ms; uint16_t seq; uint64_t sent_ms; };
struct dns_target { char server[64], domain[128]; int state; uint16_t id; uint64_t sent_ms; int fd; };
enum { CK_IDLE, CK_WAIT, CK_OK, CK_FAILED };

static struct ping_target pings[MAX_TARGETS];
static struct dns_target dnss[MAX_TARGETS];
static int npings, ndns;
static int icmp_fd = -1;
static uint16_t echo_id;
static time_t conf_mtime;

/* SIMPLEADMIN_PING_TARGETS="a,b" and SIMPLEADMIN_DNS_TESTS="server:domain,..." */
static void load_conf(void) {
    struct stat st;
    if (stat(conf_file, &st) == 0 && st.st_mtime == conf_mtime && (npings || ndns)) return;
    conf_mtime = st.st_mtime;
    char ping_list[256] = "8.8.8.8,1.1.1.1", dns_list[512] = "8.8.8.8:www.google.com,1.1.1.1:www.google.com";
    char b[8192];
    if (read_file(conf_file, b, sizeof(b)) > 0) {
        for (char *line = strtok(b, "\n"); line; line = strtok(NULL, "\n")) {
            if (!strncmp(line, "SIMPLEADMIN_PING_TARGETS=", 25)) sscanf(line + 25, "\"%255[^\"]\"", ping_list);
            if (!strncmp(line, "SIMPLEADMIN_DNS_TESTS=", 22)) sscanf(line + 22, "\"%511[^\"]\"", dns_list);
        }
    }
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

static void conn_start(void) {
    load_conf();
    uint64_t now = monotonic_ms();
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

static void conn_expire(void) {
    uint64_t now = monotonic_ms();
    for (int i = 0; i < npings; i++)
        if (pings[i].state == CK_WAIT && now - pings[i].sent_ms > PING_TIMEOUT_MS) pings[i].state = CK_FAILED;
    for (int i = 0; i < ndns; i++)
        if (dnss[i].state == CK_WAIT && now - dnss[i].sent_ms > DNS_TIMEOUT_MS) {
            dnss[i].state = CK_FAILED;
            if (dnss[i].fd >= 0) { close(dnss[i].fd); dnss[i].fd = -1; }
        }
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
    jcat(&j, "}},\"net\":{\"wan_ip\":"); jstr(&j, sys.wan_ip);
    jcat(&j, ",\"dns\":["); jstr(&j, sys.dns[0]); if (sys.dns[1][0]) { jcat(&j, ","); jstr(&j, sys.dns[1]); }
    jcat(&j, "],\"apn\":"); jstr(&j, md.apn);

    /* Connectivity, same shape and rules as cgi-bin/get_ping. */
    int pass_p = 0, pass_d = 0, pending = 0, nt = 0;
    double sum = 0;
    for (int i = 0; i < npings; i++) {
        if (pings[i].state == CK_OK) { pass_p++; sum += pings[i].ms; nt++; }
        if (pings[i].state == CK_WAIT || pings[i].state == CK_IDLE) pending++;
    }
    for (int i = 0; i < ndns; i++) {
        if (dnss[i].state == CK_OK) pass_d++;
        if (dnss[i].state == CK_WAIT || dnss[i].state == CK_IDLE) pending++;
    }
    /* Nothing answered yet but checks still in flight: not a failure. */
    const char *status = pass_p + pass_d == npings + ndns ? "ok" : pass_p + pass_d > 0 ? "warning"
                         : pending ? "pending" : "error";
    jcat(&j, "},\"conn\":{\"status\":\"%s\",\"pending\":%s,\"ping\":{\"total\":%d,\"passed\":%d,\"avg_ms\":",
         status, pending ? "true" : "false", npings, pass_p);
    if (nt) jcat(&j, "%.1f", sum / nt); else jcat(&j, "null");
    jcat(&j, ",\"results\":[");
    for (int i = 0; i < npings; i++) {
        jcat(&j, "%s{\"host\":", i ? "," : ""); jstr(&j, pings[i].host);
        jcat(&j, ",\"status\":\"%s\"", pings[i].state == CK_OK ? "ok" : pings[i].state == CK_FAILED ? "failed" : "pending");
        if (pings[i].state == CK_OK) jcat(&j, ",\"time\":%.1f", pings[i].ms);
        jcat(&j, "}");
    }
    jcat(&j, "]},\"dns\":{\"total\":%d,\"passed\":%d,\"results\":[", ndns, pass_d);
    for (int i = 0; i < ndns; i++) {
        jcat(&j, "%s{\"server\":", i ? "," : ""); jstr(&j, dnss[i].server);
        jcat(&j, ",\"domain\":"); jstr(&j, dnss[i].domain);
        jcat(&j, ",\"status\":\"%s\"}", dnss[i].state == CK_OK ? "ok" : dnss[i].state == CK_FAILED ? "failed" : "pending");
    }
    jcat(&j, "]}}");

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

static void usage(const char *prog) {
    fprintf(stderr, "Usage: %s [-d] [-1] [-p PORT] [-i IFACE] [-C CONF]\n"
                    "  -d        debug: foreground, log to stderr\n"
                    "  -1        print one JSON snapshot on stdout and exit\n"
                    "  -p PORT   WebSocket port (default %d)\n"
                    "  -i IFACE  accept clients only on IFACE (e.g. bridge0)\n"
                    "  -C CONF   simpleadmin.conf with the ping/DNS targets (default %s)\n",
            prog, WS_PORT_DEFAULT, CONF_FILE_DEFAULT);
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
        else { usage(argv[0]); return strcmp(argv[i], "-h") ? 1 : 0; }
    }
    signal(SIGINT, on_signal);
    signal(SIGTERM, on_signal);
    signal(SIGPIPE, SIG_IGN);
    srand((unsigned)time(NULL) ^ (unsigned)getpid());
    echo_id = (uint16_t)(getpid() & 0xffff);

    if (qmi_open() < 0) fprintf(stderr, "WARN: QMI over QRTR not available, modem data will be empty\n");
    icmp_fd = socket(AF_INET, SOCK_RAW | SOCK_NONBLOCK, IPPROTO_ICMP);
    if (icmp_fd < 0) fprintf(stderr, "WARN: no ICMP socket (%s), ping reported as failed\n", strerror(errno));

    static char out[16384];
    if (once) {
        poll_identity(); poll_serving(); poll_radio(); poll_system();
        conn_start();
        uint64_t until = monotonic_ms() + DNS_TIMEOUT_MS + 100;
        while (monotonic_ms() < until) {
            struct pollfd p[1 + MAX_TARGETS];
            int n = 0;
            if (icmp_fd >= 0) { p[n].fd = icmp_fd; p[n++].events = POLLIN; }
            for (int i = 0; i < ndns; i++) if (dnss[i].fd >= 0) { p[n].fd = dnss[i].fd; p[n++].events = POLLIN; }
            if (poll(p, (nfds_t)n, 100) > 0) {
                if (icmp_fd >= 0 && (p[0].revents & POLLIN)) icmp_read();
                for (int i = 0; i < ndns; i++) if (dnss[i].fd >= 0) dns_read(&dnss[i]);
            }
            conn_expire();
        }
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

    uint64_t next_push = 0, next_radio = 0, next_serving = 0, next_identity = 0, next_conn = 0;
    while (running) {
        struct pollfd fds[2 + WS_MAX_CLIENTS + WS_MAX_PENDING + MAX_TARGETS];
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
        }
        ws_pending_expire();
        conn_expire();

        uint64_t now = monotonic_ms();
        if (ws_nclients == 0) { next_push = next_radio = next_serving = next_conn = 0; continue; }
        /* A new client gets data at once; QMI services are looked up again
           if the modem restarted. */
        static uint64_t next_lookup;
        int down = 0;
        for (size_t i = 0; i < sizeof(svcs) / sizeof(svcs[0]); i++) down |= !svcs[i].ok;
        if (down && qmi_fd >= 0 && now >= next_lookup) {
            qmi_lookup();
            next_lookup = now + LOOKUP_RETRY_MS;
            next_identity = 0;      /* re-read everything from the new endpoints */
        }
        if (now >= next_identity) { poll_identity(); next_identity = now + IDENTITY_MS; }
        if (now >= next_serving) { poll_serving(); next_serving = now + SERVING_MS; }
        if (now >= next_radio) { poll_radio(); next_radio = now + RADIO_MS; }
        if (now >= next_conn) { conn_start(); next_conn = now + CONN_MS; }
        if (now >= next_push) {
            poll_system();
            size_t n = serialize(out, sizeof(out));
            ws_broadcast(out, n);
            next_push = now + PUSH_MS;
        }
    }
    ws_stop();
    unlink("/run/system_bridge.pid");
    return 0;
}
