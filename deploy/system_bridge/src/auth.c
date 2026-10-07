/*
 * WebSocket access rules of system_bridge (diag_bridge has a copy),
 * mirroring SimpleAdmin's cgi-bin/session_utils.sh: the WebSockets carry
 * what the CGIs protect (SIM identifiers, radio data), so they follow the
 * same login and lock settings.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <time.h>

#include "auth.h"

const char *ws_conf_file = "/WEBSERVER/www/config/simpleadmin.conf";
static const char *session_store = "/tmp/simpleadmin_sessions.txt";

/* Value of KEY in simpleadmin.conf, quotes stripped; "" when absent. The
   CGIs source the file, so the last assignment wins. */
static void conf_get(const char *key, char *out, size_t cap) {
    out[0] = 0;
    FILE *f = fopen(ws_conf_file, "r");
    if (!f) return;
    char line[512];
    size_t kl = strlen(key);
    while (fgets(line, sizeof(line), f)) {
        if (strncmp(line, key, kl) || line[kl] != '=') continue;
        const char *p = line + kl + 1;
        size_t n = strcspn(p, "\r\n");
        if (n && (*p == '"' || *p == '\'')) { p++; n--; if (n && (p[n - 1] == '"' || p[n - 1] == '\'')) n--; }
        if (n >= cap) n = cap - 1;
        memcpy(out, p, n);
        out[n] = 0;
    }
    fclose(f);
}

/* is_truthy() of session_utils.sh. */
static int truthy(const char *v) {
    static const char *yes[] = { "1", "true", "TRUE", "yes", "YES", "on", "ON" };
    for (size_t i = 0; i < sizeof(yes) / sizeof(yes[0]); i++)
        if (!strcmp(v, yes[i])) return 1;
    return 0;
}

/* Value of a request header (case-insensitive name), copied to out. */
static int header(const char *req, const char *name, char *out, size_t cap) {
    size_t nl = strlen(name);
    for (const char *p = strstr(req, "\r\n"); p; p = strstr(p + 2, "\r\n")) {
        const char *h = p + 2;
        if (strncasecmp(h, name, nl) || h[nl] != ':') continue;
        h += nl + 1;
        while (*h == ' ' || *h == '\t') h++;
        size_t n = strcspn(h, "\r\n");
        if (n >= cap) n = cap - 1;
        memcpy(out, h, n);
        out[n] = 0;
        return 1;
    }
    return 0;
}

/* Host part of "scheme://host[:port][/...]" or "host[:port]". */
static void host_of(const char *s, char *out, size_t cap) {
    const char *p = strstr(s, "://");
    p = p ? p + 3 : s;
    size_t n = strcspn(p, ":/");
    if (n >= cap) n = cap - 1;
    memcpy(out, p, n);
    out[n] = 0;
}

static int session_live(const char *token) {
    FILE *f = fopen(session_store, "r");
    if (!f) return 0;
    char line[256];
    size_t tl = strlen(token);
    int ok = 0;
    long now = (long)time(NULL);
    while (!ok && fgets(line, sizeof(line), f)) {
        /* token:username:role:expiry */
        if (strncmp(line, token, tl) || line[tl] != ':') continue;
        const char *exp = strrchr(line, ':');
        ok = exp && strtol(exp + 1, NULL, 10) > now;
    }
    fclose(f);
    return ok;
}

int ws_request_allowed(const char *req) {
    char v[64];
    conf_get("SIMPLEADMIN_GUI_LOCKED", v, sizeof(v));
    if (truthy(v)) return 0;

    /* Browsers always send Origin on WebSocket handshakes: a page from
       another site must not read the modem's data. */
    char origin[256], host[256];
    if (header(req, "Origin", origin, sizeof(origin))) {
        char oh[128], hh[128];
        if (!header(req, "Host", host, sizeof(host))) return 0;
        host_of(origin, oh, sizeof(oh));
        host_of(host, hh, sizeof(hh));
        if (!oh[0] || strcasecmp(oh, hh)) return 0;
    }

    /* login_is_disabled(): only an explicit 0 turns the login off. */
    conf_get("SIMPLEADMIN_ENABLE_LOGIN", v, sizeof(v));
    if (!strcmp(v, "0")) return 1;
    char cookie[1024];
    if (!header(req, "Cookie", cookie, sizeof(cookie))) return 0;
    const char *t = strstr(cookie, "simpleadmin_session=");
    if (!t) return 0;
    t += strlen("simpleadmin_session=");
    char token[129];
    size_t n = 0;
    while (n + 1 < sizeof(token) && ((t[n] >= '0' && t[n] <= '9') || (t[n] >= 'a' && t[n] <= 'z') ||
                                      (t[n] >= 'A' && t[n] <= 'Z')))
        n++;
    if (!n) return 0;
    memcpy(token, t, n);
    token[n] = 0;
    return session_live(token);
}
