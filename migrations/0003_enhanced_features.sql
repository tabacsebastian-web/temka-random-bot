ALTER TABLE giveaways ADD COLUMN lang TEXT DEFAULT 'en';
ALTER TABLE giveaways ADD COLUMN photo_file_id TEXT;
ALTER TABLE giveaways ADD COLUMN settings_json TEXT DEFAULT '{}';

ALTER TABLE participants ADD COLUMN extra_tickets INTEGER NOT NULL DEFAULT 0;
ALTER TABLE participants ADD COLUMN referred_by INTEGER;
CREATE INDEX IF NOT EXISTS idx_participants_referred_by ON participants(giveaway_id, referred_by);
