const { escapeHtml, truncateText } = require('./utils');

const BOT_URL = 'https://t.me/TemkaDrawBot';
const WEB_URL = 'https://temka-random-bot.tabac-sebastian.workers.dev';

function formatChannelsList(channels, isCaption = false) {
  const list = Array.isArray(channels) ? channels : [];
  return list
    .map((ch, idx) => {
      const safeTitle = escapeHtml(ch.title || ch.username || 'Channel');
      const cleanUser = ch.username ? ch.username.replace(/^@/, '') : '';
      const link = ch.invite_link || (cleanUser ? `https://t.me/${cleanUser}` : '');
      const tag = cleanUser && !isCaption ? ` (@${escapeHtml(cleanUser)})` : '';
      return link
        ? `  ${idx + 1}. <a href="${escapeHtml(link)}">${safeTitle}</a>${tag}`
        : `  ${idx + 1}. <b>${safeTitle}</b>${tag}`;
    })
    .join('\n');
}

function buildActiveCard(labels, { prize, description, winnersCount, channels, endType, endAtFormatted, endCount, seedHash, settings = {}, forCaption = false }) {
  const safePrize = escapeHtml(prize);
  let desc = description ? escapeHtml(description) : '';
  if (forCaption && desc.length > 260) {
    desc = escapeHtml(truncateText(description, 220));
  }

  const endLine =
    endType === 'participants' && Number(endCount) > 0
      ? labels.endsAtCount(Number(endCount))
      : endAtFormatted;

  const perks = [];
  if (settings.referralsEnabled) perks.push(labels.perkReferral);
  if (settings.requireCaptcha) perks.push(labels.perkCaptcha);
  if (settings.requireUsername) perks.push(labels.perkUsername);
  if (settings.requirePremium) perks.push(labels.perkPremium);

  let text = `🎁 <b>${labels.heading}: ${safePrize}</b>\n\n`;
  if (desc) {
    text += `${desc}\n\n`;
  }
  text += `🏆 <b>${labels.winners}:</b> ${winnersCount}\n`;
  text += `📢 <b>${labels.channels}:</b>\n${formatChannelsList(channels, forCaption)}\n`;
  if (perks.length > 0) {
    text += `✨ ${perks.join(' · ')}\n`;
  }
  text += `\n⏳ <b>${labels.ends}:</b> ${endLine}\n`;
  text += `🔒 <b>${labels.hash}:</b>\n<code>${escapeHtml(seedHash)}</code>\n\n`;
  text += `<i>${labels.cta}</i>\n`;
  text += `🤖 <a href="${BOT_URL}">@TemkaDrawBot</a> · Provably Fair`;
  return text;
}

function buildFinishedCard(labels, { prize, winnersText, serverSeed, seedHash, finishedAtFormatted, forCaption = false }) {
  const safePrize = escapeHtml(prize);
  const verifyUrl = `${WEB_URL}/?seed=${encodeURIComponent(serverSeed)}#verify`;
  let bodyWinners = winnersText;
  if (forCaption && bodyWinners.length > 360) {
    bodyWinners = bodyWinners.split('\n').slice(0, 10).join('\n') + '\n…';
  }
  return (
    `🎉 <b>${labels.heading}: ${safePrize}</b>\n\n` +
    `🏆 <b>${labels.winners}:</b>\n${bodyWinners}\n\n` +
    `📅 <b>${labels.finished}:</b> ${finishedAtFormatted}\n` +
    `🔒 <b>${labels.verification}:</b>\n` +
    `• ${labels.seedLabel}: <code>${escapeHtml(serverSeed)}</code>\n` +
    `• ${labels.hashLabel}: <code>${escapeHtml(seedHash)}</code>\n\n` +
    `🔍 <a href="${verifyUrl}">${labels.verifyOnline}</a> · <a href="${BOT_URL}?start=create">@TemkaDrawBot</a>`
  );
}

const strings = {
  en: {
    welcome: (name) =>
      `👋 Hello, <b>${escapeHtml(name)}</b>!\n\n` +
      `🎁 Welcome to <b>Temka Random</b> — the transparent, cheat-proof, and provably fair giveaway bot for Telegram.\n\n` +
      `Launch a giveaway in 30 seconds or manage your active draws below:`,
    welcome_stats: ({ activeUsers30d, totalGiveaways, totalParticipants }) =>
      `\n\n📊 <b>Live Community Stats:</b>\n` +
      `• 👥 Monthly active users: <b>${activeUsers30d}</b>\n` +
      `• 🎁 Giveaways hosted: <b>${totalGiveaways}</b>\n` +
      `• 🎟️ Total entries: <b>${totalParticipants}</b>`,

    btn_create_giveaway: '➕ Create Giveaway',
    btn_my_giveaways: '📋 My Giveaways',
    btn_language: '🌐 Language / Язык',
    btn_help: 'ℹ️ About & Security',
    btn_back: '🔙 Back',
    btn_skip: '➡️ Skip',
    btn_cancel: '❌ Cancel',

    help_text:
      `🛡️ <b>Why is Temka Random 100% secure?</b>\n\n` +
      `1. <b>Provably Fair SHA-256:</b> A secret 256-bit seed hash is published upfront. After the draw, the seed is revealed so anyone can verify it via <code>/verify &lt;seed&gt;</code> or our 1-click web verifier.\n` +
      `2. <b>Double Subscription Check:</b> Membership is checked on join and re-verified at draw time (unsubscribers are automatically replaced).\n` +
      `3. <b>Viral &amp; Anti-Bot Tools:</b> Optional referral bonus tickets, math CAPTCHA, @username &amp; Telegram Premium filters, photo banners, participant-count auto-draw, CSV export, and fair rerolls.\n` +
      `4. <b>Always On 24/7:</b> Serverless Cloudflare Workers &amp; D1 edge database.`,

    choose_lang: '🌐 Please choose your language / Выберите язык:',
    lang_set: '✅ Language changed to English!',

    // Wizard steps
    wizard_step_prize:
      `🎁 <b>Step 1/5: Prize</b>\n\n` +
      `Send the title of your prize (e.g. <i>Telegram Premium 1 Year</i> or <i>100 USDT</i>):`,
    wizard_need_prize_text: '⚠️ Please send a text title for the prize (max 150 chars).',
    wizard_step_description:
      `📝 <b>Step 2/5: Details &amp; Optional Banner</b>\n\n` +
      `Send optional rules/description, <b>or attach a photo</b> (with optional caption) for your giveaway post, or tap Skip:`,
    wizard_photo_saved: '🖼️ Banner photo attached!',
    wizard_step_winners:
      `🏆 <b>Step 3/5: Number of winners</b>\n\n` +
      `Choose a quick preset below or type any number between 1 and 100:`,
    wizard_invalid_winners: '⚠️ Please enter a valid number between 1 and 100.',
    wizard_step_channels:
      `📢 <b>Step 4/5: Required Channels</b>\n\n` +
      `Add channels subscribers must join:\n` +
      `• Tap <b>Add Bot to Channel</b> below for 1-tap setup, <b>OR</b>\n` +
      `• Send a channel <code>@username</code> / forward any post from it.\n\n` +
      `⚠️ Bot @TemkaDrawBot must be an <b>Administrator</b> (Post + Invite links) in each channel.`,
    btn_add_bot_channel: '➕ Add Bot to Channel',
    btn_done_channels: '✅ Done adding channels',
    channel_added: (title, handle) =>
      `✅ Channel <b>${escapeHtml(title)}</b> (${escapeHtml(handle)}) added! Add another or tap <b>Done adding channels</b>.`,
    channel_added_auto: (title, handle) =>
      `⚡ Auto-detected admin promotion in <b>${escapeHtml(title)}</b> (${escapeHtml(handle)})! Tap <b>Done adding channels</b> or add more.`,
    channel_detect_error:
      '⚠️ Could not detect the channel. Tap <b>Add Bot to Channel</b>, forward a post from the channel, or send its <code>@username</code>.',
    channel_error_not_admin: (name) =>
      `❌ Could not verify admin rights in <b>${escapeHtml(name)}</b>. Please add @TemkaDrawBot as an administrator and try again.`,
    need_at_least_one_channel: '⚠️ Please add at least one channel first.',

    wizard_step_duration:
      `⏳ <b>Step 5/5: Draw Condition</b>\n\n` +
      `When should the giveaway automatically draw winners?`,
    btn_1_hour: '1 Hour',
    btn_6_hours: '6 Hours',
    btn_24_hours: '24 Hours',
    btn_3_days: '3 Days',
    btn_7_days: '7 Days',
    btn_custom_date: '📅 Custom Date & Time',
    btn_by_count: '👥 Target Participants',
    wizard_step_custom_date:
      `📅 <b>Exact End Date &amp; Time</b>\n\n` +
      `Send end time in UTC:\n` +
      `<code>DD.MM.YYYY HH:MM</code> (e.g. <code>25.11.2026 18:00</code>) or <code>DD.MM HH:MM</code>:`,
    wizard_invalid_date: '⚠️ Invalid format. Use <code>DD.MM.YYYY HH:MM</code> (e.g. <code>25.11.2026 18:00</code>).',
    wizard_date_in_past: '⚠️ End date must be in the future!',
    wizard_step_count:
      `👥 <b>Target Participants Auto-Draw</b>\n\n` +
      `Select a target number of participants (between 2 and 100,000) or send your own number:`,
    wizard_invalid_count: '⚠️ Please enter a number between 2 and 100,000.',

    wizard_preview_title: '👀 <b>Contest Preview</b>',
    preview_meta: ({ postLang, postChannelLabel, referralsEnabled, requireCaptcha, requireUsername, requirePremium }) => {
      const filters = [
        requireCaptcha ? 'Captcha' : null,
        requireUsername ? '@username' : null,
        requirePremium ? 'Premium' : null
      ].filter(Boolean);
      return (
        `⚙️ Post lang: <b>${postLang.toUpperCase()}</b> · Post in: <b>${escapeHtml(postChannelLabel)}</b>\n` +
        `🔗 Referrals (+1 ticket): <b>${referralsEnabled ? 'ON' : 'OFF'}</b> · ` +
        `🛡️ Filters: <b>${filters.length ? filters.join(', ') : 'None'}</b>`
      );
    },
    btn_publish_to_channel: '🚀 Publish Giveaway',
    btn_preview_edit: '✏️ Edit',
    btn_preview_options: '⚙️ Options & Filters',
    btn_preview_lang: (postLang) => `🌐 Post Lang: ${postLang === 'ru' ? 'RU 🇷🇺' : 'EN 🇬🇧'}`,
    btn_back_preview: '🔙 Back to Preview',

    edit_menu_title: '✏️ <b>What would you like to change?</b>',
    btn_edit_prize: '🎁 Prize',
    btn_edit_desc: '📝 Details / Photo',
    btn_edit_winners: '🏆 Winners',
    btn_edit_channels: '📢 Channels',
    btn_edit_duration: '⏳ End Condition',

    options_menu_title:
      `⚙️ <b>Giveaway Growth &amp; Anti-Bot Options</b>\n\n` +
      `Tap any option below to toggle it:`,
    btn_opt_referrals: (on) => `🔗 Referral Bonus (+1 ticket): ${on ? '✅ ON' : 'OFF'}`,
    btn_opt_captcha: (on) => `🤖 Math Captcha: ${on ? '✅ ON' : 'OFF'}`,
    btn_opt_username: (on) => `👤 Require @username: ${on ? '✅ ON' : 'OFF'}`,
    btn_opt_premium: (on) => `⭐ Telegram Premium Only: ${on ? '✅ ON' : 'OFF'}`,
    btn_opt_post_channel: (label) => `📣 Publish in: ${truncateText(label, 22)}`,

    session_expired: '⚠️ Session expired. Please send /start to begin.',
    cancelled: '❌ Giveaway creation cancelled.',

    publish_success: (channelLabel, postUrl) =>
      `🎉 <b>Giveaway published successfully to ${escapeHtml(channelLabel)}!</b>` +
      (postUrl ? `\n\n🔗 Post: <a href="${escapeHtml(postUrl)}">${escapeHtml(postUrl)}</a>` : ''),
    publish_failed: (channelLabel) =>
      `❌ Failed to publish to <b>${escapeHtml(channelLabel)}</b>. Make sure @TemkaDrawBot has "Post Messages" permission!`,

    // Giveaway cards
    giveaway_card: (params) =>
      buildActiveCard(
        {
          heading: 'GIVEAWAY',
          winners: 'Winners',
          channels: 'Required Channels',
          ends: 'Ends',
          endsAtCount: (n) => `Auto-draw at <b>${n}</b> participants`,
          hash: 'Fair Draw Hash (SHA-256)',
          cta: 'Press the button below to participate!',
          perkReferral: '+1 Ticket per friend',
          perkCaptcha: 'Anti-Bot Captcha',
          perkUsername: '@username required',
          perkPremium: 'Premium only'
        },
        params
      ),
    giveaway_finished_card: (params) =>
      buildFinishedCard(
        {
          heading: 'GIVEAWAY FINISHED',
          winners: 'Winners',
          finished: 'Finished',
          verification: 'Provably Fair Verification',
          seedLabel: 'Seed',
          hashLabel: 'Hash',
          verifyOnline: 'Verify Seed Online'
        },
        params
      ),
    giveaway_cancelled_card: (prize) =>
      `❌ <b>GIVEAWAY CANCELLED: ${escapeHtml(prize)}</b>\n\nThis contest was cancelled by the organizer.`,

    btn_participate: (count) => `🎁 Participate (${count})`,
    btn_participating: (count) => `✅ Participating (${count})`,
    btn_channels_list: '📢 Channels',
    btn_stats: '📊 Stats',
    btn_invite_ticket: '🔗 +1 Ticket (Invite)',
    btn_share_referral: '📤 Share Referral Link',
    btn_create_own: '🎁 Host Your Own Giveaway',
    btn_verify_seed: '🔍 Verify Seed Online',

    // Participation & Referrals & Anti-Bot alerts
    alert_already_participating: '✅ You are already participating in this giveaway! Good luck!',
    alert_left_giveaway: '👋 You left the giveaway.\n\n(Tap Participate again anytime before it ends!)',
    alert_success_joined: (tickets = 1, refEnabled = false) =>
      `🎉 Success! You are entered (${tickets} ticket${tickets > 1 ? 's' : ''})!\n\n` +
      (refEnabled
        ? '🔗 Invite friends via @TemkaDrawBot for +1 ticket each, and make sure you pressed Start so we can DM you if you win!'
        : '💡 Open @TemkaDrawBot and press Start so we can DM you if you win!'),
    alert_must_subscribe: (missingList) =>
      `❌ Please subscribe to all required channels first:\n\n${missingList}\n\nThen tap Participate again.`,
    alert_ended: '⏳ This giveaway has already ended!',
    alert_cancelled: '❌ This giveaway was cancelled by the organizer.',
    alert_need_username: '👤 This giveaway requires a public Telegram @username in your profile settings.',
    alert_need_premium: '⭐ This giveaway is restricted to Telegram Premium users.',
    captcha_prompt: (prize, question) =>
      `🤖 <b>Anti-Bot Check — ${escapeHtml(prize)}</b>\n\nSolve this quick check to join:\n<b>${escapeHtml(question)}</b>`,
    captcha_wrong: '❌ Wrong answer! Please try again.',

    dm_ticket_info: ({ tickets, referralsCount, refLink }) =>
      `\n\n🎟️ <b>Your tickets:</b> <b>${tickets}</b> (Invited friends: ${referralsCount})\n` +
      (refLink ? `🔗 <b>Your +1 Ticket Referral Link:</b>\n<code>${escapeHtml(refLink)}</code>` : ''),
    share_referral_text: (prize) => `Join the "${prize}" giveaway via @TemkaDrawBot!`,

    stats_popup: ({ count, totalTickets, winnersCount, seedHash, endLine }) =>
      `📊 <b>Giveaway Stats</b>\n\n` +
      `👥 Participants: <b>${count}</b> (🎟️ ${totalTickets} total tickets)\n` +
      `🏆 Winners to pick: <b>${winnersCount}</b>\n` +
      `⏳ Condition: ${endLine}\n` +
      `🔒 SHA-256 Hash:\n<code>${escapeHtml(seedHash)}</code>`,

    winner_dm_notification: ({ prize, channel, contactUrl, contactLabel }) =>
      `🎉 <b>Congratulations!</b>\n\n` +
      `You won <b>${escapeHtml(prize)}</b> from <b>${escapeHtml(channel)}</b>.` +
      (contactUrl
        ? `\n\nPlease contact the organizer to claim your prize:\n<a href="${escapeHtml(contactUrl)}">${escapeHtml(contactLabel || contactUrl)}</a>`
        : '\n\nPlease check the channel post for claim instructions.'),
    btn_claim_shoutout: '💬 Contact Organizer',

    creator_finish_dm: (prize, winnersText) =>
      `🏆 <b>Giveaway Finished: ${escapeHtml(prize)}</b>\n\n` +
      `The draw completed! Here are the verified winners:\n\n` +
      (winnersText || 'No eligible winners.'),
    channel_empty_finish: (prize) => `🏁 <b>Giveaway Finished: ${escapeHtml(prize)}</b>\n\n😢 No participants entered this giveaway.`,
    channel_winners_reply: (prize, winnersText) => `🎉 <b>Congratulations to the winners of ${escapeHtml(prize)}!</b>\n\n${winnersText}`,
    channel_reroll_reply: (prize, winnerHandle) => `🎲 <b>Reroll Winner for ${escapeHtml(prize)}:</b>\n\nCongratulations ${winnerHandle}!`,

    verify_usage:
      `🔐 <b>Provably Fair Verifier</b>\n\n` +
      `Send <code>/verify &lt;server_seed&gt;</code> to compute its SHA-256 hash and check matching giveaways.\n\n` +
      `🌐 Online verifier:\n${WEB_URL}/#verify`,
    verify_result: ({ seed, hash, matchedGiveaway }) =>
      `🔐 <b>SHA-256 Seed Verification</b>\n\n` +
      `• Seed: <code>${escapeHtml(seed)}</code>\n` +
      `• Computed SHA-256:\n<code>${escapeHtml(hash)}</code>\n` +
      (matchedGiveaway
        ? `\n✅ <b>Matched Giveaway:</b> ${escapeHtml(matchedGiveaway.prize)} (<code>${escapeHtml(matchedGiveaway.public_id)}</code>, status: ${escapeHtml(matchedGiveaway.status)})`
        : `\nℹ️ Compare the hash above with the hash published in the original giveaway post.`) +
      `\n\n🌐 <a href="${WEB_URL}/?seed=${encodeURIComponent(seed)}#verify">Open in Online Verifier</a>`,

    no_participants: '😢 No participants entered this giveaway.',
    my_giveaways_empty: 'You have not created any giveaways yet. Tap "Create Giveaway" to start!',
    my_giveaways_title: '📋 <b>My Giveaways</b>\n\nTap any contest below to manage, reroll, clone, or export CSV:',
    manage_giveaway_card: ({ g, count, totalTickets, postUrl }) => {
      const statusMap = { active: '🟢 Active', finished: '🏁 Finished', cancelled: '❌ Cancelled', finalizing: '⏳ Drawing', draft: '📝 Draft' };
      const st = statusMap[g.status] || g.status;
      let msg =
        `🎛️ <b>Manage Giveaway: ${escapeHtml(g.prize)}</b>\n\n` +
        `• Status: <b>${st}</b>\n` +
        `• ID: <code>${escapeHtml(g.public_id)}</code> · Lang: <b>${(g.lang || 'en').toUpperCase()}</b>\n` +
        `• Participants: <b>${count}</b> (🎟️ ${totalTickets} tickets) · Winners: <b>${g.winners_count}</b>\n` +
        `• SHA-256 Hash:\n<code>${escapeHtml(g.seed_hash)}</code>\n`;
      if (g.status === 'finished' && g.server_seed) {
        msg += `• Seed: <code>${escapeHtml(g.server_seed)}</code>\n`;
      }
      if (postUrl) {
        msg += `• Post: <a href="${escapeHtml(postUrl)}">Open in Channel</a>\n`;
      }
      return msg;
    },
    btn_draw_early: '🎲 Draw Now (Early)',
    btn_reroll: '🎲 Reroll Winner',
    btn_clone: '🔁 Clone Giveaway',
    btn_export_csv: '📥 Export CSV',
    btn_cancel_giveaway: '❌ Cancel Giveaway',
    alert_reroll_none: '⚠️ No remaining eligible subscribed participants to reroll.',
    reroll_done: (handle) => `🎲 New rerolled winner selected: ${handle}`,
    cancel_giveaway_done: '❌ Giveaway cancelled and channel post updated.',
    export_empty: 'ℹ️ This giveaway has 0 participants yet.',
    export_caption: (prize, count) => `📥 CSV Export — ${prize} (${count} participants)`
  },

  ru: {
    welcome: (name) =>
      `👋 Привет, <b>${escapeHtml(name)}</b>!\n\n` +
      `🎁 Добро пожаловать в <b>Temka Random</b> — прозрачный, защищённый и доказуемо честный бот для розыгрышей в Telegram.\n\n` +
      `Запустите конкурс за 30 секунд или управляйте активными розыгрышами ниже:`,
    welcome_stats: ({ activeUsers30d, totalGiveaways, totalParticipants }) =>
      `\n\n📊 <b>Статистика бота:</b>\n` +
      `• 👥 Активных пользователей в месяц: <b>${activeUsers30d}</b>\n` +
      `• 🎁 Проведено розыгрышей: <b>${totalGiveaways}</b>\n` +
      `• 🎟️ Всего участий: <b>${totalParticipants}</b>`,

    btn_create_giveaway: '➕ Создать розыгрыш',
    btn_my_giveaways: '📋 Мои розыгрыши',
    btn_language: '🌐 Язык / Language',
    btn_help: 'ℹ️ О боте и безопасности',
    btn_back: '🔙 Назад',
    btn_skip: '➡️ Пропустить',
    btn_cancel: '❌ Отмена',

    help_text:
      `🛡️ <b>Почему Temka Random на 100% честный и безопасный?</b>\n\n` +
      `1. <b>Provably Fair (SHA-256):</b> До старта публикуется криптографический хеш сида. После завершения сид раскрывается — любой может проверить его командой <code>/verify &lt;сид&gt;</code> или в 1 клик на сайте.\n` +
      `2. <b>Двойная проверка подписки:</b> Бот проверяет подписку при входе и повторно в момент розыгрыша (отписавшиеся автоматически заменяются).\n` +
      `3. <b>Вирусный рост и анти-бот:</b> Реферальные доп. билеты, математическая капча, фильтр по @username и Telegram Premium, баннеры с фото, авто-итоги по числу участников, CSV-экспорт и реролл.\n` +
      `4. <b>24/7 без сбоев:</b> Работает на Cloudflare Workers &amp; D1.`,

    choose_lang: '🌐 Пожалуйста, выберите язык / Choose language:',
    lang_set: '✅ Язык успешно изменён на Русский!',

    wizard_step_prize:
      `🎁 <b>Шаг 1/5: Приз</b>\n\n` +
      `Отправьте название приза (например: <i>Telegram Premium на 1 год</i> или <i>100 USDT</i>):`,
    wizard_need_prize_text: '⚠️ Пожалуйста, отправьте текстовое название приза.',
    wizard_step_description:
      `📝 <b>Шаг 2/5: Детали и баннер (по желанию)</b>\n\n` +
      `Отправьте описание/условия, <b>или прикрепите фото</b> (с подписью), либо нажмите «Пропустить»:`,
    wizard_photo_saved: '🖼️ Фото-баннер прикреплён!',
    wizard_step_winners:
      `🏆 <b>Шаг 3/5: Количество победителей</b>\n\n` +
      `Выберите готовый вариант ниже или введите число от 1 до 100:`,
    wizard_invalid_winners: '⚠️ Введите корректное число от 1 до 100.',
    wizard_step_channels:
      `📢 <b>Шаг 4/5: Обязательные каналы</b>\n\n` +
      `Добавьте каналы для подписки:\n` +
      `• Нажмите <b>Добавить бота в канал</b> ниже для подключения в 1 клик, <b>ИЛИ</b>\n` +
      `• Отправьте <code>@username</code> канала / перешлите пост из него.\n\n` +
      `⚠️ Бот @TemkaDrawBot должен быть <b>Администратором</b> (публикация и пригласительные ссылки).`,
    btn_add_bot_channel: '➕ Добавить бота в канал',
    btn_done_channels: '✅ Готово (каналы добавлены)',
    channel_added: (title, handle) =>
      `✅ Канал <b>${escapeHtml(title)}</b> (${escapeHtml(handle)}) добавлен! Добавьте ещё или нажмите <b>Готово</b>.`,
    channel_added_auto: (title, handle) =>
      `⚡ Бот автоматически определил назначение админом в <b>${escapeHtml(title)}</b> (${escapeHtml(handle)})! Нажмите <b>Готово</b> или добавьте ещё.`,
    channel_detect_error:
      '⚠️ Не удалось определить канал. Нажмите <b>Добавить бота в канал</b>, перешлите сообщение из канала или отправьте его <code>@username</code>.',
    channel_error_not_admin: (name) =>
      `❌ Нет прав администратора в <b>${escapeHtml(name)}</b>. Назначьте @TemkaDrawBot админом и попробуйте снова.`,
    need_at_least_one_channel: '⚠️ Сначала добавьте хотя бы один канал.',

    wizard_step_duration:
      `⏳ <b>Шаг 5/5: Условие завершения</b>\n\n` +
      `Когда нужно автоматически подвести итоги?`,
    btn_1_hour: '1 час',
    btn_6_hours: '6 часов',
    btn_24_hours: '24 часа',
    btn_3_days: '3 дня',
    btn_7_days: '7 дней',
    btn_custom_date: '📅 Точная дата и время',
    btn_by_count: '👥 По числу участников',
    wizard_step_custom_date:
      `📅 <b>Точная дата и время окончания</b>\n\n` +
      `Отправьте дату в UTC:\n` +
      `<code>ДД.ММ.ГГГГ ЧЧ:ММ</code> (напр. <code>25.11.2026 18:00</code>) или <code>ДД.ММ ЧЧ:ММ</code>:`,
    wizard_invalid_date: '⚠️ Неверный формат. Используйте <code>ДД.ММ.ГГГГ ЧЧ:ММ</code>.',
    wizard_date_in_past: '⚠️ Дата окончания должна быть в будущем!',
    wizard_step_count:
      `👥 <b>Авто-розыгрыш по числу участников</b>\n\n` +
      `Выберите целевое число участников (от 2 до 100 000) или введите своё число:`,
    wizard_invalid_count: '⚠️ Введите число от 2 до 100 000.',

    wizard_preview_title: '👀 <b>Предпросмотр розыгрыша</b>',
    preview_meta: ({ postLang, postChannelLabel, referralsEnabled, requireCaptcha, requireUsername, requirePremium }) => {
      const filters = [
        requireCaptcha ? 'Капча' : null,
        requireUsername ? '@username' : null,
        requirePremium ? 'Premium' : null
      ].filter(Boolean);
      return (
        `⚙️ Язык поста: <b>${postLang.toUpperCase()}</b> · Публикация в: <b>${escapeHtml(postChannelLabel)}</b>\n` +
        `🔗 Рефералы (+1 билет): <b>${referralsEnabled ? 'ВКЛ' : 'ВЫКЛ'}</b> · ` +
        `🛡️ Фильтры: <b>${filters.length ? filters.join(', ') : 'Нет'}</b>`
      );
    },
    btn_publish_to_channel: '🚀 Опубликовать в канале',
    btn_preview_edit: '✏️ Изменить',
    btn_preview_options: '⚙️ Опции и фильтры',
    btn_preview_lang: (postLang) => `🌐 Язык поста: ${postLang === 'ru' ? 'RU 🇷🇺' : 'EN 🇬🇧'}`,
    btn_back_preview: '🔙 Назад к предпросмотру',

    edit_menu_title: '✏️ <b>Что вы хотите изменить?</b>',
    btn_edit_prize: '🎁 Приз',
    btn_edit_desc: '📝 Детали / Фото',
    btn_edit_winners: '🏆 Победители',
    btn_edit_channels: '📢 Каналы',
    btn_edit_duration: '⏳ Условие стопа',

    options_menu_title:
      `⚙️ <b>Настройки роста и защиты от ботов</b>\n\n` +
      `Нажмите на параметр, чтобы переключить:`,
    btn_opt_referrals: (on) => `🔗 Бонус за друзей (+1 билет): ${on ? '✅ ВКЛ' : 'ВЫКЛ'}`,
    btn_opt_captcha: (on) => `🤖 Матем. капча: ${on ? '✅ ВКЛ' : 'ВЫКЛ'}`,
    btn_opt_username: (on) => `👤 Требовать @username: ${on ? '✅ ВКЛ' : 'ВЫКЛ'}`,
    btn_opt_premium: (on) => `⭐ Только Telegram Premium: ${on ? '✅ ВКЛ' : 'ВЫКЛ'}`,
    btn_opt_post_channel: (label) => `📣 Пост в: ${truncateText(label, 22)}`,

    session_expired: '⚠️ Сессия истекла. Отправьте /start, чтобы начать заново.',
    cancelled: '❌ Создание розыгрыша отменено.',

    publish_success: (channelLabel, postUrl) =>
      `🎉 <b>Розыгрыш успешно опубликован в ${escapeHtml(channelLabel)}!</b>` +
      (postUrl ? `\n\n🔗 Пост: <a href="${escapeHtml(postUrl)}">${escapeHtml(postUrl)}</a>` : ''),
    publish_failed: (channelLabel) =>
      `❌ Не удалось опубликовать в <b>${escapeHtml(channelLabel)}</b>. Проверьте право «Публикация сообщений» у @TemkaDrawBot!`,

    giveaway_card: (params) =>
      buildActiveCard(
        {
          heading: 'РОЗЫГРЫШ',
          winners: 'Победителей',
          channels: 'Условия участия (подписка)',
          ends: 'Окончание',
          endsAtCount: (n) => `Авто-итоги при <b>${n}</b> участниках`,
          hash: 'Хеш честности (SHA-256)',
          cta: 'Нажмите кнопку ниже для участия!',
          perkReferral: '+1 билет за друга',
          perkCaptcha: 'Анти-бот капча',
          perkUsername: 'Нужен @username',
          perkPremium: 'Только Premium'
        },
        params
      ),
    giveaway_finished_card: (params) =>
      buildFinishedCard(
        {
          heading: 'РОЗЫГРЫШ ЗАВЕРШЁН',
          winners: 'Победители',
          finished: 'Завершено',
          verification: 'Проверка честности (Provably Fair)',
          seedLabel: 'Сид',
          hashLabel: 'Хеш',
          verifyOnline: 'Проверить сид онлайн'
        },
        params
      ),
    giveaway_cancelled_card: (prize) =>
      `❌ <b>РОЗЫГРЫШ ОТМЕНЁН: ${escapeHtml(prize)}</b>\n\nОрганизатор отменил этот конкурс.`,

    btn_participate: (count) => `🎁 Участвовать (${count})`,
    btn_participating: (count) => `✅ Вы участвуете (${count})`,
    btn_channels_list: '📢 Каналы',
    btn_stats: '📊 Статистика',
    btn_invite_ticket: '🔗 +1 билет (Друзья)',
    btn_share_referral: '📤 Поделиться ссылкой',
    btn_create_own: '🎁 Запустить свой розыгрыш',
    btn_verify_seed: '🔍 Проверить сид онлайн',

    alert_already_participating: '✅ Вы уже участвуете в этом розыгрыше! Удачи!',
    alert_left_giveaway: '👋 Вы вышли из розыгрыша.\n\n(Нажмите «Участвовать» снова до окончания конкурса, чтобы вернуться!)',
    alert_success_joined: (tickets = 1, refEnabled = false) =>
      `🎉 Вы участвуете (билетов: ${tickets})!\n\n` +
      (refEnabled
        ? '🔗 Приглашайте друзей через @TemkaDrawBot (+1 билет за друга) и нажмите Старт в боте для уведомления о победе!'
        : '💡 Откройте @TemkaDrawBot и нажмите Старт, чтобы получить уведомление при победе!'),
    alert_must_subscribe: (missingList) =>
      `❌ Вы подписались не на все каналы:\n\n${missingList}\n\nПодпишитесь и нажмите «Участвовать» снова.`,
    alert_ended: '⏳ Этот розыгрыш уже завершён!',
    alert_cancelled: '❌ Этот розыгрыш был отменён организатором.',
    alert_need_username: '👤 Для участия в этом конкурсе нужен публичный @username в профиле Telegram.',
    alert_need_premium: '⭐ Этот розыгрыш доступен только для пользователей Telegram Premium.',
    captcha_prompt: (prize, question) =>
      `🤖 <b>Проверка от ботов — ${escapeHtml(prize)}</b>\n\nРешите пример для участия:\n<b>${escapeHtml(question)}</b>`,
    captcha_wrong: '❌ Неверный ответ! Попробуйте ещё раз.',

    dm_ticket_info: ({ tickets, referralsCount, refLink }) =>
      `\n\n🎟️ <b>Ваши билеты:</b> <b>${tickets}</b> (Приглашено друзей: ${referralsCount})\n` +
      (refLink ? `🔗 <b>Ваша реферальная ссылка (+1 билет):</b>\n<code>${escapeHtml(refLink)}</code>` : ''),
    share_referral_text: (prize) => `Участвуй в розыгрыше «${prize}» через @TemkaDrawBot!`,

    stats_popup: ({ count, totalTickets, winnersCount, seedHash, endLine }) =>
      `📊 <b>Статистика розыгрыша</b>\n\n` +
      `👥 Участников: <b>${count}</b> (🎟️ всего билетов: ${totalTickets})\n` +
      `🏆 Победителей: <b>${winnersCount}</b>\n` +
      `⏳ Условие: ${endLine}\n` +
      `🔒 SHA-256 хеш:\n<code>${escapeHtml(seedHash)}</code>`,

    winner_dm_notification: ({ prize, channel, contactUrl, contactLabel }) =>
      `🎉 <b>Поздравляем!</b>\n\n` +
      `Вы выиграли <b>${escapeHtml(prize)}</b> от <b>${escapeHtml(channel)}</b>.` +
      (contactUrl
        ? `\n\nСвяжитесь с организатором для получения приза:\n<a href="${escapeHtml(contactUrl)}">${escapeHtml(contactLabel || contactUrl)}</a>`
        : '\n\nПодробности получения приза смотрите в посте канала.'),
    btn_claim_shoutout: '💬 Связаться с организатором',

    creator_finish_dm: (prize, winnersText) =>
      `🏆 <b>Розыгрыш завершён: ${escapeHtml(prize)}</b>\n\n` +
      `Итоги подведены! Проверенные победители:\n\n` +
      (winnersText || 'Нет подходящих победителей.'),
    channel_empty_finish: (prize) => `🏁 <b>Розыгрыш завершён: ${escapeHtml(prize)}</b>\n\n😢 В конкурсе не было участников.`,
    channel_winners_reply: (prize, winnersText) => `🎉 <b>Поздравляем победителей розыгрыша «${escapeHtml(prize)}»!</b>\n\n${winnersText}`,
    channel_reroll_reply: (prize, winnerHandle) => `🎲 <b>Реролл победителя «${escapeHtml(prize)}»:</b>\n\nПоздравляем ${winnerHandle}!`,

    verify_usage:
      `🔐 <b>Проверка честности (SHA-256)</b>\n\n` +
      `Отправьте <code>/verify &lt;server_seed&gt;</code>, чтобы вычислить SHA-256 хеш и найти конкурс.\n\n` +
      `🌐 Онлайн-проверка:\n${WEB_URL}/#verify`,
    verify_result: ({ seed, hash, matchedGiveaway }) =>
      `🔐 <b>Проверка SHA-256 сида</b>\n\n` +
      `• Сид: <code>${escapeHtml(seed)}</code>\n` +
      `• Вычисленный SHA-256:\n<code>${escapeHtml(hash)}</code>\n` +
      (matchedGiveaway
        ? `\n✅ <b>Найден розыгрыш:</b> ${escapeHtml(matchedGiveaway.prize)} (<code>${escapeHtml(matchedGiveaway.public_id)}</code>, статус: ${escapeHtml(matchedGiveaway.status)})`
        : `\nℹ️ Сравните этот хеш с хешем из поста конкурса.`) +
      `\n\n🌐 <a href="${WEB_URL}/?seed=${encodeURIComponent(seed)}#verify">Открыть в веб-проверке</a>`,

    no_participants: '😢 В розыгрыше не было участников.',
    my_giveaways_empty: 'Вы ещё не создали ни одного розыгрыша. Нажмите «Создать розыгрыш», чтобы начать!',
    my_giveaways_title: '📋 <b>Мои розыгрыши</b>\n\nНажмите на любой конкурс для управления, реролла, клонирования или экспорта CSV:',
    manage_giveaway_card: ({ g, count, totalTickets, postUrl }) => {
      const statusMap = { active: '🟢 Активен', finished: '🏁 Завершён', cancelled: '❌ Отменён', finalizing: '⏳ Подведение', draft: '📝 Черновик' };
      const st = statusMap[g.status] || g.status;
      let msg =
        `🎛️ <b>Управление: ${escapeHtml(g.prize)}</b>\n\n` +
        `• Статус: <b>${st}</b>\n` +
        `• ID: <code>${escapeHtml(g.public_id)}</code> · Язык: <b>${(g.lang || 'en').toUpperCase()}</b>\n` +
        `• Участников: <b>${count}</b> (🎟️ билетов: ${totalTickets}) · Победителей: <b>${g.winners_count}</b>\n` +
        `• SHA-256 хеш:\n<code>${escapeHtml(g.seed_hash)}</code>\n`;
      if (g.status === 'finished' && g.server_seed) {
        msg += `• Сид: <code>${escapeHtml(g.server_seed)}</code>\n`;
      }
      if (postUrl) {
        msg += `• Пост: <a href="${escapeHtml(postUrl)}">Открыть в канале</a>\n`;
      }
      return msg;
    },
    btn_draw_early: '🎲 Разыграть сейчас',
    btn_reroll: '🎲 Реролл победителя',
    btn_clone: '🔁 Клонировать',
    btn_export_csv: '📥 Экспорт CSV',
    btn_cancel_giveaway: '❌ Отменить розыгрыш',
    alert_reroll_none: '⚠️ Больше нет подходящих подписанных участников для реролла.',
    reroll_done: (handle) => `🎲 Выбран новый победитель (реролл): ${handle}`,
    cancel_giveaway_done: '❌ Розыгрыш отменён, пост в канале обновлён.',
    export_empty: 'ℹ️ В этом розыгрыше пока 0 участников.',
    export_caption: (prize, count) => `📥 Экспорт CSV — ${prize} (${count} участников)`
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
  BOT_URL,
  WEB_URL,
  strings,
  t
};
