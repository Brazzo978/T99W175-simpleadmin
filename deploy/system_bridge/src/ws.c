/*
 * Minimal WebSocket server (RFC 6455) of system_bridge (a copy of the one
 * in T99W175-diag-json-bridge, which diag_bridge uses): text frames out, ping/close in, handshakes polled with the
 * caller's main loop. See ws.h.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <errno.h>
#include <fcntl.h>
#include <unistd.h>
#include <time.h>
#include <sys/socket.h>
#include <netinet/in.h>

#include "ws.h"
#include "auth.h"

/* ============= SHA-1 (for WebSocket handshake) ============= */

static void sha1(const uint8_t *data, size_t len, uint8_t digest[20]) {
    uint32_t h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE,
             h3 = 0x10325476, h4 = 0xC3D2E1F0;
    size_t padded_len = ((len + 8) / 64 + 1) * 64;
    uint8_t *msg = calloc(1, padded_len);
    memcpy(msg, data, len);
    msg[len] = 0x80;
    uint64_t bits = (uint64_t)len * 8;
    for (int i = 0; i < 8; i++)
        msg[padded_len - 1 - i] = (uint8_t)((bits >> (i * 8)) & 0xFF);

    for (size_t off = 0; off < padded_len; off += 64) {
        uint32_t w[80];
        for (int i = 0; i < 16; i++)
            w[i] = ((uint32_t)msg[off+i*4]<<24) | ((uint32_t)msg[off+i*4+1]<<16) |
                    ((uint32_t)msg[off+i*4+2]<<8) | msg[off+i*4+3];
        for (int i = 16; i < 80; i++) {
            uint32_t v = w[i-3] ^ w[i-8] ^ w[i-14] ^ w[i-16];
            w[i] = (v << 1) | (v >> 31);
        }
        uint32_t a = h0, b = h1, c = h2, d = h3, e = h4;
        for (int i = 0; i < 80; i++) {
            uint32_t f, k;
            if (i < 20)      { f = (b & c) | ((~b) & d);       k = 0x5A827999; }
            else if (i < 40) { f = b ^ c ^ d;                   k = 0x6ED9EBA1; }
            else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
            else              { f = b ^ c ^ d;                   k = 0xCA62C1D6; }
            uint32_t t = ((a << 5) | (a >> 27)) + f + e + k + w[i];
            e = d; d = c; c = (b << 30) | (b >> 2); b = a; a = t;
        }
        h0 += a; h1 += b; h2 += c; h3 += d; h4 += e;
    }
    free(msg);
    uint32_t h[] = { h0, h1, h2, h3, h4 };
    for (int i = 0; i < 5; i++) {
        digest[i*4]   = (uint8_t)(h[i] >> 24);
        digest[i*4+1] = (uint8_t)(h[i] >> 16);
        digest[i*4+2] = (uint8_t)(h[i] >> 8);
        digest[i*4+3] = (uint8_t)(h[i]);
    }
}

/* ============= BASE64 ============= */

static const char b64_chars[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static size_t base64_encode(const uint8_t *in, size_t len, char *out) {
    size_t j = 0;
    for (size_t i = 0; i < len; i += 3) {
        uint32_t v = (uint32_t)in[i] << 16;
        if (i + 1 < len) v |= (uint32_t)in[i+1] << 8;
        if (i + 2 < len) v |= in[i+2];
        out[j++] = b64_chars[(v >> 18) & 0x3F];
        out[j++] = b64_chars[(v >> 12) & 0x3F];
        out[j++] = (i + 1 < len) ? b64_chars[(v >> 6) & 0x3F] : '=';
        out[j++] = (i + 2 < len) ? b64_chars[v & 0x3F] : '=';
    }
    out[j] = 0;
    return j;
}

/* ============= WEBSOCKET SERVER ============= */

#define WS_HANDSHAKE_MS  3000
#define WS_MAX_KEY_LEN   64
#define WS_MAX_PAYLOAD   16384
#define WS_GUID          "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

int ws_listen_fd = -1;
int ws_clients[WS_MAX_CLIENTS];
static uint64_t ws_client_since[WS_MAX_CLIENTS];
int ws_nclients = 0;

struct ws_pending_conn ws_pending[WS_MAX_PENDING];
int ws_npending = 0;

uint64_t monotonic_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint64_t)ts.tv_sec * 1000u + (uint64_t)ts.tv_nsec / 1000000u;
}

int ws_start(uint16_t port, const char *iface) {
    ws_listen_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (ws_listen_fd < 0) return -1;
    int opt = 1;
    setsockopt(ws_listen_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
    /* Restrict the listener to one interface (the LAN bridge): bound to
       INADDR_ANY alone it is also reachable from the carrier side. */
    if (iface && *iface &&
        setsockopt(ws_listen_fd, SOL_SOCKET, SO_BINDTODEVICE, iface, (socklen_t)strlen(iface) + 1) < 0) {
        int saved = errno;
        close(ws_listen_fd);
        ws_listen_fd = -1;
        errno = saved;
        return -1;
    }
    struct sockaddr_in addr = {
        .sin_family = AF_INET,
        .sin_port = htons(port),
        .sin_addr.s_addr = INADDR_ANY
    };
    if (bind(ws_listen_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0 ||
        listen(ws_listen_fd, 4) < 0) {
        int saved = errno;
        close(ws_listen_fd);
        ws_listen_fd = -1;
        errno = saved;
        return -1;
    }
    fcntl(ws_listen_fd, F_SETFL, O_NONBLOCK);
    return 0;
}

static void ws_remove_client(int idx) {
    if (idx < 0 || idx >= ws_nclients) return;
    close(ws_clients[idx]);
    ws_nclients--;
    ws_clients[idx] = ws_clients[ws_nclients];
    ws_client_since[idx] = ws_client_since[ws_nclients];
}

/* A full table evicts the oldest client, so stale or hostile connections
   cannot lock the web UI out. */
static void ws_add_client(int fd) {
    if (ws_nclients >= WS_MAX_CLIENTS) {
        int oldest = 0;
        for (int i = 1; i < ws_nclients; i++)
            if (ws_client_since[i] < ws_client_since[oldest]) oldest = i;
        ws_remove_client(oldest);
    }
    ws_clients[ws_nclients] = fd;
    ws_client_since[ws_nclients] = monotonic_ms();
    ws_nclients++;
}

static void ws_pending_remove(int idx, int close_fd) {
    if (idx < 0 || idx >= ws_npending) return;
    if (close_fd) close(ws_pending[idx].fd);
    ws_npending--;
    if (idx != ws_npending) ws_pending[idx] = ws_pending[ws_npending];
}

void ws_accept(void) {
    int fd = accept(ws_listen_fd, NULL, NULL);
    if (fd < 0) return;
    /* accept() does not inherit O_NONBLOCK from the listener on Linux. */
    fcntl(fd, F_SETFL, O_NONBLOCK);
    if (ws_npending >= WS_MAX_PENDING) { close(fd); return; }
    struct ws_pending_conn *c = &ws_pending[ws_npending++];
    c->fd = fd;
    c->deadline_ms = monotonic_ms() + WS_HANDSHAKE_MS;
    c->len = 0;
    c->buf[0] = 0;
}

static int ws_key_valid(const char *key, size_t len) {
    if (len == 0 || len > WS_MAX_KEY_LEN) return 0;
    for (size_t i = 0; i < len; i++) {
        char ch = key[i];
        if (!((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') ||
              (ch >= '0' && ch <= '9') || ch == '+' || ch == '/' || ch == '='))
            return 0;
    }
    return 1;
}

/* Reads more of a pending handshake; completes the upgrade once the request
   headers are in, drops the connection on any error. */
void ws_pending_read(int idx) {
    struct ws_pending_conn *c = &ws_pending[idx];
    ssize_t n = read(c->fd, c->buf + c->len, sizeof(c->buf) - 1 - c->len);
    if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR)) return;
    if (n <= 0) { ws_pending_remove(idx, 1); return; }
    c->len += (size_t)n;
    c->buf[c->len] = 0;

    if (!strstr(c->buf, "\r\n\r\n")) {
        if (c->len >= sizeof(c->buf) - 1) ws_pending_remove(idx, 1);
        return;
    }

    if (!ws_request_allowed(c->buf)) {
        static const char deny[] = "HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n";
        (void)write(c->fd, deny, sizeof(deny) - 1);
        ws_pending_remove(idx, 1);
        return;
    }

    char *key_start = strstr(c->buf, "Sec-WebSocket-Key:");
    if (!key_start) { ws_pending_remove(idx, 1); return; }
    key_start += 18;
    while (*key_start == ' ' || *key_start == '\t') key_start++;
    char *key_end = strstr(key_start, "\r\n");
    if (!key_end) { ws_pending_remove(idx, 1); return; }
    while (key_end > key_start && (key_end[-1] == ' ' || key_end[-1] == '\t')) key_end--;

    size_t key_len = (size_t)(key_end - key_start);
    if (!ws_key_valid(key_start, key_len)) { ws_pending_remove(idx, 1); return; }

    char accept_in[WS_MAX_KEY_LEN + 36];
    memcpy(accept_in, key_start, key_len);
    memcpy(accept_in + key_len, WS_GUID, 36);

    uint8_t sha_out[20];
    sha1((uint8_t *)accept_in, key_len + 36, sha_out);
    char accept_b64[64];
    base64_encode(sha_out, 20, accept_b64);

    char resp[512];
    int rlen = snprintf(resp, sizeof(resp),
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        "Sec-WebSocket-Accept: %s\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "\r\n", accept_b64);
    if (rlen <= 0 || write(c->fd, resp, (size_t)rlen) != rlen) { ws_pending_remove(idx, 1); return; }

    int fd = c->fd;
    ws_pending_remove(idx, 0);
    ws_add_client(fd);
}

void ws_pending_expire(void) {
    uint64_t now = monotonic_ms();
    for (int i = ws_npending - 1; i >= 0; i--)
        if (now >= ws_pending[i].deadline_ms) ws_pending_remove(i, 1);
}

/* Header and payload go out in a single write: on a non-blocking socket a
   short write would otherwise leave half a frame on the wire and desync the
   stream, so anything short of the full frame drops the client. */
int ws_send_text(int fd, const char *text, size_t len) {
    static uint8_t frame[10 + WS_MAX_PAYLOAD];
    size_t hlen;
    if (len > WS_MAX_PAYLOAD) return -1;
    frame[0] = 0x81;
    if (len < 126) {
        frame[1] = (uint8_t)len; hlen = 2;
    } else {
        frame[1] = 126; frame[2] = (uint8_t)(len >> 8); frame[3] = (uint8_t)len; hlen = 4;
    }
    memcpy(frame + hlen, text, len);
    ssize_t w = write(fd, frame, hlen + len);
    return (w == (ssize_t)(hlen + len)) ? 0 : -1;
}

void ws_broadcast(const char *text, size_t len) {
    for (int i = ws_nclients - 1; i >= 0; i--)
        if (ws_send_text(ws_clients[i], text, len) < 0)
            ws_remove_client(i);
}

/* Client frames are masked; only close and ping need an answer. A ping is
   answered with an unmasked pong carrying the unmasked payload (control
   frames carry at most 125 bytes). Data frames are ignored. */
void ws_handle_client(int idx) {
    uint8_t buf[256];
    ssize_t n = read(ws_clients[idx], buf, sizeof(buf));
    if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR)) return;
    if (n <= 0) { ws_remove_client(idx); return; }
    if (n < 2) return;
    uint8_t opcode = buf[0] & 0x0F;
    if (opcode == 0x08) {
        ws_remove_client(idx);
    } else if (opcode == 0x09) {
        size_t len = buf[1] & 0x7F, hdr = (buf[1] & 0x80) ? 6 : 2;
        if (len > 125 || (size_t)n < hdr + len) return;
        uint8_t pong[2 + 125];
        pong[0] = 0x8A;
        pong[1] = (uint8_t)len;
        for (size_t i = 0; i < len; i++)
            pong[2 + i] = (buf[1] & 0x80) ? buf[hdr + i] ^ buf[2 + (i & 3)] : buf[hdr + i];
        (void)write(ws_clients[idx], pong, 2 + len);
    }
}

void ws_stop(void) {
    for (int i = 0; i < ws_nclients; i++) close(ws_clients[i]);
    ws_nclients = 0;
    for (int i = 0; i < ws_npending; i++) close(ws_pending[i].fd);
    ws_npending = 0;
    if (ws_listen_fd >= 0) { close(ws_listen_fd); ws_listen_fd = -1; }
}
