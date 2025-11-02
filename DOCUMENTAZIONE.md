# Documentazione dettagliata di "Simple Admin"

## Panoramica del progetto
"Simple Admin" è un'interfaccia amministrativa web progettata per modem/router basati sul modem Quectel T99W175. L'applicazione è composta da pagine HTML statiche arricchite da Bootstrap 5 e Alpine.js sul lato client e da una serie di CGI Bash che eseguono comandi AT, interrogano lo stato del sistema e orchestrano utility come Watchcat, TTL override o l'invio di SMS. Tutti i file sono pensati per essere distribuiti sulla partizione web del dispositivo ed eseguiti dal server HTTP embedded.

## Struttura generale del repository
- `README.md`: panoramica sintetica del progetto e rimando alla presente documentazione.
- `www/`: directory principale pubblicata dal server HTTP del modem.
  - File HTML di pagina (`index.html`, `network.html`, `scanner.html`, `settings.html`, `sms.html`, `deviceinfo.html`, `watchcat.html`, `watchcat_backup.html`).
  - Asset statici (`css/`, `js/`, `fonts/`, `favicon.ico`).
  - Script CGI Bash (`cgi-bin/`) invocati via fetch dalle pagine web.

## Dettaglio dei file HTML
### `www/index.html`
Home page che mostra lo stato generale del modem. Il template include navbar Bootstrap, widget riassuntivi e tre sezioni principali:
- Pannello "Device Overview" con schede per temperatura, stato SIM, segnale e uptime aggiornate da `processAllInfos()` tramite interrogazioni AT (`get_atcommand`).【F:www/index.html†L1-L384】【F:www/index.html†L600-L879】
- Grafici numerici di throughput 5G/LTE ottenuti da parsing delle risposte `^NRSTAT` e `^SRVST` (variabili `nrDownload`, `nonNrUpload`, ecc.).【F:www/index.html†L384-L600】
- Tabelle dettagliate con identificativi cella (eNBID, CellID, TAC), indirizzi IP, stato di rete e indicatori di qualità (RSRP/RSRQ/SINR) con barre di avanzamento percentuali calcolate lato client.【F:www/index.html†L180-L384】【F:www/index.html†L520-L720】
La funzione `processAllInfos()` definisce lo stato iniziale, esegue fetch ciclici al CGI `get_atcommand` e parsea le risposte AT per popolare le proprietà Alpine. Gestisce anche fallback in caso di errori e memorizza l'ultima data di aggiornamento.【F:www/index.html†L600-L879】

### `www/network.html`
Interfaccia di configurazione radio. Il componente Alpine `cellLocking()` gestisce:
- Recupero delle bande supportate e di quelle attualmente bloccate tramite `AT^BAND_PREF_EXT?`, popolando dinamicamente la form con `populateCheckboxes()` e controlli per mostrare le bande consentite dall'operatore.【F:www/network.html†L1-L260】【F:www/network.html†L440-L720】
- Possibilità di bloccare bande LTE/NR5G per ciascuna modalità (LTE, NSA, SA) inviando AT `AT^BAND_PREF`. Il codice conserva lo stato selezionato e aggiorna `updatedLockedBands` sui cambi di checkbox.【F:www/network.html†L260-L520】
- Utility di rete (ping, TTL, reset) e modale di conferma, oltre a supporto per generare campi EARFCN/PCI con `generate-freq-box.js` e interpretare impostazioni correnti con `parseCurrentSettings()`.【F:www/network.html†L200-L360】【F:www/js/generate-freq-box.js†L1-L38】【F:www/js/parse-settings.js†L1-L92】

### `www/scanner.html`
Pagina dedicata allo scanning delle celle. Carica Chart.js (per futuri grafici) e istanzia `cellScanner()` che:
- Contiene un dizionario MCC/MNC→nome operatore usato per etichettare i risultati di scansione.【F:www/scanner.html†L1-L320】
- Fornisce funzioni `startCellScan()` e `parseCellScan()` (definite più avanti nel file) che inviano comandi AT multi-step per ottenere tabelle di celle LTE e NR5G e popolare la tabella dinamica con frequenze, bande, PCI, RSRP e livello segnale.【F:www/scanner.html†L320-L520】
- Gestisce stati di caricamento, cancellazione dei risultati, cambi di modalità (Full/LTE/NR5G) e disabilita i pulsanti durante la scansione per evitare comandi simultanei.【F:www/scanner.html†L120-L220】【F:www/scanner.html†L320-L420】

### `www/settings.html`
Hub di utility avanzate. `simpleSettings()` espone numerose azioni:
- Terminale AT con textarea di output, history e pulsanti di invio/clear; supporta invio multiplo separato da virgole e fallback su `ATI` quando vuoto.【F:www/settings.html†L1-L200】【F:www/settings.html†L380-L540】
- Sezione "One Click Utilities" per reboot, reset configurazioni AT, gestione IP passthrough, DNS proxy e modalità USB (RMNET/ECM/MBIM/RNDIS). Il codice prepara i comandi `AT+QMAP`, `AT+QCFG` e invoca `rebootDevice()` dopo le modifiche.【F:www/settings.html†L200-L360】【F:www/settings.html†L540-L660】
- Pannello TTL override che interroga `/cgi-bin/get_ttl_status`, abilita/disabilita il servizio con `/cgi-bin/set_ttl` e mostra log di debug in risposta.【F:www/settings.html†L660-L820】
- Monitor di Watchcat (lettura `/cgi-bin/get_watchcat_status`) con pulsanti per aprire la pagina dedicata e per rigenerare la configurazione via `/cgi-bin/set_watchcat`.【F:www/settings.html†L820-L940】
- Supporto a modali di conferma e countdown di reboot, oltre a logica per sincronizzare gli switch UI con i valori restituiti dai CGI.【F:www/settings.html†L380-L540】【F:www/settings.html†L700-L860】

### `www/sms.html`
Modulo SMS bilingue (commenti inglese/cinese). Il componente `fetchSMS()`:
- Esegue `AT+CMGL="ALL"` tramite `get_atcommand` per scaricare inbox, convertendo risposte UCS-2 in testo leggibile con `convertHexToText` e normalizzando timestamp (`parseCustomDate`).【F:www/sms.html†L1-L160】【F:www/sms.html†L160-L360】
- Gestisce selezione multipla, "Select All", cancellazione per indici specifici (`AT+CMGD=`) o massiva (`AT+CMGD=,4`).【F:www/sms.html†L200-L320】
- Implementa invio SMS multipart in UCS-2 con calcolo header UDH (`uid`, numero segmenti) inviando i parametri codificati al CGI `send_sms`. Mostra notifiche visive per esito e ripete la richiesta inbox dopo l'invio.【F:www/sms.html†L320-L360】

### `www/deviceinfo.html`
Dashboard informativa con modale per cambio IMEI:
- `fetchDeviceInfo()` invia comandi AT (`AT+CGMI`, `AT+CGMM`, `^VERSION?`, `+CIMI`, `+ICCID`, `+CGSN`, `+CNUM`, `+CGCONTRDP`) per ottenere produttore, modello, versione firmware, IMSI, ICCID, IMEI, IP WWAN e numero telefonico, e richiama `/cgi-bin/get_lanip` per l'IP LAN.【F:www/deviceinfo.html†L1-L220】【F:www/deviceinfo.html†L360-L520】
- Consente di inserire un nuovo IMEI: `updateIMEI()` effettua padding, swap nibble, formatta la stringa e prepara due comandi `^NV` concatenati prima di chiamare `rebootDevice()` per applicare il cambiamento.【F:www/deviceinfo.html†L400-L500】
- Include modale con countdown di reboot, sezione contributor e tabelle per mostrare i dati in tempo reale.【F:www/deviceinfo.html†L220-L360】【F:www/deviceinfo.html†L500-L520】

### `www/watchcat.html`
Interfaccia moderna per configurare il watchdog di connettività:
- La form raccoglie IP da pingare, timeout e soglia fallimenti, abilita/disabilita l'esecuzione con uno switch. `simpleWatchCat()` chiama `/cgi-bin/watchcat_maker` con parametri codificati e ricarica lo stato da `/cgi-bin/get_watchcat_status` per riflettere i dati attivi in `/tmp/watchcat.json`.【F:www/watchcat.html†L1-L200】【F:www/watchcat.html†L200-L340】
- Il getter `isFormComplete` disabilita lo switch finché tutti i campi non sono compilati, prevenendo configurazioni incomplete.【F:www/watchcat.html†L220-L320】

### `www/watchcat_backup.html`
Versione precedente della pagina Watchcat, praticamente identica ma con binding leggermente differenti (`x:onchange` anziché `x-on:change`) e senza fetch dello stato iniziale. Conservata come fallback storico.【F:www/watchcat_backup.html†L1-L200】

### `www/network.html` (sezione Utility)
Oltre al band locking, la pagina contiene schede per IP passthrough, configurazione APN e gestione PCI/EARFCN manuale grazie ai campi generati da `generateFreqNumberInputs`. I pulsanti attivano metodi `cellLocking()` per inviare comandi AT di lock, reset o generazione modali. I checkbox usano `populateCheckboxes()` per mantenere lo stato bloccato anche al refresh.【F:www/network.html†L120-L260】【F:www/js/populate-checkbox.js†L1-L80】

## Dettaglio dei file JavaScript
### `www/js/dark-mode.js`
Gestisce il toggle tema chiaro/scuro aggiornando l'attributo `data-bs-theme` sull'elemento `<html>`, memorizza la scelta in `localStorage` e inverte il testo del pulsante. Se non è presente preferenza, imposta di default il tema scuro.【F:www/js/dark-mode.js†L1-L35】

### `www/js/generate-freq-box.js`
Crea dinamicamente fino a 10 coppie di input EARFCN/PCI per la sezione "Manual Cell Locking". Ascolta l'input `NumCells` e popola il contenitore `freqNumbersContainer` con markup condizionale che sfrutta Alpine (`x-show`).【F:www/js/generate-freq-box.js†L1-L38】

### `www/js/parse-settings.js`
Funzioni di parsing delle risposte AT per ricavare SIM attiva, APN, stato di cell locking, preferenze rete e bande PCC/SCC. Restituisce un oggetto con campi normalizzati usato da `cellLocking().getCurrentSettings()`.【F:www/js/parse-settings.js†L1-L92】

### `www/js/populate-checkbox.js`
Genera le checkbox di selezione bande con layout responsive (righe da 5 colonne), pre-seleziona quelle attualmente bloccate e aggiunge listener per aggiornare `cellLock` al cambiamento. Utilizza DocumentFragment per performance.【F:www/js/populate-checkbox.js†L1-L80】

### Librerie di terze parti
- `www/js/alpinejs.min.js`: build minificata di Alpine.js 3, fornisce binding reattivo `x-data`, `x-show`, `x-model` nelle pagine.
- `www/js/bootstrap.bundle.min.js`: bundle Bootstrap 5 (incluso Popper) per componenti UI e responsive layout.

## Dettaglio dei file CSS e asset
### `www/css/styles.css`
Definisce l'import dei font Poppins in vari pesi, importa `all.min.css` (probabilmente Font Awesome) e aggiunge stili custom per modali di caricamento, loader animati e classi utility (`.is-warning`, `.is-medium`). Forza il font Poppins su tutta l'app.【F:www/css/styles.css†L1-L120】【F:www/css/styles.css†L120-L200】

### `www/css/bootstrap.min.css`
Distribuzione minificata di Bootstrap 5.3 locale per garantire UI coerente offline.

### `www/css/all.min.css`
Foglio di stile minificato per icone (derivato da Font Awesome), utilizzato per eventuali simboli nelle pagine.

### `www/fonts/*.woff2`
Set completo del font "Poppins" in vari pesi (300–700, regular/italic) caricati localmente per ridurre dipendenze esterne.

### Altri asset
- `www/favicon.ico`: icona del sito.

## Script CGI (`www/cgi-bin/`)
### `get_atcommand`
Script Bash che riceve parametri URL-encoded (`atcmd`), li decodifica (`urldecode`), invia il comando ad `atcli_smd8` e attende risposta contenente `OK` o `ERROR` prima di restituirla come plain text. Gestisce progressivamente il tempo di attesa in caso di risposte lunghe.【F:www/cgi-bin/get_atcommand†L1-L33】

### `user_atcommand`
Variante di `get_atcommand` che usa `awk` per rimuovere sequenze ANSI dalla risposta AT, pensata per comandi avanzati inseriti dall'utente nella pagina Settings.【F:www/cgi-bin/user_atcommand†L1-L32】

### `get_ping`
Esegue `ping -c 1 8.8.8.8` e ritorna "OK" o "ERROR" in base alla perdita di pacchetti, usato per verificare la connettività Internet nella homepage.【F:www/cgi-bin/get_ping†L1-L18】

### `get_uptime`
Invoca `uptime` e restituisce il risultato come testo semplice per la scheda Uptime della homepage.【F:www/cgi-bin/get_uptime†L1-L11】

### `get_lanip`
Parsa `mobileap_cfg.xml` per ottenere l'indirizzo IP LAN (`APIPAddr`) e lo restituisce in JSON. Fornisce fallback "0" quando il valore non è presente.【F:www/cgi-bin/get_lanip†L1-L20】

### `get_ttl_status`
Controlla `iptables -t mangle` alla ricerca della regola TTL, determinando se il servizio è attivo e quale valore viene applicato. Produce JSON con `isEnabled` e `ttl`.【F:www/cgi-bin/get_ttl_status†L1-L19】

### `set_ttl`
Gestisce l'override TTL: legge `ttlvalue` dalla query string, ferma il servizio `/usrdata/simplefirewall/ttl-override`, invoca `ttl_script.sh` per abilitare/disabilitare il valore e lo riattiva. Restituisce log di debug in un array JSON per diagnosi lato UI.【F:www/cgi-bin/set_ttl†L1-L60】

### `get_watchcat_status`
Restituisce `/tmp/watchcat.json` (se presente) per esporre stato e log del watchdog; in caso contrario risponde con `{}`.【F:www/cgi-bin/get_watchcat_status†L1-L18】

### `set_watchcat`
Crea/aggiorna il servizio systemd `watchcat.service` basandosi sui parametri URL (`status`, `IpDNS`, `cooldown`, `failures`, `action`). Quando abilitato, genera uno script `/usrdata/simpleadmin/script/watchat.sh` che pinga ciclicamente l'host e registra esiti, eventualmente riavviando il modem o cambiando SIM. Gestisce anche la disinstallazione completa quando disattivato.【F:www/cgi-bin/set_watchcat†L1-L120】

### `watchcat_maker`
Versione semplificata che valida i parametri e delega a script esterni (`create_watchcat.sh`/`remove_watchcat.sh`) per abilitare o disattivare Watchcat, restituendo messaggi in plain text.【F:www/cgi-bin/watchcat_maker†L1-L80】

### `send_sms`
Riceve numero e messaggio UCS-2 (parametri `number`, `msg`, `Command`), invia `AT+CMGS` tramite `atcli_smd8`, quindi inoltra il corpo a `microcom` aggiungendo `CTRL+Z`. Restituisce la risposta grezza del modem (lo script contiene piccola svista con parentesi ma funziona come prototipo).【F:www/cgi-bin/send_sms†L1-L40】

### `get_watchcat_status`, `watchcat_maker`, `set_watchcat`
Lavorano in sinergia con `www/watchcat*.html` per creare servizi persistenti e salvare log in `/tmp/watchat.json`, consentendo al front-end di mostrare stato e cronologia ping.【F:www/cgi-bin/get_watchcat_status†L1-L18】【F:www/cgi-bin/watchcat_maker†L1-L80】【F:www/cgi-bin/set_watchcat†L1-L120】

### `get_lanip`, `get_ping`, `get_uptime`
Forniscono API leggere in JSON o testo per alimentare rispettivamente Device Info, i test di connettività e il riquadro "Uptime" della home.【F:www/cgi-bin/get_lanip†L1-L20】【F:www/cgi-bin/get_ping†L1-L18】【F:www/cgi-bin/get_uptime†L1-L11】

## Note di progetto e comportamento complessivo
- Tutte le pagine includono `js/dark-mode.js`, permettendo la persistenza del tema via `localStorage` condivisa sull'intero sito.【F:www/index.html†L600-L640】【F:www/settings.html†L1-L60】
- Le chiamate verso `/cgi-bin/get_atcommand` concatenano più comandi AT con `;` per minimizzare round trip, richiedendo attenzione ai timeout; l'interfaccia mostra loader (`.loader`) mentre attende le risposte.【F:www/index.html†L600-L720】【F:www/css/styles.css†L80-L140】
- Gli script CGI presuppongono la presenza di strumenti proprietari (`atcli_smd8`, `/usrdata/simpleadmin/script/...`), confermando che il repository è destinato ad essere distribuito sul firmware personalizzato del modem.

