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
  required_channels TEXT,
  target_chat_id TEXT,
  channel_post_chat_id TEXT,
  channel_post_message_id INTEGER,
  status TEXT DEFAULT 'draft',
  end_type TEXT DEFAULT 'time',
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
