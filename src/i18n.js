const strings = {
  en: {
    welcome: (name) =>
      `👋 Hello, <b>${name}</b>!\n\n` +
      `🎁 Welcome to <b>Temka Random</b> — the secure, transparent, and provably fair giveaway bot for Telegram.\n\n` +
      `Select an action below:`,
    btn_create_giveaway: '➕ Create Giveaway',
    btn_my_giveaways: '📋 My Giveaways',
    btn_language: '🌐 Language / Язык',
    btn_help: 'ℹ️ About & Security',

    help_text:
      `🛡️ <b>Why is Temka Random 100% secure?</b>\n\n` +
      `1. <b>Provably Fair Randomness:</b> Before any giveaway starts, a cryptographic SHA-256 hash of the secret server seed is published. Once finished, the seed is revealed so anyone can verify the exact draw calculations.\n` +
      `2. <b>Double-Check Verification:</b> At draw time, the bot re-verifies if winners are still subscribed. Cheaters who unsubscribe after clicking are disqualified.\n` +
      `3. <b>Anti-Bot:</b> Instant protection against automated multi-accounts and flood attacks.\n\n` +
      `<i>Inspired by Best Random Bot, built with superior security & zero rigging.</i>`,

    choose_lang: '🌐 Please choose your language / Пожалуйста, выберите язык:',
    lang_set: '✅ Language changed to English!',

    // Wizard steps
    wizard_step_prize:
      `🎁 <b>Step 1/5: Prize</b>\n\n` +
      `Send me the title or description of the prize (e.g. <i>Telegram Premium 1 Year</i> or <i>100 USDT</i>):`,
    wizard_step_description:
      `📝 <b>Step 2/5: Additional details</b>\n\n` +
      `Send optional description or additional rules for the contest, or send /skip to leave blank:`,
    wizard_step_winners:
      `👥 <b>Step 3/5: Number of winners</b>\n\n` +
      `How many winners should be chosen? Enter a number between 1 and 100:`,
    wizard_invalid_winners: '⚠️ Please send a valid number between 1 and 100.',
    wizard_step_channels:
      `📢 <b>Step 4/5: Required channels</b>\n\n` +
      `Send the username of the channel (e.g. <code>@mychannel</code>) or forward a message from the channel.\n\n` +
      `⚠️ <b>Important:</b> The bot must be added as an <b>Administrator</b> in that channel with invite & post rights!\n\n` +
      `<i>You can send multiple channels one by one. When done, press "Done adding channels".</i>`,
    btn_done_channels: '✅ Done adding channels',
    channel_added: (title, username) => `✅ Channel <b>${title}</b> (@${username}) added! Add another or click "Done".`,
    channel_error_not_admin: (username) =>
      `❌ Could not verify bot admin rights in @${username}. Make sure @TemkaDrawBot is an administrator in that channel and try again.`,
    need_at_least_one_channel: '⚠️ Please add at least one channel before finishing.',

    wizard_step_duration:
      `⏳ <b>Step 5/5: Contest duration</b>\n\n` +
      `Choose how long this contest will run:`,
    btn_1_hour: '1 Hour',
    btn_6_hours: '6 Hours',
    btn_24_hours: '24 Hours',
    btn_3_days: '3 Days',
    btn_7_days: '7 Days',
    btn_custom_date: '📅 Custom Date & Time',
    wizard_step_custom_date:
      `📅 <b>Exact End Date & Time</b>\n\n` +
      `Send the exact date and time when the contest should end.\n\n` +
      `Format: <code>DD.MM.YYYY HH:MM</code> (e.g. <code>25.11.2026 18:00</code> UTC) or <code>DD.MM HH:MM</code> (e.g. <code>25.11 18:00</code>):`,
    wizard_invalid_date: '⚠️ Invalid date format. Please send in format: <code>DD.MM.YYYY HH:MM</code> (e.g. <code>25.11.2026 18:00</code>)',
    wizard_date_in_past: '⚠️ The end date must be in the future! Please enter a date/time in the future.',

    wizard_preview_title: '👀 <b>Contest Preview</b>\n\nReview your giveaway before publishing:',
    btn_publish_to_channel: '🚀 Publish Giveaway',
    btn_cancel: '❌ Cancel',
    session_expired: '⚠️ Session expired. Please send /start to create a giveaway.',
    cancelled: '❌ Giveaway creation cancelled.',

    // Giveaway Post Content
    giveaway_card: ({ prize, description, winnersCount, channels, endAtFormatted, seedHash }) => {
      let text = `🎁 <b>GIVEAWAY: ${prize}</b>\n\n`;
      if (description) {
        text += `${description}\n\n`;
      }
      text += `🏆 <b>Winners:</b> ${winnersCount}\n`;
      text += `📢 <b>Required Channels:</b>\n`;
      channels.forEach((ch, idx) => {
        const link = ch.invite_link || (ch.username ? `https://t.me/${ch.username}` : '');
        const tag = ch.username ? ` (@${ch.username})` : '';
        if (link) {
          text += `  ${idx + 1}. <a href="${link}">${ch.title}</a>${tag}\n`;
        } else {
          text += `  ${idx + 1}. <b>${ch.title}</b>${tag}\n`;
        }
      });
      text += `\n⏳ <b>Ends:</b> ${endAtFormatted}\n`;
      text += `🔒 <b>Fair Draw Hash (SHA-256):</b>\n<code>${seedHash}</code>\n\n`;
      text += `<i>Press the button below to participate!</i>`;
      return text;
    },

    btn_participate: (count) => `🎁 Participate (${count})`,
    btn_channels_list: '📢 Channels',
    btn_stats: '📊 Stats',

    // Callback responses
    alert_already_participating: '✅ You are already participating in this giveaway! Good luck!',
    alert_left_giveaway: '👋 You have left the giveaway. You are no longer participating.\n\n(Click Participate again if you change your mind!)',
    alert_success_joined: '🎉 Success! You are now entered into the giveaway!\n\n💡 Tip: Open @TemkaDrawBot and press Start so we can notify you in private if you win!',
    alert_must_subscribe: (missingList) =>
      `❌ You are not subscribed to all required channels!\n\nPlease subscribe to:\n${missingList}\nthen press Participate again.`,
    alert_ended: '⏳ This giveaway has already ended!',

    winner_dm_notification: ({ prize, channel, directLink }) =>
      `🎉 <b>Congratulations!</b>\n\n` +
      `You were chosen as a winner for a shoutout in the next post on ${channel}.\n\n` +
      `Please contact the channel administration through direct messages to claim your shoutout:\n` +
      `<a href="${directLink}">${directLink}</a>`,
    btn_claim_shoutout: '💬 Contact Administration (Claim Shoutout)',

    // Finished giveaway card
    giveaway_finished_card: ({ prize, winnersText, serverSeed, seedHash, finishedAtFormatted }) =>
      `🎉 <b>GIVEAWAY FINISHED: ${prize}</b>\n\n` +
      `🏆 <b>Winners:</b>\n${winnersText}\n\n` +
      `📅 <b>Finished:</b> ${finishedAtFormatted}\n` +
      `🔒 <b>Provably Fair Verification:</b>\n` +
      `• Seed: <code>${serverSeed}</code>\n` +
      `• Hash: <code>${seedHash}</code>\n\n` +
      `<i>Winners were selected cryptographically using HMAC-SHA256 and verified for channel membership.</i>`,

    no_participants: '😢 No participants entered this giveaway.',
    my_giveaways_empty: 'You have not created any giveaways yet. Click "Create Giveaway" to start!',
    my_giveaways_title: '📋 <b>Your Giveaways:</b>'
  },

  ru: {
    welcome: (name) =>
      `👋 Привет, <b>${name}</b>!\n\n` +
      `🎁 Добро пожаловать в <b>Temka Random</b> — безопасный, прозрачный и честный бот для проведения розыгрышей в Telegram.\n\n` +
      `Выберите действие в меню ниже:`,
    btn_create_giveaway: '➕ Создать розыгрыш',
    btn_my_giveaways: '📋 Мои розыгрыши',
    btn_language: '🌐 Язык / Language',
    btn_help: 'ℹ️ О боте и безопасности',

    help_text:
      `🛡️ <b>Почему Temka Random на 100% честный и безопасный?</b>\n\n` +
      `1. <b>Provably Fair (Доказуемая честность):</b> До начала конкурса публикуется криптографический SHA-256 хеш сида. После завершения сид раскрывается — любой может перепроверить формулу и убедиться, что победители выбраны случайно и без подкрутки.\n` +
      `2. <b>Двойная проверка подписки:</b> В момент розыгрыша бот повторно проверяет подписку финалистов. Если пользователь отписался после нажатия кнопки, он автоматически дисквалифицируется и приз переходит следующему.\n` +
      `3. <b>Анти-бот защита:</b> Фильтрация накруток, спама и мультиаккаунтов.\n\n` +
      `<i>Дизайн и удобство в стиле Best Random Bot, но с максимальной надёжностью.</i>`,

    choose_lang: '🌐 Пожалуйста, выберите язык / Please choose your language:',
    lang_set: '✅ Язык успешно изменён на Русский!',

    // Wizard steps
    wizard_step_prize:
      `🎁 <b>Шаг 1/5: Приз</b>\n\n` +
      `Отправьте название или описание приза (например, <i>Telegram Premium на 1 год</i> или <i>100 USDT</i>):`,
    wizard_step_description:
      `📝 <b>Шаг 2/5: Дополнительное описание</b>\n\n` +
      `Отправьте текст с подробными условиями/описанием или отправьте /skip, чтобы пропустить:`,
    wizard_step_winners:
      `👥 <b>Шаг 3/5: Количество победителей</b>\n\n` +
      `Сколько победителей будет в розыгрыше? Введите число от 1 до 100:`,
    wizard_invalid_winners: '⚠️ Пожалуйста, введите корректное число от 1 до 100.',
    wizard_step_channels:
      `📢 <b>Шаг 4/5: Каналы для подписки</b>\n\n` +
      `Отправьте юзернейм канала (например: <code>@mychannel</code>) или перешлите любое сообщение из канала.\n\n` +
      `⚠️ <b>Важно:</b> Бот @TemkaDrawBot должен быть добавлен в этот канал как <b>Администратор</b> (с правами публикации/приглашения)!\n\n` +
      `<i>Вы можете отправить несколько каналов по очереди. Когда закончите, нажмите кнопку «Готово».</i>`,
    btn_done_channels: '✅ Готово (все каналы добавлены)',
    channel_added: (title, username) => `✅ Канал <b>${title}</b> (@${username}) добавлен! Можете отправить ещё один или нажать «Готово».`,
    channel_error_not_admin: (username) =>
      `❌ Не удалось подтвердить права администратора в @${username}. Убедитесь, что @TemkaDrawBot добавлен в канал как администратор, и попробуйте снова.`,
    need_at_least_one_channel: '⚠️ Добавьте хотя бы один канал перед продолжением.',

    wizard_step_duration:
      `⏳ <b>Шаг 5/5: Длительность розыгрыша</b>\n\n` +
      `Выберите, сколько времени будет длиться конкурс:`,
    btn_1_hour: '1 час',
    btn_6_hours: '6 часов',
    btn_24_hours: '24 часа',
    btn_3_days: '3 дня',
    btn_7_days: '7 дней',
    btn_custom_date: '📅 Указать точную дату',
    wizard_step_custom_date:
      `📅 <b>Точная дата и время окончания</b>\n\n` +
      `Отправьте дату и время, когда должен завершиться розыгрыш.\n\n` +
      `Формат: <code>ДД.ММ.ГГГГ ЧЧ:ММ</code> (например: <code>25.11.2026 18:00</code> UTC) или <code>ДД.ММ ЧЧ:ММ</code> (например: <code>25.11 18:00</code>):`,
    wizard_invalid_date: '⚠️ Неверный формат даты. Пожалуйста, отправьте в формате: <code>ДД.ММ.ГГГГ ЧЧ:ММ</code> (например: <code>25.11.2026 18:00</code>)',
    wizard_date_in_past: '⚠️ Дата окончания должна быть в будущем! Пожалуйста, укажите дату вперёд.',

    wizard_preview_title: '👀 <b>Предпросмотр розыгрыша</b>\n\nПроверьте условия перед публикацией:',
    btn_publish_to_channel: '🚀 Опубликовать в канале',
    btn_cancel: '❌ Отмена',
    session_expired: '⚠️ Сессия истекла. Пожалуйста, отправьте /start, чтобы создать розыгрыш.',
    cancelled: '❌ Создание розыгрыша отменено.',

    // Giveaway Post Content
    giveaway_card: ({ prize, description, winnersCount, channels, endAtFormatted, seedHash }) => {
      let text = `🎁 <b>РОЗЫГРЫШ: ${prize}</b>\n\n`;
      if (description) {
        text += `${description}\n\n`;
      }
      text += `🏆 <b>Количество победителей:</b> ${winnersCount}\n`;
      text += `📢 <b>Для участия подпишитесь на:</b>\n`;
      channels.forEach((ch, idx) => {
        const link = ch.invite_link || (ch.username ? `https://t.me/${ch.username}` : '');
        const tag = ch.username ? ` (@${ch.username})` : '';
        if (link) {
          text += `  ${idx + 1}. <a href="${link}">${ch.title}</a>${tag}\n`;
        } else {
          text += `  ${idx + 1}. <b>${ch.title}</b>${tag}\n`;
        }
      });
      text += `\n⏳ <b>Окончание:</b> ${endAtFormatted}\n`;
      text += `🔒 <b>Хеш честности (SHA-256):</b>\n<code>${seedHash}</code>\n\n`;
      text += `<i>Для участия нажмите кнопку ниже!</i>`;
      return text;
    },

    btn_participate: (count) => `🎁 Участвовать (${count})`,
    btn_channels_list: '📢 Каналы',
    btn_stats: '📊 Статистика',

    // Callback responses
    alert_already_participating: '✅ Вы уже участвуете в этом розыгрыше! Удачи!',
    alert_left_giveaway: '👋 Вы вышли из розыгрыша и больше не участвуете.\n\n(Нажмите «Участвовать» снова, если передумаете!)',
    alert_success_joined: '🎉 Вы успешно зарегистрированы в розыгрыше!\n\n💡 Совет: Откройте @TemkaDrawBot и нажмите Старт, чтобы бот смог прислать вам уведомление в ЛС в случае победы!',
    alert_must_subscribe: (missingList) =>
      `❌ Вы подписались не на все каналы!\n\nПожалуйста, подпишитесь на:\n${missingList}\nи затем нажмите «Участвовать» снова.`,
    alert_ended: '⏳ Этот розыгрыш уже завершён!',

    winner_dm_notification: ({ prize, channel, directLink }) =>
      `🎉 <b>Поздравляем!</b>\n\n` +
      `Вы были выбраны победителем на шаут-аут в следующем посте на ${channel}.\n\n` +
      `Пожалуйста, свяжитесь с администрацией канала в личных сообщениях для получения шаут-аута:\n` +
      `<a href="${directLink}">${directLink}</a>`,
    btn_claim_shoutout: '💬 Написать в ЛС (Получить шаут-аут)',

    // Finished giveaway card
    giveaway_finished_card: ({ prize, winnersText, serverSeed, seedHash, finishedAtFormatted }) =>
      `🎉 <b>РОЗЫГРЫШ ЗАВЕРШЁН: ${prize}</b>\n\n` +
      `🏆 <b>Победители:</b>\n${winnersText}\n\n` +
      `📅 <b>Завершено:</b> ${finishedAtFormatted}\n` +
      `🔒 <b>Проверка честности (Provably Fair):</b>\n` +
      `• Исходный сид: <code>${serverSeed}</code>\n` +
      `• Хеш сида: <code>${seedHash}</code>\n\n` +
      `<i>Победители выбраны криптографически через HMAC-SHA256 с обязательной проверкой активной подписки.</i>`,

    no_participants: '😢 В розыгрыше не было участников.',
    my_giveaways_empty: 'Вы ещё не создали ни одного розыгрыша. Нажмите «Создать розыгрыш», чтобы начать!',
    my_giveaways_title: '📋 <b>Ваши розыгрыши:</b>'
  }
};

function t(lang, key, ...args) {
  const currentLang = strings[lang] ? lang : 'ru';
  const entry = strings[currentLang][key] || strings['en'][key];
  if (typeof entry === 'function') {
    return entry(...args);
  }
  return entry || key;
}

module.exports = {
  strings,
  t
};
