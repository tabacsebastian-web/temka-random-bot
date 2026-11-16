# 🎁 Temka Random Bot (@TemkaDrawBot)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

An open-source, secure, and provably fair Telegram giveaway bot for channels and groups (**English** primary, **Russian** second language), powered by **Cloudflare Workers & D1** and **SHA-256 / HMAC-SHA256** winner selection.

- 🤖 **Live Bot:** [@TemkaDrawBot](https://t.me/TemkaDrawBot)
- 🌐 **Status & Online SHA-256 Verifier:** [https://temka-random-bot.tabac-sebastian.workers.dev](https://temka-random-bot.tabac-sebastian.workers.dev)

---

## 🛡️ Why Channel Admins Trust Temka Random

1. **Provably Fair (Cryptographically Verifiable):**
   - A 256-bit secret `server_seed` is generated when creating a giveaway, and its `SHA-256(server_seed)` hash is published upfront before anyone joins.
   - When the draw finishes, `server_seed` is revealed publicly — anyone can verify fairness using `/verify <seed>` in Telegram or in the browser via the [online verifier](https://temka-random-bot.tabac-sebastian.workers.dev/#verify).
2. **Double Anti-Cheat Subscription Check:**
   - Required channel subscriptions are checked both when a user clicks Participate and again at draw time (unsubscribed finalists are automatically skipped and replaced).
3. **Always-On 24/7 Serverless Edge (Cloudflare Workers + D1):**
   - Sub-150ms webhook handling, persistent **Cloudflare D1** database, and a minute-level **Cron Trigger** so draws never depend on a local machine and never miss a deadline.
4. **Bilingual Interface (English Primary + Russian):**
   - English by default across profiles, channel posts, commands, and onboarding, with Russian (`RU`) available as a second language via `/lang`.

---

## 📁 Project Structure

```text
temka-random-bot/
├── migrations/
│   ├── 0001_init.sql         # Initial Cloudflare D1 schema (default lang = 'en')
│   └── 0002_last_active.sql  # last_active_at column for 30-day active users (MAU)
├── public/
│   └── index.html            # Public status page & browser SHA-256 Seed Verifier
├── src/
│   ├── bot-core.js           # Core bot workflows (grammY, compatible with D1 & Node)
│   ├── bot.js                # Optional Node.js local adapter
│   ├── config.js             # Environment configuration (DEFAULT_LANG=en)
│   ├── db-d1.js              # Async Cloudflare D1 database adapter
│   ├── db.js                 # Node.js SQLite database adapter + backup hooks
│   ├── fairness.js           # Provably Fair algorithm (HMAC-SHA256 + rejection sampling)
│   ├── i18n.js               # English (primary) & Russian translations
│   ├── index.js              # Optional Node.js HTTP / webhook server
│   ├── profile.js            # Syncs Telegram descriptions & commands via Bot API
│   ├── scheduler.js          # Node.js fallback scheduler
│   └── worker.js             # Cloudflare Worker entrypoint (fetch + cron scheduled)
├── LICENSE                   # MIT License
├── package.json
├── test.js                   # Unit tests (fairness, i18n, SQLite, D1, profile)
└── wrangler.jsonc            # Cloudflare Workers & D1 configuration
```

---

## 🚀 Local Development & Cloudflare Deployment

```bash
npm test                                    # Run unit tests
npx wrangler d1 migrations apply temka-random-db --local
npm run dev:cf                              # Run Cloudflare Worker + D1 locally
npm run deploy:cf                           # Deploy to Cloudflare Workers
```

After deploying, send a signed `POST /setup` request with header `X-Telegram-Bot-Api-Secret-Token` to register the Telegram webhook and sync bot profile descriptions and commands (`default`/EN and `ru`).

---

## 📄 License

Released under the [MIT License](LICENSE).
