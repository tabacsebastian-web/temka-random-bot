const { Bot, InlineKeyboard, InputFile } = require('grammy');
const crypto = require('crypto');
const { BOT_URL, WEB_URL, t } = require('./i18n');
const fairness = require('./fairness');
const { parseSettings } = require('./db-helpers');
const {
  MAX_TELEGRAM_CAPTION,
  escapeHtml,
  buildParticipantsCsv,
  truncateText,
  signCaptchaToken,
  createCaptchaChallenge,
  buildChannelPostUrl,
  formatChannelLabel
} = require('./utils');

function getMainMenuKeyboard(lang) {
  return new InlineKeyboard()
    .text(t(lang, 'btn_create_giveaway'), 'menu_create').row()
    .text(t(lang, 'btn_my_giveaways'), 'menu_my').row()
    .text(t(lang, 'btn_language'), 'menu_lang')
    .text(t(lang, 'btn_help'), 'menu_help');
}

function getLanguageKeyboard(includeBack = false) {
  const kb = new InlineKeyboard()
    .text('🇬🇧 English', 'set_lang_en')
    .text('🇷🇺 Русский', 'set_lang_ru');
  if (includeBack) {
    kb.row().text('🔙 Back', 'menu_back');
  }
  return kb;
}

function getBotUsername(owner, fallback = 'TemkaDrawBot') {
  return (owner?.botInfo?.username || owner?.me?.username || fallback || 'TemkaDrawBot').replace(/^@/, '');
}

function buildPostActionKeyboard(lang, publicId, count, channels, settings = {}, botUsername = 'TemkaDrawBot', options = {}) {
  const { isDm = false, isJoined = false, refId = null } = options;
  const joinData = refId ? `join_${publicId}_r${refId}` : `join_${publicId}`;
  const joinLabel = isDm && isJoined
    ? t(lang, 'btn_participating', count)
    : t(lang, 'btn_participate', count);

  const kb = new InlineKeyboard().text(joinLabel, joinData).row();

  const primaryChannel = Array.isArray(channels) ? channels[0] : channels;
  const chUrl = primaryChannel?.invite_link || (primaryChannel?.username ? `https://t.me/${primaryChannel.username.replace(/^@/, '')}` : '');
  if (chUrl && !isDm) {
    kb.url(t(lang, 'btn_channels_list'), chUrl);
  }
  kb.text(t(lang, 'btn_stats'), `stats_${publicId}`);

  if (settings?.referralsEnabled && !isDm) {
    kb.row().url(t(lang, 'btn_invite_ticket'), `https://t.me/${botUsername}?start=join_${publicId}`);
  }
  return kb;
}

function formatDate(timestamp, lang) {
  const d = new Date(timestamp || Date.now());
  const locale = lang === 'ru' ? 'ru-RU' : 'en-US';
  return (
    d.toLocaleString(locale, {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) + ' UTC'
  );
}

function formatWinnerHandle(w) {
  if (w.username) {
    return `@${escapeHtml(String(w.username).replace(/^@/, ''))}`;
  }
  return `<a href="tg://user?id=${w.user_id}">${escapeHtml(w.first_name || 'User')}</a>`;
}

function parseCustomDate(input) {
  const str = input.trim();

  const m1 = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (m1) {
    const d = new Date(Date.UTC(
      parseInt(m1[3], 10),
      parseInt(m1[2], 10) - 1,
      parseInt(m1[1], 10),
      parseInt(m1[4], 10),
      parseInt(m1[5], 10)
    ));
    if (!isNaN(d.getTime())) return d.getTime();
  }

  const m2 = str.match(/^(\d{1,2})[./-](\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (m2) {
    const now = new Date();
    const day = parseInt(m2[1], 10);
    const month = parseInt(m2[2], 10) - 1;
    const year = now.getUTCFullYear();
    const hours = parseInt(m2[3], 10);
    const mins = parseInt(m2[4], 10);
    let d = new Date(Date.UTC(year, month, day, hours, mins));
    if (d.getTime() < Date.now() - 3600000) {
      d = new Date(Date.UTC(year + 1, month, day, hours, mins));
    }
    if (!isNaN(d.getTime())) return d.getTime();
  }

  const m3 = str.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (m3) {
    const d = new Date(Date.UTC(
      parseInt(m3[1], 10),
      parseInt(m3[2], 10) - 1,
      parseInt(m3[3], 10),
      parseInt(m3[4], 10),
      parseInt(m3[5], 10)
    ));
    if (!isNaN(d.getTime())) return d.getTime();
  }

  return null;
}

function recoverGiveawayFromMessage(publicId, message, defaultLang = 'en') {
  const txt = message?.text || message?.caption || '';
  if (!txt) return null;

  const isRu = /РОЗЫГРЫШ:/i.test(txt);
  const prizeMatch =
    txt.match(/GIVEAWAY:\s*(.+?)(?:\n|$)/i) ||
    txt.match(/РОЗЫГРЫШ:\s*(.+?)(?:\n|$)/i);
  const winnersMatch =
    txt.match(/Winners:\s*(\d+)/i) ||
    txt.match(/Победителей:\s*(\d+)/i) ||
    txt.match(/Количество победителей:\s*(\d+)/i);
  const hashMatch = txt.match(/([a-f0-9]{64})/);

  const prize = prizeMatch ? prizeMatch[1].trim() : 'Giveaway';
  const winnersCount = winnersMatch ? parseInt(winnersMatch[1], 10) : 1;
  const seedHash = hashMatch ? hashMatch[1] : '';

  const chat = message.chat;
  const channelObj = {
    id: chat.id,
    title: chat.title || 'Channel',
    username: chat.username || ''
  };

  let endAt = Date.now() + 3 * 86400000;
  const endsMatch =
    txt.match(/Ends:\s*(.+?)(?:\n|$)/i) ||
    txt.match(/Окончание:\s*(.+?)(?:\n|$)/i);
  if (endsMatch) {
    const rawDate = endsMatch[1].replace(/UTC/i, '').trim();
    const year = new Date().getUTCFullYear();
    const parsed = Date.parse(`${rawDate} ${year} UTC`) || Date.parse(rawDate);
    if (!isNaN(parsed) && parsed > Date.now()) {
      endAt = parsed;
    }
  }

  const { serverSeed } = fairness.generateSeed();

  return {
    public_id: publicId,
    creator_id: 0,
    prize,
    description: '',
    winners_count: winnersCount,
    required_channels: [channelObj],
    target_chat_id: String(chat.id),
    channel_post_chat_id: String(chat.id),
    channel_post_message_id: message.message_id,
    status: 'active',
    end_type: 'time',
    end_at: endAt,
    end_count: 0,
    seed_hash: seedHash,
    server_seed: serverSeed,
    lang: isRu ? 'ru' : defaultLang,
    settings: parseSettings({ hasPhoto: Boolean(message.photo && message.photo.length > 0) })
  };
}

async function getOrRecoverGiveaway(db, publicId, message, defaultLang = 'en') {
  let g = await db.giveaways.getByPublicId(publicId);
  if (!g && message) {
    const recovered = recoverGiveawayFromMessage(publicId, message, defaultLang);
    if (recovered) {
      try {
        const gid = await db.giveaways.create(recovered);
        g = await db.giveaways.getById(gid);
      } catch (err) {
        g = await db.giveaways.getByPublicId(publicId);
      }
    }
  }
  return g;
}

async function isUserSubscribed(api, chatId, userId) {
  try {
    const member = await api.getChatMember(chatId, userId);
    return (
      ['creator', 'administrator', 'member', 'restricted'].includes(member.status) &&
      (member.status !== 'restricted' || member.is_member !== false)
    );
  } catch (err) {
    return false;
  }
}

async function verifyAndAddChannel(api, botId, sessionData, targetChat) {
  const botMember = await api.getChatMember(targetChat.id, botId);
  const isAdmin = ['administrator', 'creator'].includes(botMember.status);
  const canPost =
    botMember.status === 'creator' ||
    targetChat.type !== 'channel' ||
    botMember.can_post_messages !== false;

  if (!isAdmin || !canPost) {
    return { ok: false, reason: 'not_admin' };
  }

  let inviteLink = null;
  if (targetChat.username) {
    inviteLink = `https://t.me/${targetChat.username}`;
  } else {
    try {
      inviteLink = await api.exportChatInviteLink(targetChat.id);
    } catch (e1) {
      try {
        const linkObj = await api.createChatInviteLink(targetChat.id, { creates_join_request: false });
        inviteLink = linkObj.invite_link;
      } catch (e2) {}
    }
  }

  sessionData.channels = sessionData.channels || [];
  if (!sessionData.channels.some((c) => String(c.id) === String(targetChat.id))) {
    sessionData.channels.push({
      id: targetChat.id,
      title: targetChat.title || targetChat.username || 'Channel',
      username: targetChat.username || '',
      invite_link: inviteLink
    });
  }

  const title = targetChat.title || targetChat.username || 'Channel';
  const cleanHandle = targetChat.username ? targetChat.username.replace(/^@/, '') : '';
  const handle = cleanHandle ? `@${cleanHandle}` : 'Private Channel';
  return { ok: true, title, handle };
}

/**
 * Edits the callback message in-place (handling photo vs text messages), falling back to reply.
 */
async function editOrReply(ctx, text, extra = {}) {
  const msg = ctx.callbackQuery?.message;
  try {
    if (msg?.photo && msg.photo.length > 0) {
      if (text.length <= MAX_TELEGRAM_CAPTION) {
        await ctx.editMessageCaption({ caption: text, ...extra });
        return;
      }
    } else if (msg) {
      await ctx.editMessageText(text, extra);
      return;
    }
  } catch (err) {
    if (String(err?.description || err?.message || '').includes('message is not modified')) {
      return;
    }
  }
  await ctx.reply(text, extra);
}

/**
 * Sends or edits a channel giveaway post supporting optional photo banner with automatic caption fitting.
 */
async function sendChannelGiveawayPost(api, chatId, photoFileId, fullText, captionText, replyMarkup) {
  if (photoFileId && captionText.length <= MAX_TELEGRAM_CAPTION) {
    try {
      const sent = await api.sendPhoto(chatId, photoFileId, {
        caption: captionText,
        parse_mode: 'HTML',
        reply_markup: replyMarkup
      });
      return { sentMsg: sent, usedPhoto: true };
    } catch (err) {
      console.error('sendPhoto failed, falling back to text post:', err.message);
    }
  }
  const sent = await api.sendMessage(chatId, fullText, {
    parse_mode: 'HTML',
    reply_markup: replyMarkup,
    disable_web_page_preview: true
  });
  return { sentMsg: sent, usedPhoto: false };
}

async function editChannelPost(api, g, fullText, captionText, replyMarkup) {
  if (!g.channel_post_chat_id || !g.channel_post_message_id) return;
  const preferCaption = Boolean(g.settings?.hasPhoto || g.photo_file_id);
  if (preferCaption && captionText.length <= MAX_TELEGRAM_CAPTION) {
    try {
      await api.editMessageCaption(g.channel_post_chat_id, g.channel_post_message_id, {
        caption: captionText,
        parse_mode: 'HTML',
        reply_markup: replyMarkup
      });
      return;
    } catch (err) {}
  }
  try {
    await api.editMessageText(g.channel_post_chat_id, g.channel_post_message_id, fullText, {
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
      disable_web_page_preview: true
    });
  } catch (err) {
    console.error('Error editing channel post:', err.message);
  }
}

const USER_CACHE_TTL_MS = 120000;
const USER_CACHE_MAX_SIZE = 2000;
const STATS_CACHE_TTL_MS = 60000;
const STATS_STALE_TTL_MS = 300000;
const COUNTER_EDIT_DEBOUNCE_MS = 1500;

function answerCb(ctx, opts = undefined) {
  if (!ctx.callbackQuery) return Promise.resolve();
  return ctx.answerCallbackQuery(opts).catch(() => {});
}

/**
 * Creates a configured grammY Bot instance and giveaway finalization helpers
 * using either the sync Node SQLite adapter or the async Cloudflare D1 adapter.
 */
function createBot({
  token,
  db,
  defaultLang = 'en',
  botInfo = undefined,
  botUsername: explicitUsername = '',
  caches = undefined,
  scheduleBackground = undefined
}) {
  const bot = new Bot(token, botInfo ? { botInfo } : undefined);
  const runtimeCaches = caches || {
    users: new Map(),
    stats: { value: null, updatedAt: 0 },
    channelRefresh: new Map()
  };
  const runBg = typeof scheduleBackground === 'function'
    ? scheduleBackground
    : (promise) => {
        Promise.resolve(promise).catch(() => {});
      };

  function cacheUserEntry(userId, lang, lastActiveAt) {
    const key = String(userId);
    if (runtimeCaches.users.size >= USER_CACHE_MAX_SIZE && !runtimeCaches.users.has(key)) {
      const oldestKey = runtimeCaches.users.keys().next().value;
      if (oldestKey !== undefined) runtimeCaches.users.delete(oldestKey);
    }
    runtimeCaches.users.set(key, {
      lang: ['en', 'ru'].includes(lang) ? lang : defaultLang,
      lastActiveAt: Number(lastActiveAt || 0),
      expiresAt: Date.now() + USER_CACHE_TTL_MS
    });
  }

  bot.catch((err) => {
    console.error('[Bot] Handler error:', err);
  });

  bot.use(async (ctx, next) => {
    if (ctx.from) {
      const now = Date.now();
      const cacheKey = String(ctx.from.id);
      const cached = runtimeCaches.users.get(cacheKey);
      let userLang;

      if (cached && cached.expiresAt > now) {
        userLang = cached.lang;
        if (db.users.touch && (!cached.lastActiveAt || now - cached.lastActiveAt > 3600000)) {
          cached.lastActiveAt = now;
          runBg(db.users.touch(ctx.from.id));
        }
      } else {
        let user = await db.users.get(ctx.from.id);
        if (!user) {
          const lc = (ctx.from.language_code || '').toLowerCase();
          userLang = lc.startsWith('ru') ? 'ru' : defaultLang;
          await db.users.upsert(ctx.from.id, ctx.from.username, ctx.from.first_name, userLang);
          cacheUserEntry(ctx.from.id, userLang, now);
        } else {
          userLang = ['en', 'ru'].includes(user.lang) ? user.lang : defaultLang;
          let activeAt = Number(user.last_active_at || 0);
          if (db.users.touch && (!activeAt || now - activeAt > 3600000)) {
            activeAt = now;
            runBg(db.users.touch(ctx.from.id));
          }
          cacheUserEntry(ctx.from.id, userLang, activeAt);
        }
      }

      ctx.lang = userLang;
    } else {
      ctx.lang = defaultLang;
    }
    ctx.t = (key, ...args) => t(ctx.lang, key, ...args);
    ctx.botUsername = getBotUsername(ctx, explicitUsername || bot.botInfo?.username);
    await next();
  });

  function resolvePostLang(g, message = null) {
    if (g?.lang === 'ru' || g?.lang === 'en') return g.lang;
    const msgText = message?.text || message?.caption || '';
    if (msgText && /РОЗЫГРЫШ:/i.test(msgText)) return 'ru';
    return defaultLang;
  }

  function buildStepChannelsKeyboard(lang, channels, botUsername) {
    const kb = new InlineKeyboard()
      .url(
        t(lang, 'btn_add_bot_channel'),
        `https://t.me/${botUsername}?startchannel=true&admin=post_messages+edit_messages+invite_users`
      )
      .row();
    if (Array.isArray(channels) && channels.length > 0) {
      kb.text(t(lang, 'btn_done_channels'), 'wizard_done_channels').row();
    }
    kb.text(t(lang, 'btn_cancel'), 'wizard_cancel');
    return kb;
  }

  function buildWinnersKeyboard(lang) {
    return new InlineKeyboard()
      .text('1', 'win_cnt_1')
      .text('3', 'win_cnt_3')
      .text('5', 'win_cnt_5')
      .text('10', 'win_cnt_10')
      .row()
      .text(t(lang, 'btn_cancel'), 'wizard_cancel');
  }

  function buildDurationKeyboard(lang) {
    return new InlineKeyboard()
      .text(t(lang, 'btn_1_hour'), 'dur_3600000')
      .text(t(lang, 'btn_6_hours'), 'dur_21600000').row()
      .text(t(lang, 'btn_24_hours'), 'dur_86400000')
      .text(t(lang, 'btn_3_days'), 'dur_259200000').row()
      .text(t(lang, 'btn_7_days'), 'dur_604800000')
      .text(t(lang, 'btn_custom_date'), 'dur_custom').row()
      .text(t(lang, 'btn_by_count'), 'dur_count').row()
      .text(t(lang, 'btn_cancel'), 'wizard_cancel');
  }

  function buildTargetCountKeyboard(lang) {
    return new InlineKeyboard()
      .text('50', 'cnt_50')
      .text('100', 'cnt_100')
      .text('250', 'cnt_250').row()
      .text('500', 'cnt_500')
      .text('1000', 'cnt_1000').row()
      .text(t(lang, 'btn_cancel'), 'wizard_cancel');
  }

  function buildPreviewKeyboard(uiLang, postLang) {
    return new InlineKeyboard()
      .text(t(uiLang, 'btn_publish_to_channel'), 'wizard_publish').row()
      .text(t(uiLang, 'btn_preview_edit'), 'preview_edit')
      .text(t(uiLang, 'btn_preview_options'), 'preview_options').row()
      .text(t(uiLang, 'btn_preview_lang', postLang), 'preview_toggle_lang')
      .text(t(uiLang, 'btn_cancel'), 'wizard_cancel');
  }

  function renderPreviewPayload(uiLang, data) {
    const postLang = data.lang === 'ru' ? 'ru' : (data.lang === 'en' ? 'en' : uiLang);
    const settings = parseSettings(data.settings);
    const channels = data.channels || [];
    const postCh = channels[settings.postChannelIndex || 0] || channels[0];

    const card = t(postLang, 'giveaway_card', {
      prize: data.prize,
      description: data.description,
      winnersCount: data.winners_count,
      channels,
      endType: data.end_type || 'time',
      endAtFormatted: formatDate(data.end_at, postLang),
      endCount: data.end_count || 0,
      seedHash: data.seed_hash,
      settings,
      forCaption: Boolean(data.photo_file_id)
    });

    const meta = t(uiLang, 'preview_meta', {
      postLang,
      postChannelLabel: formatChannelLabel(postCh),
      referralsEnabled: settings.referralsEnabled,
      requireCaptcha: settings.requireCaptcha,
      requireUsername: settings.requireUsername,
      requirePremium: settings.requirePremium
    });

    const fullText = `${t(uiLang, 'wizard_preview_title')}\n${meta}\n\n${card}`;
    return {
      text: fullText,
      kb: buildPreviewKeyboard(uiLang, postLang),
      postLang
    };
  }

  async function getPublicStatsFast() {
    if (!db.stats?.getPublicStats) return null;
    const now = Date.now();
    const cache = runtimeCaches.stats;
    if (cache.value && now - cache.updatedAt < STATS_CACHE_TTL_MS) {
      return cache.value;
    }
    if (cache.value && now - cache.updatedAt < STATS_STALE_TTL_MS) {
      runBg(
        Promise.resolve(db.stats.getPublicStats()).then((fresh) => {
          cache.value = fresh;
          cache.updatedAt = Date.now();
        })
      );
      return cache.value;
    }
    const fresh = await db.stats.getPublicStats();
    cache.value = fresh;
    cache.updatedAt = Date.now();
    return fresh;
  }

  async function sendWelcomeMenu(ctx) {
    const name = ctx.from?.first_name || 'Friend';
    let text = ctx.t('welcome', name);
    try {
      const stats = await getPublicStatsFast();
      if (stats) {
        text += ctx.t('welcome_stats', stats);
      }
    } catch (err) {}
    await ctx.reply(text, {
      parse_mode: 'HTML',
      reply_markup: getMainMenuKeyboard(ctx.lang)
    });
  }

  async function startCreateWizard(ctx) {
    if (!ctx.from) return;
    await Promise.all([
      db.sessions.set(ctx.from.id, 'step_prize', {
        channels: [],
        lang: ctx.lang,
        end_type: 'time',
        end_count: 0,
        photo_file_id: null,
        settings: parseSettings({ creatorUsername: ctx.from.username || '' })
      }),
      ctx.reply(ctx.t('wizard_step_prize'), {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().text(ctx.t('btn_cancel'), 'wizard_cancel')
      })
    ]);
  }

  async function showGiveawayPreview(ctx, session, { reuseSeed = false, editInPlace = false } = {}) {
    const data = session.data || {};
    if (!reuseSeed || !data.seed_hash || !data.server_seed || !data.public_id) {
      const { serverSeed, seedHash } = fairness.generateSeed();
      data.seed_hash = seedHash;
      data.server_seed = serverSeed;
      data.public_id = crypto.randomBytes(4).toString('hex');
    }
    data.returnToPreview = false;
    data.settings = parseSettings(data.settings);
    if (!data.lang) data.lang = ctx.lang;

    const { text, kb } = renderPreviewPayload(ctx.lang, data);

    const sendPreview = async () => {
      if (editInPlace) {
        await editOrReply(ctx, text, {
          parse_mode: 'HTML',
          reply_markup: kb,
          disable_web_page_preview: true
        });
        return;
      }

      if (data.photo_file_id && text.length <= MAX_TELEGRAM_CAPTION) {
        try {
          await ctx.replyWithPhoto(data.photo_file_id, {
            caption: text,
            parse_mode: 'HTML',
            reply_markup: kb
          });
          return;
        } catch (err) {}
      }

      await ctx.reply(text, {
        parse_mode: 'HTML',
        reply_markup: kb,
        disable_web_page_preview: true
      });
    };

    await Promise.all([
      db.sessions.set(ctx.from.id, 'preview', data),
      sendPreview()
    ]);
  }

  async function sendCaptchaChallenge(ctx, g, refId = null) {
    if (!ctx.from) return;
    const challenge = createCaptchaChallenge(token, ctx.from.id, g.public_id);
    const sigShort = challenge.sig.slice(0, 8);
    const refSuffix = refId ? `_${refId}` : '';

    const kb = new InlineKeyboard();
    challenge.choices.forEach((choice, idx) => {
      kb.text(String(choice), `cap_${g.public_id}_${choice}_${challenge.answer}_${sigShort}${refSuffix}`);
      if (idx % 2 === 1 && idx < challenge.choices.length - 1) kb.row();
    });

    await ctx.reply(ctx.t('captcha_prompt', g.prize, challenge.question), {
      parse_mode: 'HTML',
      reply_markup: kb
    });
  }

  async function applyChannelPostMarkup(g, count) {
    const postLang = resolvePostLang(g);
    await bot.api.editMessageReplyMarkup(g.channel_post_chat_id, g.channel_post_message_id, {
      reply_markup: buildPostActionKeyboard(
        postLang,
        g.public_id,
        count,
        g.required_channels,
        g.settings,
        getBotUsername({ botInfo: bot.botInfo }, explicitUsername)
      )
    });
  }

  async function refreshChannelPostCounter(g, knownCount = undefined) {
    if (!g.channel_post_chat_id || !g.channel_post_message_id) return;
    const key = String(g.id);
    const state = runtimeCaches.channelRefresh.get(key) || { lastEditAt: 0, pending: false };
    runtimeCaches.channelRefresh.set(key, state);

    const now = Date.now();
    if (now - state.lastEditAt >= COUNTER_EDIT_DEBOUNCE_MS) {
      state.lastEditAt = now;
      try {
        const count = knownCount !== undefined ? knownCount : await db.participants.count(g.id);
        await applyChannelPostMarkup(g, count);
      } catch (err) {}
      return;
    }

    if (state.pending) return;
    state.pending = true;
    try {
      await new Promise((resolve) => setTimeout(resolve, COUNTER_EDIT_DEBOUNCE_MS));
      state.pending = false;
      state.lastEditAt = Date.now();
      const latestCount = await db.participants.count(g.id);
      await applyChannelPostMarkup(g, latestCount);
    } catch (err) {
      state.pending = false;
    }
  }

  async function renderDmJoinView(ctx, g, refId = null, knownState = null) {
    const botUsername = ctx.botUsername;
    let participantsCount;
    let isJoined;
    let extraTickets;

    if (knownState) {
      participantsCount = knownState.count;
      isJoined = Boolean(knownState.isJoined);
      extraTickets = Math.max(0, Number(knownState.extraTickets) || 0);
    } else {
      const [count, participantRow] = await Promise.all([
        db.participants.count(g.id),
        ctx.from ? db.participants.get(g.id, ctx.from.id) : null
      ]);
      participantsCount = count;
      isJoined = Boolean(participantRow);
      extraTickets = Math.max(0, Number(participantRow?.extra_tickets) || 0);
    }

    let text = ctx.t('giveaway_card', {
      prize: g.prize,
      description: g.description,
      winnersCount: g.winners_count,
      channels: g.required_channels,
      endType: g.end_type || 'time',
      endAtFormatted: formatDate(g.end_at, ctx.lang),
      endCount: g.end_count || 0,
      seedHash: g.seed_hash,
      settings: g.settings,
      forCaption: false
    });

    const kb = buildPostActionKeyboard(ctx.lang, g.public_id, participantsCount, g.required_channels, g.settings, botUsername, {
      isDm: true,
      isJoined,
      refId
    });

    if (isJoined && g.settings?.referralsEnabled && ctx.from) {
      const refLink = `https://t.me/${botUsername}?start=ref_${g.public_id}_${ctx.from.id}`;
      text += ctx.t('dm_ticket_info', {
        tickets: 1 + extraTickets,
        referralsCount: extraTickets,
        refLink
      });
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent(ctx.t('share_referral_text', g.prize))}`;
      kb.row().url(ctx.t('btn_share_referral'), shareUrl);
    }

    await ctx.reply(text, {
      parse_mode: 'HTML',
      reply_markup: kb,
      disable_web_page_preview: true
    });
  }

  async function renderManagePanel(ctx, g, { edit = true } = {}) {
    const participants = await db.participants.listForGiveaway(g.id);
    const count = participants.length;
    const totalTickets = participants.reduce((acc, p) => acc + Math.min(1 + Math.max(0, Number(p.extra_tickets) || 0), 100), 0);
    const primaryCh = g.required_channels?.[g.settings?.postChannelIndex || 0] || g.required_channels?.[0];
    const postUrl = buildChannelPostUrl(primaryCh, g.channel_post_chat_id, g.channel_post_message_id);

    const text = ctx.t('manage_giveaway_card', { g, count, totalTickets, postUrl });
    const kb = new InlineKeyboard();

    if (g.status === 'active') {
      kb.text(ctx.t('btn_draw_early'), `early_${g.public_id}`)
        .text(ctx.t('btn_cancel_giveaway'), `cancel_g_${g.public_id}`)
        .row();
    } else if (g.status === 'finished') {
      kb.text(ctx.t('btn_reroll'), `reroll_${g.public_id}`).row();
      if (g.server_seed) {
        kb.url(ctx.t('btn_verify_seed'), `${WEB_URL}/?seed=${encodeURIComponent(g.server_seed)}#verify`).row();
      }
    }

    kb.text(ctx.t('btn_export_csv'), `export_${g.public_id}`)
      .text(ctx.t('btn_clone'), `clone_${g.public_id}`)
      .row()
      .text(ctx.t('btn_back'), 'menu_my');

    if (edit) {
      await editOrReply(ctx, text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
    }
  }

  async function renderMyGiveawaysList(ctx, { edit = false } = {}) {
    if (!ctx.from) return;
    const list = db.giveaways.listByCreatorWithCounts
      ? await db.giveaways.listByCreatorWithCounts(ctx.from.id)
      : await db.giveaways.listByCreator(ctx.from.id);
    if (!list || list.length === 0) {
      return ctx.reply(ctx.t('my_giveaways_empty'), {
        reply_markup: getMainMenuKeyboard(ctx.lang)
      });
    }

    const kb = new InlineKeyboard();
    for (const g of list.slice(0, 10)) {
      const emoji =
        g.status === 'active' ? '🟢' : g.status === 'finished' ? '🏁' : g.status === 'cancelled' ? '❌' : '📝';
      const cnt = g.participant_count !== undefined ? g.participant_count : await db.participants.count(g.id);
      const label = `${emoji} ${truncateText(g.prize, 28)} (${cnt})`;
      kb.text(label, `manage_${g.public_id}`).row();
    }
    kb.text(ctx.t('btn_back'), 'menu_back');

    const payload = { parse_mode: 'HTML', reply_markup: kb };
    if (edit) {
      await editOrReply(ctx, ctx.t('my_giveaways_title'), payload);
    } else {
      await ctx.reply(ctx.t('my_giveaways_title'), payload);
    }
  }

  async function completeParticipantJoin(ctx, g, refId = null, { sendDmFollowup = false } = {}) {
    const userId = ctx.from.id;
    let extraTickets = 0;
    let newCount = 0;

    if (db.participants.joinFast) {
      const res = await db.participants.joinFast(g.id, userId, ctx.from.username, ctx.from.first_name, refId);
      extraTickets = res.extraTickets;
      newCount = res.count;
    } else {
      await db.participants.add(g.id, userId, ctx.from.username, ctx.from.first_name, refId);
      const [participantRow, count] = await Promise.all([
        db.participants.get(g.id, userId),
        db.participants.count(g.id)
      ]);
      extraTickets = Number(participantRow?.extra_tickets || 0);
      newCount = count;
    }

    const myTickets = 1 + Math.max(0, Number(extraTickets) || 0);
    const isDm = ctx.chat?.type === 'private' || ctx.callbackQuery?.message?.chat?.type === 'private';

    const uiTasks = [];
    if (ctx.callbackQuery) {
      uiTasks.push(
        answerCb(ctx, {
          text: ctx.t('alert_success_joined', myTickets, Boolean(g.settings?.referralsEnabled)),
          show_alert: true
        })
      );
    }
    if (isDm && (sendDmFollowup || ctx.callbackQuery?.message)) {
      uiTasks.push(
        renderDmJoinView(ctx, g, refId, {
          count: newCount,
          extraTickets,
          isJoined: true
        })
      );
    }

    runBg(refreshChannelPostCounter(g, newCount));
    if (g.end_type === 'participants' && g.end_count > 0 && newCount >= g.end_count) {
      runBg(finalizeGiveaway(g.id));
    }

    await Promise.all(uiTasks);
  }

  async function finishStepPrompt(ctx, stepName, sessionData) {
    const replyTask = (() => {
      if (stepName === 'step_prize') {
        return ctx.reply(ctx.t('wizard_step_prize'), {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard().text(ctx.t('btn_cancel'), 'wizard_cancel')
        });
      }
      if (stepName === 'step_desc') {
        return ctx.reply(ctx.t('wizard_step_description'), {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .text(ctx.t('btn_skip'), 'wizard_skip_desc').row()
            .text(ctx.t('btn_cancel'), 'wizard_cancel')
        });
      }
      if (stepName === 'step_winners') {
        return ctx.reply(ctx.t('wizard_step_winners'), {
          parse_mode: 'HTML',
          reply_markup: buildWinnersKeyboard(ctx.lang)
        });
      }
      if (stepName === 'step_channels') {
        return ctx.reply(ctx.t('wizard_step_channels'), {
          parse_mode: 'HTML',
          reply_markup: buildStepChannelsKeyboard(ctx.lang, sessionData.channels, ctx.botUsername)
        });
      }
      if (stepName === 'step_duration') {
        return ctx.reply(ctx.t('wizard_step_duration'), {
          parse_mode: 'HTML',
          reply_markup: buildDurationKeyboard(ctx.lang)
        });
      }
      return Promise.resolve();
    })();

    await Promise.all([
      db.sessions.set(ctx.from.id, stepName, sessionData),
      replyTask
    ]);
  }

  // ==================== COMMANDS ====================

  bot.command('start', async (ctx) => {
    const payload = (ctx.match || '').trim();
    if (payload === 'create') {
      return startCreateWizard(ctx);
    }

    const refMatch = payload.match(/^ref_([a-f0-9]+)_(\d+)$/);
    if (refMatch) {
      if (ctx.from && db.giveaways.getWithParticipant) {
        const info = await db.giveaways.getWithParticipant(refMatch[1], ctx.from.id);
        if (info?.giveaway) {
          return renderDmJoinView(ctx, info.giveaway, Number(refMatch[2]), {
            count: info.participantsCount,
            extraTickets: info.extraTickets,
            isJoined: info.isJoined
          });
        }
      } else {
        const g = await db.giveaways.getByPublicId(refMatch[1]);
        if (g) {
          return renderDmJoinView(ctx, g, Number(refMatch[2]));
        }
      }
    }

    const captchaMatch = payload.match(/^captcha_([a-f0-9]+)(?:_(\d+))?$/);
    if (captchaMatch) {
      const g = await db.giveaways.getByPublicId(captchaMatch[1]);
      if (g && g.status === 'active') {
        const refId = captchaMatch[2] ? Number(captchaMatch[2]) : null;
        return sendCaptchaChallenge(ctx, g, refId);
      }
    }

    if (payload && payload.startsWith('join_')) {
      const publicId = payload.replace('join_', '');
      if (ctx.from && db.giveaways.getWithParticipant) {
        const info = await db.giveaways.getWithParticipant(publicId, ctx.from.id);
        if (info?.giveaway) {
          return renderDmJoinView(ctx, info.giveaway, null, {
            count: info.participantsCount,
            extraTickets: info.extraTickets,
            isJoined: info.isJoined
          });
        }
      } else {
        const g = await db.giveaways.getByPublicId(publicId);
        if (g) {
          return renderDmJoinView(ctx, g, null);
        }
      }
    }

    await sendWelcomeMenu(ctx);
  });

  bot.command('my', async (ctx) => {
    await renderMyGiveawaysList(ctx, { edit: false });
  });

  bot.command('cancel', async (ctx) => {
    if (ctx.from) {
      await Promise.all([
        db.sessions.clear(ctx.from.id),
        ctx.reply(ctx.t('cancelled'), {
          reply_markup: getMainMenuKeyboard(ctx.lang)
        })
      ]);
    }
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(ctx.t('help_text'), {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: getMainMenuKeyboard(ctx.lang)
    });
  });

  bot.command('verify', async (ctx) => {
    const seed = (ctx.match || '').trim();
    if (!seed) {
      return ctx.reply(ctx.t('verify_usage'), {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: getMainMenuKeyboard(ctx.lang)
      });
    }
    const hash = crypto.createHash('sha256').update(seed).digest('hex');
    const matchedGiveaway = db.giveaways.getBySeedHash ? await db.giveaways.getBySeedHash(hash) : null;
    await ctx.reply(ctx.t('verify_result', { seed, hash, matchedGiveaway }), {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: getMainMenuKeyboard(ctx.lang)
    });
  });

  bot.command(['lang', 'language'], async (ctx) => {
    await ctx.reply(ctx.t('choose_lang'), { reply_markup: getLanguageKeyboard(false) });
  });

  // ==================== MENU & PROFILE CALLBACKS ====================

  bot.callbackQuery(/^set_lang_(en|ru)$/, async (ctx) => {
    const chosen = ctx.match[1];
    if (ctx.from) {
      ctx.lang = chosen;
      cacheUserEntry(ctx.from.id, chosen, Date.now());
      await Promise.all([
        db.users.setLang(ctx.from.id, chosen),
        answerCb(ctx),
        ctx.reply(t(chosen, 'lang_set'), {
          reply_markup: getMainMenuKeyboard(chosen)
        })
      ]);
    }
  });

  bot.callbackQuery('menu_help', async (ctx) => {
    await Promise.all([
      answerCb(ctx),
      ctx.reply(ctx.t('help_text'), {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: new InlineKeyboard().text(ctx.t('btn_back'), 'menu_back')
      })
    ]);
  });

  bot.callbackQuery('menu_lang', async (ctx) => {
    await Promise.all([
      answerCb(ctx),
      ctx.reply(ctx.t('choose_lang'), { reply_markup: getLanguageKeyboard(true) })
    ]);
  });

  bot.callbackQuery('menu_back', async (ctx) => {
    await Promise.all([
      answerCb(ctx),
      sendWelcomeMenu(ctx)
    ]);
  });

  bot.callbackQuery('menu_my', async (ctx) => {
    await Promise.all([
      answerCb(ctx),
      renderMyGiveawaysList(ctx, { edit: true })
    ]);
  });

  bot.callbackQuery('menu_create', async (ctx) => {
    await Promise.all([
      answerCb(ctx),
      startCreateWizard(ctx)
    ]);
  });

  bot.callbackQuery('wizard_cancel', async (ctx) => {
    await Promise.all([
      answerCb(ctx),
      ctx.from ? db.sessions.clear(ctx.from.id) : Promise.resolve(),
      ctx.reply(ctx.t('cancelled'), {
        reply_markup: getMainMenuKeyboard(ctx.lang)
      })
    ]);
  });

  // ==================== 1-TAP AUTO-DETECT CHANNEL PROMOTION ====================

  bot.on('my_chat_member', async (ctx) => {
    const update = ctx.myChatMember;
    if (!update || !update.from || !update.chat) return;
    if (!['channel', 'supergroup'].includes(update.chat.type)) return;

    const newStatus = update.new_chat_member?.status;
    if (!['administrator', 'creator'].includes(newStatus)) return;

    const session = await db.sessions.get(update.from.id);
    if (!session || session.step !== 'step_channels') return;

    try {
      const botId = ctx.me?.id || bot.botInfo?.id;
      const result = await verifyAndAddChannel(ctx.api, botId, session.data, update.chat);
      if (!result.ok) return;

      await db.sessions.set(update.from.id, 'step_channels', session.data);
      const userObj = await db.users.get(update.from.id);
      const uLang = userObj?.lang === 'ru' ? 'ru' : defaultLang;
      await ctx.api.sendMessage(update.from.id, t(uLang, 'channel_added_auto', result.title, result.handle), {
        parse_mode: 'HTML',
        reply_markup: buildStepChannelsKeyboard(uLang, session.data.channels, ctx.botUsername)
      });
    } catch (err) {}
  });

  // ==================== WIZARD MESSAGE HANDLERS ====================

  bot.on('message', async (ctx) => {
    if (!ctx.from) return;
    if (ctx.chat?.type && ctx.chat.type !== 'private') return;

    const session = await db.sessions.get(ctx.from.id);
    if (!session) return;

    const text = (ctx.message.text || ctx.message.caption || '').trim();
    const photos = ctx.message.photo;
    const photoFileId = Array.isArray(photos) && photos.length > 0 ? photos[photos.length - 1].file_id : null;

    if (session.step === 'step_prize') {
      if (!text || text.length > 150) {
        return ctx.reply(ctx.t('wizard_need_prize_text'));
      }
      session.data.prize = text;
      if (session.data.returnToPreview) {
        return showGiveawayPreview(ctx, session, { reuseSeed: true });
      }
      return finishStepPrompt(ctx, 'step_desc', session.data);
    }

    if (session.step === 'step_desc') {
      if (photoFileId) {
        session.data.photo_file_id = photoFileId;
      }
      if (text && text !== '/skip') {
        session.data.description = text;
      } else if (!photoFileId) {
        session.data.description = '';
      }
      if (photoFileId) {
        await ctx.reply(ctx.t('wizard_photo_saved'));
      }
      if (session.data.returnToPreview) {
        return showGiveawayPreview(ctx, session, { reuseSeed: true });
      }
      return finishStepPrompt(ctx, 'step_winners', session.data);
    }

    if (session.step === 'step_winners') {
      const num = parseInt(text, 10);
      if (isNaN(num) || num < 1 || num > 100) {
        return ctx.reply(ctx.t('wizard_invalid_winners'));
      }
      session.data.winners_count = num;
      if (session.data.returnToPreview) {
        return showGiveawayPreview(ctx, session, { reuseSeed: true });
      }
      return finishStepPrompt(ctx, 'step_channels', session.data);
    }

    if (session.step === 'step_channels') {
      let targetChat = null;

      if (ctx.message.forward_origin) {
        const origin = ctx.message.forward_origin;
        if (origin.type === 'channel' && origin.chat) targetChat = origin.chat;
        else if (origin.type === 'chat' && origin.sender_chat) targetChat = origin.sender_chat;
      }
      if (!targetChat && ctx.message.forward_from_chat) {
        targetChat = ctx.message.forward_from_chat;
      }
      if (!targetChat && text) {
        let clean = text.replace(/^https?:\/\/t\.me\//, '').replace(/^@/, '').trim();
        if (clean.includes('/')) clean = clean.split('/')[0];
        try {
          targetChat = await ctx.api.getChat(clean.startsWith('-') ? clean : `@${clean}`);
        } catch (err) {}
      }

      if (!targetChat) {
        return ctx.reply(ctx.t('channel_detect_error'), { parse_mode: 'HTML' });
      }

      try {
        const res = await verifyAndAddChannel(ctx.api, ctx.me.id, session.data, targetChat);
        if (!res.ok) {
          const name = targetChat.username ? `@${targetChat.username}` : targetChat.title || 'Channel';
          return ctx.reply(ctx.t('channel_error_not_admin', name), { parse_mode: 'HTML' });
        }

        await db.sessions.set(ctx.from.id, 'step_channels', session.data);
        return ctx.reply(ctx.t('channel_added', res.title, res.handle), {
          parse_mode: 'HTML',
          reply_markup: buildStepChannelsKeyboard(ctx.lang, session.data.channels, ctx.botUsername)
        });
      } catch (err) {
        const name = targetChat.username ? `@${targetChat.username}` : targetChat.title || 'channel';
        return ctx.reply(ctx.t('channel_error_not_admin', name), { parse_mode: 'HTML' });
      }
    }

    if (session.step === 'step_custom_date') {
      const endAt = text ? parseCustomDate(text) : null;
      if (!endAt) {
        return ctx.reply(ctx.t('wizard_invalid_date'), { parse_mode: 'HTML' });
      }
      if (endAt <= Date.now() + 60000) {
        return ctx.reply(ctx.t('wizard_date_in_past'), { parse_mode: 'HTML' });
      }
      session.data.end_type = 'time';
      session.data.end_at = endAt;
      session.data.end_count = 0;
      return showGiveawayPreview(ctx, session, { reuseSeed: Boolean(session.data.returnToPreview) });
    }

    if (session.step === 'step_target_count') {
      const cnt = parseInt(text, 10);
      if (isNaN(cnt) || cnt < 2 || cnt > 100000) {
        return ctx.reply(ctx.t('wizard_invalid_count'));
      }
      session.data.end_type = 'participants';
      session.data.end_count = cnt;
      session.data.end_at = Date.now() + 365 * 86400000;
      return showGiveawayPreview(ctx, session, { reuseSeed: Boolean(session.data.returnToPreview) });
    }
  });

  // ==================== WIZARD CALLBACKS ====================

  bot.callbackQuery('wizard_skip_desc', async (ctx) => {
    if (!ctx.from) return answerCb(ctx);
    const [session] = await Promise.all([db.sessions.get(ctx.from.id), answerCb(ctx)]);
    if (!session) return;

    session.data.description = '';
    session.data.photo_file_id = null;
    if (session.data.returnToPreview) {
      return showGiveawayPreview(ctx, session, { reuseSeed: true });
    }
    return finishStepPrompt(ctx, 'step_winners', session.data);
  });

  bot.callbackQuery(/^win_cnt_(\d+)$/, async (ctx) => {
    if (!ctx.from) return answerCb(ctx);
    const session = await db.sessions.get(ctx.from.id);
    if (!session || !session.data) {
      return answerCb(ctx, { text: ctx.t('session_expired'), show_alert: true });
    }
    session.data.winners_count = Math.min(Math.max(parseInt(ctx.match[1], 10), 1), 100);
    const nextTask = session.data.returnToPreview
      ? showGiveawayPreview(ctx, session, { reuseSeed: true })
      : finishStepPrompt(ctx, 'step_channels', session.data);
    await Promise.all([answerCb(ctx), nextTask]);
  });

  bot.callbackQuery('wizard_done_channels', async (ctx) => {
    if (!ctx.from) return answerCb(ctx);
    const session = await db.sessions.get(ctx.from.id);
    if (!session || !session.data.channels || session.data.channels.length === 0) {
      return Promise.all([answerCb(ctx), ctx.reply(ctx.t('need_at_least_one_channel'))]);
    }
    const nextTask =
      session.data.returnToPreview && session.data.end_at
        ? showGiveawayPreview(ctx, session, { reuseSeed: true })
        : finishStepPrompt(ctx, 'step_duration', session.data);
    await Promise.all([answerCb(ctx), nextTask]);
  });

  bot.callbackQuery('dur_custom', async (ctx) => {
    if (!ctx.from) return answerCb(ctx);
    const session = await db.sessions.get(ctx.from.id);
    if (!session || !session.data) {
      return answerCb(ctx, { text: ctx.t('session_expired'), show_alert: true });
    }
    await Promise.all([
      answerCb(ctx),
      db.sessions.set(ctx.from.id, 'step_custom_date', session.data),
      ctx.reply(ctx.t('wizard_step_custom_date'), {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().text(ctx.t('btn_cancel'), 'wizard_cancel')
      })
    ]);
  });

  bot.callbackQuery('dur_count', async (ctx) => {
    if (!ctx.from) return answerCb(ctx);
    const session = await db.sessions.get(ctx.from.id);
    if (!session || !session.data) {
      return answerCb(ctx, { text: ctx.t('session_expired'), show_alert: true });
    }
    await Promise.all([
      answerCb(ctx),
      db.sessions.set(ctx.from.id, 'step_target_count', session.data),
      ctx.reply(ctx.t('wizard_step_count'), {
        parse_mode: 'HTML',
        reply_markup: buildTargetCountKeyboard(ctx.lang)
      })
    ]);
  });

  bot.callbackQuery(/^cnt_(\d+)$/, async (ctx) => {
    if (!ctx.from) return answerCb(ctx);
    const session = await db.sessions.get(ctx.from.id);
    if (!session || !session.data) {
      return answerCb(ctx, { text: ctx.t('session_expired'), show_alert: true });
    }
    session.data.end_type = 'participants';
    session.data.end_count = parseInt(ctx.match[1], 10);
    session.data.end_at = Date.now() + 365 * 86400000;
    await Promise.all([
      answerCb(ctx),
      showGiveawayPreview(ctx, session, { reuseSeed: Boolean(session.data.returnToPreview) })
    ]);
  });

  bot.callbackQuery(/^dur_(\d+)$/, async (ctx) => {
    if (!ctx.from) return answerCb(ctx);
    const session = await db.sessions.get(ctx.from.id);
    if (!session || !session.data) {
      return answerCb(ctx, { text: ctx.t('session_expired'), show_alert: true });
    }

    const durationMs = parseInt(ctx.match[1], 10);
    session.data.end_type = 'time';
    session.data.end_count = 0;
    session.data.end_at = Date.now() + durationMs;
    await Promise.all([
      answerCb(ctx),
      showGiveawayPreview(ctx, session, { reuseSeed: Boolean(session.data.returnToPreview) })
    ]);
  });

  // ==================== PREVIEW EDITING & OPTIONS ====================

  bot.callbackQuery('preview_back', async (ctx) => {
    if (!ctx.from) return answerCb(ctx);
    const session = await db.sessions.get(ctx.from.id);
    if (!session || !session.data) {
      return answerCb(ctx, { text: ctx.t('session_expired'), show_alert: true });
    }
    await Promise.all([
      answerCb(ctx),
      showGiveawayPreview(ctx, session, { reuseSeed: true, editInPlace: true })
    ]);
  });

  bot.callbackQuery('preview_toggle_lang', async (ctx) => {
    if (!ctx.from) return answerCb(ctx);
    const session = await db.sessions.get(ctx.from.id);
    if (!session || !session.data) {
      return answerCb(ctx, { text: ctx.t('session_expired'), show_alert: true });
    }
    session.data.lang = session.data.lang === 'ru' ? 'en' : 'ru';
    await Promise.all([
      answerCb(ctx),
      showGiveawayPreview(ctx, session, { reuseSeed: true, editInPlace: true })
    ]);
  });

  bot.callbackQuery('preview_edit', async (ctx) => {
    if (!ctx.from) return answerCb(ctx);
    const session = await db.sessions.get(ctx.from.id);
    if (!session || !session.data) {
      return answerCb(ctx, { text: ctx.t('session_expired'), show_alert: true });
    }
    const kb = new InlineKeyboard()
      .text(ctx.t('btn_edit_prize'), 'edit_field_prize')
      .text(ctx.t('btn_edit_desc'), 'edit_field_desc').row()
      .text(ctx.t('btn_edit_winners'), 'edit_field_winners')
      .text(ctx.t('btn_edit_channels'), 'edit_field_channels').row()
      .text(ctx.t('btn_edit_duration'), 'edit_field_duration').row()
      .text(ctx.t('btn_back_preview'), 'preview_back');

    await Promise.all([
      answerCb(ctx),
      editOrReply(ctx, ctx.t('edit_menu_title'), { parse_mode: 'HTML', reply_markup: kb })
    ]);
  });

  bot.callbackQuery(/^edit_field_(prize|desc|winners|channels|duration)$/, async (ctx) => {
    if (!ctx.from) return answerCb(ctx);
    const session = await db.sessions.get(ctx.from.id);
    if (!session || !session.data) {
      return answerCb(ctx, { text: ctx.t('session_expired'), show_alert: true });
    }
    const field = ctx.match[1];
    session.data.returnToPreview = true;
    if (field === 'channels') {
      session.data.channels = [];
    }
    const stepMap = {
      prize: 'step_prize',
      desc: 'step_desc',
      winners: 'step_winners',
      channels: 'step_channels',
      duration: 'step_duration'
    };
    await Promise.all([
      answerCb(ctx),
      finishStepPrompt(ctx, stepMap[field], session.data)
    ]);
  });

  async function renderOptionsMenu(ctx, session) {
    const s = parseSettings(session.data.settings);
    session.data.settings = s;

    const channels = session.data.channels || [];
    const postCh = channels[s.postChannelIndex || 0] || channels[0];

    const kb = new InlineKeyboard()
      .text(ctx.t('btn_opt_referrals', s.referralsEnabled), 'opt_toggle_referrals').row()
      .text(ctx.t('btn_opt_captcha', s.requireCaptcha), 'opt_toggle_captcha').row()
      .text(ctx.t('btn_opt_username', s.requireUsername), 'opt_toggle_username').row()
      .text(ctx.t('btn_opt_premium', s.requirePremium), 'opt_toggle_premium').row();

    if (channels.length > 1 && postCh) {
      kb.text(ctx.t('btn_opt_post_channel', formatChannelLabel(postCh)), 'opt_cycle_post_channel').row();
    }
    kb.text(ctx.t('btn_back_preview'), 'preview_back');

    await Promise.all([
      db.sessions.set(ctx.from.id, 'preview', session.data),
      editOrReply(ctx, ctx.t('options_menu_title'), { parse_mode: 'HTML', reply_markup: kb })
    ]);
  }

  bot.callbackQuery('preview_options', async (ctx) => {
    if (!ctx.from) return answerCb(ctx);
    const session = await db.sessions.get(ctx.from.id);
    if (!session || !session.data) {
      return answerCb(ctx, { text: ctx.t('session_expired'), show_alert: true });
    }
    await Promise.all([
      answerCb(ctx),
      renderOptionsMenu(ctx, session)
    ]);
  });

  bot.callbackQuery(/^opt_toggle_(referrals|captcha|username|premium)$/, async (ctx) => {
    if (!ctx.from) return answerCb(ctx);
    const session = await db.sessions.get(ctx.from.id);
    if (!session || !session.data) {
      return answerCb(ctx, { text: ctx.t('session_expired'), show_alert: true });
    }
    const s = parseSettings(session.data.settings);
    const keyMap = {
      referrals: 'referralsEnabled',
      captcha: 'requireCaptcha',
      username: 'requireUsername',
      premium: 'requirePremium'
    };
    const prop = keyMap[ctx.match[1]];
    s[prop] = !s[prop];
    session.data.settings = s;
    await Promise.all([
      answerCb(ctx),
      renderOptionsMenu(ctx, session)
    ]);
  });

  bot.callbackQuery('opt_cycle_post_channel', async (ctx) => {
    if (!ctx.from) return answerCb(ctx);
    const session = await db.sessions.get(ctx.from.id);
    if (!session || !session.data || !session.data.channels?.length) {
      return answerCb(ctx, { text: ctx.t('session_expired'), show_alert: true });
    }
    const s = parseSettings(session.data.settings);
    s.postChannelIndex = ((s.postChannelIndex || 0) + 1) % session.data.channels.length;
    session.data.settings = s;
    await Promise.all([
      answerCb(ctx),
      renderOptionsMenu(ctx, session)
    ]);
  });

  // ==================== PUBLISH GIVEAWAY ====================

  bot.callbackQuery('wizard_publish', async (ctx) => {
    if (!ctx.from) return answerCb(ctx);
    const session = await db.sessions.get(ctx.from.id);
    if (!session || !session.data || !session.data.channels || session.data.channels.length === 0) {
      return answerCb(ctx, { text: ctx.t('session_expired'), show_alert: true });
    }

    const d = session.data;
    const postLang = d.lang === 'ru' ? 'ru' : (d.lang === 'en' ? 'en' : ctx.lang);
    const settings = parseSettings(d.settings);
    settings.creatorUsername = ctx.from.username || settings.creatorUsername || '';

    const chIdx = settings.postChannelIndex || 0;
    const targetChannel = d.channels[chIdx] || d.channels[0];
    const targetLabel = formatChannelLabel(targetChannel);

    const baseCardParams = {
      prize: d.prize,
      description: d.description,
      winnersCount: d.winners_count,
      channels: d.channels,
      endType: d.end_type || 'time',
      endAtFormatted: formatDate(d.end_at, postLang),
      endCount: d.end_count || 0,
      seedHash: d.seed_hash,
      settings
    };
    const fullText = t(postLang, 'giveaway_card', { ...baseCardParams, forCaption: false });
    const captionText = t(postLang, 'giveaway_card', { ...baseCardParams, forCaption: true });
    const postKb = buildPostActionKeyboard(postLang, d.public_id, 0, d.channels, settings, ctx.botUsername);

    const [giveawayId] = await Promise.all([
      db.giveaways.create({
        public_id: d.public_id,
        creator_id: ctx.from.id,
        prize: d.prize,
        description: d.description,
        winners_count: d.winners_count,
        required_channels: d.channels,
        target_chat_id: String(targetChannel.id),
        status: 'draft',
        end_type: d.end_type || 'time',
        end_at: d.end_at,
        end_count: d.end_count || 0,
        seed_hash: d.seed_hash,
        server_seed: d.server_seed,
        lang: postLang,
        photo_file_id: d.photo_file_id || null,
        settings
      }),
      db.sessions.clear(ctx.from.id),
      answerCb(ctx)
    ]);

    try {
      const { sentMsg, usedPhoto } = await sendChannelGiveawayPost(
        ctx.api,
        targetChannel.id,
        d.photo_file_id,
        fullText,
        captionText,
        postKb
      );
      settings.hasPhoto = usedPhoto;
      const postUrl = buildChannelPostUrl(targetChannel, targetChannel.id, sentMsg.message_id);
      await Promise.all([
        db.giveaways.updatePostDetails(giveawayId, targetChannel.id, sentMsg.message_id, settings),
        ctx.reply(ctx.t('publish_success', targetLabel, postUrl), {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: getMainMenuKeyboard(ctx.lang)
        })
      ]);
    } catch (err) {
      console.error('Failed to publish to channel:', err);
      await Promise.all([
        db.giveaways.cancel(giveawayId),
        ctx.reply(ctx.t('publish_failed', targetLabel), {
          parse_mode: 'HTML',
          reply_markup: getMainMenuKeyboard(ctx.lang)
        })
      ]);
    }
  });

  // ==================== PARTICIPATE / REFERRAL / CAPTCHA ====================

  async function checkMissingChannels(api, channels, userId) {
    if (!Array.isArray(channels) || channels.length === 0) return [];
    const checks = await Promise.all(
      channels.map(async (ch) => ({
        ch,
        ok: await isUserSubscribed(api, ch.id, userId)
      }))
    );
    return checks.filter((r) => !r.ok).map((r) => `• ${formatChannelLabel(r.ch)}`);
  }

  bot.callbackQuery(/^join_([a-f0-9]+)(?:_r(\d+))?$/, async (ctx) => {
    const publicId = ctx.match[1];
    const refId = ctx.match[2] ? Number(ctx.match[2]) : null;
    const userId = ctx.from.id;

    let g = null;
    let alreadyIn = false;
    let knownExtraTickets = 0;
    let knownReferredBy = null;

    if (db.giveaways.getWithParticipant) {
      const joinState = await db.giveaways.getWithParticipant(publicId, userId);
      if (joinState?.giveaway) {
        g = joinState.giveaway;
        alreadyIn = joinState.isJoined;
        knownExtraTickets = joinState.extraTickets;
        knownReferredBy = joinState.referredBy;
      }
    }
    if (!g) {
      g = await getOrRecoverGiveaway(db, publicId, ctx.callbackQuery?.message, defaultLang);
      if (g) {
        alreadyIn = await db.participants.isParticipating(g.id, userId);
      }
    }

    if (!g) {
      return answerCb(ctx, { text: 'Giveaway not found.', show_alert: true });
    }
    if (g.status === 'cancelled') {
      return answerCb(ctx, { text: ctx.t('alert_cancelled'), show_alert: true });
    }
    if (g.status === 'finished' || g.status === 'finalizing') {
      return answerCb(ctx, { text: ctx.t('alert_ended'), show_alert: true });
    }

    if (alreadyIn) {
      let newCount;
      if (db.participants.removeFast) {
        const res = await db.participants.removeFast(g.id, userId, knownReferredBy);
        newCount = res.count;
      } else {
        await db.participants.remove(g.id, userId);
      }

      runBg(refreshChannelPostCounter(g, newCount));
      const uiTasks = [answerCb(ctx, { text: ctx.t('alert_left_giveaway'), show_alert: true })];
      if (ctx.callbackQuery?.message?.chat?.type === 'private') {
        uiTasks.push(
          renderDmJoinView(ctx, g, refId, {
            count: newCount !== undefined ? newCount : await db.participants.count(g.id),
            extraTickets: knownExtraTickets,
            isJoined: false
          })
        );
      }
      await Promise.all(uiTasks);
      return;
    }

    if (g.settings?.requireUsername && !ctx.from.username) {
      return answerCb(ctx, { text: ctx.t('alert_need_username'), show_alert: true });
    }
    if (g.settings?.requirePremium && !ctx.from.is_premium) {
      return answerCb(ctx, { text: ctx.t('alert_need_premium'), show_alert: true });
    }

    const missing = await checkMissingChannels(ctx.api, g.required_channels, userId);
    if (missing.length > 0) {
      return answerCb(ctx, {
        text: ctx.t('alert_must_subscribe', missing.join('\n')),
        show_alert: true
      });
    }

    if (g.settings?.requireCaptcha) {
      const isPrivate = ctx.callbackQuery?.message?.chat?.type === 'private';
      if (!isPrivate) {
        const refParam = refId ? `_${refId}` : '';
        return answerCb(ctx, {
          url: `https://t.me/${ctx.botUsername}?start=captcha_${g.public_id}${refParam}`
        });
      }
      await Promise.all([answerCb(ctx), sendCaptchaChallenge(ctx, g, refId)]);
      return;
    }

    await completeParticipantJoin(ctx, g, refId);
  });

  bot.callbackQuery(/^cap_([a-f0-9]+)_(\d+)_(\d+)_([a-f0-9]+)(?:_(\d+))?$/, async (ctx) => {
    const [, publicId, choiceStr, expectedStr, sig, refStr] = ctx.match;
    const choice = Number(choiceStr);
    const expected = Number(expectedStr);
    const refId = refStr ? Number(refStr) : null;

    if (!ctx.from) return answerCb(ctx);
    const expectedSig = signCaptchaToken(token, ctx.from.id, publicId, expected).slice(0, 8);
    if (sig !== expectedSig) {
      return answerCb(ctx, { text: ctx.t('session_expired'), show_alert: true });
    }
    if (choice !== expected) {
      return answerCb(ctx, { text: ctx.t('captcha_wrong'), show_alert: true });
    }

    const g = await db.giveaways.getByPublicId(publicId);
    if (!g || g.status !== 'active') {
      return answerCb(ctx, { text: ctx.t('alert_ended'), show_alert: true });
    }

    const missing = await checkMissingChannels(ctx.api, g.required_channels, ctx.from.id);
    if (missing.length > 0) {
      return answerCb(ctx, {
        text: ctx.t('alert_must_subscribe', missing.join('\n')),
        show_alert: true
      });
    }

    await completeParticipantJoin(ctx, g, refId, { sendDmFollowup: true });
  });

  bot.callbackQuery(/^stats_([a-f0-9]+)$/, async (ctx) => {
    const publicId = ctx.match[1];
    const [g] = await Promise.all([
      getOrRecoverGiveaway(db, publicId, ctx.callbackQuery?.message, defaultLang),
      answerCb(ctx)
    ]);
    if (!g) return;

    const participants = await db.participants.listForGiveaway(g.id);
    const count = participants.length;
    const totalTickets = participants.reduce((acc, p) => acc + Math.min(1 + Math.max(0, Number(p.extra_tickets) || 0), 100), 0);
    const endLine =
      g.end_type === 'participants' && g.end_count > 0
        ? (ctx.lang === 'ru' ? `${g.end_count} участ.` : `${g.end_count} participants`)
        : formatDate(g.end_at, ctx.lang);

    await ctx.reply(
      ctx.t('stats_popup', {
        count,
        totalTickets,
        winnersCount: g.winners_count,
        seedHash: g.seed_hash,
        endLine
      }),
      { parse_mode: 'HTML' }
    );
  });

  // ==================== CREATOR MANAGEMENT PANEL ====================

  bot.callbackQuery(/^manage_([a-f0-9]+)$/, async (ctx) => {
    if (!ctx.from) return answerCb(ctx);
    const [g] = await Promise.all([db.giveaways.getByPublicId(ctx.match[1]), answerCb(ctx)]);
    if (!g || String(g.creator_id) !== String(ctx.from.id)) return;
    await renderManagePanel(ctx, g, { edit: true });
  });

  bot.callbackQuery(/^early_([a-f0-9]+)$/, async (ctx) => {
    if (!ctx.from) return answerCb(ctx);
    const [g] = await Promise.all([db.giveaways.getByPublicId(ctx.match[1]), answerCb(ctx)]);
    if (!g || String(g.creator_id) !== String(ctx.from.id)) return;
    if (g.status !== 'active') return;
    await finalizeGiveaway(g.id);
    const updated = await db.giveaways.getById(g.id);
    if (updated) await renderManagePanel(ctx, updated, { edit: true });
  });

  bot.callbackQuery(/^cancel_g_([a-f0-9]+)$/, async (ctx) => {
    if (!ctx.from) return answerCb(ctx);
    const [g] = await Promise.all([db.giveaways.getByPublicId(ctx.match[1]), answerCb(ctx)]);
    if (!g || String(g.creator_id) !== String(ctx.from.id)) return;
    if (g.status !== 'active') return;

    const postLang = resolvePostLang(g);
    const cancelCard = t(postLang, 'giveaway_cancelled_card', g.prize);
    await Promise.all([
      db.giveaways.cancel(g.id),
      editChannelPost(ctx.api, g, cancelCard, cancelCard, new InlineKeyboard())
    ]);
    g.status = 'cancelled';
    await renderManagePanel(ctx, g, { edit: true });
  });

  bot.callbackQuery(/^export_([a-f0-9]+)$/, async (ctx) => {
    if (!ctx.from) return answerCb(ctx);
    const g = await db.giveaways.getByPublicId(ctx.match[1]);
    if (!g || String(g.creator_id) !== String(ctx.from.id)) {
      return answerCb(ctx);
    }
    const participants = await db.participants.listForGiveaway(g.id);
    if (!participants.length) {
      return answerCb(ctx, { text: ctx.t('export_empty'), show_alert: true });
    }
    const csv = buildParticipantsCsv(participants);
    const bytes = new TextEncoder().encode(csv);
    await Promise.all([
      answerCb(ctx),
      ctx.replyWithDocument(new InputFile(bytes, `giveaway_${g.public_id}_participants.csv`), {
        caption: ctx.t('export_caption', g.prize, participants.length)
      })
    ]);
  });

  bot.callbackQuery(/^clone_([a-f0-9]+)$/, async (ctx) => {
    if (!ctx.from) return answerCb(ctx);
    const [g] = await Promise.all([db.giveaways.getByPublicId(ctx.match[1]), answerCb(ctx)]);
    if (!g || String(g.creator_id) !== String(ctx.from.id)) return;

    const clonedEndAt =
      g.end_type === 'participants'
        ? Date.now() + 365 * 86400000
        : Date.now() + Math.max(3600000, (g.end_at && g.created_at && g.end_at > g.created_at) ? (g.end_at - g.created_at) : 86400000);

    const session = {
      data: {
        prize: g.prize,
        description: g.description || '',
        winners_count: g.winners_count || 1,
        channels: g.required_channels || [],
        lang: g.lang || ctx.lang,
        photo_file_id: g.photo_file_id || null,
        end_type: g.end_type || 'time',
        end_count: g.end_count || 0,
        end_at: clonedEndAt,
        settings: parseSettings({ ...g.settings, creatorUsername: ctx.from.username || g.settings?.creatorUsername || '' })
      }
    };
    await showGiveawayPreview(ctx, session);
  });

  bot.callbackQuery(/^reroll_([a-f0-9]+)$/, async (ctx) => {
    if (!ctx.from) return answerCb(ctx);
    const g = await db.giveaways.getByPublicId(ctx.match[1]);
    if (!g || String(g.creator_id) !== String(ctx.from.id) || g.status !== 'finished') {
      return answerCb(ctx);
    }

    const participants = await db.participants.listForGiveaway(g.id);
    const currentWinners = Array.isArray(g.winners) ? [...g.winners] : [];
    const alreadyIds = new Set(currentWinners.map((w) => String(w.user_id)));

    const candidateOrder = fairness.selectWinners(g.server_seed, participants, participants.length);
    let nextWinner = null;
    for (const cand of candidateOrder) {
      if (alreadyIds.has(String(cand.user_id))) continue;
      const missing = await checkMissingChannels(ctx.api, g.required_channels, cand.user_id);
      if (missing.length === 0) {
        nextWinner = cand;
        break;
      }
    }

    if (!nextWinner) {
      return answerCb(ctx, { text: ctx.t('alert_reroll_none'), show_alert: true });
    }

    const updatedWinners = [...currentWinners, nextWinner];
    const postLang = resolvePostLang(g);
    const winnerHandle = formatWinnerHandle(nextWinner);
    const winnersText = updatedWinners.map((w, idx) => `${idx + 1}. ${formatWinnerHandle(w)}`).join('\n');

    const cardParams = {
      prize: g.prize,
      winnersText,
      serverSeed: g.server_seed,
      seedHash: g.seed_hash,
      finishedAtFormatted: formatDate(g.finished_at || Date.now(), postLang)
    };
    const finishKb = new InlineKeyboard()
      .url(t(postLang, 'btn_verify_seed'), `${WEB_URL}/?seed=${encodeURIComponent(g.server_seed)}#verify`).row()
      .url(t(postLang, 'btn_create_own'), `${BOT_URL}?start=create`);

    await Promise.all([
      db.giveaways.updateWinners(g.id, updatedWinners),
      answerCb(ctx),
      editChannelPost(
        ctx.api,
        g,
        t(postLang, 'giveaway_finished_card', { ...cardParams, forCaption: false }),
        t(postLang, 'giveaway_finished_card', { ...cardParams, forCaption: true }),
        finishKb
      ),
      g.channel_post_chat_id && g.channel_post_message_id
        ? bot.api.sendMessage(
            g.channel_post_chat_id,
            t(postLang, 'channel_reroll_reply', g.prize, winnerHandle),
            { parse_mode: 'HTML', reply_to_message_id: g.channel_post_message_id }
          ).catch(() => {})
        : Promise.resolve(),
      notifyWinnerDm(g, nextWinner),
      ctx.reply(ctx.t('reroll_done', winnerHandle), { parse_mode: 'HTML' })
    ]);
  });

  // ==================== FINALIZATION ENGINE ====================

  async function resolveContactForGiveaway(g) {
    const chIdx = g.settings?.postChannelIndex || 0;
    const primaryCh = (g.required_channels && (g.required_channels[chIdx] || g.required_channels[0])) || null;
    const channelTitle = primaryCh?.title || primaryCh?.username || 'Giveaway Channel';

    let creatorUsername = (g.settings?.creatorUsername || '').replace(/^@/, '');
    if (!creatorUsername && g.creator_id > 0) {
      const creatorUser = await db.users.get(g.creator_id);
      if (creatorUser?.username) creatorUsername = creatorUser.username.replace(/^@/, '');
    }

    const chUsername = primaryCh?.username ? primaryCh.username.replace(/^@/, '') : '';
    let contactUrl = '';
    let contactLabel = '';
    if (creatorUsername) {
      contactUrl = `https://t.me/${creatorUsername}`;
      contactLabel = `@${creatorUsername}`;
    } else if (chUsername) {
      contactUrl = `https://t.me/${chUsername}`;
      contactLabel = `@${chUsername}`;
    } else if (primaryCh?.invite_link) {
      contactUrl = primaryCh.invite_link;
      contactLabel = channelTitle;
    }

    return { channelTitle, contactUrl, contactLabel };
  }

  async function notifyWinnerDm(g, winner, preResolvedContact = null) {
    try {
      const [{ channelTitle, contactUrl, contactLabel }, userObj] = await Promise.all([
        preResolvedContact ? Promise.resolve(preResolvedContact) : resolveContactForGiveaway(g),
        db.users.get(winner.user_id)
      ]);
      const userLang = userObj?.lang === 'ru' ? 'ru' : resolvePostLang(g);
      const dmText = t(userLang, 'winner_dm_notification', {
        prize: g.prize,
        channel: channelTitle,
        contactUrl,
        contactLabel
      });
      const extra = { parse_mode: 'HTML', disable_web_page_preview: true };
      if (contactUrl) {
        extra.reply_markup = new InlineKeyboard().url(t(userLang, 'btn_claim_shoutout'), contactUrl);
      }
      await bot.api.sendMessage(winner.user_id, dmText, extra);
    } catch (dmErr) {}
  }

  async function finalizeGiveaway(giveawayId) {
    const claimed = db.giveaways.claimForFinish
      ? await db.giveaways.claimForFinish(giveawayId)
      : true;
    if (!claimed) return;

    let g;
    let finishedPersisted = false;
    try {
      g = await db.giveaways.getById(giveawayId);
      if (!g || (g.status !== 'active' && g.status !== 'finalizing')) return;

      const postLang = resolvePostLang(g);
      const participants = await db.participants.listForGiveaway(g.id);

      if (!participants || participants.length === 0) {
        await db.giveaways.finish(g.id, g.server_seed, []);
        finishedPersisted = true;
        if (g.channel_post_chat_id && g.channel_post_message_id) {
          try {
            await bot.api.sendMessage(
              g.channel_post_chat_id,
              t(postLang, 'channel_empty_finish', g.prize),
              { parse_mode: 'HTML', reply_to_message_id: g.channel_post_message_id }
            );
          } catch (e) {}
        }
        return;
      }

      const candidateWinners = fairness.selectWinners(g.server_seed, participants, participants.length);
      const verifiedWinners = [];
      for (const candidate of candidateWinners) {
        if (verifiedWinners.length >= g.winners_count) break;
        const missing = await checkMissingChannels(bot.api, g.required_channels, candidate.user_id);
        if (missing.length === 0) {
          verifiedWinners.push(candidate);
        }
      }

      await db.giveaways.finish(g.id, g.server_seed, verifiedWinners);
      finishedPersisted = true;

      const winnersText = verifiedWinners.map((w, idx) => `${idx + 1}. ${formatWinnerHandle(w)}`).join('\n');
      const cardParams = {
        prize: g.prize,
        winnersText: winnersText || t(postLang, 'no_participants'),
        serverSeed: g.server_seed,
        seedHash: g.seed_hash,
        finishedAtFormatted: formatDate(Date.now(), postLang)
      };

      const finishKb = new InlineKeyboard()
        .url(t(postLang, 'btn_verify_seed'), `${WEB_URL}/?seed=${encodeURIComponent(g.server_seed)}#verify`).row()
        .url(t(postLang, 'btn_create_own'), `${BOT_URL}?start=create`);

      const contactInfo = await resolveContactForGiveaway(g);

      await Promise.all([
        editChannelPost(
          bot.api,
          g,
          t(postLang, 'giveaway_finished_card', { ...cardParams, forCaption: false }),
          t(postLang, 'giveaway_finished_card', { ...cardParams, forCaption: true }),
          finishKb
        ),
        g.channel_post_chat_id && g.channel_post_message_id
          ? bot.api.sendMessage(
              g.channel_post_chat_id,
              t(postLang, 'channel_winners_reply', g.prize, winnersText || t(postLang, 'no_participants')),
              {
                parse_mode: 'HTML',
                reply_markup: finishKb,
                reply_to_message_id: g.channel_post_message_id
              }
            ).catch(() => {})
          : Promise.resolve(),
        ...verifiedWinners.map((w) => notifyWinnerDm(g, w, contactInfo)),
        g.creator_id
          ? (async () => {
              const creatorObj = await db.users.get(g.creator_id);
              const creatorLang = creatorObj?.lang === 'ru' ? 'ru' : postLang;
              await bot.api.sendMessage(
                g.creator_id,
                t(creatorLang, 'creator_finish_dm', g.prize, winnersText),
                { parse_mode: 'HTML' }
              );
            })().catch(() => {})
          : Promise.resolve()
      ]);
    } catch (err) {
      if (!finishedPersisted && db.giveaways.releaseFinishClaim) {
        await db.giveaways.releaseFinishClaim(giveawayId);
      }
      throw err;
    }
  }

  async function finalizeDueGiveaways() {
    const dueGiveaways = await db.giveaways.getActiveToFinish();
    for (const g of dueGiveaways) {
      console.log(`[Scheduler] Finalizing giveaway #${g.id} (${g.prize})...`);
      await finalizeGiveaway(g.id);
    }
    return dueGiveaways.length;
  }

  return {
    bot,
    finalizeGiveaway,
    finalizeDueGiveaways
  };
}

module.exports = {
  createBot,
  formatDate,
  parseCustomDate,
  recoverGiveawayFromMessage
};
