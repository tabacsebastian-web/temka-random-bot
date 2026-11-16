const strings = {
  en: {
    welcome: (name) =>
      `👋 Hello, <b>${name}</b>!\n\n` +
      `🎁 Welcome to <b>Temka Random</b> — the transparent, cheat-proof, and provably fair giveaway bot for Telegram.\n\n` +
      `Launch a giveaway in 30 seconds or check your active contests below:`,
    welcome_stats: ({ activeUsers30d, totalGiveaways, totalParticipants }) =>
      `\n\n📊 <b>Live Community Stats:</b>\n` +
      `• 👥 Monthly active users: <b>${activeUsers30d}</b>\n` +
      `• 🎁 Giveaways hosted: <b>${totalGiveaways}</b>\n` +
      `• 🎟️ Total entries: <b>${totalParticipants}</b>`,
    btn_create_giveaway: '➕ Create Giveaway',
    btn_my_giveaways: '📋 My Giveaways',
    btn_language: '🌐 Language / Язык / Limbă',
    btn_help: 'ℹ️ About & Security',

    help_text:
      `🛡️ <b>Why is Temka Random 100% secure?</b>\n\n` +
      `1. <b>Provably Fair Randomness:</b> Before any giveaway starts, a cryptographic SHA-256 hash of the secret server seed is published. Once finished, the seed is revealed so anyone can verify the exact draw calculations with <code>/verify &lt;seed&gt;</code> or on our web verifier.\n` +
      `2. <b>Double-Check Verification:</b> At draw time, the bot re-verifies if winners are still subscribed. Anyone who unsubscribes after clicking is disqualified.\n` +
      `3. <b>Always On 24/7:</b> Powered by Cloudflare Workers & D1 so giveaways never pause and results always publish on time.`,

    choose_lang: '🌐 Please choose your language / Выберите язык / Alege limba:',
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
    channel_added: (title, handle) => `✅ Channel <b>${title}</b> (${handle}) added! Add another or click "Done".`,
    channel_error_not_admin: (username) =>
      `❌ Could not verify bot admin rights in ${username}. Make sure @TemkaDrawBot is an administrator in that channel and try again.`,
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
      text += `<i>Press the button below to participate!</i>\n`;
      text += `🤖 <a href="https://t.me/TemkaDrawBot">@TemkaDrawBot</a> · Provably Fair`;
      return text;
    },

    btn_participate: (count) => `🎁 Participate (${count})`,
    btn_channels_list: '📢 Channels',
    btn_stats: '📊 Stats',
    btn_create_own: '🎁 Host Your Own Giveaway',

    // Callback responses
    alert_already_participating: '✅ You are already participating in this giveaway! Good luck!',
    alert_left_giveaway: '👋 You have left the giveaway. You are no longer participating.\n\n(Click Participate again if you change your mind!)',
    alert_success_joined: '🎉 Success! You are now entered into the giveaway!\n\n💡 Tip: Open @TemkaDrawBot and press Start so we can notify you in private if you win!',
    alert_must_subscribe: (missingList) =>
      `❌ You are not subscribed to all required channels!\n\nPlease subscribe to:\n${missingList}\nthen press Participate again.`,
    alert_ended: '⏳ This giveaway has already ended!',

    winner_dm_notification: ({ prize, channel, directLink }) =>
      `🎉 <b>Congratulations!</b>\n\n` +
      `You won <b>${prize}</b> on ${channel}.\n\n` +
      `Please contact the channel administration through direct messages to claim your prize:\n` +
      `<a href="${directLink}">${directLink}</a>`,
    btn_claim_shoutout: '💬 Contact Administration',

    // Finished giveaway card
    giveaway_finished_card: ({ prize, winnersText, serverSeed, seedHash, finishedAtFormatted }) =>
      `🎉 <b>GIVEAWAY FINISHED: ${prize}</b>\n\n` +
      `🏆 <b>Winners:</b>\n${winnersText}\n\n` +
      `📅 <b>Finished:</b> ${finishedAtFormatted}\n` +
      `🔒 <b>Provably Fair Verification:</b>\n` +
      `• Seed: <code>${serverSeed}</code>\n` +
      `• Hash: <code>${seedHash}</code>\n\n` +
      `🔍 <a href="https://temka-random-bot.tabac-sebastian.workers.dev/#verify">Verify Seed Online</a> · Run yours via <a href="https://t.me/TemkaDrawBot?start=create">@TemkaDrawBot</a>`,

    verify_usage:
      `🔐 <b>Provably Fair Verifier</b>\n\n` +
      `Send <code>/verify &lt;server_seed&gt;</code> to calculate its SHA-256 hash and compare it with the published giveaway hash.\n\n` +
      `🌐 You can also verify visually online:\nhttps://temka-random-bot.tabac-sebastian.workers.dev/#verify`,
    verify_result: ({ seed, hash, matchedGiveaway }) =>
      `🔐 <b>SHA-256 Seed Verification</b>\n\n` +
      `• Seed: <code>${seed}</code>\n` +
      `• Computed SHA-256:\n<code>${hash}</code>\n` +
      (matchedGiveaway
        ? `\n✅ <b>Matched Giveaway:</b> ${matchedGiveaway.prize} (<code>${matchedGiveaway.public_id}</code>, status: ${matchedGiveaway.status})`
        : `\nℹ️ Compare the hash above with the hash published in the original giveaway post before it ended.`),

    no_participants: '😢 No participants entered this giveaway.',
    my_giveaways_empty: 'You have not created any giveaways yet. Click "Create Giveaway" to start!',
    my_giveaways_title: '📋 <b>Your Giveaways:</b>'
  },

  ru: {
    welcome: (name) =>
      `👋 Привет, <b>${name}</b>!\n\n` +
      `🎁 Добро пожаловать в <b>Temka Random</b> — безопасный, прозрачный и честный бот для проведения розыгрышей в Telegram.\n\n` +
      `Запустите конкурс за 30 секунд или выберите действие ниже:`,
    welcome_stats: ({ activeUsers30d, totalGiveaways, totalParticipants }) =>
      `\n\n📊 <b>Статистика бота:</b>\n` +
      `• 👥 Активных пользователей в месяц: <b>${activeUsers30d}</b>\n` +
      `• 🎁 Проведено розыгрышей: <b>${totalGiveaways}</b>\n` +
      `• 🎟️ Всего участий: <b>${totalParticipants}</b>`,
    btn_create_giveaway: '➕ Создать розыгрыш',
    btn_my_giveaways: '📋 Мои розыгрыши',
    btn_language: '🌐 Язык / Language / Limbă',
    btn_help: 'ℹ️ О боте и безопасности',

    help_text:
      `🛡️ <b>Почему Temka Random на 100% честный и безопасный?</b>\n\n` +
      `1. <b>Provably Fair (Доказуемая честность):</b> До начала конкурса публикуется криптографический SHA-256 хеш сида. После завершения сид раскрывается — любой может проверить его через <code>/verify &lt;сид&gt;</code> или на сайте.\n` +
      `2. <b>Двойная проверка подписки:</b> В момент розыгрыша бот повторно проверяет подписку финалистов. Отписавшиеся автоматически дисквалифицируются.\n` +
      `3. <b>Работает 24/7:</b> Запущен на Cloudflare Workers & D1 — итоги всегда публикуются точно в срок.`,

    choose_lang: '🌐 Пожалуйста, выберите язык / Choose language / Alege limba:',
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
    channel_added: (title, handle) => `✅ Канал <b>${title}</b> (${handle}) добавлен! Можете отправить ещё один или нажать «Готово».`,
    channel_error_not_admin: (username) =>
      `❌ Не удалось подтвердить права администратора в ${username}. Убедитесь, что @TemkaDrawBot добавлен в канал как администратор, и попробуйте снова.`,
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
      text += `<i>Для участия нажмите кнопку ниже!</i>\n`;
      text += `🤖 <a href="https://t.me/TemkaDrawBot">@TemkaDrawBot</a> · Provably Fair`;
      return text;
    },

    btn_participate: (count) => `🎁 Участвовать (${count})`,
    btn_channels_list: '📢 Каналы',
    btn_stats: '📊 Статистика',
    btn_create_own: '🎁 Запустить свой розыгрыш',

    // Callback responses
    alert_already_participating: '✅ Вы уже участвуете в этом розыгрыше! Удачи!',
    alert_left_giveaway: '👋 Вы вышли из розыгрыша и больше не участвуете.\n\n(Нажмите «Участвовать» снова, если передумаете!)',
    alert_success_joined: '🎉 Вы успешно зарегистрированы в розыгрыше!\n\n💡 Совет: Откройте @TemkaDrawBot и нажмите Старт, чтобы бот смог прислать вам уведомление в ЛС в случае победы!',
    alert_must_subscribe: (missingList) =>
      `❌ Вы подписались не на все каналы!\n\nПожалуйста, подпишитесь на:\n${missingList}\nи затем нажмите «Участвовать» снова.`,
    alert_ended: '⏳ Этот розыгрыш уже завершён!',

    winner_dm_notification: ({ prize, channel, directLink }) =>
      `🎉 <b>Поздравляем!</b>\n\n` +
      `Вы выиграли <b>${prize}</b> в канале ${channel}.\n\n` +
      `Свяжитесь с администрацией канала для получения приза:\n` +
      `<a href="${directLink}">${directLink}</a>`,
    btn_claim_shoutout: '💬 Написать администрации',

    // Finished giveaway card
    giveaway_finished_card: ({ prize, winnersText, serverSeed, seedHash, finishedAtFormatted }) =>
      `🎉 <b>РОЗЫГРЫШ ЗАВЕРШЁН: ${prize}</b>\n\n` +
      `🏆 <b>Победители:</b>\n${winnersText}\n\n` +
      `📅 <b>Завершено:</b> ${finishedAtFormatted}\n` +
      `🔒 <b>Проверка честности (Provably Fair):</b>\n` +
      `• Исходный сид: <code>${serverSeed}</code>\n` +
      `• Хеш сида: <code>${seedHash}</code>\n\n` +
      `🔍 <a href="https://temka-random-bot.tabac-sebastian.workers.dev/#verify">Проверить сид онлайн</a> · Создать свой: <a href="https://t.me/TemkaDrawBot?start=create">@TemkaDrawBot</a>`,

    verify_usage:
      `🔐 <b>Проверка честности (SHA-256)</b>\n\n` +
      `Отправьте <code>/verify &lt;server_seed&gt;</code>, чтобы вычислить SHA-256 хеш сида и сравнить его с хешем из поста розыгрыша.\n\n` +
      `🌐 Также доступна онлайн-проверка:\nhttps://temka-random-bot.tabac-sebastian.workers.dev/#verify`,
    verify_result: ({ seed, hash, matchedGiveaway }) =>
      `🔐 <b>Проверка SHA-256 сида</b>\n\n` +
      `• Сид: <code>${seed}</code>\n` +
      `• Вычисленный SHA-256:\n<code>${hash}</code>\n` +
      (matchedGiveaway
        ? `\n✅ <b>Найден розыгрыш:</b> ${matchedGiveaway.prize} (<code>${matchedGiveaway.public_id}</code>, статус: ${matchedGiveaway.status})`
        : `\nℹ️ Сравните этот хеш с хешем, опубликованным в посте до окончания конкурса.`),

    no_participants: '😢 В розыгрыше не было участников.',
    my_giveaways_empty: 'Вы ещё не создали ни одного розыгрыша. Нажмите «Создать розыгрыш», чтобы начать!',
    my_giveaways_title: '📋 <b>Ваши розыгрыши:</b>'
  },

  ro: {
    welcome: (name) =>
      `👋 Salut, <b>${name}</b>!\n\n` +
      `🎁 Bine ai venit la <b>Temka Random</b> — botul transparent și verificabil criptografic (Provably Fair) pentru concursuri și giveaway-uri pe Telegram.\n\n` +
      `Lansează un concurs în 30 de secunde sau alege o opțiune mai jos:`,
    welcome_stats: ({ activeUsers30d, totalGiveaways, totalParticipants }) =>
      `\n\n📊 <b>Statistici live:</b>\n` +
      `• 👥 Utilizatori activi lunar: <b>${activeUsers30d}</b>\n` +
      `• 🎁 Giveaway-uri organizate: <b>${totalGiveaways}</b>\n` +
      `• 🎟️ Participări totale: <b>${totalParticipants}</b>`,
    btn_create_giveaway: '➕ Creează Giveaway',
    btn_my_giveaways: '📋 Giveaway-urile mele',
    btn_language: '🌐 Limbă / Language / Язык',
    btn_help: 'ℹ️ Despre & Securitate',

    help_text:
      `🛡️ <b>De ce este Temka Random 100% corect?</b>\n\n` +
      `1. <b>Provably Fair (SHA-256 + HMAC):</b> Înainte ca giveaway-ul să înceapă, se publică hash-ul SHA-256 al seed-ului secret. La final, seed-ul este dezvăluit și oricine îl poate verifica cu <code>/verify &lt;seed&gt;</code> sau online.\n` +
      `2. <b>Verificare dublă a abonării:</b> Botul verifică abonamentul atât la înscriere, cât și în momentul extragerii. Cine se dezabonează este descalificat automat.\n` +
      `3. <b>Activ 24/7 pe Cloudflare:</b> Rulează permanent pe Cloudflare Workers & D1 și extrage câștigătorii la timp exact.`,

    choose_lang: '🌐 Alege limba / Choose language / Выберите язык:',
    lang_set: '✅ Limba a fost schimbată în Română!',

    // Wizard steps
    wizard_step_prize:
      `🎁 <b>Pasul 1/5: Premiul</b>\n\n` +
      `Trimite titlul sau premiul concursului (ex: <i>Telegram Premium 1 An</i> sau <i>100 USDT</i>):`,
    wizard_step_description:
      `📝 <b>Pasul 2/5: Detalii suplimentare</b>\n\n` +
      `Trimite o descriere sau reguli opționale pentru concurs, sau trimite /skip pentru a sări peste acest pas:`,
    wizard_step_winners:
      `👥 <b>Pasul 3/5: Număr de câștigători</b>\n\n` +
      `Câți câștigători să fie aleși? Introdu un număr între 1 și 100:`,
    wizard_invalid_winners: '⚠️ Te rog introdu un număr valid între 1 și 100.',
    wizard_step_channels:
      `📢 <b>Pasul 4/5: Canale obligatorii</b>\n\n` +
      `Trimite username-ul canalului (ex: <code>@canalulmeu</code>) sau redirecționează (forward) un mesaj din canal.\n\n` +
      `⚠️ <b>Important:</b> Botul @TemkaDrawBot trebuie să fie <b>Administrator</b> în acel canal (cu drept de postare și invitații)!\n\n` +
      `<i>Poți adăuga mai multe canale pe rând. Când ești gata, apasă „Gata”.</i>`,
    btn_done_channels: '✅ Gata (canalele au fost adăugate)',
    channel_added: (title, handle) => `✅ Canalul <b>${title}</b> (${handle}) a fost adăugat! Mai adaugă unul sau apasă „Gata”.`,
    channel_error_not_admin: (username) =>
      `❌ Nu am putut confirma drepturile de administrator în ${username}. Verifică dacă @TemkaDrawBot este administrator în canal și încearcă din nou.`,
    need_at_least_one_channel: '⚠️ Adaugă cel puțin un canal înainte de a continua.',

    wizard_step_duration:
      `⏳ <b>Pasul 5/5: Durata concursului</b>\n\n` +
      `Alege cât timp va fi activ giveaway-ul:`,
    btn_1_hour: '1 Oră',
    btn_6_hours: '6 Ore',
    btn_24_hours: '24 Ore',
    btn_3_days: '3 Zile',
    btn_7_days: '7 Zile',
    btn_custom_date: '📅 Dată și oră exactă',
    wizard_step_custom_date:
      `📅 <b>Data și ora exactă de încheiere</b>\n\n` +
      `Trimite data și ora când trebuie să se termine concursul.\n\n` +
      `Format: <code>ZZ.LL.AAAA OO:MM</code> (ex: <code>25.11.2026 18:00</code> UTC) sau <code>ZZ.LL OO:MM</code> (ex: <code>25.11 18:00</code>):`,
    wizard_invalid_date: '⚠️ Format invalid. Trimite în format: <code>ZZ.LL.AAAA OO:MM</code> (ex: <code>25.11.2026 18:00</code>)',
    wizard_date_in_past: '⚠️ Data de finalizare trebuie să fie în viitor!',

    wizard_preview_title: '👀 <b>Previzualizare Giveaway</b>\n\nVerifică detaliile înainte de publicare:',
    btn_publish_to_channel: '🚀 Publică în canal',
    btn_cancel: '❌ Anulează',
    session_expired: '⚠️ Sesiunea a expirat. Trimite /start pentru a crea un giveaway nou.',
    cancelled: '❌ Crearea giveaway-ului a fost anulată.',

    // Giveaway Post Content
    giveaway_card: ({ prize, description, winnersCount, channels, endAtFormatted, seedHash }) => {
      let text = `🎁 <b>CONCURS: ${prize}</b>\n\n`;
      if (description) {
        text += `${description}\n\n`;
      }
      text += `🏆 <b>Câștigători:</b> ${winnersCount}\n`;
      text += `📢 <b>Canale necesare:</b>\n`;
      channels.forEach((ch, idx) => {
        const link = ch.invite_link || (ch.username ? `https://t.me/${ch.username}` : '');
        const tag = ch.username ? ` (@${ch.username})` : '';
        if (link) {
          text += `  ${idx + 1}. <a href="${link}">${ch.title}</a>${tag}\n`;
        } else {
          text += `  ${idx + 1}. <b>${ch.title}</b>${tag}\n`;
        }
      });
      text += `\n⏳ <b>Se încheie:</b> ${endAtFormatted}\n`;
      text += `🔒 <b>Hash corectitudine (SHA-256):</b>\n<code>${seedHash}</code>\n\n`;
      text += `<i>Apasă butonul de mai jos pentru a participa!</i>\n`;
      text += `🤖 <a href="https://t.me/TemkaDrawBot">@TemkaDrawBot</a> · Provably Fair`;
      return text;
    },

    btn_participate: (count) => `🎁 Participă (${count})`,
    btn_channels_list: '📢 Canale',
    btn_stats: '📊 Statistici',
    btn_create_own: '🎁 Creează propriul giveaway',

    // Callback responses
    alert_already_participating: '✅ Participi deja la acest giveaway! Succes!',
    alert_left_giveaway: '👋 Ai ieșit din giveaway și nu mai participi.\n\n(Apasă din nou Participă dacă te răzgândești!)',
    alert_success_joined: '🎉 Te-ai înscris cu succes în giveaway!\n\n💡 Sfat: Deschide @TemkaDrawBot și apasă Start ca să primești mesaj privat dacă câștigi!',
    alert_must_subscribe: (missingList) =>
      `❌ Nu ești abonat la toate canalele necesare!\n\nAbonează-te la:\n${missingList}\napoi apasă din nou Participă.`,
    alert_ended: '⏳ Acest giveaway s-a încheiat deja!',

    winner_dm_notification: ({ prize, channel, directLink }) =>
      `🎉 <b>Felicitări!</b>\n\n` +
      `Ai câștigat <b>${prize}</b> pe canalul ${channel}.\n\n` +
      `Contactează administrația canalului pentru a revendica premiul:\n` +
      `<a href="${directLink}">${directLink}</a>`,
    btn_claim_shoutout: '💬 Contactează administrația',

    // Finished giveaway card
    giveaway_finished_card: ({ prize, winnersText, serverSeed, seedHash, finishedAtFormatted }) =>
      `🎉 <b>CONCURS ÎNCHEIAT: ${prize}</b>\n\n` +
      `🏆 <b>Câștigători:</b>\n${winnersText}\n\n` +
      `📅 <b>Finalizat:</b> ${finishedAtFormatted}\n` +
      `🔒 <b>Verificare Provably Fair:</b>\n` +
      `• Seed: <code>${serverSeed}</code>\n` +
      `• Hash: <code>${seedHash}</code>\n\n` +
      `🔍 <a href="https://temka-random-bot.tabac-sebastian.workers.dev/#verify">Verifică seed-ul online</a> · Fă și tu un concurs: <a href="https://t.me/TemkaDrawBot?start=create">@TemkaDrawBot</a>`,

    verify_usage:
      `🔐 <b>Verificator Provably Fair (SHA-256)</b>\n\n` +
      `Trimite <code>/verify &lt;server_seed&gt;</code> pentru a calcula hash-ul SHA-256 și a-l compara cu hash-ul publicat în postare.\n\n` +
      `🌐 Verifică și online:\nhttps://temka-random-bot.tabac-sebastian.workers.dev/#verify`,
    verify_result: ({ seed, hash, matchedGiveaway }) =>
      `🔐 <b>Verificare Seed SHA-256</b>\n\n` +
      `• Seed: <code>${seed}</code>\n` +
      `• SHA-256 calculat:\n<code>${hash}</code>\n` +
      (matchedGiveaway
        ? `\n✅ <b>Concurs găsit:</b> ${matchedGiveaway.prize} (<code>${matchedGiveaway.public_id}</code>, status: ${matchedGiveaway.status})`
        : `\nℹ️ Compară acest hash cu hash-ul publicat în postarea concursului înainte de extragere.`),

    no_participants: '😢 Nu au existat participanți în acest concurs.',
    my_giveaways_empty: 'Nu ai creat încă niciun giveaway. Apasă „Creează Giveaway” pentru a începe!',
    my_giveaways_title: '📋 <b>Giveaway-urile tale:</b>'
  }
};

function t(lang, key, ...args) {
  const currentLang = strings[lang] ? lang : 'en';
  const entry = strings[currentLang][key] || strings.en[key];
  if (typeof entry === 'function') {
    return entry(...args);
  }
  return entry || key;
}

module.exports = {
  strings,
  t
};
