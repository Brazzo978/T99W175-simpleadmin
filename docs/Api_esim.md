eSIM LPA Server - REST API Documentation
Avvio del Server
Modalità Interattiva (default)
./euicc-client -config client.yaml
Modalità Server
# Server normale
./euicc-client -server -port 8080

# Server in modalità daemon
./euicc-client -server -port 8080 -daemon

# Con debug logging
./euicc-client -server -port 8080 -debug
Endpoints API
Base URL: http://localhost:8080/api/v1

Profile Endpoints
1. Read EID
Legge l'EID della SIM.

Endpoint: GET /api/v1/eid

Response:

{
  "success": true,
  "data": {
    "eid": "89049032004008882600003196489175"
  }
}
2. List Profiles
Elenca tutti i profili presenti sulla eSIM.

Endpoint: GET /api/v1/profiles

Response:

{
  "success": true,
  "data": {
    "count": 2,
    "profiles": [
      {
        "iccid": "8939107900010489479",
        "profile_name": "Vodafone IT",
        "profile_nickname": "Personal",
        "service_provider_name": "Vodafone",
        "profile_state": 1,
        "profile_class": 2,
        "enabled": true
      },
      {
        "iccid": "8939107900010489480",
        "profile_name": "TIM IT",
        "profile_nickname": "",
        "service_provider_name": "TIM",
        "profile_state": 0,
        "profile_class": 2,
        "enabled": false
      }
    ]
  }
}
3. Enable Profile
Abilita un profilo specifico.

Endpoint: POST /api/v1/profile/enable

Request Body:

{
  "iccid": "8939107900010489479"
}
Response:

{
  "success": true,
  "message": "Profile enabled successfully",
  "data": {
    "iccid": "8939107900010489479"
  }
}
4. Disable Profile
Disabilita un profilo specifico.

Endpoint: POST /api/v1/profile/disable

Request Body:

{
  "iccid": "8939107900010489479"
}
Response:

{
  "success": true,
  "message": "Profile disabled successfully",
  "data": {
    "iccid": "8939107900010489479"
  }
}
5. Delete Profile
Elimina un profilo. Attenzione: questa operazione è irreversibile!

Endpoint: DELETE /api/v1/profile/delete o POST /api/v1/profile/delete

Request Body:

{
  "iccid": "8939107900010489479"
}
Response:

{
  "success": true,
  "message": "Profile deleted successfully",
  "data": {
    "iccid": "8939107900010489479"
  }
}
6. Set Nickname
Imposta o rimuove il nickname di un profilo.

Endpoint: POST /api/v1/profile/nickname o PUT /api/v1/profile/nickname

Request Body:

{
  "iccid": "8939107900010489479",
  "nickname": "My Work SIM"
}
Per rimuovere il nickname, inviare una stringa vuota:

{
  "iccid": "8939107900010489479",
  "nickname": ""
}
Response:

{
  "success": true,
  "message": "Nickname set successfully",
  "data": {
    "iccid": "8939107900010489479",
    "nickname": "My Work SIM"
  }
}
Download Endpoint
Download Profile
Scarica e installa un nuovo profilo eSIM.

Endpoint: POST /api/v1/download

Request Body:

{
  "smdp": "smdp.io",
  "matching_id": "QR-G-5C-1LS-1W1Z9P7",
  "confirmation_code": "1234",
  "auto_confirm": true
}
Parametri:

smdp (required): Indirizzo del server SMDP (senza https://)
matching_id (required): Matching ID del profilo
confirmation_code (optional): Codice di conferma se richiesto
auto_confirm (optional): Se true, conferma automaticamente il download
Response:

{
  "success": true,
  "message": "Profile downloaded successfully",
  "isdp_aid": "A0000005591010FFFFFFFF8900000100",
  "profile_info": {
    "profile_name": "Vodafone IT",
    "iccid": "8939107900010489479",
    "service_provider_name": "Vodafone"
  },
  "notification": {
    "address": "https://smdp.io/notifications",
    "iccid": "8939107900010489479",
    "operation": 0,
    "sequence_number": 1
  }
}
Notification Endpoints
1. List Notifications
Elenca tutte le notifiche pendenti.

Endpoint: GET /api/v1/notifications

Response:

{
  "success": true,
  "data": {
    "count": 2,
    "notifications": [
      {
        "sequence_number": 1,
        "iccid": "8939107900010489479",
        "operation": 0,
        "operation_name": "Install",
        "address": "https://smdp.io/notifications"
      },
      {
        "sequence_number": 2,
        "iccid": "8939107900010489480",
        "operation": 1,
        "operation_name": "Enable",
        "address": "https://smdp.io/notifications"
      }
    ]
  }
}
Operation Types:

0: Install
1: Enable
2: Disable
3: Delete
2. Process Notifications
Elabora le notifiche per un ICCID specifico.

Endpoint: POST /api/v1/notifications/process

Request Body (processa tutte le notifiche):

{
  "iccid": "8939107900010489479",
  "process_all": true
}
Request Body (processa una notifica specifica):

{
  "iccid": "8939107900010489479",
  "process_all": false,
  "sequence_number": 1
}
Response:

{
  "success": true,
  "processed_count": 2,
  "message": "Processed 2 notification(s)",
  "errors": []
}
Response con errori:

{
  "success": false,
  "processed_count": 1,
  "message": "Processed 1 notification(s)",
  "errors": [
    "Failed to handle notification sequence 2: connection timeout"
  ]
}
3. Remove Notifications
Rimuove le notifiche dalla lista.

Endpoint: DELETE /api/v1/notifications/remove o POST /api/v1/notifications/remove

Request Body (rimuovi tutte):

{
  "remove_all": true
}
Request Body (rimuovi per ICCID):

{
  "iccid": "8939107900010489479"
}
Request Body (rimuovi per sequence number):

{
  "sequence_number": 1
}
Response:

{
  "success": true,
  "removed_count": 2,
  "message": "Removed 2 notification(s)",
  "errors": []
}
Health Check
Endpoint: GET /health

Response:

{
  "success": true,
  "message": "eSIM LPA Server is running"
}
Error Responses
Tutti gli errori seguono questo formato:

{
  "error": "Bad Request",
  "message": "ICCID is required"
}
Status Codes comuni:

200 OK - Richiesta completata con successo
400 Bad Request - Parametri mancanti o non validi
405 Method Not Allowed - Metodo HTTP non supportato
500 Internal Server Error - Errore del server o dell'hardware eSIM
Esempi con curl
List Profiles
curl http://localhost:8080/api/v1/profiles
Enable Profile
curl -X POST http://localhost:8080/api/v1/profile/enable \
  -H "Content-Type: application/json" \
  -d '{"iccid": "8939107900010489479"}'
Download Profile
curl -X POST http://localhost:8080/api/v1/download \
  -H "Content-Type: application/json" \
  -d '{
    "smdp": "smdp.io",
    "matching_id": "QR-G-5C-1LS-1W1Z9P7",
    "auto_confirm": true
  }'
List Notifications
curl http://localhost:8080/api/v1/notifications
Process Notifications
curl -X POST http://localhost:8080/api/v1/notifications/process \
  -H "Content-Type: application/json" \
  -d '{
    "iccid": "8939107900010489479",
    "process_all": true
  }'
Note
Il server supporta CORS per permettere richieste da origini diverse
Tutte le risposte sono in formato JSON
Il parametro -daemon reindirizza l'output su euicc-server.log
Per sicurezza, considera l'uso di un reverse proxy (nginx) con HTTPS in produzione
