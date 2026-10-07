/* Minimal WebSocket server of system_bridge (same as diag_bridge's copy). */
#ifndef COMMON_WS_H
#define COMMON_WS_H

#include <stddef.h>
#include <stdint.h>

#define WS_MAX_CLIENTS   8
#define WS_MAX_PENDING   4

/* Connections still in the HTTP upgrade handshake. They are polled with the
   rest of the main loop instead of being read synchronously, so a peer that
   connects and never sends cannot stall DIAG processing. */
struct ws_pending_conn {
    int fd;
    uint64_t deadline_ms;
    size_t len;
    char buf[2048];
};

extern int ws_listen_fd;
extern int ws_clients[WS_MAX_CLIENTS];
extern int ws_nclients;
extern struct ws_pending_conn ws_pending[WS_MAX_PENDING];
extern int ws_npending;

uint64_t monotonic_ms(void);
/* Listens on port, only on iface when given (SO_BINDTODEVICE). */
int ws_start(uint16_t port, const char *iface);
void ws_accept(void);
void ws_pending_read(int idx);
void ws_pending_expire(void);
int ws_send_text(int fd, const char *text, size_t len);
void ws_broadcast(const char *text, size_t len);
void ws_handle_client(int idx);
void ws_stop(void);

#endif
