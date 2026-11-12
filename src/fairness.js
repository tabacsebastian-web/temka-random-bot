const crypto = require('crypto');

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
 * Deterministically and uniformly shuffles and selects winners using HMAC-SHA256.
 *
 * @param {string} serverSeed - Revealed server seed
 * @param {Array<{ user_id: number|string, username?: string, first_name?: string }>} participants
 * @param {number} winnersCount
 * @returns {Array<any>} Ordered list of winners
 */
function selectWinners(serverSeed, participants, winnersCount) {
  if (!participants || participants.length === 0) return [];
  if (winnersCount >= participants.length) {
    return [...participants];
  }

  // Work on a copy sorted deterministically by user_id and joined_at
  const pool = [...participants];

  // Fisher-Yates shuffle driven by HMAC-SHA256
  // Generate pseudo-random numbers using counter-based HMAC stream
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
    // Rejection sampling to prevent modulo bias
    const limit = Math.floor(0xffffffff / maxExclusive) * maxExclusive;
    let rand;
    do {
      rand = nextUint32();
    } while (rand >= limit);
    return rand % maxExclusive;
  }

  // Pick winnersCount elements
  const winners = [];
  for (let i = 0; i < winnersCount && pool.length > 0; i++) {
    const chosenIndex = randomInt(pool.length);
    const [winner] = pool.splice(chosenIndex, 1);
    winners.push(winner);
  }

  return winners;
}

/**
 * Validates SHA256 integrity
 */
function verifySeedHash(serverSeed, seedHash) {
  const calculated = crypto.createHash('sha256').update(serverSeed).digest('hex');
  return calculated === seedHash;
}

module.exports = {
  generateSeed,
  selectWinners,
  verifySeedHash
};
