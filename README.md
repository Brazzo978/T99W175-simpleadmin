# T99W175-simpleadmin

"Simple T99" web interface for the T99W175 modem/router, composed of static HTML/JS pages and Bash CGI scripts that interact with the device's networking services. For a detailed description of each file and the available features, see [DOCUMENTAZIONE.md](DOCUMENTAZIONE.md).

## Configurazione

Il comportamento dell'autenticazione può essere controllato tramite il file `www/config/simpleadmin.conf`. La voce `SIMPLEADMIN_ENABLE_LOGIN` è impostata a `1` per richiedere il login degli utenti; impostandola a `0` il login viene disattivato e l'interfaccia web resta accessibile senza credenziali.
