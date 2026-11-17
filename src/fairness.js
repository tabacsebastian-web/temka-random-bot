const crypto = require('crypto');

const MAX_TICKETS_PER_USER = 100;

/**
 * Generates a high-entropy server seed and its public SHA-256 hash.
 * The hash is published BEFORE the contest starts.
 * The seed is revealed AFTER the contest ends.
 */
function generateSeed() {
  const serverSeed = crypto.randomBytes(32).toString('hex');
  const seedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
  return { serverSeed, seedHash };
}

/**
 * Deterministically and uniformly shuffles and selects unique winners using HMAC-SHA256.
 * Supports optional referral extra_tickets weights while ensuring each user wins at most once.
 *
 * @param {string} serverSeed - Revealed server seed
 * @param {Array<{ user_id: number|string, username?: string, first_name?: string, extra_tickets?: number }>} participants
 * @param {number} winnersCount
 * @returns {Array<any>} Ordered list of unique winners
 */
function selectWinners(serverSeed, participants, winnersCount) {
  if (!participants || participants.length === 0 || winnersCount <= 0) return [];

  const targetCount = Math.min(winnersCount, participants.length);
  const hasWeightedTickets = participants.some((p) => Number(p.extra_tickets) > 0);

  let pool;
  if (!hasWeightedTickets) {
    pool = [...participants];
  } else {
    pool = [];
    for (const p of participants) {
      const tickets = Math.min(1 + Math.max(0, Math.floor(Number(p.extra_tickets) || 0)), MAX_TICKETS_PER_USER);
      for (let tIdx = 0; tIdx < tickets; tIdx++) {
        pool.push(p);
      }
    }
  }

  let hmacCounter = 0;
  let buffer = Buffer.alloc(0);
  let bufferOffset = 0;

  function nextUint32() {
    if (bufferOffset + 4 > buffer.length) {
      const hmac = crypto.createHmac('sha256', serverSeed);
      hmac.update(`temka_draw_${hmacCounter++}`);
      buffer = hmac.digest();
      bufferOffset = 0;
    }
    const val = buffer.readUInt32BE(bufferOffset);
    bufferOffset += 4;
    return val;
  }

  function randomInt(maxExclusive) {
    if (maxExclusive <= 1) return 0;
    const limit = Math.floor(0xffffffff / maxExclusive) * maxExclusive;
    let rand;
    do {
      rand = nextUint32();
    } while (rand >= limit);
    return rand % maxExclusive;
  }

  const winners = [];
  for (let i = 0; i < targetCount && pool.length > 0; i++) {
    const chosenIndex = randomInt(pool.length);
    const chosen = pool[chosenIndex];
    winners.push(chosen);

    if (!hasWeightedTickets) {
      pool.splice(chosenIndex, 1);
    } else {
      const winnerId = String(chosen.user_id);
      pool = pool.filter((item) => String(item.user_id) !== winnerId);
    }
  }

  return winners;
}

/**
 * Validates SHA-256 integrity between revealed server seed and published hash.
 */
function verifySeedHash(serverSeed, seedHash) {
  const calculated = crypto.createHash('sha256').update(serverSeed).digest('hex');
  return calculated === seedHash;
}

module.exports = {
  MAX_TICKETS_PER_USER,
  generateSeed,
  selectWinners,
  verifySeedHash
};
