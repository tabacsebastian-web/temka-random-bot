const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { parseGiveawayRow, serializeSettings } = require('./db-helpers');

// Ensure database directory exists
const dbDir = path.dirname(config.DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new DatabaseSync(config.DB_PATH);

// Enable WAL mode for high concurrency
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;

  CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    lang TEXT DEFAULT 'en',
    created_at INTEGER,
    last_active_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS giveaways (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT UNIQUE,
    creator_id INTEGER,
    prize TEXT,
    description TEXT,
    winners_count INTEGER DEFAULT 1,
    required_channels TEXT, -- JSON array of { id, title, username, invite_link }
    target_chat_id TEXT,    -- where to publish
    channel_post_chat_id TEXT,
    channel_post_message_id INTEGER,
    status TEXT DEFAULT 'draft', -- draft, active, finalizing, finished, cancelled
    end_type TEXT DEFAULT 'time', -- time, participants
    end_at INTEGER,
    end_count INTEGER DEFAULT 0,
    seed_hash TEXT,
    server_seed TEXT,
    created_at INTEGER,
    finished_at INTEGER,
    winners_json TEXT,
    lang TEXT DEFAULT 'en',
    photo_file_id TEXT,
    settings_json TEXT DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    giveaway_id INTEGER,
    user_id INTEGER,
    username TEXT,
    first_name TEXT,
    joined_at INTEGER,
    extra_tickets INTEGER NOT NULL DEFAULT 0,
    referred_by INTEGER,
    UNIQUE(giveaway_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    user_id INTEGER PRIMARY KEY,
    step TEXT,
    data TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_giveaways_status ON giveaways(status);
  CREATE INDEX IF NOT EXISTS idx_participants_giveaway ON participants(giveaway_id);
`);

function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// Idempotent schema migrations for existing SQLite files
ensureColumn('users', 'last_active_at', 'INTEGER');
ensureColumn('giveaways', 'lang', "TEXT DEFAULT 'en'");
ensureColumn('giveaways', 'photo_file_id', 'TEXT');
ensureColumn('giveaways', 'settings_json', "TEXT DEFAULT '{}'");
ensureColumn('participants', 'extra_tickets', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('participants', 'referred_by', 'INTEGER');
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_participants_referred_by ON participants(giveaway_id, referred_by);
  CREATE INDEX IF NOT EXISTS idx_giveaways_creator_id ON giveaways(creator_id);
  CREATE INDEX IF NOT EXISTS idx_giveaways_seed_hash ON giveaways(seed_hash);
  CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active_at);
  CREATE INDEX IF NOT EXISTS idx_participants_joined_at ON participants(joined_at);
  CREATE INDEX IF NOT EXISTS idx_giveaways_created_at ON giveaways(created_at);
`);

const userQueries = {
  get: db.prepare('SELECT * FROM users WHERE user_id = ?'),
  upsert: db.prepare(`
    INSERT INTO users (user_id, username, first_name, lang, created_at, last_active_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      username = excluded.username,
      first_name = excluded.first_name,
      last_active_at = excluded.last_active_at
  `),
  touch: db.prepare('UPDATE users SET last_active_at = ? WHERE user_id = ?'),
  setLang: db.prepare('UPDATE users SET lang = ?, last_active_at = ? WHERE user_id = ?')
};

const giveawayQueries = {
  getByPublicId: db.prepare('SELECT * FROM giveaways WHERE public_id = ?'),
  getById: db.prepare('SELECT * FROM giveaways WHERE id = ?'),
  getActiveToFinish: db.prepare(`
    SELECT * FROM giveaways
    WHERE status = 'active' AND (
      (end_type = 'time' AND end_at <= ?)
      OR (end_type = 'participants' AND end_count > 0 AND (
        (SELECT COUNT(*) FROM participants WHERE giveaway_id = giveaways.id) >= end_count
        OR (end_at IS NOT NULL AND end_at <= ?)
      ))
    )
  `),
  updatePostDetails: db.prepare(`
    UPDATE giveaways
    SET channel_post_chat_id = ?, channel_post_message_id = ?, status = 'active'
    WHERE id = ?
  `),
  updatePostDetailsWithSettings: db.prepare(`
    UPDATE giveaways
    SET channel_post_chat_id = ?, channel_post_message_id = ?, status = 'active', settings_json = ?
    WHERE id = ?
  `),
  finish: db.prepare(`
    UPDATE giveaways
    SET status = 'finished', server_seed = ?, winners_json = ?, finished_at = ?
    WHERE id = ?
  `),
  updateWinners: db.prepare('UPDATE giveaways SET winners_json = ? WHERE id = ?'),
  cancel: db.prepare("UPDATE giveaways SET status = 'cancelled', finished_at = ? WHERE id = ? AND status IN ('active', 'draft')"),
  listByCreator: db.prepare('SELECT * FROM giveaways WHERE creator_id = ? ORDER BY id DESC LIMIT 20'),
  listByCreatorWithCounts: db.prepare(`
    SELECT g.*, (SELECT COUNT(*) FROM participants p WHERE p.giveaway_id = g.id) AS participant_count
    FROM giveaways g
    WHERE g.creator_id = ?
    ORDER BY g.id DESC
    LIMIT 20
  `),
  getWithParticipant: db.prepare(`
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
};

const participantQueries = {
  get: db.prepare('SELECT * FROM participants WHERE giveaway_id = ? AND user_id = ?'),
  add: db.prepare(`
    INSERT OR IGNORE INTO participants (giveaway_id, user_id, username, first_name, joined_at, extra_tickets, referred_by)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `),
  remove: db.prepare('DELETE FROM participants WHERE giveaway_id = ? AND user_id = ?'),
  count: db.prepare('SELECT COUNT(*) as cnt FROM participants WHERE giveaway_id = ?'),
  isParticipating: db.prepare('SELECT 1 FROM participants WHERE giveaway_id = ? AND user_id = ?'),
  listForGiveaway: db.prepare('SELECT user_id, username, first_name, joined_at, extra_tickets, referred_by FROM participants WHERE giveaway_id = ? ORDER BY joined_at ASC'),
  syncReferrerTickets: db.prepare(`
    UPDATE participants
    SET extra_tickets = (
      SELECT COUNT(*) FROM participants p2 WHERE p2.giveaway_id = ? AND p2.referred_by = ?
    )
    WHERE giveaway_id = ? AND user_id = ?
  `)
};

const sessionQueries = {
  get: db.prepare('SELECT * FROM sessions WHERE user_id = ?'),
  set: db.prepare(`
    INSERT INTO sessions (user_id, step, data)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      step = excluded.step,
      data = excluded.data
  `),
  clear: db.prepare('DELETE FROM sessions WHERE user_id = ?')
};

let changeListener = null;
function notifyChange() {
  if (typeof changeListener === 'function') {
    changeListener();
  }
}

module.exports = {
  db,
  onChange: (cb) => {
    changeListener = cb;
  },
  exportState: () => {
    const users = db.prepare('SELECT * FROM users').all();
    const giveaways = db.prepare('SELECT * FROM giveaways').all();
    const participants = db.prepare(`
      SELECT p.user_id, p.username, p.first_name, p.joined_at, p.extra_tickets, p.referred_by, g.public_id AS giveaway_public_id
      FROM participants p
      JOIN giveaways g ON g.id = p.giveaway_id
    `).all();
    return { users, giveaways, participants, exportedAt: Date.now() };
  },
  importState: (state) => {
    if (!state || typeof state !== 'object') return;
    const insertUser = db.prepare(`
      INSERT OR IGNORE INTO users (user_id, username, first_name, lang, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const u of state.users || []) {
      insertUser.run(u.user_id, u.username || null, u.first_name || '', u.lang || config.DEFAULT_LANG, u.created_at || Date.now());
    }

    const insertGiveaway = db.prepare(`
      INSERT OR IGNORE INTO giveaways (
        public_id, creator_id, prize, description, winners_count,
        required_channels, target_chat_id, channel_post_chat_id, channel_post_message_id,
        status, end_type, end_at, end_count, seed_hash, server_seed,
        created_at, finished_at, winners_json, lang, photo_file_id, settings_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const g of state.giveaways || []) {
      const reqCh = typeof g.required_channels === 'string' ? g.required_channels : JSON.stringify(g.required_channels || []);
      insertGiveaway.run(
        g.public_id,
        g.creator_id || 0,
        g.prize || '',
        g.description || '',
        g.winners_count || 1,
        reqCh,
        g.target_chat_id || null,
        g.channel_post_chat_id || null,
        g.channel_post_message_id || null,
        g.status || 'active',
        g.end_type || 'time',
        g.end_at || null,
        g.end_count || 0,
        g.seed_hash || '',
        g.server_seed || '',
        g.created_at || Date.now(),
        g.finished_at || null,
        g.winners_json || null,
        g.lang || config.DEFAULT_LANG,
        g.photo_file_id || null,
        typeof g.settings_json === 'string' ? g.settings_json : serializeSettings(g.settings)
      );
    }

    const findGiveaway = db.prepare('SELECT id FROM giveaways WHERE public_id = ?');
    const insertParticipant = db.prepare(`
      INSERT OR IGNORE INTO participants (giveaway_id, user_id, username, first_name, joined_at, extra_tickets, referred_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const p of state.participants || []) {
      const row = p.giveaway_public_id ? findGiveaway.get(p.giveaway_public_id) : null;
      if (row) {
        insertParticipant.run(
          row.id,
          p.user_id,
          p.username || null,
          p.first_name || '',
          p.joined_at || Date.now(),
          p.extra_tickets || 0,
          p.referred_by || null
        );
      }
    }
  },
  users: {
    get: (id) => userQueries.get.get(id),
    upsert: (id, username, firstName, lang = config.DEFAULT_LANG) => {
      const now = Date.now();
      const res = userQueries.upsert.run(id, username || null, firstName || '', lang, now, now);
      notifyChange();
      return res;
    },
    touch: (id) => {
      return userQueries.touch.run(Date.now(), id);
    },
    setLang: (id, lang) => {
      const res = userQueries.setLang.run(lang, Date.now(), id);
      notifyChange();
      return res;
    }
  },
  stats: {
    getPublicStats: () => {
      const since = Date.now() - 30 * 86400000;
      const activeRow = db.prepare(`
        SELECT COUNT(*) AS cnt FROM (
          SELECT user_id AS uid FROM users WHERE COALESCE(last_active_at, created_at, 0) >= ?
          UNION
          SELECT user_id AS uid FROM participants WHERE joined_at >= ?
          UNION
          SELECT creator_id AS uid FROM giveaways WHERE created_at >= ? AND creator_id > 0
        )
      `).get(since, since, since);
      const giveawaysRow = db.prepare('SELECT COUNT(*) AS cnt FROM giveaways').get();
      const participantsRow = db.prepare('SELECT COUNT(*) AS cnt FROM participants').get();
      return {
        activeUsers30d: Number(activeRow?.cnt || 0),
        totalGiveaways: Number(giveawaysRow?.cnt || 0),
        totalParticipants: Number(participantsRow?.cnt || 0)
      };
    }
  },
  giveaways: {
    create: (data) => {
      const stmt = db.prepare(`
        INSERT INTO giveaways (
          public_id, creator_id, prize, description, winners_count,
          required_channels, target_chat_id, channel_post_chat_id, channel_post_message_id,
          status, end_type, end_at, end_count, seed_hash, server_seed, created_at,
          lang, photo_file_id, settings_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const info = stmt.run(
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
        data.lang || config.DEFAULT_LANG,
        data.photo_file_id || null,
        serializeSettings(data.settings)
      );
      notifyChange();
      return info.lastInsertRowid;
    },
    getByPublicId: (publicId) => parseGiveawayRow(giveawayQueries.getByPublicId.get(publicId), config.DEFAULT_LANG),
    getBySeedHash: (seedHash) => {
      const g = db.prepare('SELECT * FROM giveaways WHERE seed_hash = ? LIMIT 1').get(seedHash);
      return parseGiveawayRow(g || null, config.DEFAULT_LANG);
    },
    getById: (id) => parseGiveawayRow(giveawayQueries.getById.get(id), config.DEFAULT_LANG),
    getActiveToFinish: (now = Date.now()) => {
      return giveawayQueries.getActiveToFinish.all(now, now).map((g) => parseGiveawayRow(g, config.DEFAULT_LANG));
    },
    updatePostDetails: (id, chatId, messageId, settings = undefined) => {
      if (settings !== undefined) {
        giveawayQueries.updatePostDetailsWithSettings.run(String(chatId), messageId, serializeSettings(settings), id);
      } else {
        giveawayQueries.updatePostDetails.run(String(chatId), messageId, id);
      }
      notifyChange();
    },
    finish: (id, serverSeed, winners) => {
      giveawayQueries.finish.run(serverSeed, JSON.stringify(winners), Date.now(), id);
      notifyChange();
    },
    updateWinners: (id, winners) => {
      giveawayQueries.updateWinners.run(JSON.stringify(winners), id);
      notifyChange();
    },
    cancel: (id) => {
      const res = giveawayQueries.cancel.run(Date.now(), id);
      if (res.changes > 0) notifyChange();
      return res.changes > 0;
    },
    claimForFinish: (id) => {
      const res = db
        .prepare("UPDATE giveaways SET status = 'finalizing' WHERE id = ? AND status = 'active'")
        .run(id);
      return res.changes > 0;
    },
    releaseFinishClaim: (id) => {
      db.prepare("UPDATE giveaways SET status = 'active' WHERE id = ? AND status = 'finalizing'").run(id);
    },
    listByCreator: (creatorId) => giveawayQueries.listByCreator.all(creatorId).map((g) => parseGiveawayRow(g, config.DEFAULT_LANG)),
    listByCreatorWithCounts: (creatorId) =>
      giveawayQueries.listByCreatorWithCounts.all(creatorId).map((row) => {
        const count = Number(row.participant_count || 0);
        delete row.participant_count;
        const parsed = parseGiveawayRow(row, config.DEFAULT_LANG);
        parsed.participant_count = count;
        return parsed;
      }),
    getWithParticipant: (publicId, userId) => {
      const row = giveawayQueries.getWithParticipant.get(userId, publicId);
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
        giveaway: parseGiveawayRow(row, config.DEFAULT_LANG),
        isJoined,
        extraTickets,
        referredBy,
        participantsCount
      };
    }
  },
  participants: {
    get: (giveawayId, userId) => participantQueries.get.get(giveawayId, userId) || null,
    add: (giveawayId, userId, username, firstName, referredBy = null) => {
      let validReferrer = null;
      if (referredBy && String(referredBy) !== String(userId)) {
        if (participantQueries.isParticipating.get(giveawayId, referredBy)) {
          validReferrer = Number(referredBy);
        }
      }
      const res = participantQueries.add.run(
        giveawayId,
        userId,
        username || null,
        firstName || '',
        Date.now(),
        validReferrer
      );
      if (res.changes > 0) {
        if (validReferrer) {
          participantQueries.syncReferrerTickets.run(giveawayId, validReferrer, giveawayId, validReferrer);
        }
        notifyChange();
      }
      return res.changes > 0;
    },
    joinFast: (giveawayId, userId, username, firstName, referredBy = null) => {
      let validReferrer = null;
      if (referredBy && String(referredBy) !== String(userId)) {
        if (participantQueries.isParticipating.get(giveawayId, referredBy)) {
          validReferrer = Number(referredBy);
        }
      }
      const res = participantQueries.add.run(
        giveawayId,
        userId,
        username || null,
        firstName || '',
        Date.now(),
        validReferrer
      );
      const added = res.changes > 0;
      if (added) {
        if (validReferrer) {
          participantQueries.syncReferrerTickets.run(giveawayId, validReferrer, giveawayId, validReferrer);
        }
        notifyChange();
      }
      const selfRow = participantQueries.get.get(giveawayId, userId);
      const countRow = participantQueries.count.get(giveawayId);
      return {
        added,
        extraTickets: Number(selfRow?.extra_tickets || 0),
        count: Number(countRow?.cnt || 0)
      };
    },
    remove: (giveawayId, userId) => {
      const existing = participantQueries.get.get(giveawayId, userId);
      const res = participantQueries.remove.run(giveawayId, userId);
      if (res.changes > 0) {
        if (existing?.referred_by) {
          participantQueries.syncReferrerTickets.run(giveawayId, existing.referred_by, giveawayId, existing.referred_by);
        }
        notifyChange();
      }
      return res.changes > 0;
    },
    removeFast: (giveawayId, userId, knownReferredBy = undefined) => {
      const refId = knownReferredBy !== undefined
        ? knownReferredBy
        : participantQueries.get.get(giveawayId, userId)?.referred_by || null;
      const res = participantQueries.remove.run(giveawayId, userId);
      const removed = res.changes > 0;
      if (removed) {
        if (refId) {
          participantQueries.syncReferrerTickets.run(giveawayId, refId, giveawayId, refId);
        }
        notifyChange();
      }
      const countRow = participantQueries.count.get(giveawayId);
      return { removed, count: Number(countRow?.cnt || 0) };
    },
    count: (giveawayId) => {
      const res = participantQueries.count.get(giveawayId);
      return res ? res.cnt : 0;
    },
    isParticipating: (giveawayId, userId) => {
      return Boolean(participantQueries.isParticipating.get(giveawayId, userId));
    },
    listForGiveaway: (giveawayId) => {
      return participantQueries.listForGiveaway.all(giveawayId);
    }
  },
  sessions: {
    get: (userId) => {
      const s = sessionQueries.get.get(userId);
      if (!s) return null;
      return { step: s.step, data: JSON.parse(s.data || '{}') };
    },
    set: (userId, step, data = {}) => {
      sessionQueries.set.run(userId, step, JSON.stringify(data));
    },
    clear: (userId) => {
      sessionQueries.clear.run(userId);
    }
  }
};
