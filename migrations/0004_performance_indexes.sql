CREATE INDEX IF NOT EXISTS idx_giveaways_creator_id ON giveaways(creator_id);
CREATE INDEX IF NOT EXISTS idx_giveaways_seed_hash ON giveaways(seed_hash);
CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active_at);
CREATE INDEX IF NOT EXISTS idx_participants_joined_at ON participants(joined_at);
CREATE INDEX IF NOT EXISTS idx_giveaways_created_at ON giveaways(created_at);
