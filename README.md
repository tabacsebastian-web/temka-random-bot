# 🎁 Temka Random Bot (@TemkaDrawBot)

Un bot de Telegram securizat, transparent și bilingv (EN / RU) pentru crearea și gestionarea concursurilor și giveaway-urilor în canale și grupuri, inspirat din **Best Random Bot**, dar construit cu accent strict pe **siguranță și corectitudine dovedită (Provably Fair)**.

---

## 🛡️ De ce este 100% sigur (spre deosebire de alte soluții)?

1. **Provably Fair (Criptografic verificabil):**
   - La crearea fiecărui concurs se generează un seed criptografic secret de 256 de biți (`server_seed`).
   - Hesh-ul său public `SHA-256(server_seed)` este afișat în mesajul de concurs **înainte** ca acesta să înceapă.
   - La finalizare, `server_seed`-ul este dezvăluit public. Câștigătorii sunt calculați deterministic prin `HMAC-SHA256(server_seed)`. Oricine poate rula formula și confirma că rezultatul este autentic și nu a fost măsluit.
2. **Re-verificare anti-cheat la extragere:**
   - Când sosește momentul extragerii, botul verifică din nou dacă utilizatorii extrași **sunt încă abonați** la canalele cerute. Dacă cineva a dat unsubscribe după participare, este descalificat pe loc și se alege automat următorul participant eligibil.
3. **Protecție Anti-Spam & Multi-Account:**
   - Unicitate garantată la nivel de bază de date pe `(giveaway_id, user_id)`.
   - Suport pentru rate-limiting și debouncing pentru a preveni erorile 429 de la Telegram când mii de utilizatori apasă butonul simultan.
4. **Bilingv Nativ (Engleză & Rusă):**
   - Detectare automată a limbii utilizatorului + posibilitate de comutare oricând prin `/lang` sau buton dedicat.

---

## 📁 Structura Proiectului

```
temka-random-bot/
├── data/                  # Baza de date SQLite (temka.db)
├── src/
│   ├── bot.js             # Handlere GrammY, comenzi, butoane inline, verificare abonare
│   ├── config.js          # Configurații & citire .env
│   ├── db.js              # Schema bazei de date (utilizatori, concursuri, participanți)
│   ├── fairness.js        # Algoritmul criptografic provably fair (HMAC-SHA256)
│   ├── i18n.js            # Textele și traducerile complete în EN și RU
│   ├── index.js           # Punctul de intrare (pornire bot + runner concurent)
│   └── scheduler.js       # Background timer pentru finalizarea automată a concursurilor
├── .env                   # Token-ul botului și setările de mediu
├── package.json           # Dependențele Node.js
└── test.js                # Teste unitare pentru logică, securitate și DB
```

---

## 🚀 Pornire

Pentru a rula botul:

```bash
cd /Users/sebi/.gemini/antigravity/scratch/temka-random-bot
export PATH="$HOME/.local/bin:$PATH"
npm start
```
