function parseGiveawayRow(row) {
  if (!row) return null;
  if (typeof row.required_channels === 'string') {
    row.required_channels = JSON.parse(row.required_channels || '[]');
  }
  return row;
}

/**
 * Creates an async database adapter backed by Cloudflare D1.
 * Mirrors the interface of src/db.js so bot-core works seamlessly on both runtimes.
 */
function createD1Database(d1, defaultLang = 'ru') {
  return {
    ping: async () => {
      await d1.prepare('SELECT 1 AS ok').first();
      return true;
    },

    users: {
      get: async (id) => {
        return d1.prepare('SELECT * FROM users WHERE user_id = ?').bind(id).first();
      },
      upsert: async (id, username, firstName, lang = defaultLang) => {
        return d1.prepare(`
          INSERT INTO users (user_id, username, first_name, lang, created_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            username = excluded.username,
            first_name = excluded.first_name
        `).bind(id, username || null, firstName || '', lang, Date.now()).run();
      },
      setLang: async (id, lang) => {
        return d1.prepare('UPDATE users SET lang = ? WHERE user_id = ?').bind(lang, id).run();
      }
    },

    giveaways: {
      create: async (data) => {
        const res = await d1.prepare(`
          INSERT INTO giveaways (
            public_id, creator_id, prize, description, winners_count,
            required_channels, target_chat_id, channel_post_chat_id, channel_post_message_id,
            status, end_type, end_at, end_count, seed_hash, server_seed, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          data.public_id,
          data.creator_id,
          data.prize,
          data.description || '',
          data.winners_count || 1,
          JSON.stringify(data.required_channels || []),
          data.target_chat_id || null,
          data.channel_post_chat_id || null,
          data.channel_post_message_id || null,
          data.status || 'draft',
          data.end_type || 'time',
          data.end_at || null,
          data.end_count || 0,
          data.seed_hash || '',
          data.server_seed || '',
          data.created_at || Date.now()
        ).run();
        return res.meta?.last_row_id;
      },

      getByPublicId: async (publicId) => {
        const row = await d1.prepare('SELECT * FROM giveaways WHERE public_id = ?').bind(publicId).first();
        return parseGiveawayRow(row);
      },

      getById: async (id) => {
        const row = await d1.prepare('SELECT * FROM giveaways WHERE id = ?').bind(id).first();
        return parseGiveawayRow(row);
      },

      getActiveToFinish: async (now = Date.now()) => {
        const res = await d1.prepare(`
          SELECT * FROM giveaways
          WHERE status = 'active' AND (
            (end_type = 'time' AND end_at <= ?)
            OR (end_type = 'participants' AND (SELECT COUNT(*) FROM participants WHERE giveaway_id = giveaways.id) >= end_count)
          )
        `).bind(now).all();
        return (res.results || []).map(parseGiveawayRow);
      },

      claimForFinish: async (id) => {
        const res = await d1
          .prepare("UPDATE giveaways SET status = 'finalizing' WHERE id = ? AND status = 'active'")
          .bind(id)
          .run();
        return (res.meta?.changes || 0) > 0;
      },

      releaseFinishClaim: async (id) => {
        await d1
          .prepare("UPDATE giveaways SET status = 'active' WHERE id = ? AND status = 'finalizing'")
          .bind(id)
          .run();
      },

      updatePostDetails: async (id, chatId, messageId) => {
        await d1
          .prepare("UPDATE giveaways SET channel_post_chat_id = ?, channel_post_message_id = ?, status = 'active' WHERE id = ?")
          .bind(String(chatId), messageId, id)
          .run();
      },

      finish: async (id, serverSeed, winners) => {
        await d1
          .prepare("UPDATE giveaways SET status = 'finished', server_seed = ?, winners_json = ?, finished_at = ? WHERE id = ?")
          .bind(serverSeed, JSON.stringify(winners), Date.now(), id)
          .run();
      },

      listByCreator: async (creatorId) => {
        const res = await d1
          .prepare('SELECT * FROM giveaways WHERE creator_id = ? ORDER BY id DESC LIMIT 20')
          .bind(creatorId)
          .all();
        return res.results || [];
      }
    },

    participants: {
      add: async (giveawayId, userId, username, firstName) => {
        const res = await d1
          .prepare(`
            INSERT OR IGNORE INTO participants (giveaway_id, user_id, username, first_name, joined_at)
            VALUES (?, ?, ?, ?, ?)
          `)
          .bind(giveawayId, userId, username || null, firstName || '', Date.now())
          .run();
        return (res.meta?.changes || 0) > 0;
      },

      remove: async (giveawayId, userId) => {
        const res = await d1
          .prepare('DELETE FROM participants WHERE giveaway_id = ? AND user_id = ?')
          .bind(giveawayId, userId)
          .run();
        return (res.meta?.changes || 0) > 0;
      },

      count: async (giveawayId) => {
        const row = await d1
          .prepare('SELECT COUNT(*) as cnt FROM participants WHERE giveaway_id = ?')
          .bind(giveawayId)
          .first();
        return row ? Number(row.cnt) : 0;
      },

      isParticipating: async (giveawayId, userId) => {
        const row = await d1
          .prepare('SELECT 1 AS found FROM participants WHERE giveaway_id = ? AND user_id = ?')
          .bind(giveawayId, userId)
          .first();
        return Boolean(row);
      },

      listForGiveaway: async (giveawayId) => {
        const res = await d1
          .prepare('SELECT user_id, username, first_name, joined_at FROM participants WHERE giveaway_id = ? ORDER BY joined_at ASC')
          .bind(giveawayId)
          .all();
        return res.results || [];
      }
    },

    sessions: {
      get: async (userId) => {
        const row = await d1.prepare('SELECT * FROM sessions WHERE user_id = ?').bind(userId).first();
        if (!row) return null;
        return { step: row.step, data: JSON.parse(row.data || '{}') };
      },

      set: async (userId, step, data = {}) => {
        await d1
          .prepare(`
            INSERT INTO sessions (user_id, step, data)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
              step = excluded.step,
              data = excluded.data
          `)
          .bind(userId, step, JSON.stringify(data))
          .run();
      },

      clear: async (userId) => {
        await d1.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
      }
    }
  };
}

module.exports = {
  createD1Database
};
