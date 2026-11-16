# 🎁 Temka Random Bot (@TemkaDrawBot)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Un bot de Telegram open-source, securizat, rapid și multilingv (**EN / RU / RO**) pentru organizarea concursurilor și giveaway-urilor în canale și grupuri Telegram, construit pe **Cloudflare Workers & D1** și algoritm **Provably Fair (SHA-256 + HMAC-SHA256)**.

- 🤖 **Bot Live:** [@TemkaDrawBot](https://t.me/TemkaDrawBot)
- 🌐 **Status & Verificator Online SHA-256:** [https://temka-random-bot.tabac-sebastian.workers.dev](https://temka-random-bot.tabac-sebastian.workers.dev)

---

## 🛡️ De ce are încredere comunitatea în Temka Random

1. **Provably Fair (Criptografic verificabil):**
   - La crearea concursului se generează un seed secret de 256 de biți (`server_seed`) și se publică `SHA-256(server_seed)` înainte de start.
   - La finalizare, `server_seed` este dezvăluit public — oricine poate verifica autenticitatea folosind comanda `/verify <seed>` în bot sau direct în browser pe [pagina web](https://temka-random-bot.tabac-sebastian.workers.dev/#verify).
2. **Verificare dublă anti-cheat:**
   - Botul verifică abonarea la toate canalele obligatorii atât la apăsarea butonului de participare, cât și în momentul extragerii câștigătorilor (dezabonații sunt descalificați automat).
3. **24/7 pe Cloudflare Workers + D1:**
   - Webhook instant cu răspuns sub ~150 ms, bază de date persistentă **Cloudflare D1** și **Cron Trigger** nativ din minut în minut pentru finalizarea automată a concursurilor.
4. **Multilingv nativ (English / Русский / Română):**
   - Detectare automată a limbii utilizatorului + comutare rapidă prin `/lang`.

---

## 📁 Structura Proiectului

```text
temka-random-bot/
├── migrations/
│   ├── 0001_init.sql         # Schema inițială Cloudflare D1
│   └── 0002_last_active.sql  # Coloană last_active_at pentru MAU (utilizatori activi lunar)
├── public/
│   └── index.html            # Pagina web de status + Verificator interactiv SHA-256
├── src/
│   ├── bot-core.js           # Logica completă a botului (grammY, compatibilă D1 & Node)
│   ├── bot.js                # Adaptor Node.js pentru rulare locală
│   ├── config.js             # Configurații & variabile de mediu
│   ├── db-d1.js              # Adaptor async pentru Cloudflare D1
│   ├── db.js                 # Adaptor SQLite pentru Node.js + backup hooks
│   ├── fairness.js           # Algoritm Provably Fair (HMAC-SHA256 + rejection sampling)
│   ├── i18n.js               # Traduceri complete EN / RU / RO
│   ├── index.js              # Server HTTP / webhook opțional pentru Node.js
│   ├── profile.js            # Sincronizare descrieri, About și comenzi pe Telegram API
│   ├── scheduler.js          # Scheduler Node.js
│   └── worker.js             # Entrypoint Cloudflare Worker (fetch + cron scheduled)
├── LICENSE                   # Licență MIT
├── package.json
├── test.js                   # Teste unitare (fairness, i18n, SQLite, D1, profil)
└── wrangler.jsonc            # Configurare Cloudflare Workers & D1
```

---

## 🚀 Dezvoltare locală & Deploy pe Cloudflare

```bash
npm test                                    # Rulează testele unitare
npx wrangler d1 migrations apply temka-random-db --local
npm run dev:cf                              # Pornește local Cloudflare Worker + D1
npm run deploy:cf                           # Deploy pe Cloudflare Workers & Pages
```

După deploy, un request `POST /setup` semnat cu header-ul `X-Telegram-Bot-Api-Secret-Token` înregistrează webhook-ul și sincronizează automat profilul multilingv (`setMyShortDescription`, `setMyDescription`, `setMyCommands`).

---

## 📄 Licență

Publicat sub [Licența MIT](LICENSE). Poți folosi, audita și extinde proiectul liber.
