const PROFILE_TEXTS = {
  '': {
    short_description:
      '🎁 Provably fair Telegram giveaways (SHA-256) with auto subscription check & 24/7 draws. Free for channels!',
    description:
      '🎁 Launch transparent, cheat-proof giveaways in your Telegram channels in 30 seconds!\n\n' +
      '✨ Why channel admins choose Temka Random:\n' +
      '• 🔐 Provably Fair (SHA-256 + HMAC-SHA256) — zero rigging, anyone can verify the seed\n' +
      '• ✅ Double Subscription Check — verifies membership on join and again at draw time\n' +
      '• ⚡ 24/7 Automatic Draws — powered by Cloudflare Workers & D1, never misses a deadline\n' +
      '• 🌐 Multilingual (EN / RU / RO) + live giveaway stats\n\n' +
      '👇 Tap START to launch your first giveaway for free!',
    commands: [
      { command: 'start', description: '🎁 Main menu & create a giveaway' },
      { command: 'help', description: '🛡️ How Provably Fair draws work' },
      { command: 'verify', description: '🔐 Verify any giveaway seed (SHA-256)' },
      { command: 'lang', description: '🌐 Switch language (EN / RU / RO)' },
      { command: 'cancel', description: '❌ Cancel current giveaway setup' }
    ]
  },
  ru: {
    short_description:
      '🎁 Честные розыгрыши в Telegram (SHA-256) с проверкой подписки и авто-итогами 24/7. Бесплатно!',
    description:
      '🎁 Запускайте честные и защищённые розыгрыши в Telegram-каналах за 30 секунд!\n\n' +
      '✨ Почему админы выбирают Temka Random:\n' +
      '• 🔐 Provably Fair (SHA-256 + HMAC) — без подкрутки, любой может проверить сид\n' +
      '• ✅ Двойная проверка подписки — при участии и повторно в момент розыгрыша\n' +
      '• ⚡ Авто-итоги 24/7 — работает на Cloudflare Workers & D1, без задержек\n' +
      '• 🌐 Русский / English / Română + статистика в реальном времени\n\n' +
      '👇 Нажмите ЗАПУСТИТЬ, чтобы создать первый розыгрыш бесплатно!',
    commands: [
      { command: 'start', description: '🎁 Главное меню и создание розыгрыша' },
      { command: 'help', description: '🛡️ Как работает честный алгоритм' },
      { command: 'verify', description: '🔐 Проверить сид розыгрыша (SHA-256)' },
      { command: 'lang', description: '🌐 Сменить язык (RU / EN / RO)' },
      { command: 'cancel', description: '❌ Отменить создание розыгрыша' }
    ]
  },
  ro: {
    short_description:
      '🎁 Giveaway-uri corecte pe Telegram (SHA-256) cu verificare abonare și extrageri automate 24/7!',
    description:
      '🎁 Lansează concursuri și giveaway-uri transparente în canalele Telegram în 30 de secunde!\n\n' +
      '✨ De ce administratorii aleg Temka Random:\n' +
      '• 🔐 Provably Fair (SHA-256 + HMAC) — imposibil de trucat, verificabil de oricine\n' +
      '• ✅ Verificare dublă a abonării — la înscriere și din nou la extragerea câștigătorilor\n' +
      '• ⚡ Extrageri automate 24/7 — rulează pe Cloudflare Workers & D1, fără pauze\n' +
      '• 🌐 Română / Русский / English + statistici live\n\n' +
      '👇 Apasă START pentru a crea primul tău giveaway gratuit!',
    commands: [
      { command: 'start', description: '🎁 Meniu principal și creare giveaway' },
      { command: 'help', description: '🛡️ Cum funcționează Provably Fair' },
      { command: 'verify', description: '🔐 Verifică un seed (SHA-256)' },
      { command: 'lang', description: '🌐 Schimbă limba (RO / RU / EN)' },
      { command: 'cancel', description: '❌ Anulează configurarea curentă' }
    ]
  }
};

async function syncBotProfile(api) {
  const results = [];
  for (const [languageCode, cfg] of Object.entries(PROFILE_TEXTS)) {
    const langOpt = languageCode ? { language_code: languageCode } : {};
    await api.setMyShortDescription(cfg.short_description, langOpt);
    await api.setMyDescription(cfg.description, langOpt);
    await api.setMyCommands(cfg.commands, langOpt);
    results.push(languageCode || 'default');
  }
  return results;
}

module.exports = {
  PROFILE_TEXTS,
  syncBotProfile
};
