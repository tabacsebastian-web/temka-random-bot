const assert = require('assert');
const fairness = require('./src/fairness');
const db = require('./src/db');
const { t } = require('./src/i18n');

console.log('--- Testing Temka Random Bot Components ---');

// 1. Test Fairness
const { serverSeed, seedHash } = fairness.generateSeed();
assert(serverSeed && serverSeed.length === 64, 'Server seed must be 64 hex characters');
assert(seedHash && seedHash.length === 64, 'Seed hash must be 64 hex characters');
assert(fairness.verifySeedHash(serverSeed, seedHash), 'Seed hash must verify');

const mockParticipants = [
  { user_id: 101, username: 'alice', first_name: 'Alice' },
  { user_id: 102, username: 'bob', first_name: 'Bob' },
  { user_id: 103, username: 'charlie', first_name: 'Charlie' },
  { user_id: 104, username: 'david', first_name: 'David' }
];

const winners = fairness.selectWinners(serverSeed, mockParticipants, 2);
assert(winners.length === 2, 'Should pick exactly 2 winners');
assert(winners[0].user_id !== winners[1].user_id, 'Winners must be distinct');

// Determinism test: same seed must pick same winners
const winnersRecheck = fairness.selectWinners(serverSeed, mockParticipants, 2);
assert(winners[0].user_id === winnersRecheck[0].user_id, 'Draw must be 100% reproducible');
console.log('✅ Provably Fair algorithm verified successfully!');

// 2. Test i18n (EN / RU / RO) & Profile metadata limits
assert(t('en', 'btn_create_giveaway') === '➕ Create Giveaway');
assert(t('ru', 'btn_create_giveaway') === '➕ Создать розыгрыш');
assert(t('ro', 'btn_create_giveaway') === '➕ Creează Giveaway');
const { PROFILE_TEXTS } = require('./src/profile');
for (const [langKey, cfg] of Object.entries(PROFILE_TEXTS)) {
  assert(cfg.short_description.length <= 120, `short_description too long for ${langKey || 'default'}`);
  assert(cfg.description.length <= 512, `description too long for ${langKey || 'default'}`);
  assert(Array.isArray(cfg.commands) && cfg.commands.length >= 3, `commands missing for ${langKey || 'default'}`);
}
console.log('✅ i18n & Telegram profile limits verified successfully!');

// 3. Test Database + State Export/Import & Change Hooks
let changeNotifications = 0;
db.onChange(() => {
  changeNotifications += 1;
});

db.users.upsert(999999, 'creator_test', 'Creator', 'en');
assert(changeNotifications >= 1, 'onChange must fire on user upsert');

const testPubId = `test_pub_${Date.now()}`;
const customCreatedAt = Date.now() - 5000;
const testGid = db.giveaways.create({
  public_id: testPubId,
  creator_id: 999999,
  prize: '100 USDT',
  description: 'Test giveaway',
  winners_count: 1,
  required_channels: [{ id: -1001234567, title: 'Test Channel', username: 'testchannel' }],
  end_at: Date.now() + 3600000,
  seed_hash: seedHash,
  server_seed: serverSeed,
  channel_post_chat_id: '-100999888',
  channel_post_message_id: 42,
  created_at: customCreatedAt
});
assert(testGid > 0, 'Giveaway inserted');

const fetched = db.giveaways.getByPublicId(testPubId);
assert(fetched && fetched.prize === '100 USDT', 'Giveaway query matches');
assert(fetched.channel_post_chat_id === '-100999888', 'channel_post_chat_id must persist on create');
assert(fetched.channel_post_message_id === 42, 'channel_post_message_id must persist on create');
assert(fetched.created_at === customCreatedAt, 'created_at must persist on create');

const changesBeforeParticipant = changeNotifications;
db.participants.add(testGid, 111, 'user1', 'First');
assert(db.participants.count(testGid) === 1, 'Participant counted');
assert(db.participants.isParticipating(testGid, 111) === true, 'Participant detected');
assert(db.participants.isParticipating(testGid, 222) === false, 'Non-participant detected');
assert(changeNotifications > changesBeforeParticipant, 'onChange must fire on participant add');

const exported = db.exportState();
assert(Array.isArray(exported.users), 'exportState must include users array');
assert(Array.isArray(exported.giveaways), 'exportState must include giveaways array');
assert(Array.isArray(exported.participants), 'exportState must include participants array');
assert(
  exported.giveaways.some((g) => g.public_id === testPubId && g.channel_post_message_id === 42),
  'exportState must include newly created giveaway'
);
assert(
  exported.participants.some((p) => p.giveaway_public_id === testPubId && p.user_id === 111),
  'exportState must key participants by giveaway_public_id'
);

// Test importState idempotency / round-trip
db.importState(exported);
assert(db.participants.isParticipating(testGid, 111) === true, 'Participant preserved after importState');

// Test remove
const changesBeforeRemove = changeNotifications;
db.participants.remove(testGid, 111);
assert(db.participants.count(testGid) === 0, 'Participant removed');
assert(db.participants.isParticipating(testGid, 111) === false, 'Participant no longer in DB');
assert(changeNotifications > changesBeforeRemove, 'onChange must fire on participant remove');

console.log('✅ Database layer verified successfully!');

// 4. Test Cloudflare D1 async adapter & bot-core factory
const { createD1Database } = require('./src/db-d1');
const { createBot } = require('./src/bot-core');

const sqliteAsD1 = {
  prepare(sql) {
    let bound = [];
    return {
      bind(...args) {
        bound = args;
        return this;
      },
      async first() {
        return db.db.prepare(sql).get(...bound) || null;
      },
      async all() {
        return { results: db.db.prepare(sql).all(...bound) };
      },
      async run() {
        const res = db.db.prepare(sql).run(...bound);
        return { meta: { changes: res.changes, last_row_id: res.lastInsertRowid } };
      }
    };
  }
};

(async () => {
  const d1Db = createD1Database(sqliteAsD1, 'en');
  assert(await d1Db.ping() === true, 'D1 ping succeeds');

  await d1Db.users.upsert(888888, 'd1_tester', 'D1Tester', 'ru');
  const d1User = await d1Db.users.get(888888);
  assert(d1User && d1User.username === 'd1_tester', 'D1 user upsert/get works');
  await d1Db.users.setLang(888888, 'en');
  assert((await d1Db.users.get(888888)).lang === 'en', 'D1 setLang works');

  const d1PubId = `d1_pub_${Date.now()}`;
  const d1SeedPair = fairness.generateSeed();
  const d1Gid = await d1Db.giveaways.create({
    public_id: d1PubId,
    creator_id: 888888,
    prize: 'D1 Test Prize',
    description: 'Testing D1',
    winners_count: 1,
    required_channels: [{ id: -100777, title: 'D1 Chan', username: 'd1chan' }],
    status: 'active',
    end_type: 'time',
    end_at: Date.now() - 1000,
    seed_hash: d1SeedPair.seedHash,
    server_seed: d1SeedPair.serverSeed
  });
  assert(d1Gid > 0, 'D1 giveaway inserted');
  const byHash = await d1Db.giveaways.getBySeedHash(d1SeedPair.seedHash);
  assert(byHash && byHash.public_id === d1PubId, 'D1 getBySeedHash works');
  await d1Db.giveaways.updatePostDetails(d1Gid, -100777, 99);

  await d1Db.users.touch(888888);
  const d1Stats = await d1Db.stats.getPublicStats();
  assert(d1Stats.activeUsers30d >= 1 && d1Stats.totalGiveaways >= 1, 'D1 public stats work');
  const nodeStats = db.stats.getPublicStats();
  assert(nodeStats.activeUsers30d >= 1 && nodeStats.totalGiveaways >= 1, 'Node SQLite public stats work');

  assert(await d1Db.participants.add(d1Gid, 701, 'p1', 'One') === true, 'D1 participant add works');
  assert(await d1Db.participants.add(d1Gid, 701, 'p1', 'One') === false, 'D1 participant duplicate ignored');
  assert(await d1Db.participants.count(d1Gid) === 1, 'D1 participant count matches');
  assert(await d1Db.participants.isParticipating(d1Gid, 701) === true, 'D1 isParticipating matches');

  const due = await d1Db.giveaways.getActiveToFinish(Date.now());
  assert(due.some((item) => item.id === d1Gid), 'D1 getActiveToFinish detects due giveaway');

  assert(await d1Db.giveaways.claimForFinish(d1Gid) === true, 'D1 claimForFinish acquires lock');
  assert(await d1Db.giveaways.claimForFinish(d1Gid) === false, 'D1 claimForFinish prevents double finish');
  await d1Db.giveaways.releaseFinishClaim(d1Gid);
  assert((await d1Db.giveaways.getById(d1Gid)).status === 'active', 'D1 releaseFinishClaim restores active');
  await d1Db.giveaways.finish(d1Gid, serverSeed, [{ user_id: 701, username: 'p1', first_name: 'One' }]);
  assert((await d1Db.giveaways.getById(d1Gid)).status === 'finished', 'D1 finish marks giveaway finished');

  await d1Db.sessions.set(888888, 'step_prize', { channels: [] });
  const s = await d1Db.sessions.get(888888);
  assert(s && s.step === 'step_prize', 'D1 sessions set/get works');
  await d1Db.sessions.clear(888888);
  assert((await d1Db.sessions.get(888888)) === null, 'D1 sessions clear works');

  const { bot: cfBot, finalizeDueGiveaways } = createBot({
    token: '123456:TEST_TOKEN',
    db: d1Db,
    defaultLang: 'ru'
  });
  assert(cfBot && typeof finalizeDueGiveaways === 'function', 'createBot works with D1 adapter');

  console.log('✅ Cloudflare D1 adapter & bot-core verified successfully!');
  console.log('🎉 All unit tests passed!');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
