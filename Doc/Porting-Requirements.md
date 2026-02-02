# Requirement per porting GUI su modem Quectel (AT diversi)

## Obiettivo
Questo documento elenca **tutti i dati richiesti dalla GUI** per risultare utilizzabile su un modem diverso (es. Quectel) e indica **dove** nella codebase tali dati vengono richiesti o parsati. L’obiettivo è fornire una base per iniziare il porting sostituendo la sintassi AT del T99W175 con la sintassi AT Quectel, mantenendo invariato il contratto dati usato dal front-end. La GUI attuale usa CGI Bash e JavaScript per inviare AT e interpretare le risposte.【F:Doc/Explaination.md†L1-L128】

---

## 1) Inventario dati necessari (contratto dati richiesto dalla GUI)

> **Nota:** per ogni riga sono indicati **i dati richiesti**, **il comando AT oggi usato** (T99W175) e **il punto nel codice**. In fase di porting, vanno fornite le controparti Quectel e gli adattamenti di parsing.

### 1.1 Identità modem / build
**Dati necessari**
- Produttore, modello, versione firmware/hardware
- IMEI
- IMSI, ICCID, numero MSISDN (se disponibile)

**Comandi T99W175 attuali**
- `AT+CGMI`, `AT+CGMM`, `AT^VERSION?`, `AT+CGSN`, `AT+CIMI`, `AT+ICCID`, `AT+CNUM`【F:Doc/Explaination.md†L48-L49】

**Uso nel codice**
- `www/deviceinfo.html` + `fetchDeviceInfo()` (richiama `get_atcommand`)【F:Doc/Explaination.md†L48-L49】

**Requisito porting Quectel**
- Mappare comandi equivalenti Quectel (es. CGMI/CGMM/CGSN spesso standard) e **formato risposta** (linee, separatori, prefissi) per parser front-end.

---

### 1.2 Stato radio e modalità RAT
**Dati necessari**
- Modalità radio corrente (auto, 3G/4G/5G combinazioni)
- Stato NR5G (NSA/SA)
- Stato radio on/off (funzionalità baseband)

**Comandi T99W175 attuali**
- `AT^SLMODE?` (modalità radio), `AT^NR5G_MODE?`, `AT+CFUN?`【F:Doc/Modem Command Parse.md†L1006-L1012】【F:Doc/Modem Command Parse.md†L620-L683】【F:Doc/Modem Command Parse.md†L713-L788】

**Uso nel codice**
- Parser impostazioni in `www/js/parse-settings.js` (label e normalizzazione)【F:www/js/parse-settings.js†L1-L120】
- Menu configurazioni e reset radio in `modem_config` (CLI)【F:modem_config†L463-L512】

**Requisito porting Quectel**
- Identificare comando Quectel che restituisce **modalità RAT attiva** e **configurazione preferenze**, mappando ai label in `parse-settings.js`.

---

### 1.3 Stato registrazione, operatore, qualità segnale
**Dati necessari**
- Registrazione rete (CREG), operatore (COPS)
- Qualità segnale (CSQ, RSRP/RSRQ/SINR dove disponibili)

**Comandi T99W175 attuali**
- `AT+CREG?`, `AT+COPS?`, `AT+CSQ`【F:modem_config†L239-L285】
- Dettaglio radio (RSRP/RSRQ/SINR/PCI/ARFCN) con `AT^DEBUG?`【F:Doc/Modem Command Parse.md†L43-L141】

**Uso nel codice**
- Dashboard `index.html` via batch `processAllInfos()` (CGI `get_atcommand`)【F:Doc/Explaination.md†L27-L31】
- Parsing cell info da `AT^DEBUG?` in `modem_config`【F:modem_config†L1138-L1224】

**Requisito porting Quectel**
- Mappare i campi di cella (PCI, EARFCN/NR-ARFCN, banda, BW, RSRP/RSRQ/SINR) ai campi attesi dalla UI. 

---

### 1.4 Temperatura modem
**Dati necessari**
- Temperatura device

**Comandi T99W175 attuali**
- `AT^TEMP?`【F:Doc/Modem Command Parse.md†L157-L184】

**Uso nel codice**
- Dashboard `index.html` (batch `processAllInfos()`)【F:Doc/Explaination.md†L27-L31】

**Requisito porting Quectel**
- Trovare l’equivalente Quectel (spesso `AT+QTEMP?` o simile) e adattare il parser per estrarre valore numerico.

---

### 1.5 APN / PDP context
**Dati necessari**
- APN configurato e tipo PDP

**Comandi T99W175 attuali**
- `AT+CGDCONT?`, `AT+CGDCONT=1,"<type>","<apn>"`【F:Doc/Modem Command Parse.md†L983-L991】

**Uso nel codice**
- `modem_config` (config APN)【F:modem_config†L419-L474】

**Requisito porting Quectel**
- Confermare che il modem Quectel supporti `CGDCONT`; in caso contrario mappare su comando equivalente e aggiornare parser.

---

### 1.6 Informazioni IP PDP e rete
**Dati necessari**
- IP assegnato al PDP, gateway, DNS (se disponibili) e CID attivo

**Comandi T99W175 attuali**
- `AT+CGCONTRDP` dopo `AT+CGPIAF=1,1,1,1`【F:Doc/Modem Command Parse.md†L970-L983】

**Uso nel codice**
- `fetchDeviceInfo()` per Device Info【F:Doc/Explaination.md†L48-L49】

**Requisito porting Quectel**
- Individuare l’output Quectel equivalente (es. `AT+CGCONTRDP` o `AT+QCGCONTRDP`) e rendere omogeneo il parsing.

---

### 1.7 SIM: slot fisico, stato e IMSI
**Dati necessari**
- Slot SIM attivo (0/1)
- IMSI attuale

**Comandi T99W175 attuali**
- `AT^SWITCH_SLOT?`, `AT^SWITCH_SLOT=<mode>`【F:Doc/Modem Command Parse.md†L203-L265】
- `AT+CIMI`【F:modem_config†L225-L239】

**Uso nel codice**
- `modem_config` (SIM switch)【F:modem_config†L1048-L1123】

**Requisito porting Quectel**
- Mappare a comandi Quectel per cambio SIM (se dual-SIM). Se non supportato, nascondere feature nel front-end.

---

### 1.8 Band lock e cell lock
**Dati necessari**
- Lista bande consentite per RAT (LTE, NR NSA, NR SA)
- Lock cella (LTE: PCI+EARFCN; NR SA: band+SCS+ARFCN+PCI)

**Comandi T99W175 attuali**
- `AT^BAND_PREF_EXT?` e `AT^BAND_PREF_EXT=<tech>,<status>,<bands>`【F:Doc/Modem Command Parse.md†L272-L378】
- `AT^LTE_LOCK?`, `AT^LTE_LOCK=<pci,earfcn>`【F:Doc/Modem Command Parse.md†L382-L498】
- `AT^NR5G_LOCK?`, `AT^NR5G_LOCK=<band,scs,arfcn,pci>`【F:Doc/Modem Command Parse.md†L502-L606】

**Uso nel codice**
- `network.html` + JS di locking (`parse-settings.js`, `populate-checkbox.js`)【F:Doc/Explaination.md†L31-L33】【F:www/js/parse-settings.js†L70-L205】
- Reset lock e radio in `www/cgi-bin/factory_reset`【F:www/cgi-bin/factory_reset†L33-L60】

**Requisito porting Quectel**
- Definire per Quectel: comandi per **query bande disponibili**, **set bande**, **query lock cella**, **set lock cella**.
- Aggiornare parsing di `parse-settings.js` per leggere i nuovi formati di risposta.

---

### 1.9 SMS: lettura, invio, storage
**Dati necessari**
- Stato memoria, lista SMS, contenuti, invio e cancellazione

**Comandi T99W175 attuali**
- `AT+CPMS`, `AT+CMGL`, `AT+CMGD`, `AT+CMGS` + settaggi `AT+CSMS`, `AT+CSCS`, `AT+CSMP`, `AT+CNMI`【F:Doc/Modem Command Parse.md†L1031-L1097】

**Uso nel codice**
- `www/js/sms.js` (request, parse e delete)【F:www/js/sms.js†L1-L220】【F:www/js/sms.js†L204-L571】
- `www/cgi-bin/send_sms` (invio diretto su porta seriale)【F:www/cgi-bin/send_sms†L106-L118】

**Requisito porting Quectel**
- Verificare supporto GSM 07.05/07.07 standard (spesso compatibile). Se differenze, adattare parsing SMS e invio (script CGI).

---

### 1.10 Reset, reboot, AT factory
**Dati necessari**
- Comando reboot baseband
- Factory reset AT (se previsto)

**Comandi T99W175 attuali**
- `AT+CFUN=1,1` (reboot), `AT&F` (AT profile reset)【F:www/js/advanced.js†L216-L249】

**Uso nel codice**
- `www/js/advanced.js` (azioni UI)【F:www/js/advanced.js†L216-L249】

**Requisito porting Quectel**
- Stabilire comandi Quectel equivalenti (es. `AT+QPOWD=1` per power down, o `AT+CFUN=1,1` se supportato) e aggiornare i trigger UI.

---

## 2) Punti di integrazione da aggiornare

### 2.1 Backend CGI
- **`www/cgi-bin/get_atcommand`**: invoca `atcli_smd8` e gestisce retry/timeout. Se il modem Quectel usa un diverso binario o device, qui va cambiato il wrapper di esecuzione o aggiunta una selezione per tipo modem.【F:www/cgi-bin/get_atcommand†L48-L92】
- **`www/cgi-bin/user_atcommand`**: stessa logica ma output “pulito”; va allineato al nuovo binario AT.
- **`www/cgi-bin/factory_reset`**: resetta band lock, LTE/NR lock e mode; comandi da mappare su Quectel.【F:www/cgi-bin/factory_reset†L33-L60】
- **`www/cgi-bin/send_sms`**: usa un path dispositivo e sequenza AT per SMS; verificare il device path e compatibilità AT del modem Quectel.【F:www/cgi-bin/send_sms†L106-L118】

### 2.2 Front-end JS
- **`www/js/parse-settings.js`**: parser per band lock, NR lock e modalità RAT. Modificare regex/pattern per formati Quectel.【F:www/js/parse-settings.js†L70-L205】
- **`www/js/sms.js`**: AT standard per CPMS/CMGL/CMGD; verificare compatibilità o adattare parsing.【F:www/js/sms.js†L108-L220】
- **`www/js/advanced.js`**: comandi di reboot e reset AT profile; sostituire con Quectel equivalenti.【F:www/js/advanced.js†L216-L249】

---

## 3) Esempi di modifiche (JS/CGI) per inserire nuova logica AT Quectel

> Gli esempi sotto **mostrano i punti da toccare** e la struttura; i comandi Quectel sono esempi indicativi e vanno verificati sul datasheet.

### 3.1 Esempio: `get_atcommand` con wrapper Quectel
**File:** `www/cgi-bin/get_atcommand`

```bash
# esempio di sostituzione, da adattare
# runcmd="$(atcli_smd8 "$decoded_atcmd" 2>&1)"

if command -v atcli_quectel >/dev/null 2>&1; then
  runcmd="$(atcli_quectel "$decoded_atcmd" 2>&1)"
else
  runcmd="$(atcli_smd8 "$decoded_atcmd" 2>&1)"
fi
```

Questo permette una prima fase di porting con fallback. Va deciso **il binario reale** o l’interfaccia seriale del modem Quectel.【F:www/cgi-bin/get_atcommand†L72-L92】

---

### 3.2 Esempio: sostituzione comandi reboot in `advanced.js`
**File:** `www/js/advanced.js`

```js
// prima (T99W175)
this.atcmd = "AT+CFUN=1,1";

// esempio Quectel (verificare):
this.atcmd = "AT+QPOWD=1";
```

La UI rimane identica, cambia solo il comando inviato dal front-end.【F:www/js/advanced.js†L216-L235】

---

### 3.3 Esempio: parser cella in `parse-settings.js`
**File:** `www/js/parse-settings.js`

Per il T99W175 la funzione `parseLteLocks()` assume output `(...,...)` o lista separata da virgole. Se Quectel restituisce un formato diverso (es. `+QENG: "LTE",...`), serve aggiornare le regex.

```js
// esempio di parsing alternativo (pseudocodice)
if (line.startsWith('+QENG: "LTE"')) {
  const fields = line.split(',');
  const pci = Number.parseInt(fields[4], 10);
  const earfcn = Number.parseInt(fields[8], 10);
  // mapping verso { pci, earfcn }
}
```

**Obiettivo:** mantenere la struttura normalizzata `{ pci, earfcn }` usata dal resto della UI.【F:www/js/parse-settings.js†L70-L165】

---

### 3.4 Esempio: banda e RAT mode
**File:** `www/js/parse-settings.js`

Se Quectel usa `AT+QNWPREFCFG`/`AT+QCFG` per preferenze RAT, il parsing deve produrre gli stessi label `PREF_NETWORK_LABELS` e `NR5G_MODE_LABELS`.

```js
// pseudo-estrazione e mapping
const pref = mapQuectelToPrefNetworkValue(qcfgValue);
const prefLabel = describePrefNetworkValue(pref);
```

La UI si aspetta **numeri/label standardizzati**, non il raw string Quectel.【F:www/js/parse-settings.js†L6-L60】

---

### 3.5 Esempio: SMS e storage
**File:** `www/js/sms.js` + `www/cgi-bin/send_sms`

Se il modem Quectel accetta la stessa sequenza GSM 07.05, lo script `send_sms` può rimanere uguale. Se invece richiede un prompt diverso o echo differente, va adattato il flusso di `AT+CMGS` e il parser in `sms.js`.

```bash
# esempio: cambio device seriale per Quectel
# device="/dev/smd8"
# device="/dev/ttyUSB2"
```

**Obiettivo:** non cambiare il contratto dati del front-end (sempre UCS-2, stessa UI), ma modificare la parte di trasporto AT.【F:www/cgi-bin/send_sms†L106-L118】

---

## 4) Checklist dati per un porting completo

1. **Comandi AT equivalenti** per:
   - Identità modem (CGMI/CGMM/CGSN/IMEI/FW)
   - Stato SIM/ICCID/IMSI
   - Stato rete (CREG/COPS)
   - Stato RAT + 5G (NSA/SA)
   - Dettaglio cella (PCI/ARFCN/RSRP/RSRQ/SINR)
   - Band lock e cell lock
   - Temperatura
   - PDP/APN e IP assegnato
   - SMS (storage, read, send, delete)
   - Reboot/reset

2. **Formato risposta** per ogni comando (linee, prefissi e campi) da documentare.
3. **Aggiornamento parser JS** (`parse-settings.js`, `sms.js`) per match del formato Quectel.
4. **Aggiornamento CGI** per invocare la shell/binary corretta e device seriale Quectel.
5. **Test end-to-end** sulle pagine principali (Home, Network, Settings, SMS, Device Info).【F:Doc/Explaination.md†L27-L49】

---

## 5) Suggerimento di approccio (minimo impatto)

- Introdurre un **adapter di comandi** (file JSON o JS) con mapping `feature -> AT command`, così la UI non deve essere riscritta.
- Aggiornare `get_atcommand` per selezionare l’helper AT in base a una variabile `MODEM_TYPE` (es. `T99` vs `QUECTEL`).
- Aggiornare solo i parser dove i formati di risposta cambiano.

Questo consente di iniziare rapidamente il porting Quectel, isolando le differenze AT senza stravolgere la UI.

