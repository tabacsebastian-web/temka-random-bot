const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const config = require('./config');

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
    lang TEXT DEFAULT 'ru',
    created_at INTEGER
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
    status TEXT DEFAULT 'draft', -- draft, active, finished, cancelled
    end_type TEXT DEFAULT 'time', -- time, participants
    end_at INTEGER,
    end_count INTEGER DEFAULT 0,
    seed_hash TEXT,
    server_seed TEXT,
    created_at INTEGER,
    finished_at INTEGER,
    winners_json TEXT
  );

  CREATE TABLE IF NOT EXISTS participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    giveaway_id INTEGER,
    user_id INTEGER,
    username TEXT,
    first_name TEXT,
    joined_at INTEGER,
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

// Prepared statement helpers
const userQueries = {
  get: db.prepare('SELECT * FROM users WHERE user_id = ?'),
  upsert: db.prepare(`
    INSERT INTO users (user_id, username, first_name, lang, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      username = excluded.username,
      first_name = excluded.first_name
  `),
  setLang: db.prepare('UPDATE users SET lang = ? WHERE user_id = ?')
};

const giveawayQueries = {
  createDraft: db.prepare(`
    INSERT INTO giveaways (public_id, creator_id, prize, description, winners_count, required_channels, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)
  `),
  getByPublicId: db.prepare('SELECT * FROM giveaways WHERE public_id = ?'),
  getById: db.prepare('SELECT * FROM giveaways WHERE id = ?'),
  getActiveToFinish: db.prepare(`
    SELECT * FROM giveaways
    WHERE status = 'active' AND (
      (end_type = 'time' AND end_at <= ?)
      OR (end_type = 'participants' AND (SELECT COUNT(*) FROM participants WHERE giveaway_id = giveaways.id) >= end_count)
    )
  `),
  updateStatus: db.prepare('UPDATE giveaways SET status = ? WHERE id = ?'),
  updatePostDetails: db.prepare(`
    UPDATE giveaways
    SET channel_post_chat_id = ?, channel_post_message_id = ?, status = 'active'
    WHERE id = ?
  `),
  finish: db.prepare(`
    UPDATE giveaways
    SET status = 'finished', server_seed = ?, winners_json = ?, finished_at = ?
    WHERE id = ?
  `),
  listByCreator: db.prepare('SELECT * FROM giveaways WHERE creator_id = ? ORDER BY id DESC LIMIT 20')
};

const participantQueries = {
  add: db.prepare(`
    INSERT OR IGNORE INTO participants (giveaway_id, user_id, username, first_name, joined_at)
    VALUES (?, ?, ?, ?, ?)
  `),
  remove: db.prepare('DELETE FROM participants WHERE giveaway_id = ? AND user_id = ?'),
  count: db.prepare('SELECT COUNT(*) as cnt FROM participants WHERE giveaway_id = ?'),
  isParticipating: db.prepare('SELECT 1 FROM participants WHERE giveaway_id = ? AND user_id = ?'),
  listForGiveaway: db.prepare('SELECT user_id, username, first_name, joined_at FROM participants WHERE giveaway_id = ? ORDER BY joined_at ASC')
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
      SELECT p.user_id, p.username, p.first_name, p.joined_at, g.public_id AS giveaway_public_id
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
        created_at, finished_at, winners_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        g.winners_json || null
      );
    }

    const findGiveaway = db.prepare('SELECT id FROM giveaways WHERE public_id = ?');
    const insertParticipant = db.prepare(`
      INSERT OR IGNORE INTO participants (giveaway_id, user_id, username, first_name, joined_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const p of state.participants || []) {
      const row = p.giveaway_public_id ? findGiveaway.get(p.giveaway_public_id) : null;
      if (row) {
        insertParticipant.run(row.id, p.user_id, p.username || null, p.first_name || '', p.joined_at || Date.now());
      }
    }
  },
  users: {
    get: (id) => userQueries.get.get(id),
    upsert: (id, username, firstName, lang = config.DEFAULT_LANG) => {
      const res = userQueries.upsert.run(id, username || null, firstName || '', lang, Date.now());
      notifyChange();
      return res;
    },
    setLang: (id, lang) => {
      const res = userQueries.setLang.run(lang, id);
      notifyChange();
      return res;
    }
  },
  giveaways: {
    create: (data) => {
      const stmt = db.prepare(`
        INSERT INTO giveaways (
          public_id, creator_id, prize, description, winners_count,
          required_channels, target_chat_id, channel_post_chat_id, channel_post_message_id,
          status, end_type, end_at, end_count, seed_hash, server_seed, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        data.created_at || Date.now()
      );
      notifyChange();
      return info.lastInsertRowid;
    },
    getByPublicId: (publicId) => {
      const g = giveawayQueries.getByPublicId.get(publicId);
      if (g && g.required_channels) {
        g.required_channels = JSON.parse(g.required_channels);
      }
      return g;
    },
    getById: (id) => {
      const g = giveawayQueries.getById.get(id);
      if (g && g.required_channels) {
        g.required_channels = JSON.parse(g.required_channels);
      }
      return g;
    },
    getActiveToFinish: (now = Date.now()) => {
      const rows = giveawayQueries.getActiveToFinish.all(now);
      return rows.map((g) => {
        if (g.required_channels) g.required_channels = JSON.parse(g.required_channels);
        return g;
      });
    },
    updatePostDetails: (id, chatId, messageId) => {
      giveawayQueries.updatePostDetails.run(String(chatId), messageId, id);
      notifyChange();
    },
    finish: (id, serverSeed, winners) => {
      giveawayQueries.finish.run(serverSeed, JSON.stringify(winners), Date.now(), id);
      notifyChange();
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
    listByCreator: (creatorId) => giveawayQueries.listByCreator.all(creatorId)
  },
  participants: {
    add: (giveawayId, userId, username, firstName) => {
      const res = participantQueries.add.run(
        giveawayId,
        userId,
        username || null,
        firstName || '',
        Date.now()
      );
      if (res.changes > 0) notifyChange();
      return res.changes > 0;
    },
    remove: (giveawayId, userId) => {
      const res = participantQueries.remove.run(giveawayId, userId);
      if (res.changes > 0) notifyChange();
      return res.changes > 0;
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
