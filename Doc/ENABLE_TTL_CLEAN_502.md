# Enable Clean TTL Flow on 502 (T99-style CGI + stock firewall backend)  STILL NOT WORKING 

Questa procedura porta il TTL del 502 a una versione pulita:

- CGI `set_ttl` e `get_ttl_status` con session/auth (`session_utils.sh`)
- parsing input sicuro (niente `eval`)
- backend `ttl-override` senza regole duplicate
- persistenza valore TTL in `/usrdata/simplefirewall/ttlvalue`

## File usati dal repo

- `scripts/502/simplefirewall/ttl-override`
- `scripts/502/simplefirewall/ttl-override.service`


