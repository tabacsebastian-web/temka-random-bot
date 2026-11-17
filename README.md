# 🎁 Temka Random Bot (@TemkaDrawBot)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

An open-source, secure, and provably fair Telegram giveaway bot for channels and groups (**English** primary, **Russian** second language), powered by **Cloudflare Workers & D1** and **SHA-256 / HMAC-SHA256** winner selection.

- 🤖 **Live Bot:** [@TemkaDrawBot](https://t.me/TemkaDrawBot)
- 🌐 **Status & 1-Click SHA-256 Verifier:** [https://temka-random-bot.tabac-sebastian.workers.dev](https://temka-random-bot.tabac-sebastian.workers.dev)

---

## 🛡️ Key Features

1. **Provably Fair (Cryptographically Verifiable):**
   - A 256-bit `server_seed` is generated per contest and its `SHA-256(server_seed)` hash is published upfront before anyone joins.
   - Winner ranking uses deterministic HMAC-SHA256 with rejection sampling (including weighted referral tickets and provably fair backup/reroll order).
   - Finished posts include a **1-click verification link** (`/?seed=<seed>#verify`) backed by both browser WebCrypto SHA-256 and `/api/verify`, plus `/verify <seed>` inside Telegram.
2. **Viral Growth & Engagement:**
   - Optional **+1 Extra Ticket per Invited Friend** (`start=ref_<id>_<user>`), automatically deducting extra tickets if a referred friend leaves.
   - Optional **banner photos** (`sendPhoto` with caption fitting), bilingual post language selector (`EN` / `RU`), and live DM ticket tracking.
3. **Anti-Bot & Double Subscription Protection:**
   - Required channel subscriptions are checked on join and re-verified right before picking winners.
   - Optional per-contest filters: stateless HMAC **Math CAPTCHA**, require public `@username`, and **Telegram Premium Only**.
4. **Effortless Admin Dashboard (`/my` & 1-Tap Setup):**
   - **1-tap `Add Bot to Channel`** (`startchannel`) with automatic `my_chat_member` promotion detection.
   - Quick winner presets (`1`, `3`, `5`, `10`), **auto-draw by date/time or target participant count**, inline **Edit** & **Options** from Preview, plus **Draw Early**, **Reroll**, **Clone Giveaway**, **Cancel**, and **Export CSV**.
5. **Always-On 24/7 Serverless Edge (Cloudflare Workers + D1):**
   - Sub-150ms webhook handling, persistent **Cloudflare D1** database, and a minute-level **Cron Trigger**.

---

## 📁 Project Structure

```text
temka-random-bot/
├── migrations/
│   ├── 0001_init.sql               # Initial D1 schema
│   ├── 0002_last_active.sql        # last_active_at column for 30-day MAU
│   └── 0003_enhanced_features.sql  # Post lang, photo banners, settings JSON, referral tickets
├── public/
│   └── index.html                  # Public status page & 1-click SHA-256 Seed Verifier
├── src/
│   ├── bot-core.js                 # Core bot workflows (grammY, D1 & Node compatible)
│   ├── bot.js                      # Optional Node.js local adapter
│   ├── config.js                   # Environment configuration (DEFAULT_LANG=en)
│   ├── db-d1.js                    # Async Cloudflare D1 database adapter
│   ├── db-helpers.js               # Shared giveaway/settings row normalization helpers
│   ├── db.js                       # Node.js SQLite database adapter + backup hooks
│   ├── fairness.js                 # Provably Fair algorithm (HMAC-SHA256 + weighted tickets)
│   ├── i18n.js                     # English (primary) & Russian translations + HTML escaping
│   ├── index.js                    # Optional Node.js HTTP / webhook server
│   ├── profile.js                  # Syncs Telegram descriptions & commands via Bot API
│   ├── scheduler.js                # Node.js fallback scheduler
│   ├── utils.js                    # HTML escape, CSV export, HMAC CAPTCHA, Telegram link builders
│   └── worker.js                   # Cloudflare Worker entrypoint (webhook, /api/verify, cron)
├── LICENSE                         # MIT License
├── package.json
├── test.js                         # Unit tests (fairness, utils, i18n, SQLite, D1, bot-core)
└── wrangler.jsonc                  # Cloudflare Workers & D1 configuration
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
