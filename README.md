# Briscola & Tressette Online

Gioco di carte italiano multiplayer (Briscola 2/4, Tressette 4) + modalità locale vs CPU.

## Avvio locale

```bash
npm install
npm start
```

Apri http://localhost:3000

## Online (ristorante)

1. Un giocatore: **Online → Crea stanza** (scegli Briscola 2/4 o Tressette).
2. Condivide **codice**, **link** o **QR**.
3. Gli altri: **Online → Entra** con nickname + codice.
4. L’host avvia quando tutti i posti sono pieni.

Funziona su Android, iPhone e PC (browser). Installabile come PWA.

## Deploy

Il server è pronto per hosting HTTPS. Config inclusi:

- `Dockerfile` + `railway.json` → [Railway](https://railway.app)
- `render.yaml` → [Render](https://render.com)
- `Procfile` → Heroku-compatible

Esempio Railway:
1. Crea progetto e collega questa cartella / repo
2. Deploy automatico (`npm start`, porta `PORT`)
3. Condividi l’URL HTTPS con gli amici

In locale (solo rete Wi‑Fi del ristorante):
```bash
npm start
```
Poi apri `http://IP-DEL-PC:3000` dai telefoni (stesso Wi‑Fi). Per Internet serve un deploy cloud o un tunnel (cloudflared / ngrok).

## Struttura

- `public/` — client PWA
- `shared/` — motore regole (server + client)
- `server/` — Express + WebSocket
- `cards/` — immagini carte piacentine
