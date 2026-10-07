/* WebSocket access rules of system_bridge (same as diag_bridge's copy). */
#ifndef COMMON_AUTH_H
#define COMMON_AUTH_H

/* SimpleAdmin configuration read for the rules below. */
extern const char *ws_conf_file;

/* Same rules as SimpleAdmin's cgi-bin/session_utils.sh, applied to the
   handshake request (headers, NUL-terminated): a locked GUI refuses
   everyone, a cross-site Origin is refused, and with login enabled the
   simpleadmin_session cookie must name a live session. Returns 1 when the
   connection may be upgraded. */
int ws_request_allowed(const char *request);

#endif
