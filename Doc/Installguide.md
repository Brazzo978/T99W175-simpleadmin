# RM502Q-AE (FW203) – Guida completa step-by-step (da modem pulito a setup completo)

Questa guida descrive i passaggi **step-by-step** per portare un **RM502Q-AE** da stato "pulito" (con firmware corretto) a una configurazione completa con:

* **ADB abilitato**
* **toolkit RGMII (iamromulan)**
* **SimpleAdmin + SSH**
* **GUI custom** (cartella `Payload/` dal repository GitHub)
* **binari `atcli` / `atcli_smd11`**
* **servizi base (cron / ttl / ecc.)**

> La cartella **`Payload/`** dentro al repository GitHub viene usata per copiare tutti i file nei path corretti.
> Dopo il deploy dei file, si passa alla guida dedicata **`atcmd -> atcli`** per completare lo switch funzionale.

---

## Panoramica del flusso

1. Flash firmware corretto (**FW 203**)
2. Sblocco ADB (`AT+QADBKEY`)
3. Abilitazione ADB via `AT+QCFG="usbcfg"`
4. Caricamento `wget` su `/usr/bin`
5. Download/esecuzione toolkit iamromulan
6. Installazione **SimpleAdmin** + **SSH server**
7. Verifica connettività dati (SIM/APN/ping)
8. Deploy file custom dal repository (**cartella `Payload/`**) via ADB
9. Verifica GUI base (`lighttpd`, `192.168.225.1`)
10. **Seguire guida `atcmd -> atcli`** (obbligatoria per completare lo switch)

---

## Prerequisiti

* Modem **RM502Q-AE con ALMENO il firmware RM502QAEAAR13A04M4G_01.201.01.201, RM502QAEAAR13A04M4G_01.203.01.203 consigliato **
* Accesso AT commands
* PC con `adb` installato
* Download repository GitHub con cartella `Payload/`
* SIM dati disponibile


---

## Step 1 – Flash firmware 203

Flashare il Modem alla  **R13**.

---

## Step 2 – Sblocco ADB con `AT+QADBKEY`

### 2.1 Leggi la challenge

```txt
AT+QADBKEY?
+QADBKEY: 12345678
OK
```

### 2.2 Calcola la chiave ADB

Usa il tool:

* `https://onecompiler.com/python/3znepjcsq`

### 2.3 Invia la chiave calcolata

```txt
AT+QADBKEY="0jXKXQwSwMxYoeg"
```

> L’esempio sopra usa una chiave calcolata sulla challenge mostrata. Nel tuo caso la chiave dipende dalla challenge letta dal modem.

---

## Step 3 – Abilita ADB via `AT+QCFG="usbcfg"`

### 3.1 Leggi la configurazione attuale

```txt
AT+QCFG="usbcfg"
+QCFG: "usbcfg",0x2C7C,0x0801,1,1,1,1,1,0,0
```

### 3.2 Abilita ADB

```txt
AT+QCFG="usbcfg",0x2C7C,0x0801,1,1,1,1,1,1,0
```

✅ A questo punto **ADB è presente** .

---

## Step 4 – Carica `wget` in `/usr/bin`

Sul FW 203, `wget` va caricato manualmente per poter scaricare e lanciare il toolkit su quelli precedenti era presente non so cosa sia successo in quectel.
Lo potete prendere dalla cartella payload.

### 4.1 Copia `wget`

```bash
adb push wget /usr/bin/wget
```

### 4.2 Permessi

```bash
adb shell "chmod 755 /usr/bin/wget"
```

> Anche `777` funziona, ma **755** è consigliato.

---

## Step 5 – Esegui il toolkit RGMII di iamromulan

Da shell ADB:

```bash
adb shell "cd /tmp && wget -O RMxxx_rgmii_toolkit.sh https://raw.githubusercontent.com/iamromulan/quectel-rgmii-toolkit/SDXLEMUR/RMxxx_rgmii_toolkit.sh && chmod +x RMxxx_rgmii_toolkit.sh && ./RMxxx_rgmii_toolkit.sh && cd /"
```

---

## Step 6 – Installa SimpleAdmin e SSH server (dal toolkit)

Dal toolkit di iamromulan:

* installa **SimpleAdmin**
* installa **SSH server**

> Per questa fase serve connettività dati funzionante sul modem.

---

## Step 7 – Verifica connettività (SIM/APN/ping)

### 7.1 Inserisci SIM

Inserisci una SIM attiva.

### 7.2 Test ping da ADB

Esegui un ping dalla shell ADB.

### 7.3 Se il ping non va, imposta APN

```txt
AT+CGDCONT=1,"IPV4V6","apn-here-inside-of-quotes"
```

### 7.4 Riavvia stack radio

```txt
AT+CFUN=1
```

✅ Dopo questo il ping dovrebbe funzionare e puoi usare il toolkit/installazioni online.

---

## Step 8 – Deploy file custom dal repository GitHub (`Payload/`)

A questo punto si passa alla tua GUI e ai file custom.

### 8.1 Scarica/clona il repository GitHub

Assicurati di avere sul PC la cartella `Payload/` con i file del progetto (binari, unit systemd, init script, udev, config, `www` opzionale).

### 8.2 Struttura  di `Payload/`

```text
Payload/
├─ bin/
│  ├─ wget
│  ├─ atcli
│  └─ atcli_smd11
├─ etc-init.d/
│  └─ crontab
├─ systemd/
│  ├─ crontab.service
│  └─ ttl-override.service
├─ udev/
│  └─ 99-smd-perms.rules
└─ simpleadmin/
   ├─ lighttpd.conf
   └─ www/              
```

### 8.3 Entra nella cartella `Payload` (Windows CMD)

```bat
cd C:\Users\Manu\Desktop\Payload
```

### 8.4 Remount root in RW (se necessario)

```bash
adb shell "mount -o remount,rw /"
```

### 8.5 Deploy file (push + permessi + servizi)

Usa la lista comandi **comandi.txt**  presente nella cartella payload per:

* pushare i file nei path corretti
* impostare permessi/owner
* avviare `crontab`
* creare symlink servizi al boot
* riavviare `lighttpd`


### 8.6 Note specifiche importanti (tua procedura)

* `atcli` e `atcli_smd11` vanno in:

  * `/usr/bin/atcli`
  * `/usr/bin/atcli_smd11`
* Permessi consigliati:

  * `chmod 755`
* La web root di SimpleAdmin va backupata:

  * `mv /usrdata/simpleadmin/www /usrdata/simpleadmin/www.old`
* La nuova `www` va caricata in:

  * `/usrdata/simpleadmin/`
* In fase test/bootstrap hai usato:

  * `chmod -R 777 /usrdata/simpleadmin/www`

---

## Step 9 – Verifica GUI base (dopo deploy)

Riavvia `lighttpd` e verifica GUI base.

```bash
adb shell "systemctl restart lighttpd.service"
adb shell "systemctl status lighttpd.service --no-pager | sed -n '1,20p'"
```

Apri dal browser:

* `http://192.168.225.1`

✅ Se `lighttpd` è `active (running)` e la GUI si apre, il deploy base è OK.

---

## Step 10 – Guida `atcmd -> atcli` (obbligatoria per setup completo)

A questo punto il modem è **preparato**, ma per ottenere il progetto funzionante al 100% devi ancora seguire la guida dedicata:

* **`atcmd -> atcli`**[`atcmd_to_atcli.md`](atcmd_to_atcli.md)

### In questa guida devi fare (parte di switch)

* Disabilitare bridge `socat` / `atcmd` (smd7 / smd11)
* Verificare che i bridge siano `inactive` e/o disabilitati
* Applicare/verificare i permessi persistenti su `/dev/smd*` (udev)
* Aggiungere `www-data` al gruppo `radio`
* Testare:

  * `atcli ATI`
  * `atcli_smd11 ATI`

> **Importante:** segui la parte di **migrazione a `atcli`**. Non eseguire i passaggi di rollback/ritorno a SimpleAdmin bridge se non ti servono.

---

## Risultato finale atteso

Al termine di tutti gli step:

* ✅ ADB attivo
* ✅ Toolkit iamromulan usabile
* ✅ SimpleAdmin + SSH installati
* ✅ GUI custom caricata
* ✅ `lighttpd` funzionante su `192.168.225.1`
* ✅ `atcli` / `atcli_smd11` operativi
* ✅ servizi base (`crontab`, ecc.) attivi

---

## Troubleshooting rapido

### ADB non compare dopo `QCFG`

* Ricontrolla `AT+QADBKEY?` / chiave calcolata
* Ricontrolla `AT+QCFG="usbcfg"`
* Ricollega USB / riapri ADB

### `wget` non funziona sul modem

* Verifica path `/usr/bin/wget`
* Verifica permessi `755`
* Verifica binario compatibile con firmware/architettura

### Toolkit non scarica / non installa

* Verifica SIM/APN
* Fai ping da ADB
* Reimposta APN (`AT+CGDCONT`) + `AT+CFUN=1`

### GUI non si apre su `192.168.225.1`

* Verifica `systemctl status lighttpd.service`
* Verifica che la `www` sia stata caricata correttamente
* Verifica permessi sulla `www`

### `atcli` non funziona anche se i binari ci sono

* Completa la guida **`atcmd -> atcli`** (bridge socat / udev / gruppo `radio` / test)

---

## Note finali

La cartella `Payload/` serve a rendere il deploy semi automatico , sono presenti nella doc guide su come fare tutto manualmente.

Il passaggio a `atcli` resta una fase separata e intenzionale: prima si prepara l’ambiente (deploy), poi si completa lo switch funzionale con la guida dedicata.
