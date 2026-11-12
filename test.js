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

// 2. Test i18n
assert(t('en', 'btn_create_giveaway') === '➕ Create Giveaway');
assert(t('ru', 'btn_create_giveaway') === '➕ Создать розыгрыш');
console.log('✅ i18n dictionary verified successfully!');

// 3. Test Database
const testPubId = `test_pub_${Date.now()}`;
const testGid = db.giveaways.create({
  public_id: testPubId,
  creator_id: 999999,
  prize: '100 USDT',
  description: 'Test giveaway',
  winners_count: 1,
  required_channels: [{ id: -1001234567, title: 'Test Channel', username: 'testchannel' }],
  end_at: Date.now() + 3600000,
  seed_hash: seedHash,
  server_seed: serverSeed
});
assert(testGid > 0, 'Giveaway inserted');

const fetched = db.giveaways.getByPublicId(testPubId);
assert(fetched && fetched.prize === '100 USDT', 'Giveaway query matches');

db.participants.add(testGid, 111, 'user1', 'First');
assert(db.participants.count(testGid) === 1, 'Participant counted');
assert(db.participants.isParticipating(testGid, 111) === true, 'Participant detected');
assert(db.participants.isParticipating(testGid, 222) === false, 'Non-participant detected');

// Test remove
db.participants.remove(testGid, 111);
assert(db.participants.count(testGid) === 0, 'Participant removed');
assert(db.participants.isParticipating(testGid, 111) === false, 'Participant no longer in DB');

console.log('✅ Database layer verified successfully!');
console.log('🎉 All unit tests passed!');
