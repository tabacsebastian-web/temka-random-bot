const assert = require('assert');
const fairness = require('./src/fairness');
const db = require('./src/db');
const { t, PROFILE_TEXTS } = require('./src/i18n');
const { PROFILE_TEXTS: profileCfg } = require('./src/profile');
const {
  escapeHtml,
  escapeCsvCell,
  buildParticipantsCsv,
  signCaptchaToken,
  createCaptchaChallenge,
  buildChannelPostUrl
} = require('./src/utils');
const { parseGiveawayRow } = require('./src/db-helpers');

console.log('--- Testing Temka Random Bot Components ---');

// 1. Test Fairness (determinism, full-order shuffling, and weighted referral tickets)
const { serverSeed, seedHash } = fairness.generateSeed();
assert(serverSeed && serverSeed.length === 64, 'Server seed must be 64 hex characters');
assert(seedHash && seedHash.length === 64, 'Seed hash must be 64 hex characters');
assert(fairness.verifySeedHash(serverSeed, seedHash), 'Seed hash must verify');

const manyParticipants = Array.from({ length: 12 }, (_, idx) => ({
  user_id: 1000 + idx,
  username: `user${idx}`,
  first_name: `User ${idx}`,
  extra_tickets: 0
}));

const fullShuffle = fairness.selectWinners(serverSeed, manyParticipants, manyParticipants.length);
assert(fullShuffle.length === manyParticipants.length, 'Full shuffle must include all participants');
assert(
  new Set(fullShuffle.map((w) => w.user_id)).size === manyParticipants.length,
  'Full shuffle must contain unique users'
);
const fullShuffleAgain = fairness.selectWinners(serverSeed, manyParticipants, manyParticipants.length);
assert.deepStrictEqual(
  fullShuffle.map((w) => w.user_id),
  fullShuffleAgain.map((w) => w.user_id),
  'Full shuffle must be deterministic'
);
const prefixDraw = fairness.selectWinners(serverSeed, manyParticipants, 3);
assert.deepStrictEqual(
  prefixDraw.map((w) => w.user_id),
  fullShuffle.slice(0, 3).map((w) => w.user_id),
  'Top N winners must equal the prefix of the full candidate ranking (supports provably fair rerolls)'
);

const isIdenticalOrder = fullShuffle.every((w, i) => w.user_id === manyParticipants[i].user_id);
assert(!isIdenticalOrder, 'Selecting winnersCount === participants.length must shuffle via HMAC-SHA256');

const weightedParticipants = [
  { user_id: 1, username: 'alice', first_name: 'Alice', extra_tickets: 15 },
  { user_id: 2, username: 'bob', first_name: 'Bob', extra_tickets: 0 },
  { user_id: 3, username: 'charlie', first_name: 'Charlie', extra_tickets: 3 }
];
const weightedWinners = fairness.selectWinners(serverSeed, weightedParticipants, 3);
assert(weightedWinners.length === 3, 'Weighted draw must pick all 3 unique users');
assert(new Set(weightedWinners.map((w) => w.user_id)).size === 3, 'Weighted winners must remain unique');
console.log('✅ Provably Fair algorithm & weighted tickets verified successfully!');

// 2. Test Utilities (HTML escape, CSV safety, CAPTCHA HMAC, URL builder)
assert(escapeHtml('<b onclick="x">&') === '&lt;b onclick=&quot;x&quot;&gt;&amp;', 'escapeHtml must escape markup chars');
assert(escapeCsvCell('=CMD()') === "'=CMD()", 'escapeCsvCell must neutralize formula prefixes');
const csv = buildParticipantsCsv([
  { user_id: 42, username: 'admin', first_name: 'Alice, Jr.', extra_tickets: 2, referred_by: null, joined_at: 1700000000000 }
]);
assert(csv.includes('user_id,username,first_name,extra_tickets,total_tickets,referred_by,joined_at_utc'));
assert(csv.includes('"Alice, Jr."') && csv.includes(',2,3,,'), 'CSV export must format tickets cleanly');

const cap = createCaptchaChallenge('test_secret', 555, 'abcd1234');
assert(cap.choices.length === 4 && cap.choices.includes(cap.answer), 'Captcha must generate 4 unique options including answer');
assert(signCaptchaToken('test_secret', 555, 'abcd1234', cap.answer) === cap.sig, 'Captcha signature must match');
assert(buildChannelPostUrl({ username: 'mychan' }, -100123, 77) === 'https://t.me/mychan/77');
assert(buildChannelPostUrl({ title: 'Priv' }, -100123456789, 88) === 'https://t.me/c/123456789/88');
console.log('✅ Utilities (HTML escape, CSV export, HMAC captcha, links) verified successfully!');

// 3. Test i18n (EN primary / RU secondary) & Profile metadata limits
assert(t('en', 'btn_create_giveaway') === '➕ Create Giveaway');
assert(t('ru', 'btn_create_giveaway') === '➕ Создать розыгрыш');
assert(t('ro', 'btn_create_giveaway') === '➕ Create Giveaway', 'Unknown locales must fall back to English');

const safeCard = t('en', 'giveaway_card', {
  prize: '<script>100 USDT</script>',
  description: 'A & B',
  winnersCount: 2,
  channels: [{ id: -1001, title: 'My <Channel>', username: 'mychan' }],
  endType: 'participants',
  endCount: 500,
  endAtFormatted: 'Nov 20, 12:00 UTC',
  seedHash,
  settings: { referralsEnabled: true, requireCaptcha: true, requireUsername: true, requirePremium: true }
});
assert(!safeCard.includes('<script>') && safeCard.includes('&lt;script&gt;100 USDT&lt;/script&gt;'));
assert(safeCard.includes('500') && safeCard.includes('+1 Ticket per friend') && safeCard.includes('Anti-Bot Captcha'));

const dmNoCyber = t('en', 'winner_dm_notification', {
  prize: 'Nitro',
  channel: 'My Channel',
  contactUrl: '',
  contactLabel: ''
});
assert(!dmNoCyber.includes('CyberBeats44') && !dmNoCyber.includes('Vertex Beats'), 'Hardcoded fallback must be gone');

assert.deepStrictEqual(Object.keys(profileCfg), ['', 'ru'], 'Profile texts must only target English (default) and Russian');
for (const [langKey, cfg] of Object.entries(profileCfg)) {
  assert(cfg.short_description.length <= 120, `short_description too long for ${langKey || 'default'}`);
  assert(cfg.description.length <= 512, `description too long for ${langKey || 'default'}`);
  assert(Array.isArray(cfg.commands) && cfg.commands.length === 6, `commands count mismatch for ${langKey || 'default'}`);
}
console.log('✅ i18n escaping & Telegram profile limits verified successfully!');

// 4. Test SQLite DB + Referral Ticket Accounting + End-by-Count + Cancel/Reroll/Clone fields
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
  end_type: 'participants',
  end_count: 2,
  end_at: Date.now() + 86400000,
  seed_hash: seedHash,
  server_seed: serverSeed,
  channel_post_chat_id: '-100999888',
  channel_post_message_id: 42,
  created_at: customCreatedAt,
  lang: 'ru',
  photo_file_id: 'AgACAgIAAxkBA_test_photo',
  settings: { referralsEnabled: true, requireCaptcha: true, creatorUsername: 'creator_test' },
  status: 'active'
});
assert(testGid > 0, 'Giveaway inserted');

const fetched = db.giveaways.getByPublicId(testPubId);
assert(fetched && fetched.lang === 'ru', 'Giveaway lang must persist');
assert(fetched.photo_file_id === 'AgACAgIAAxkBA_test_photo', 'photo_file_id must persist');
assert(fetched.settings.requireCaptcha === true && fetched.settings.creatorUsername === 'creator_test', 'settings must persist');

// Participant 1 joins (with invalid self-referral ignored), Participant 2 joins referred by 111
db.participants.add(testGid, 111, 'user1', 'First', 111);
assert(db.participants.get(testGid, 111).extra_tickets === 0, 'Self-referral must not grant tickets');
assert(db.giveaways.getActiveToFinish().every((g) => g.id !== testGid), 'Count-based giveaway must not finish at 1/2');

db.participants.add(testGid, 222, 'user2', 'Second', 111);
assert(db.participants.count(testGid) === 2, 'Two participants counted');
assert(db.participants.get(testGid, 111).extra_tickets === 1, 'Referrer must gain +1 ticket when friend joins');
assert(db.giveaways.getActiveToFinish().some((g) => g.id === testGid), 'Count-based giveaway must trigger finish at 2/2');

const exported = db.exportState();
db.importState(exported);
assert(db.participants.get(testGid, 111).extra_tickets === 1, 'Extra tickets preserved across export/import');

db.participants.remove(testGid, 222);
assert(db.participants.get(testGid, 111).extra_tickets === 0, 'Referrer ticket must decrement if referred friend leaves');

assert(db.giveaways.cancel(testGid) === true, 'Cancel active giveaway succeeds');
assert(db.giveaways.getById(testGid).status === 'cancelled', 'Giveaway status becomes cancelled');
console.log('✅ SQLite DB layer (referrals, count-end, cancel, settings, export/import) verified successfully!');

// 5. Test Cloudflare D1 async adapter & bot-core factory
const { createD1Database } = require('./src/db-d1');
const { createBot, parseCustomDate, recoverGiveawayFromMessage } = require('./src/bot-core');

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
    server_seed: d1SeedPair.serverSeed,
    lang: 'ru',
    settings: { referralsEnabled: true, creatorUsername: 'd1_tester' }
  });
  assert(d1Gid > 0, 'D1 giveaway inserted');
  const byHash = await d1Db.giveaways.getBySeedHash(d1SeedPair.seedHash);
  assert(byHash && byHash.public_id === d1PubId && byHash.lang === 'ru', 'D1 getBySeedHash parses lang and settings');
  await d1Db.giveaways.updatePostDetails(d1Gid, -100777, 99, { referralsEnabled: true, hasPhoto: false });

  await d1Db.users.touch(888888);
  const d1Stats = await d1Db.stats.getPublicStats();
  assert(d1Stats.activeUsers30d >= 1 && d1Stats.totalGiveaways >= 1, 'D1 public stats work');

  assert(await d1Db.participants.add(d1Gid, 701, 'p1', 'One') === true, 'D1 participant add works');
  assert(await d1Db.participants.add(d1Gid, 702, 'p2', 'Two', 701) === true, 'D1 referral participant add works');
  assert((await d1Db.participants.get(d1Gid, 701)).extra_tickets === 1, 'D1 referrer gains +1 ticket');
  await d1Db.participants.remove(d1Gid, 702);
  assert((await d1Db.participants.get(d1Gid, 701)).extra_tickets === 0, 'D1 referrer ticket decrements on leave');

  const due = await d1Db.giveaways.getActiveToFinish(Date.now());
  assert(due.some((item) => item.id === d1Gid), 'D1 getActiveToFinish detects due giveaway');

  await d1Db.giveaways.finish(d1Gid, d1SeedPair.serverSeed, [{ user_id: 701, username: 'p1', first_name: 'One' }]);
  await d1Db.giveaways.updateWinners(d1Gid, [
    { user_id: 701, username: 'p1', first_name: 'One' },
    { user_id: 703, username: 'p3', first_name: 'Three' }
  ]);
  const updatedD1 = await d1Db.giveaways.getById(d1Gid);
  assert(updatedD1.status === 'finished' && updatedD1.winners.length === 2, 'D1 updateWinners supports reroll');

  const { bot: cfBot, finalizeDueGiveaways } = createBot({
    token: '123456:TEST_TOKEN',
    db: d1Db,
    defaultLang: 'en',
    botUsername: 'TemkaDrawBot'
  });
  assert(cfBot && typeof finalizeDueGiveaways === 'function', 'createBot works with D1 adapter');
  assert(parseCustomDate('25.12.2030 18:00') > Date.now(), 'parseCustomDate parses future UTC date');
  const rec = recoverGiveawayFromMessage('deadbeef', {
    chat: { id: -1001, title: 'Chan', username: 'chan' },
    message_id: 12,
    text: '🎁 GIVEAWAY: Test\nWinners: 2\n' + seedHash
  });
  assert(rec && rec.winners_count === 2 && rec.seed_hash === seedHash, 'recoverGiveawayFromMessage parses card');
  assert(parseGiveawayRow({ ...rec, settings_json: '{}' }).settings.referralsEnabled === true, 'parseGiveawayRow normalizes defaults');

  console.log('✅ Cloudflare D1 adapter & bot-core verified successfully!');
  console.log('🎉 All unit tests passed!');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
