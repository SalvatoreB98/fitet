# FITeT Campionati Dashboard & Schede Ranking Atleti

Applicazione web full-stack, reattiva e mobile-first per la consultazione e il monitoraggio di tutti i campionati FITeT (Nazionali e Regionali), con navigazione integrata verso la **scheda ranking e lo storico punti dei singoli atleti**.

---

## 🚀 Caratteristiche Principali

- **Classifica a Squadre Ufficiale**:
  - Posizioni con badge per Promozione Diretta (1°), Playoff (2°) e Retrocessione.
  - Differenziali di partite, set e punti gioco.
  - **Forma recente** calcolata dinamicamente dalle ultime partite disputate (badge `V`, `P`, `N`).
  - Cliccando su una squadra, filtro istantaneo delle sue partite nel calendario.
- **Calendario & Risultati**:
  - Vista suddivisa per giornate (1^ - 9^ Giornata).
  - Toggle rapido: **Tutte le fasi**, **Solo Andata**, **Solo Ritorno**.
  - Filtro per squadra.
  - Card incontro con evidenziazione grafica del vincitore, stato partita (*Incontro Disputato* con pulsazione o *In programma*) e link al referto ufficiale federale.
- **Statistiche Atleti del Girone**:
  - Tabella completa dei 35 atleti con bandiera nazionalità, squadra, incontri disputati (ID), partite disputate (PD), vinte (PaV), perse (PaP), set (SV/SP), punti (PV/PP) e **% Vittorie** con indicatore visivo.
  - Ricerca istantanea (per cognome, nome o società) e filtro per squadra.
  - Ordinamento cliccabile su tutte le colonne (es. % Vittorie, Partite Vinte, ecc.).
  - Cliccando sull'atleta: apertura immediata della **Scheda Profilo e Ranking Atleta**.
- **Scheda Dettaglio Atleta (Modal Interattiva)**:
  - Foto ufficiale del giocatore con fallback avatar, nazionalità, data di nascita, società, categoria (es. `6^ (*)`) e stato (`Fuori Quadro` o posizione ranking).
  - Statistiche stagionali riassuntive: partite giocate, vinte, perse e % successo con progress bar.
  - Card punti ranking attuali (`166.00 pt`) con punti iniziali e data di partenza.
  - **Grafico interattivo SVG dell'andamento punti nel tempo**: curva con gradiente e tooltip interattivi su ciascuna data di classifica.
  - Tabella cronologica dello storico delle rilevazioni.

---

## 🛠️ Architettura e Tecnologie

- **Backend**: Node.js, Express, TypeScript, Cheerio.
- **Scraping & Decoding**:
  - `responseType: 'arraybuffer'` con decodifica `TextDecoder('iso-8859-1')` per la corretta gestione dei caratteri accentati nei cognomi e nelle società.
  - Header HTTP specializzati (`X-Requested-With: XMLHttpRequest`, `Referer`) per interrogare gli script federale protetti come `dettaglioatleta_unica.php`.
- **Frontend**: React 18, Vite 6, TypeScript, Bootstrap 5, Bootstrap Icons.
- **Design & UX**: Glassmorphism con backdrop blur, tema scuro ad alto contrasto di default con toggle tema chiaro, design responsive mobile-first.

---

## 📡 Endpoint FITeT e Parser

| Sezione | Endpoint FITeT Ufficiale | Parser Backend |
| :--- | :--- | :--- |
| **Classifica** | `https://portale.fitet.org/risultati/campionati/classifica_squadre.php?CAM=1902` | [`server/parsers/classificaParser.ts`](file:///d:/Coding/FITET/CAMPIONATO/server/parsers/classificaParser.ts) |
| **Calendario** | `https://portale.fitet.org/risultati/campionati/Calendario.asp?CAM=1902&ANNO=41` | [`server/parsers/calendarioParser.ts`](file:///d:/Coding/FITET/CAMPIONATO/server/parsers/calendarioParser.ts) |
| **Statistiche** | `https://portale.fitet.org/risultati/campionati/statistiche_atleti.php?CAM=1902` | [`server/parsers/statisticheParser.ts`](file:///d:/Coding/FITET/CAMPIONATO/server/parsers/statisticheParser.ts) |
| **Scheda Atleta** | `https://portale.fitet.org/risultati/new_rank/dettaglioatleta_unica.php?ATLETA={ID}&ID_CLASS=248&ZU=1&AVVERSARIO=0` | [`server/parsers/atletaParser.ts`](file:///d:/Coding/FITET/CAMPIONATO/server/parsers/atletaParser.ts) |
| **Autocomplete** | `https://portale.fitet.org/risultati/new_rank/ajax.php?term={QUERY}` | [`server/services/athleteResolver.ts`](file:///d:/Coding/FITET/CAMPIONATO/server/services/athleteResolver.ts) |

---

## 💾 Caching Strategy

La cache memorizza i dati estratti sia in memoria che su disco (`server/cache/`):
- **Classifica**: TTL 30 minuti.
- **Calendario**: TTL 30 minuti.
- **Statistiche Atleti**: TTL 60 minuti.
- **Scheda Ranking Atleta**: TTL 24 ore.
- **Pulsante "Ricarica Dati"**: bypassa la cache inviando `?refresh=true` ed esegue un refresh completo istantaneo.

---

## 💻 Come Avviare il Progetto

### 1. Installazione Dipendenze
```bash
npm install
```

### 2. Avvio in Sviluppo (Client + Server)
Avvia contemporaneamente il server API (porta 3001) e Vite (porta 5173):
```bash
npm run dev
```
Accedi su: [http://localhost:5173](http://localhost:5173)

### 3. Avvio in Produzione
```bash
npm run build
npm start
```
Accedi su: [http://localhost:3001](http://localhost:3001)

---

## Web Push Notifications (PWA)

Le notifiche push funzionano su **Android** (Chrome, Edge, Samsung Internet, Firefox) anche senza installare la PWA, e su **iOS 16.4+** solo se l'app è stata aggiunta alla schermata Home. Su iOS 15 e precedenti Web Push non è supportato.

### 1. Configurazione Supabase

Esegui lo script [`supabase/push_notifications.sql`](supabase/push_notifications.sql) nell'SQL Editor di Supabase. Crea:

- `push_subscriptions`: una riga per ogni dispositivo iscritto;
- `push_state`: stato persistente del trigger sull'`ID_CLASS` delle classifiche.

Le tabelle hanno RLS attivo e nessuna policy pubblica: il backend usa la `SUPABASE_SERVICE_ROLE_KEY`.

### 2. Chiavi VAPID

Genera una coppia di chiavi (una sola volta per progetto):

```bash
npx web-push generate-vapid-keys
```

Aggiungi su Vercel (e nel `.env` locale) le variabili:

```env
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:tua-email@dominio.it
CRON_SECRET=una-stringa-casuale-lunga
```

### 3. Trigger automatico cambio classifica

Il backend confronta l'`ID_CLASS` rilevato da `portale.fitet.org/menu.php` con l'ultimo valore salvato in `push_state`:

- primo avvio: salva il baseline senza notificare;
- `ID_CLASS` aumentato: invia la push a tutti i dispositivi e aggiorna lo stato.

Il controllo avviene automaticamente quando la cache dell'`ID_CLASS` scade (ogni 4 ore) e tramite l'endpoint protetto:

```text
GET /api/push/check-ranking
Authorization: Bearer <CRON_SECRET>
```

Su Vercel è configurato un cron giornaliero in `vercel.json`. Per controlli più frequenti puoi usare un cron esterno (es. cron-job.org o GitHub Actions) che chiami lo stesso endpoint con il token.

### 4. Endpoint Web Push

| Metodo | Endpoint | Descrizione |
| :--- | :--- | :--- |
| `GET` | `/api/push/public-key` | Restituisce la chiave pubblica VAPID al frontend |
| `POST` | `/api/push/subscribe` | Salva la subscription e invia la push di benvenuto |
| `DELETE` | `/api/push/subscribe` | Rimuove la subscription (disattivazione) |
| `GET` | `/api/push/check-ranking` | Forza il controllo dell'`ID_CLASS` e notifica se cambiato |
