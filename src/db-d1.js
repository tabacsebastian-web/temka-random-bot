const { parseGiveawayRow, serializeSettings } = require('./db-helpers');

/**
 * Creates an async database adapter backed by Cloudflare D1.
 * Mirrors the interface of src/db.js so bot-core works seamlessly on both runtimes.
 */
function createD1Database(d1, defaultLang = 'en') {
  async function syncReferrerTickets(giveawayId, referrerId) {
    if (!referrerId) return;
    await d1
      .prepare(`
        UPDATE participants
        SET extra_tickets = (
          SELECT COUNT(*) FROM participants p2 WHERE p2.giveaway_id = ? AND p2.referred_by = ?
        )
        WHERE giveaway_id = ? AND user_id = ?
      `)
      .bind(giveawayId, referrerId, giveawayId, referrerId)
      .run();
  }

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
        const now = Date.now();
        return d1.prepare(`
          INSERT INTO users (user_id, username, first_name, lang, created_at, last_active_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            username = excluded.username,
            first_name = excluded.first_name,
            last_active_at = excluded.last_active_at
        `).bind(id, username || null, firstName || '', lang, now, now).run();
      },
      touch: async (id) => {
        return d1.prepare('UPDATE users SET last_active_at = ? WHERE user_id = ?').bind(Date.now(), id).run();
      },
      setLang: async (id, lang) => {
        return d1.prepare('UPDATE users SET lang = ?, last_active_at = ? WHERE user_id = ?').bind(lang, Date.now(), id).run();
      }
    },

    stats: {
      getPublicStats: async () => {
        const since = Date.now() - 30 * 86400000;
        const row = await d1.prepare(`
          SELECT
            (SELECT COUNT(*) FROM (
              SELECT user_id AS uid FROM users WHERE COALESCE(last_active_at, created_at, 0) >= ?
              UNION
              SELECT user_id AS uid FROM participants WHERE joined_at >= ?
              UNION
              SELECT creator_id AS uid FROM giveaways WHERE created_at >= ? AND creator_id > 0
            )) AS active_users,
            (SELECT COUNT(*) FROM giveaways) AS total_giveaways,
            (SELECT COUNT(*) FROM participants) AS total_participants
        `).bind(since, since, since).first();
        return {
          activeUsers30d: Number(row?.active_users || 0),
          totalGiveaways: Number(row?.total_giveaways || 0),
          totalParticipants: Number(row?.total_participants || 0)
        };
      }
    },

    giveaways: {
      create: async (data) => {
        const res = await d1.prepare(`
          INSERT INTO giveaways (
            public_id, creator_id, prize, description, winners_count,
            required_channels, target_chat_id, channel_post_chat_id, channel_post_message_id,
            status, end_type, end_at, end_count, seed_hash, server_seed, created_at,
            lang, photo_file_id, settings_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          data.created_at || Date.now(),
          data.lang || defaultLang,
          data.photo_file_id || null,
          serializeSettings(data.settings)
        ).run();
        return res.meta?.last_row_id;
      },

      getByPublicId: async (publicId) => {
        const row = await d1.prepare('SELECT * FROM giveaways WHERE public_id = ?').bind(publicId).first();
        return parseGiveawayRow(row, defaultLang);
      },

      getBySeedHash: async (seedHash) => {
        const row = await d1.prepare('SELECT * FROM giveaways WHERE seed_hash = ? LIMIT 1').bind(seedHash).first();
        return parseGiveawayRow(row, defaultLang);
      },

      getById: async (id) => {
        const row = await d1.prepare('SELECT * FROM giveaways WHERE id = ?').bind(id).first();
        return parseGiveawayRow(row, defaultLang);
      },

      getActiveToFinish: async (now = Date.now()) => {
        const res = await d1.prepare(`
          SELECT * FROM giveaways
          WHERE status = 'active' AND (
            (end_type = 'time' AND end_at <= ?)
            OR (end_type = 'participants' AND end_count > 0 AND (
              (SELECT COUNT(*) FROM participants WHERE giveaway_id = giveaways.id) >= end_count
              OR (end_at IS NOT NULL AND end_at <= ?)
            ))
          )
        `).bind(now, now).all();
        return (res.results || []).map((row) => parseGiveawayRow(row, defaultLang));
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

      updatePostDetails: async (id, chatId, messageId, settings = undefined) => {
        if (settings !== undefined) {
          await d1
            .prepare("UPDATE giveaways SET channel_post_chat_id = ?, channel_post_message_id = ?, status = 'active', settings_json = ? WHERE id = ?")
            .bind(String(chatId), messageId, serializeSettings(settings), id)
            .run();
        } else {
          await d1
            .prepare("UPDATE giveaways SET channel_post_chat_id = ?, channel_post_message_id = ?, status = 'active' WHERE id = ?")
            .bind(String(chatId), messageId, id)
            .run();
        }
      },

      finish: async (id, serverSeed, winners) => {
        await d1
          .prepare("UPDATE giveaways SET status = 'finished', server_seed = ?, winners_json = ?, finished_at = ? WHERE id = ?")
          .bind(serverSeed, JSON.stringify(winners), Date.now(), id)
          .run();
      },

      updateWinners: async (id, winners) => {
        await d1
          .prepare('UPDATE giveaways SET winners_json = ? WHERE id = ?')
          .bind(JSON.stringify(winners), id)
          .run();
      },

      cancel: async (id) => {
        const res = await d1
          .prepare("UPDATE giveaways SET status = 'cancelled', finished_at = ? WHERE id = ? AND status IN ('active', 'draft')")
          .bind(Date.now(), id)
          .run();
        return (res.meta?.changes || 0) > 0;
      },

      listByCreator: async (creatorId) => {
        const res = await d1
          .prepare('SELECT * FROM giveaways WHERE creator_id = ? ORDER BY id DESC LIMIT 20')
          .bind(creatorId)
          .all();
        return (res.results || []).map((row) => parseGiveawayRow(row, defaultLang));
      },

      listByCreatorWithCounts: async (creatorId) => {
        const res = await d1
          .prepare(`
            SELECT g.*, (SELECT COUNT(*) FROM participants p WHERE p.giveaway_id = g.id) AS participant_count
            FROM giveaways g
            WHERE g.creator_id = ?
            ORDER BY g.id DESC
            LIMIT 20
          `)
          .bind(creatorId)
          .all();
        return (res.results || []).map((row) => {
          const count = Number(row.participant_count || 0);
          delete row.participant_count;
          const parsed = parseGiveawayRow(row, defaultLang);
          parsed.participant_count = count;
          return parsed;
        });
      },

      getWithParticipant: async (publicId, userId) => {
        const row = await d1
          .prepare(`
            SELECT
              g.*,
              p.user_id AS _p_user_id,
              p.extra_tickets AS _p_extra_tickets,
              p.referred_by AS _p_referred_by,
              (SELECT COUNT(*) FROM participants WHERE giveaway_id = g.id) AS _p_count
            FROM giveaways g
            LEFT JOIN participants p ON p.giveaway_id = g.id AND p.user_id = ?
            WHERE g.public_id = ?
          `)
          .bind(userId, publicId)
          .first();
        if (!row) return null;
        const isJoined = row._p_user_id != null;
        const extraTickets = Number(row._p_extra_tickets || 0);
        const referredBy = row._p_referred_by != null ? Number(row._p_referred_by) : null;
        const participantsCount = Number(row._p_count || 0);
        delete row._p_user_id;
        delete row._p_extra_tickets;
        delete row._p_referred_by;
        delete row._p_count;
        return {
          giveaway: parseGiveawayRow(row, defaultLang),
          isJoined,
          extraTickets,
          referredBy,
          participantsCount
        };
      }
    },

    participants: {
      get: async (giveawayId, userId) => {
        return d1
          .prepare('SELECT * FROM participants WHERE giveaway_id = ? AND user_id = ?')
          .bind(giveawayId, userId)
          .first();
      },

      add: async (giveawayId, userId, username, firstName, referredBy = null) => {
        let validReferrer = null;
        if (referredBy && String(referredBy) !== String(userId)) {
          const refRow = await d1
            .prepare('SELECT 1 AS found FROM participants WHERE giveaway_id = ? AND user_id = ?')
            .bind(giveawayId, referredBy)
            .first();
          if (refRow) {
            validReferrer = Number(referredBy);
          }
        }

        const res = await d1
          .prepare(`
            INSERT OR IGNORE INTO participants (giveaway_id, user_id, username, first_name, joined_at, extra_tickets, referred_by)
            VALUES (?, ?, ?, ?, ?, 0, ?)
          `)
          .bind(giveawayId, userId, username || null, firstName || '', Date.now(), validReferrer)
          .run();

        const added = (res.meta?.changes || 0) > 0;
        if (added && validReferrer) {
          await syncReferrerTickets(giveawayId, validReferrer);
        }
        return added;
      },

      remove: async (giveawayId, userId) => {
        const existing = await d1
          .prepare('SELECT referred_by FROM participants WHERE giveaway_id = ? AND user_id = ?')
          .bind(giveawayId, userId)
          .first();

        const res = await d1
          .prepare('DELETE FROM participants WHERE giveaway_id = ? AND user_id = ?')
          .bind(giveawayId, userId)
          .run();
        const removed = (res.meta?.changes || 0) > 0;
        if (removed && existing?.referred_by) {
          await syncReferrerTickets(giveawayId, existing.referred_by);
        }
        return removed;
      },

      joinFast: async (giveawayId, userId, username, firstName, referredBy = null) => {
        const candidateRef = referredBy && String(referredBy) !== String(userId) ? Number(referredBy) : null;
        const stmts = [
          d1
            .prepare(`
              INSERT OR IGNORE INTO participants (giveaway_id, user_id, username, first_name, joined_at, extra_tickets, referred_by)
              SELECT ?, ?, ?, ?, ?, 0, (
                SELECT p_ref.user_id FROM participants p_ref WHERE p_ref.giveaway_id = ? AND p_ref.user_id = ? LIMIT 1
              )
            `)
            .bind(giveawayId, userId, username || null, firstName || '', Date.now(), giveawayId, candidateRef)
        ];
        if (candidateRef) {
          stmts.push(
            d1
              .prepare(`
                UPDATE participants
                SET extra_tickets = (
                  SELECT COUNT(*) FROM participants p2 WHERE p2.giveaway_id = ? AND p2.referred_by = ?
                )
                WHERE giveaway_id = ? AND user_id = ?
              `)
              .bind(giveawayId, candidateRef, giveawayId, candidateRef)
          );
        }
        stmts.push(
          d1
            .prepare('SELECT extra_tickets FROM participants WHERE giveaway_id = ? AND user_id = ?')
            .bind(giveawayId, userId),
          d1
            .prepare('SELECT COUNT(*) AS cnt FROM participants WHERE giveaway_id = ?')
            .bind(giveawayId)
        );

        let results;
        if (typeof d1.batch === 'function') {
          results = await d1.batch(stmts);
        } else {
          results = [];
          for (const stmt of stmts) {
            results.push(await stmt.all());
          }
        }

        const added = (results[0]?.meta?.changes || 0) > 0;
        const selfRes = results[stmts.length - 2];
        const countRes = results[stmts.length - 1];
        const extraTickets = Number(selfRes?.results?.[0]?.extra_tickets ?? 0);
        const count = Number(countRes?.results?.[0]?.cnt ?? 0);
        return { added, extraTickets, count };
      },

      removeFast: async (giveawayId, userId, knownReferredBy = undefined) => {
        let refId = knownReferredBy;
        if (refId === undefined) {
          const existing = await d1
            .prepare('SELECT referred_by FROM participants WHERE giveaway_id = ? AND user_id = ?')
            .bind(giveawayId, userId)
            .first();
          refId = existing?.referred_by || null;
        }

        const stmts = [
          d1
            .prepare('DELETE FROM participants WHERE giveaway_id = ? AND user_id = ?')
            .bind(giveawayId, userId)
        ];
        if (refId) {
          stmts.push(
            d1
              .prepare(`
                UPDATE participants
                SET extra_tickets = (
                  SELECT COUNT(*) FROM participants p2 WHERE p2.giveaway_id = ? AND p2.referred_by = ?
                )
                WHERE giveaway_id = ? AND user_id = ?
              `)
              .bind(giveawayId, refId, giveawayId, refId)
          );
        }
        stmts.push(
          d1
            .prepare('SELECT COUNT(*) AS cnt FROM participants WHERE giveaway_id = ?')
            .bind(giveawayId)
        );

        let results;
        if (typeof d1.batch === 'function') {
          results = await d1.batch(stmts);
        } else {
          results = [];
          for (const stmt of stmts) {
            results.push(await stmt.all());
          }
        }

        const removed = (results[0]?.meta?.changes || 0) > 0;
        const countRes = results[stmts.length - 1];
        const count = Number(countRes?.results?.[0]?.cnt ?? 0);
        return { removed, count };
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
          .prepare('SELECT user_id, username, first_name, joined_at, extra_tickets, referred_by FROM participants WHERE giveaway_id = ? ORDER BY joined_at ASC')
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
