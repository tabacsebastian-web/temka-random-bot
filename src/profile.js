const PROFILE_TEXTS = {
  '': {
    short_description:
      '🎁 Provably fair Telegram giveaways (SHA-256) with referrals, anti-bot filters & 24/7 draws. Free for channels!',
    description:
      '🎁 Launch transparent, cheat-proof giveaways in your Telegram channels in 30 seconds!\n\n' +
      '✨ Why channel admins choose Temka Random:\n' +
      '• 🔐 Provably Fair (SHA-256 + HMAC) — zero rigging, 1-click web seed verification\n' +
      '• ✅ Anti-Bot & Double Sub Check — optional math CAPTCHA, @username & Premium filters\n' +
      '• 🔗 Viral Growth & Controls — +1 referral tickets, photo banners, CSV export & rerolls\n' +
      '• ⚡ Always On 24/7 — powered by Cloudflare Workers & D1 (EN / RU)\n\n' +
      '👇 Tap START to launch your first giveaway for free!',
    commands: [
      { command: 'start', description: '🎁 Main menu & create a giveaway' },
      { command: 'my', description: '📋 Manage, reroll & export giveaways' },
      { command: 'verify', description: '🔐 Verify any giveaway seed (SHA-256)' },
      { command: 'help', description: '🛡️ How Provably Fair draws work' },
      { command: 'lang', description: '🌐 Switch language (EN / RU)' },
      { command: 'cancel', description: '❌ Cancel current giveaway setup' }
    ]
  },
  ru: {
    short_description:
      '🎁 Честные розыгрыши в Telegram (SHA-256) с рефералами, анти-бот защитой и авто-итогами 24/7!',
    description:
      '🎁 Запускайте честные и защищённые розыгрыши в Telegram-каналах за 30 секунд!\n\n' +
      '✨ Почему админы выбирают Temka Random:\n' +
      '• 🔐 Provably Fair (SHA-256 + HMAC) — без подкрутки, проверка сида в 1 клик\n' +
      '• ✅ Анти-бот и проверка подписки — капча, фильтр @username и Telegram Premium\n' +
      '• 🔗 Рост и удобство — +1 билет за друга, баннеры, экспорт CSV и реролл\n' +
      '• ⚡ Работает 24/7 на Cloudflare Workers & D1 (EN / RU)\n\n' +
      '👇 Нажмите ЗАПУСТИТЬ, чтобы создать первый розыгрыш бесплатно!',
    commands: [
      { command: 'start', description: '🎁 Главное меню и создание розыгрыша' },
      { command: 'my', description: '📋 Управление, реролл и экспорт CSV' },
      { command: 'verify', description: '🔐 Проверить сид розыгрыша (SHA-256)' },
      { command: 'help', description: '🛡️ Как работает честный алгоритм' },
      { command: 'lang', description: '🌐 Сменить язык (EN / RU)' },
      { command: 'cancel', description: '❌ Отменить создание розыгрыша' }
    ]
  }
};

const CLEARED_LOCALES = ['ro'];

async function syncBotProfile(api) {
  const results = [];
  for (const [languageCode, cfg] of Object.entries(PROFILE_TEXTS)) {
    const langOpt = languageCode ? { language_code: languageCode } : {};
    await api.setMyShortDescription(cfg.short_description, langOpt);
    await api.setMyDescription(cfg.description, langOpt);
    await api.setMyCommands(cfg.commands, langOpt);
    results.push(languageCode || 'default');
  }
  for (const lc of CLEARED_LOCALES) {
    await api.setMyShortDescription('', { language_code: lc });
    await api.setMyDescription('', { language_code: lc });
    await api.deleteMyCommands({ language_code: lc });
  }
  return results;
}

module.exports = {
  PROFILE_TEXTS,
  syncBotProfile
};
