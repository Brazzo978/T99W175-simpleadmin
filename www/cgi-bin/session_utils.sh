#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DEFAULT_CONFIG_FILE="$SCRIPT_DIR/../config/simpleadmin.conf"
if [ -n "${SIMPLEADMIN_CONFIG_FILE:-}" ]; then
    CONFIG_FILE="$SIMPLEADMIN_CONFIG_FILE"
elif [ -f "$DEFAULT_CONFIG_FILE" ]; then
    CONFIG_FILE="$DEFAULT_CONFIG_FILE"
else
    CONFIG_FILE="$SCRIPT_DIR/simpleadmin.conf"
fi

if [ -f "$CONFIG_FILE" ]; then
    # shellcheck source=/dev/null
    . "$CONFIG_FILE"
fi

SIMPLEADMIN_ENABLE_LOGIN="${SIMPLEADMIN_ENABLE_LOGIN:-1}"
SIMPLEADMIN_GUI_LOCKED="${SIMPLEADMIN_GUI_LOCKED:-0}"
SIMPLEADMIN_GUI_TOGGLE_KEY="${SIMPLEADMIN_GUI_TOGGLE_KEY:-}"
SIMPLEADMIN_GUI_LOCK_PAGE="${SIMPLEADMIN_GUI_LOCK_PAGE:-/webguioff.html}"

SIMPLEADMIN_CSRF_CHECK="${SIMPLEADMIN_CSRF_CHECK:-1}"

is_truthy() {
    case "${1:-}" in
        1|true|TRUE|yes|YES|on|ON) return 0 ;;
        *) return 1 ;;
    esac
}

# CSRF guard. busybox httpd forwards neither Origin nor Sec-Fetch-* to CGI
# scripts, so the Referer is the only same-origin signal available. It is
# required, not just checked when present: a cross-site page can suppress it
# with referrerpolicy="no-referrer", and with login disabled no cookie stands
# between that page and the endpoint.
request_is_same_origin() {
    local referer="${HTTP_REFERER:-}"
    local host="${HTTP_HOST:-}"
    [ -n "$referer" ] && [ -n "$host" ] || return 1

    local rest="${referer#*://}"
    [ "$rest" != "$referer" ] || return 1
    local referer_host="${rest%%/*}"
    # bash 3.2 on the modem: no ${var,,}
    [ "$(printf '%s' "$referer_host" | tr '[:upper:]' '[:lower:]')" = \
      "$(printf '%s' "$host" | tr '[:upper:]' '[:lower:]')" ]
}

credentials_guide() {
    cat <<'EOF'
# Credentials format: username:role:password
# Each line defines an account with username, role, and password.
# Allowed roles: "admin" (full access) and "user" (read-only access).
# Passwords are stored as SHA-512 crypt hashes ($6$...); a plaintext
# password still works and is hashed on the next successful login.
# The line below is the default administrator: change its password.
EOF
}

CREDENTIALS_FILE="${SIMPLEADMIN_CREDENTIALS_FILE:-$SCRIPT_DIR/credentials.txt}"
SESSION_STORE="${SIMPLEADMIN_SESSION_STORE:-/tmp/simpleadmin_sessions.txt}"
SESSION_TTL="${SIMPLEADMIN_SESSION_TTL:-43200}"

login_is_disabled() {
    [ "$SIMPLEADMIN_ENABLE_LOGIN" = "0" ]
}

gui_is_locked() {
    is_truthy "${SIMPLEADMIN_GUI_LOCKED:-0}"
}

status_text() {
    case "$1" in
        200) echo "OK" ;;
        201) echo "Created" ;;
        204) echo "No Content" ;;
        400) echo "Bad Request" ;;
        401) echo "Unauthorized" ;;
        403) echo "Forbidden" ;;
        404) echo "Not Found" ;;
        405) echo "Method Not Allowed" ;;
        409) echo "Conflict" ;;
        500) echo "Internal Server Error" ;;
        *) echo "OK" ;;
    esac
}

send_json_response() {
    local status="${1:-200}"
    local payload="{}"
    if [ $# -ge 2 ] && [ -n "$2" ]; then
        payload="$2"
    fi
    echo "Status: ${status} $(status_text "$status")"
    echo "Content-type: application/json"
    echo "Cache-Control: no-store"
    echo
    printf '%s\n' "$payload"
}

config_set_var_locked() {
    local key="$1"
    local value="$2"

    mkdir -p "$(dirname "$CONFIG_FILE")"
    if [ ! -f "$CONFIG_FILE" ]; then
        : > "$CONFIG_FILE"
    fi

    local tmp
    tmp="${CONFIG_FILE}.tmp"

    if grep -q -E "^${key}=" "$CONFIG_FILE"; then
        # Replace existing value.
        sed -E "s|^${key}=.*$|${key}=${value}|" "$CONFIG_FILE" > "$tmp"
    else
        # Append at end.
        cat "$CONFIG_FILE" > "$tmp"
        printf '\n%s=%s\n' "$key" "$value" >> "$tmp"
    fi

    mv "$tmp" "$CONFIG_FILE"
}

config_set_var() {
    local key="$1"
    local value="$2"
    local lock="${CONFIG_FILE}.lock"
    {
        flock -x 200
        config_set_var_locked "$key" "$value"
    } 200>"$lock"
}

gui_set_locked() {
    local locked="$1"
    if is_truthy "$locked"; then
        SIMPLEADMIN_GUI_LOCKED=1
        config_set_var "SIMPLEADMIN_GUI_LOCKED" "1"
    else
        SIMPLEADMIN_GUI_LOCKED=0
        config_set_var "SIMPLEADMIN_GUI_LOCKED" "0"
    fi
}

gui_toggle_locked() {
    if gui_is_locked; then
        gui_set_locked 0
    else
        gui_set_locked 1
    fi
}

json_escape() {
    local str="${1:-}"
    str=${str//\\/\\\\}
    str=${str//\"/\\\"}
    str=${str//$'\n'/\\n}
    str=${str//$'\r'/}
    str=${str//$'\t'/\\t}
    echo "$str"
}

generate_token() {
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -hex 32
    else
        hexdump -n 16 -v -e '/1 "%02x"' /dev/urandom
    fi
}

current_timestamp() {
    date +%s
}

write_default_credentials_file() {
    {
        credentials_guide
        printf 'admin:admin:%s\n' "$(hash_password admin || printf 'admin')"
    } > "$CREDENTIALS_FILE"
}

ensure_credentials_commentary_locked() {
    if [ ! -f "$CREDENTIALS_FILE" ]; then
        return 0
    fi

    local first_line
    first_line="$(head -n 1 "$CREDENTIALS_FILE" 2>/dev/null || true)"
    if [ "${first_line#\#}" = "$first_line" ]; then
        local tmp
        tmp="${CREDENTIALS_FILE}.tmp"
        {
            credentials_guide
            cat "$CREDENTIALS_FILE"
        } > "$tmp"
        mv "$tmp" "$CREDENTIALS_FILE"
    fi
}

ensure_credentials_file() {
    if login_is_disabled; then
        return 0
    fi
    mkdir -p "$(dirname "$CREDENTIALS_FILE")"

    if [ ! -f "$CREDENTIALS_FILE" ] || [ ! -s "$CREDENTIALS_FILE" ]; then
        write_default_credentials_file
        return 0
    fi

    { flock -x 200; ensure_credentials_commentary_locked; ensure_defaults_locked; } 200>"${CREDENTIALS_FILE}.lock"
}

ensure_session_store() {
    if login_is_disabled; then
        return 0
    fi
    if [ ! -f "$SESSION_STORE" ]; then
        mkdir -p "$(dirname "$SESSION_STORE")"
        : > "$SESSION_STORE"
    fi
}

cleanup_sessions_locked() {
    local now
    now="$(current_timestamp)"
    local tmp
    tmp="${SESSION_STORE}.tmp"
    if [ -f "$SESSION_STORE" ]; then
        awk -F ':' -v now="$now" 'NF>=4 { if ($4 > now) print $0 }' "$SESSION_STORE" > "$tmp" || :
        mv "$tmp" "$SESSION_STORE"
    else
        : > "$SESSION_STORE"
    fi
}

cleanup_sessions() {
    if login_is_disabled; then
        return 0
    fi
    ensure_session_store
    {
        flock -x 200
        cleanup_sessions_locked
    } 200>"${SESSION_STORE}.lock"
}

find_user_line() {
    local username="$1"
    ensure_credentials_file
    grep -E "^${username}:" "$CREDENTIALS_FILE" | head -n 1 || true
}

validate_username() {
    local username="$1"
    [[ "$username" =~ ^[A-Za-z0-9_.@-]{1,64}$ ]]
}

validate_role() {
    local role="$1"
    case "$role" in
        admin|user) return 0 ;;
        *) return 1 ;;
    esac
}

# Passwords are stored as SHA-512 crypt hashes ($6$salt$hash), the
# /etc/shadow format: its alphabet has no ':' so it fits the
# username:role:password layout. Lines still holding a plaintext password
# keep working and are rehashed on the first successful login.
generate_password_salt() {
    local salt=""
    if command -v openssl >/dev/null 2>&1; then
        salt="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9./' | cut -c1-16)"
    fi
    if [ "${#salt}" -lt 16 ]; then
        salt="$(hexdump -n 8 -v -e '/1 "%02x"' /dev/urandom)"
    fi
    printf '%s' "$salt"
}

hash_password_with_salt() {
    local password="$1"
    local salt="$2"
    if command -v openssl >/dev/null 2>&1; then
        printf '%s\n' "$password" | openssl passwd -6 -salt "$salt" -stdin
    elif command -v cryptpw >/dev/null 2>&1; then
        printf '%s' "$password" | cryptpw -m sha512 -S "$salt"
    else
        return 1
    fi
}

hash_password() {
    local hashed
    hashed="$(hash_password_with_salt "$1" "$(generate_password_salt)")" || return 1
    case "$hashed" in
        '$6$'*) printf '%s' "$hashed" ;;
        *) return 1 ;;
    esac
}

password_is_hashed() {
    case "$1" in
        '$6$'*) return 0 ;;
        *) return 1 ;;
    esac
}

verify_password() {
    local password="$1"
    local stored="$2"
    if password_is_hashed "$stored"; then
        local salt="${stored#\$6\$}"
        salt="${salt%%\$*}"
        [ "$(hash_password_with_salt "$password" "$salt")" = "$stored" ]
    else
        [ -n "$stored" ] && [ "$password" = "$stored" ]
    fi
}

# Newlines would split the credentials line; the hash itself has no ':'.
validate_password() {
    local password="$1"
    [ -n "$password" ] && [[ "$password" != *$'\n'* ]] && [[ "$password" != *$'\r'* ]]
}

authenticate_user() {
    local username="$1"
    local password="$2"
    local line
    line="$(find_user_line "$username")"
    if [ -z "$line" ]; then
        return 1
    fi
    IFS=':' read -r stored_username stored_role stored_password <<< "$line"
    if [ "$stored_username" != "$username" ]; then
        return 1
    fi
    if verify_password "$password" "$stored_password"; then
        SESSION_USERNAME="$stored_username"
        SESSION_ROLE="$stored_role"
        if ! password_is_hashed "$stored_password"; then
            update_password "$stored_username" "$password" || true
        fi
        return 0
    fi
    return 1
}

create_session() {
    local username="$1"
    local role="${2:-admin}"
    ensure_session_store
    local token
    token="$(generate_token)"
    local expiry
    expiry=$(( $(current_timestamp) + SESSION_TTL ))
    local tmp
    tmp="${SESSION_STORE}.tmp"
    {
        flock -x 200
        cleanup_sessions_locked
        if [ -f "$SESSION_STORE" ]; then
            cp "$SESSION_STORE" "$tmp"
        else
            : > "$tmp"
        fi
        printf '%s:%s:%s:%s\n' "$token" "$username" "$role" "$expiry" >> "$tmp"
        mv "$tmp" "$SESSION_STORE"
    } 200>"${SESSION_STORE}.lock"
    SESSION_TOKEN="$token"
    SESSION_USERNAME="$username"
    SESSION_ROLE="$role"
    SESSION_EXPIRY="$expiry"
}

load_session_from_token() {
    local token="$1"
    ensure_session_store
    if [ -z "$token" ]; then
        return 1
    fi
    cleanup_sessions
    if [ ! -f "$SESSION_STORE" ]; then
        return 1
    fi
    local line
    line=$(grep -E "^${token}:" "$SESSION_STORE" | head -n 1 || true)
    if [ -z "$line" ]; then
        return 1
    fi
    IFS=':' read -r stored_token stored_username stored_role stored_expiry <<< "$line"
    local now
    now="$(current_timestamp)"
    if [ "$stored_expiry" -le "$now" ]; then
        return 1
    fi
    SESSION_TOKEN="$stored_token"
    SESSION_USERNAME="$stored_username"
    SESSION_ROLE="$stored_role"
    SESSION_EXPIRY="$stored_expiry"
    return 0
}

extract_token_from_cookie() {
    local cookies="${HTTP_COOKIE:-}"
    if [ -z "$cookies" ]; then
        echo ""
        return
    fi
    printf '%s' "$cookies" | tr ';' '\n' | sed -n 's/^simpleadmin_session=\([^;]*\).*/\1/p' | head -n 1
}

session_load() {
    # GUI lock blocks all authenticated operations (including "login disabled" mode),
    # unless explicitly allowed by the caller.
    if gui_is_locked && [ "${SIMPLEADMIN_GUI_ALLOW_LOCKED:-0}" != "1" ]; then
        return 1
    fi

    if is_truthy "$SIMPLEADMIN_CSRF_CHECK" && ! request_is_same_origin; then
        send_json_response 403 '{"success":false,"status":"error","message":"Cross-site request blocked"}'
        exit 0
    fi

    if login_is_disabled; then
        SESSION_TOKEN=""
        SESSION_USERNAME="admin"
        SESSION_ROLE="admin"
        SESSION_EXPIRY=""
        return 0
    fi
    local token
    token="$(extract_token_from_cookie)"
    if [ -z "$token" ]; then
        return 1
    fi
    if load_session_from_token "$token"; then
        return 0
    fi
    return 1
}

session_require_role() {
    local expected_role="$1"
    if login_is_disabled; then
        return 0
    fi
    if [ "${SESSION_ROLE:-}" = "$expected_role" ]; then
        return 0
    fi
    return 1
}

invalidate_session() {
    if login_is_disabled; then
        return 0
    fi
    local token="$1"
    ensure_session_store
    if [ -z "$token" ]; then
        return 0
    fi
    local tmp
    tmp="${SESSION_STORE}.tmp"
    {
        flock -x 200
        if [ -f "$SESSION_STORE" ]; then
            grep -v -E "^${token}:" "$SESSION_STORE" > "$tmp" || :
            mv "$tmp" "$SESSION_STORE"
        fi
    } 200>"${SESSION_STORE}.lock"
}

# Recreate the default admin only when no administrator account is left, so
# renaming or removing "admin" does not silently bring back admin:admin.
ensure_admin_exists_locked() {
    if ! awk -F ':' '$1 !~ /^#/ && $2=="admin" {found=1} END{exit found?0:1}' "$CREDENTIALS_FILE"; then
        printf 'admin:admin:%s\n' "$(hash_password admin || printf 'admin')" >> "$CREDENTIALS_FILE"
    fi
}

ensure_defaults_locked() {
    ensure_admin_exists_locked
}

list_users() {
    ensure_credentials_file
    local first=1
    printf '['
    while IFS=':' read -r username role password; do
        case "$username" in
            ''|\#*) continue ;;
        esac
        if [ $first -eq 0 ]; then
            printf ','
        fi
        printf '{"username":"%s","role":"%s"}' "$(json_escape "$username")" "$(json_escape "$role")"
        first=0
    done < "$CREDENTIALS_FILE"
    printf ']'
}

user_exists() {
    local username="$1"
    ensure_credentials_file
    if grep -q -E "^${username}:" "$CREDENTIALS_FILE"; then
        return 0
    fi
    return 1
}

add_user() {
    local username="$1"
    local role="${2:-admin}"
    local password="$3"
    if ! validate_username "$username"; then
        echo "Invalid username" >&2
        return 2
    fi
    if ! validate_role "$role"; then
        echo "Invalid role" >&2
        return 3
    fi
    if ! validate_password "$password"; then
        echo "Invalid password" >&2
        return 4
    fi
    local hashed
    if ! hashed="$(hash_password "$password")"; then
        echo "Unable to hash password" >&2
        return 5
    fi
    ensure_credentials_file
    local lock="${CREDENTIALS_FILE}.lock"
    {
        flock -x 200
        if grep -q -E "^${username}:" "$CREDENTIALS_FILE"; then
            return 1
        fi
        printf '%s:%s:%s\n' "$username" "$role" "$hashed" >> "$CREDENTIALS_FILE"
        ensure_defaults_locked
    } 200>"$lock"
    return 0
}

update_password() {
    local username="$1"
    local password="$2"
    if ! validate_password "$password"; then
        return 2
    fi
    local hashed
    hashed="$(hash_password "$password")" || return 3
    ensure_credentials_file
    local lock="${CREDENTIALS_FILE}.lock"
    {
        flock -x 200
        if ! grep -q -E "^${username}:" "$CREDENTIALS_FILE"; then
            return 1
        fi
        # The hash alphabet is [./0-9A-Za-z$], so awk -v cannot mangle it.
        awk -F ':' -v user="$username" -v password="$hashed" 'BEGIN{OFS=":"} { if ($1==user) {$3=password; NF=3}; print }' "$CREDENTIALS_FILE" > "${CREDENTIALS_FILE}.tmp"
        mv "${CREDENTIALS_FILE}.tmp" "$CREDENTIALS_FILE"
        ensure_defaults_locked
    } 200>"$lock"
    return 0
}

update_role() {
    local username="$1"
    local role="$2"
    ensure_credentials_file
    if ! validate_role "$role"; then
        return 2
    fi
    local lock="${CREDENTIALS_FILE}.lock"
    {
        flock -x 200
        if ! grep -q -E "^${username}:" "$CREDENTIALS_FILE"; then
            return 1
        fi
        awk -F ':' -v user="$username" -v role="$role" 'BEGIN{OFS=":"} { if ($1==user) {$2=role}; print }' "$CREDENTIALS_FILE" > "${CREDENTIALS_FILE}.tmp"
        mv "${CREDENTIALS_FILE}.tmp" "$CREDENTIALS_FILE"
        ensure_defaults_locked
    } 200>"$lock"
    return 0
}

delete_user() {
    local username="$1"
    ensure_credentials_file
    if [ "$username" = "admin" ]; then
        return 4
    fi
    local lock="${CREDENTIALS_FILE}.lock"
    {
        flock -x 200
        if ! grep -q -E "^${username}:" "$CREDENTIALS_FILE"; then
            return 1
        fi
        local admins
        admins=$(awk -F ':' '$2 == "admin" {count++} END {print count+0}' "$CREDENTIALS_FILE")
        local is_admin
        is_admin=$(grep -E "^${username}:" "$CREDENTIALS_FILE" | awk -F ':' '{print $2}' | head -n1)
        if [ "$is_admin" = "admin" ] && [ "$admins" -le 1 ]; then
            return 2
        fi
        grep -v -E "^${username}:" "$CREDENTIALS_FILE" > "${CREDENTIALS_FILE}.tmp"
        mv "${CREDENTIALS_FILE}.tmp" "$CREDENTIALS_FILE"
        ensure_defaults_locked
    } 200>"$lock"
    return 0
}
