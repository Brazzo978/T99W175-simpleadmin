#!/bin/bash
set -eu

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

CREDENTIALS_FILE="${SIMPLEADMIN_CREDENTIALS_FILE:-$SCRIPT_DIR/credentials.txt}"
SESSION_STORE="${SIMPLEADMIN_SESSION_STORE:-/tmp/simpleadmin_sessions.txt}"
SESSION_TTL="${SIMPLEADMIN_SESSION_TTL:-43200}"

login_is_disabled() {
    [ "$SIMPLEADMIN_ENABLE_LOGIN" = "0" ]
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

json_escape() {
    local str="${1:-}"
    str=${str//\\/\\\\}
    str=${str//\"/\\\"}
    str=${str//$'\n'/\\n}
    str=${str//$'\r'/}
    str=${str//$'\t'/\\t}
    echo "$str"
}

hash_password() {
    local password="$1"
    printf '%s' "$password" | sha256sum | awk '{print $1}'
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

ensure_credentials_file() {
    if login_is_disabled; then
        return 0
    fi
    if [ ! -f "$CREDENTIALS_FILE" ]; then
        mkdir -p "$(dirname "$CREDENTIALS_FILE")"
        local default_hash
        default_hash="$(hash_password "admin")"
        printf 'admin:admin:%s\n' "$default_hash" > "$CREDENTIALS_FILE"
    fi
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

authenticate_user() {
    local username="$1"
    local password="$2"
    local line
    line="$(find_user_line "$username")"
    if [ -z "$line" ]; then
        return 1
    fi
    IFS=':' read -r stored_username stored_role stored_hash <<< "$line"
    if [ "$stored_username" != "$username" ]; then
        return 1
    fi
    local password_hash
    password_hash="$(hash_password "$password")"
    if [ "$password_hash" = "$stored_hash" ]; then
        SESSION_USERNAME="$stored_username"
        SESSION_ROLE="$stored_role"
        return 0
    fi
    return 1
}

create_session() {
    local username="$1"
    local role="$2"
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

ensure_admin_exists_locked() {
    if ! grep -q '^admin:' "$CREDENTIALS_FILE"; then
        local default_hash
        default_hash="$(hash_password "admin")"
        printf 'admin:admin:%s\n' "$default_hash" >> "$CREDENTIALS_FILE"
    fi
    if ! awk -F ':' '$2 == "admin" { count++ } END { exit(count>0 ? 0 : 1) }' "$CREDENTIALS_FILE"; then
        local first_user
        first_user=$(head -n 1 "$CREDENTIALS_FILE" | cut -d ':' -f1)
        if [ -n "$first_user" ]; then
            awk -F ':' -v user="$first_user" 'BEGIN{OFS=":"} { if ($1==user) {$2="admin"}; print }' "$CREDENTIALS_FILE" > "${CREDENTIALS_FILE}.tmp"
            mv "${CREDENTIALS_FILE}.tmp" "$CREDENTIALS_FILE"
        fi
    fi
}

list_users() {
    ensure_credentials_file
    local first=1
    printf '['
    while IFS=':' read -r username role _; do
        [ -z "$username" ] && continue
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
    local role="$2"
    local password="$3"
    if ! validate_username "$username"; then
        echo "Invalid username" >&2
        return 2
    fi
    if ! validate_role "$role"; then
        echo "Invalid role" >&2
        return 3
    fi
    ensure_credentials_file
    local lock="${CREDENTIALS_FILE}.lock"
    {
        flock -x 200
        if grep -q -E "^${username}:" "$CREDENTIALS_FILE"; then
            return 1
        fi
        local hash
        hash="$(hash_password "$password")"
        printf '%s:%s:%s\n' "$username" "$role" "$hash" >> "$CREDENTIALS_FILE"
        ensure_admin_exists_locked
    } 200>"$lock"
    return 0
}

update_password() {
    local username="$1"
    local password="$2"
    ensure_credentials_file
    local lock="${CREDENTIALS_FILE}.lock"
    {
        flock -x 200
        if ! grep -q -E "^${username}:" "$CREDENTIALS_FILE"; then
            return 1
        fi
        local hash
        hash="$(hash_password "$password")"
        awk -F ':' -v user="$username" -v hash="$hash" 'BEGIN{OFS=":"} { if ($1==user) {$3=hash}; print }' "$CREDENTIALS_FILE" > "${CREDENTIALS_FILE}.tmp"
        mv "${CREDENTIALS_FILE}.tmp" "$CREDENTIALS_FILE"
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
        ensure_admin_exists_locked
    } 200>"$lock"
    return 0
}

delete_user() {
    local username="$1"
    ensure_credentials_file
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
        ensure_admin_exists_locked
    } 200>"$lock"
    return 0
}
