const { Bot, InlineKeyboard } = require('grammy');
const crypto = require('crypto');
const { t } = require('./i18n');
const fairness = require('./fairness');

function getMainMenuKeyboard(lang) {
  return new InlineKeyboard()
    .text(t(lang, 'btn_create_giveaway'), 'menu_create').row()
    .text(t(lang, 'btn_my_giveaways'), 'menu_my').row()
    .text(t(lang, 'btn_language'), 'menu_lang')
    .text(t(lang, 'btn_help'), 'menu_help');
}

function buildPostActionKeyboard(lang, publicId, count, primaryChannel) {
  const kb = new InlineKeyboard()
    .text(t(lang, 'btn_participate', count), `join_${publicId}`).row();
  const chUrl = primaryChannel?.invite_link || (primaryChannel?.username ? `https://t.me/${primaryChannel.username.replace(/^@/, '')}` : '');
  if (chUrl) {
    kb.url(t(lang, 'btn_channels_list'), chUrl);
  }
  kb.text(t(lang, 'btn_stats'), `stats_${publicId}`);
  return kb;
}

function formatDate(timestamp, lang) {
  const d = new Date(timestamp);
  const locale = lang === 'ru' ? 'ru-RU' : lang === 'ro' ? 'ro-RO' : 'en-US';
  return d.toLocaleString(locale, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }) + ' UTC';
}

function parseCustomDate(input) {
  const str = input.trim();

  // Format 1: DD.MM.YYYY HH:MM
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

  // Format 2: DD.MM HH:MM (current or next year)
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

  // Format 3: YYYY-MM-DD HH:MM
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

function recoverGiveawayFromMessage(publicId, message) {
  if (!message || !message.text) return null;
  const txt = message.text;
  const prizeMatch =
    txt.match(/GIVEAWAY:\s*(.+?)(?:\n|$)/i) ||
    txt.match(/РОЗЫГРЫШ:\s*(.+?)(?:\n|$)/i) ||
    txt.match(/CONCURS:\s*(.+?)(?:\n|$)/i);
  const winnersMatch =
    txt.match(/Winners:\s*(\d+)/i) ||
    txt.match(/Количество победителей:\s*(\d+)/i) ||
    txt.match(/Câștigători:\s*(\d+)/i);
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
    txt.match(/Окончание:\s*(.+?)(?:\n|$)/i) ||
    txt.match(/Se încheie:\s*(.+?)(?:\n|$)/i);
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
    seed_hash: seedHash,
    server_seed: serverSeed
  };
}

async function getOrRecoverGiveaway(db, publicId, message) {
  let g = await db.giveaways.getByPublicId(publicId);
  if (!g && message) {
    const recovered = recoverGiveawayFromMessage(publicId, message);
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

/**
 * Creates a configured grammY Bot instance and giveaway finalization helpers
 * using either the sync Node SQLite adapter or the async Cloudflare D1 adapter.
 */
function createBot({ token, db, defaultLang = 'ru', botInfo = undefined }) {
  const bot = new Bot(token, botInfo ? { botInfo } : undefined);

  bot.catch((err) => {
    console.error('[Bot] Handler error:', err);
  });

  bot.use(async (ctx, next) => {
    if (ctx.from) {
      let user = await db.users.get(ctx.from.id);
      if (!user) {
        const lc = (ctx.from.language_code || '').toLowerCase();
        const userLang = lc.startsWith('ru') ? 'ru' : lc.startsWith('ro') ? 'ro' : 'en';
        await db.users.upsert(ctx.from.id, ctx.from.username, ctx.from.first_name, userLang);
        user = { user_id: ctx.from.id, lang: userLang, last_active_at: Date.now() };
      } else if (db.users.touch && (!user.last_active_at || Date.now() - user.last_active_at > 3600000)) {
        await db.users.touch(ctx.from.id);
      }
      ctx.lang = user.lang || defaultLang;
    } else {
      ctx.lang = defaultLang;
    }
    ctx.t = (key, ...args) => t(ctx.lang, key, ...args);
    await next();
  });

  async function sendWelcomeMenu(ctx) {
    const name = ctx.from?.first_name || 'Friend';
    let text = ctx.t('welcome', name);
    if (db.stats?.getPublicStats) {
      try {
        const stats = await db.stats.getPublicStats();
        text += ctx.t('welcome_stats', stats);
      } catch (err) {}
    }
    await ctx.reply(text, {
      parse_mode: 'HTML',
      reply_markup: getMainMenuKeyboard(ctx.lang)
    });
  }

  async function startCreateWizard(ctx) {
    if (!ctx.from) return;
    await db.sessions.set(ctx.from.id, 'step_prize', { channels: [] });
    await ctx.reply(ctx.t('wizard_step_prize'), {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().text(ctx.t('btn_cancel'), 'wizard_cancel')
    });
  }

  async function showGiveawayPreview(ctx, session, endAt) {
    const { serverSeed, seedHash } = fairness.generateSeed();
    const publicId = crypto.randomBytes(4).toString('hex');

    session.data.end_at = endAt;
    session.data.seed_hash = seedHash;
    session.data.server_seed = serverSeed;
    session.data.public_id = publicId;

    await db.sessions.set(ctx.from.id, 'preview', session.data);

    const previewText = ctx.t('wizard_preview_title') + '\n\n' + ctx.t('giveaway_card', {
      prize: session.data.prize,
      description: session.data.description,
      winnersCount: session.data.winners_count,
      channels: session.data.channels,
      endAtFormatted: formatDate(endAt, ctx.lang),
      seedHash
    });

    const kb = new InlineKeyboard()
      .text(ctx.t('btn_publish_to_channel'), 'wizard_publish').row()
      .text(ctx.t('btn_cancel'), 'wizard_cancel');

    await ctx.reply(previewText, {
      parse_mode: 'HTML',
      reply_markup: kb,
      disable_web_page_preview: true
    });
  }

  bot.command('start', async (ctx) => {
    const payload = ctx.match;
    if (payload === 'create') {
      return startCreateWizard(ctx);
    }
    if (payload && payload.startsWith('join_')) {
      const publicId = payload.replace('join_', '');
      const g = await db.giveaways.getByPublicId(publicId);
      if (g) {
        const participantsCount = await db.participants.count(g.id);
        const isJoined = ctx.from ? await db.participants.isParticipating(g.id, ctx.from.id) : false;
        const text = ctx.t('giveaway_card', {
          prize: g.prize,
          description: g.description,
          winnersCount: g.winners_count,
          channels: g.required_channels,
          endAtFormatted: formatDate(g.end_at, ctx.lang),
          seedHash: g.seed_hash
        });

        const kb = new InlineKeyboard()
          .text(isJoined ? `✅ Participating (${participantsCount})` : ctx.t('btn_participate', participantsCount), `join_${g.public_id}`)
          .row()
          .text(ctx.t('btn_stats'), `stats_${g.public_id}`);

        return ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
      }
    }

    await sendWelcomeMenu(ctx);
  });

  bot.command('cancel', async (ctx) => {
    if (ctx.from) {
      await db.sessions.clear(ctx.from.id);
      await ctx.reply(ctx.t('cancelled'), {
        reply_markup: getMainMenuKeyboard(ctx.lang)
      });
    }
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(ctx.t('help_text'), {
      parse_mode: 'HTML',
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
      reply_markup: getMainMenuKeyboard(ctx.lang)
    });
  });

  bot.command(['lang', 'language'], async (ctx) => {
    const kb = new InlineKeyboard()
      .text('🇬🇧 English', 'set_lang_en')
      .text('🇷🇺 Русский', 'set_lang_ru')
      .text('🇷🇴 Română', 'set_lang_ro');
    await ctx.reply(ctx.t('choose_lang'), { reply_markup: kb });
  });

  bot.callbackQuery(/^set_lang_(en|ru|ro)$/, async (ctx) => {
    const chosen = ctx.match[1];
    if (ctx.from) {
      await db.users.setLang(ctx.from.id, chosen);
      ctx.lang = chosen;
      await ctx.answerCallbackQuery();
      await ctx.reply(t(chosen, 'lang_set'), {
        reply_markup: getMainMenuKeyboard(chosen)
      });
    }
  });

  bot.callbackQuery('menu_help', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(ctx.t('help_text'), {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().text('🔙 Back', 'menu_back')
    });
  });

  bot.callbackQuery('menu_lang', async (ctx) => {
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard()
      .text('🇬🇧 English', 'set_lang_en')
      .text('🇷🇺 Русский', 'set_lang_ru')
      .text('🇷🇴 Română', 'set_lang_ro').row()
      .text('🔙 Back', 'menu_back');
    await ctx.reply(ctx.t('choose_lang'), { reply_markup: kb });
  });

  bot.callbackQuery('menu_back', async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendWelcomeMenu(ctx);
  });

  bot.callbackQuery('menu_my', async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!ctx.from) return;
    const list = await db.giveaways.listByCreator(ctx.from.id);
    if (!list || list.length === 0) {
      return ctx.reply(ctx.t('my_giveaways_empty'), {
        reply_markup: getMainMenuKeyboard(ctx.lang)
      });
    }

    let text = `${ctx.t('my_giveaways_title')}\n\n`;
    list.forEach((g, idx) => {
      const statusEmoji = g.status === 'active' ? '🟢' : g.status === 'finished' ? '🏁' : '📝';
      text += `${idx + 1}. ${statusEmoji} <b>${g.prize}</b> (${g.status})\n`;
      text += `   ID: <code>${g.public_id}</code> | Winners: ${g.winners_count}\n`;
    });

    await ctx.reply(text, {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().text('🔙 Back', 'menu_back')
    });
  });

  bot.callbackQuery('menu_create', async (ctx) => {
    await ctx.answerCallbackQuery();
    await startCreateWizard(ctx);
  });

  bot.callbackQuery('wizard_cancel', async (ctx) => {
    await ctx.answerCallbackQuery();
    if (ctx.from) await db.sessions.clear(ctx.from.id);
    await ctx.reply(ctx.t('cancelled'), {
      reply_markup: getMainMenuKeyboard(ctx.lang)
    });
  });

  bot.on('message', async (ctx) => {
    if (!ctx.from) return;
    const session = await db.sessions.get(ctx.from.id);
    if (!session) return;

    const text = ctx.message.text ? ctx.message.text.trim() : '';

    if (session.step === 'step_prize') {
      if (!text) {
        return ctx.reply('⚠️ Please send a text title for the prize.');
      }
      session.data.prize = text;
      await db.sessions.set(ctx.from.id, 'step_desc', session.data);
      return ctx.reply(ctx.t('wizard_step_description'), {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard()
          .text('➡️ Skip', 'wizard_skip_desc').row()
          .text(ctx.t('btn_cancel'), 'wizard_cancel')
      });
    }

    if (session.step === 'step_desc') {
      if (text && text !== '/skip') {
        session.data.description = text;
      }
      await db.sessions.set(ctx.from.id, 'step_winners', session.data);
      return ctx.reply(ctx.t('wizard_step_winners'), {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().text(ctx.t('btn_cancel'), 'wizard_cancel')
      });
    }

    if (session.step === 'step_winners') {
      const num = parseInt(text, 10);
      if (isNaN(num) || num < 1 || num > 100) {
        return ctx.reply(ctx.t('wizard_invalid_winners'));
      }
      session.data.winners_count = num;
      await db.sessions.set(ctx.from.id, 'step_channels', session.data);

      const kb = new InlineKeyboard();
      if (session.data.channels && session.data.channels.length > 0) {
        kb.text(ctx.t('btn_done_channels'), 'wizard_done_channels').row();
      }
      kb.text(ctx.t('btn_cancel'), 'wizard_cancel');

      return ctx.reply(ctx.t('wizard_step_channels'), {
        parse_mode: 'HTML',
        reply_markup: kb
      });
    }

    if (session.step === 'step_channels') {
      let targetChat = null;

      if (ctx.message.forward_origin) {
        const origin = ctx.message.forward_origin;
        if (origin.type === 'channel' && origin.chat) {
          targetChat = origin.chat;
        } else if (origin.type === 'chat' && origin.sender_chat) {
          targetChat = origin.sender_chat;
        }
      }

      if (!targetChat && ctx.message.forward_from_chat) {
        targetChat = ctx.message.forward_from_chat;
      }

      if (!targetChat && text) {
        let clean = text.replace(/^https?:\/\/t\.me\//, '').replace(/^@/, '').trim();
        if (clean.includes('/')) {
          clean = clean.split('/')[0];
        }
        try {
          targetChat = await ctx.api.getChat(clean.startsWith('-') ? clean : `@${clean}`);
        } catch (err) {
          // Handled below
        }
      }

      if (!targetChat) {
        return ctx.reply(
          '⚠️ Could not detect the channel. Please either forward a message directly from the channel or send its <code>@username</code>.',
          { parse_mode: 'HTML' }
        );
      }

      try {
        const botMember = await ctx.api.getChatMember(targetChat.id, ctx.me.id);
        const isAdmin = ['administrator', 'creator'].includes(botMember.status);

        if (!isAdmin) {
          const name = targetChat.username ? `@${targetChat.username}` : targetChat.title;
          return ctx.reply(ctx.t('channel_error_not_admin', name), { parse_mode: 'HTML' });
        }

        let inviteLink = null;
        if (targetChat.username) {
          inviteLink = `https://t.me/${targetChat.username}`;
        } else {
          try {
            inviteLink = await ctx.api.exportChatInviteLink(targetChat.id);
          } catch (e1) {
            try {
              const linkObj = await ctx.api.createChatInviteLink(targetChat.id, { creates_join_request: false });
              inviteLink = linkObj.invite_link;
            } catch (e2) {}
          }
        }

        session.data.channels = session.data.channels || [];
        if (!session.data.channels.some((c) => String(c.id) === String(targetChat.id))) {
          session.data.channels.push({
            id: targetChat.id,
            title: targetChat.title || targetChat.username || 'Channel',
            username: targetChat.username || '',
            invite_link: inviteLink
          });
        }

        await db.sessions.set(ctx.from.id, 'step_channels', session.data);

        const kb = new InlineKeyboard()
          .text(ctx.t('btn_done_channels'), 'wizard_done_channels').row()
          .text(ctx.t('btn_cancel'), 'wizard_cancel');

        const channelName = targetChat.title || targetChat.username || 'Channel';
        const cleanHandle = targetChat.username ? targetChat.username.replace(/^@/, '') : '';
        const handle = cleanHandle ? `@${cleanHandle}` : 'Private Channel';

        return ctx.reply(ctx.t('channel_added', channelName, handle), {
          parse_mode: 'HTML',
          reply_markup: kb
        });
      } catch (err) {
        console.error('Error verifying bot admin in channel:', err);
        const name = targetChat.username ? `@${targetChat.username}` : (targetChat.title || 'channel');
        return ctx.reply(ctx.t('channel_error_not_admin', name), { parse_mode: 'HTML' });
      }
    }

    if (session.step === 'step_custom_date') {
      if (!text) {
        return ctx.reply(ctx.t('wizard_invalid_date'), { parse_mode: 'HTML' });
      }
      const endAt = parseCustomDate(text);
      if (!endAt) {
        return ctx.reply(ctx.t('wizard_invalid_date'), { parse_mode: 'HTML' });
      }
      if (endAt <= Date.now() + 60000) {
        return ctx.reply(ctx.t('wizard_date_in_past'), { parse_mode: 'HTML' });
      }

      return showGiveawayPreview(ctx, session, endAt);
    }
  });

  bot.callbackQuery('wizard_skip_desc', async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!ctx.from) return;
    const session = await db.sessions.get(ctx.from.id);
    if (!session) return;

    session.data.description = '';
    await db.sessions.set(ctx.from.id, 'step_winners', session.data);
    await ctx.reply(ctx.t('wizard_step_winners'), {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().text(ctx.t('btn_cancel'), 'wizard_cancel')
    });
  });

  bot.callbackQuery('wizard_done_channels', async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!ctx.from) return;
    const session = await db.sessions.get(ctx.from.id);
    if (!session || !session.data.channels || session.data.channels.length === 0) {
      return ctx.reply(ctx.t('need_at_least_one_channel'));
    }

    await db.sessions.set(ctx.from.id, 'step_duration', session.data);

    const kb = new InlineKeyboard()
      .text(ctx.t('btn_1_hour'), 'dur_3600000')
      .text(ctx.t('btn_6_hours'), 'dur_21600000').row()
      .text(ctx.t('btn_24_hours'), 'dur_86400000')
      .text(ctx.t('btn_3_days'), 'dur_259200000').row()
      .text(ctx.t('btn_7_days'), 'dur_604800000').row()
      .text(ctx.t('btn_custom_date'), 'dur_custom').row()
      .text(ctx.t('btn_cancel'), 'wizard_cancel');

    await ctx.reply(ctx.t('wizard_step_duration'), {
      parse_mode: 'HTML',
      reply_markup: kb
    });
  });

  bot.callbackQuery('dur_custom', async (ctx) => {
    if (!ctx.from) return ctx.answerCallbackQuery();
    const session = await db.sessions.get(ctx.from.id);
    if (!session || !session.data) {
      return ctx.answerCallbackQuery({ text: ctx.t('session_expired'), show_alert: true });
    }
    await ctx.answerCallbackQuery();

    await db.sessions.set(ctx.from.id, 'step_custom_date', session.data);

    await ctx.reply(ctx.t('wizard_step_custom_date'), {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().text(ctx.t('btn_cancel'), 'wizard_cancel')
    });
  });

  bot.callbackQuery(/^dur_(\d+)$/, async (ctx) => {
    if (!ctx.from) return ctx.answerCallbackQuery();
    const session = await db.sessions.get(ctx.from.id);
    if (!session || !session.data) {
      return ctx.answerCallbackQuery({ text: ctx.t('session_expired'), show_alert: true });
    }
    await ctx.answerCallbackQuery();

    const durationMs = parseInt(ctx.match[1], 10);
    const endAt = Date.now() + durationMs;

    await showGiveawayPreview(ctx, session, endAt);
  });

  bot.callbackQuery('wizard_publish', async (ctx) => {
    if (!ctx.from) return ctx.answerCallbackQuery();
    const session = await db.sessions.get(ctx.from.id);
    if (!session || !session.data || !session.data.channels || session.data.channels.length === 0) {
      return ctx.answerCallbackQuery({ text: ctx.t('session_expired'), show_alert: true });
    }
    await ctx.answerCallbackQuery();

    const d = session.data;
    const targetChannel = d.channels[0];

    const giveawayId = await db.giveaways.create({
      public_id: d.public_id,
      creator_id: ctx.from.id,
      prize: d.prize,
      description: d.description,
      winners_count: d.winners_count,
      required_channels: d.channels,
      target_chat_id: String(targetChannel.id),
      status: 'active',
      end_type: 'time',
      end_at: d.end_at,
      seed_hash: d.seed_hash,
      server_seed: d.server_seed
    });

    await db.sessions.clear(ctx.from.id);

    const postText = ctx.t('giveaway_card', {
      prize: d.prize,
      description: d.description,
      winnersCount: d.winners_count,
      channels: d.channels,
      endAtFormatted: formatDate(d.end_at, ctx.lang),
      seedHash: d.seed_hash
    });

    const postKb = buildPostActionKeyboard(ctx.lang, d.public_id, 0, targetChannel);

    try {
      const sentMsg = await ctx.api.sendMessage(targetChannel.id, postText, {
        parse_mode: 'HTML',
        reply_markup: postKb,
        disable_web_page_preview: true
      });

      await db.giveaways.updatePostDetails(giveawayId, targetChannel.id, sentMsg.message_id);

      await ctx.reply(
        `🎉 <b>Giveaway published successfully to @${targetChannel.username}!</b>\n\nLink: https://t.me/${targetChannel.username}/${sentMsg.message_id}`,
        {
          parse_mode: 'HTML',
          reply_markup: getMainMenuKeyboard(ctx.lang)
        }
      );
    } catch (err) {
      console.error('Failed to publish to channel:', err);
      await ctx.reply(
        `❌ Failed to publish directly to @${targetChannel.username}. Please make sure @TemkaDrawBot has "Post Messages" permission in the channel!`,
        {
          reply_markup: getMainMenuKeyboard(ctx.lang)
        }
      );
    }
  });

  bot.callbackQuery(/^join_([a-f0-9]+)$/, async (ctx) => {
    const publicId = ctx.match[1];
    const g = await getOrRecoverGiveaway(db, publicId, ctx.callbackQuery?.message);

    if (!g) {
      return ctx.answerCallbackQuery({ text: 'Giveaway not found.', show_alert: true });
    }

    if (g.status === 'finished') {
      return ctx.answerCallbackQuery({ text: ctx.t('alert_ended'), show_alert: true });
    }

    const userId = ctx.from.id;
    const alreadyIn = await db.participants.isParticipating(g.id, userId);

    if (alreadyIn) {
      await db.participants.remove(g.id, userId);
      const newCount = await db.participants.count(g.id);

      await ctx.answerCallbackQuery({ text: ctx.t('alert_left_giveaway'), show_alert: true });

      try {
        await ctx.editMessageReplyMarkup({
          reply_markup: buildPostActionKeyboard(ctx.lang, g.public_id, newCount, g.required_channels?.[0])
        });
      } catch (err) {}
      return;
    }

    const missing = [];
    for (const ch of g.required_channels) {
      const subscribed = await isUserSubscribed(ctx.api, ch.id, userId);
      if (!subscribed) {
        missing.push(`• @${ch.username || ch.title}`);
      }
    }

    if (missing.length > 0) {
      return ctx.answerCallbackQuery({
        text: ctx.t('alert_must_subscribe', missing.join('\n')),
        show_alert: true
      });
    }

    await db.participants.add(g.id, userId, ctx.from.username, ctx.from.first_name);
    const newCount = await db.participants.count(g.id);

    await ctx.answerCallbackQuery({ text: ctx.t('alert_success_joined'), show_alert: true });

    try {
      await ctx.editMessageReplyMarkup({
        reply_markup: buildPostActionKeyboard(ctx.lang, g.public_id, newCount, g.required_channels?.[0])
      });
    } catch (err) {}
  });

  bot.callbackQuery(/^stats_([a-f0-9]+)$/, async (ctx) => {
    const publicId = ctx.match[1];
    const g = await getOrRecoverGiveaway(db, publicId, ctx.callbackQuery?.message);
    if (!g) return ctx.answerCallbackQuery();

    const count = await db.participants.count(g.id);
    const text =
      `📊 <b>Temka Random Stats</b>\n\n` +
      `👥 Participants: <b>${count}</b>\n` +
      `🏆 Winners to pick: <b>${g.winners_count}</b>\n` +
      `🔒 Provably Fair Hash:\n<code>${g.seed_hash}</code>`;

    await ctx.answerCallbackQuery();
    await ctx.reply(text, { parse_mode: 'HTML' });
  });

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

      const participants = await db.participants.listForGiveaway(g.id);

      if (!participants || participants.length === 0) {
        await db.giveaways.finish(g.id, g.server_seed, []);
        finishedPersisted = true;
        try {
          if (g.channel_post_chat_id && g.channel_post_message_id) {
            await bot.api.sendMessage(
              g.channel_post_chat_id,
              `🏁 <b>Giveaway Finished: ${g.prize}</b>\n\n${t(defaultLang, 'no_participants')}`,
              {
                parse_mode: 'HTML',
                reply_to_message_id: g.channel_post_message_id
              }
            );
          }
        } catch (e) {
          console.error('Error notifying empty giveaway finish:', e);
        }
        return;
      }

      const candidateWinners = fairness.selectWinners(g.server_seed, participants, participants.length);

      const verifiedWinners = [];
      for (const candidate of candidateWinners) {
        if (verifiedWinners.length >= g.winners_count) break;

        let stillSubscribed = true;
        for (const ch of g.required_channels) {
          if (!(await isUserSubscribed(bot.api, ch.id, candidate.user_id))) {
            stillSubscribed = false;
            break;
          }
        }

        if (stillSubscribed) {
          verifiedWinners.push(candidate);
        }
      }

      await db.giveaways.finish(g.id, g.server_seed, verifiedWinners);
      finishedPersisted = true;

      let winnersText = '';
      verifiedWinners.forEach((w, idx) => {
        const handle = w.username ? `@${w.username}` : `<a href="tg://user?id=${w.user_id}">${w.first_name || 'User'}</a>`;
        winnersText += `${idx + 1}. ${handle}\n`;
      });

      const finishCard = t(defaultLang, 'giveaway_finished_card', {
        prize: g.prize,
        winnersText: winnersText || t(defaultLang, 'no_participants'),
        serverSeed: g.server_seed,
        seedHash: g.seed_hash,
        finishedAtFormatted: formatDate(Date.now(), defaultLang)
      });

      const finishKb = new InlineKeyboard()
        .url(t(defaultLang, 'btn_create_own'), 'https://t.me/TemkaDrawBot?start=create');

      try {
        if (g.channel_post_chat_id && g.channel_post_message_id) {
          await bot.api.editMessageText(g.channel_post_chat_id, g.channel_post_message_id, finishCard, {
            parse_mode: 'HTML',
            reply_markup: finishKb,
            disable_web_page_preview: true
          });

          await bot.api.sendMessage(
            g.channel_post_chat_id,
            `🎉 <b>Congratulations to the winners of ${g.prize}!</b>\n\n${winnersText}`,
            {
              parse_mode: 'HTML',
              reply_markup: finishKb,
              reply_to_message_id: g.channel_post_message_id
            }
          );
        }
      } catch (err) {
        console.error('Error posting finished giveaway to channel:', err);
      }

      const primaryChannel = (g.required_channels && g.required_channels[0]) ? g.required_channels[0] : null;
      const channelTitle = primaryChannel ? (primaryChannel.title || 'Vertex Beats') : 'Vertex Beats';
      const rawHandle = primaryChannel ? (primaryChannel.username || 'CyberBeats44').replace(/^@/, '') : 'CyberBeats44';
      const directLink = `https://t.me/${rawHandle}?direct`;

      for (const w of verifiedWinners) {
        try {
          const userObj = await db.users.get(w.user_id);
          const userLang = userObj ? (userObj.lang || 'en') : 'en';
          const dmText = t(userLang, 'winner_dm_notification', {
            prize: g.prize,
            channel: channelTitle,
            directLink
          });

          const dmKb = new InlineKeyboard().url(t(userLang, 'btn_claim_shoutout'), directLink);

          await bot.api.sendMessage(w.user_id, dmText, {
            parse_mode: 'HTML',
            reply_markup: dmKb,
            disable_web_page_preview: true
          });
        } catch (dmErr) {
          // User hasn't started bot in DM yet
        }
      }

      try {
        if (g.creator_id) {
          await bot.api.sendMessage(
            g.creator_id,
            `🏆 <b>Giveaway Finished: ${g.prize}</b>\n\n` +
            `The draw has completed on your channel! Here are your winners:\n\n` +
            (winnersText || 'No winners') +
            `\nReach out to them for their shoutout!`,
            { parse_mode: 'HTML' }
          );
        }
      } catch (creatorErr) {}
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
