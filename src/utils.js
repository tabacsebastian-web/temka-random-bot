const crypto = require('crypto');

const MAX_TELEGRAM_CAPTION = 1024;
const MAX_TELEGRAM_TEXT = 4096;

/**
 * Escapes HTML special characters for Telegram HTML parse_mode.
 */
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Escapes a single CSV cell and guards against spreadsheet formula injection.
 */
function escapeCsvCell(value) {
  if (value === null || value === undefined) return '';
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Builds an RFC-4180 UTF-8 CSV export string for giveaway participants.
 */
function buildParticipantsCsv(participants) {
  const header = 'user_id,username,first_name,extra_tickets,total_tickets,referred_by,joined_at_utc';
  const rows = (participants || []).map((p) => {
    const extra = Math.max(0, Number(p.extra_tickets) || 0);
    const total = Math.min(1 + extra, 100);
    const isoDate = p.joined_at ? new Date(Number(p.joined_at)).toISOString() : '';
    return [
      escapeCsvCell(p.user_id),
      escapeCsvCell(p.username || ''),
      escapeCsvCell(p.first_name || ''),
      escapeCsvCell(extra),
      escapeCsvCell(total),
      escapeCsvCell(p.referred_by || ''),
      escapeCsvCell(isoDate)
    ].join(',');
  });
  return [header, ...rows].join('\n');
}

/**
 * Truncates plain text cleanly without cutting mid-surrogate.
 */
function truncateText(value, maxLen) {
  const str = String(value || '');
  if (str.length <= maxLen) return str;
  if (maxLen <= 1) return '…';
  return `${str.slice(0, maxLen - 1).trimEnd()}…`;
}

/**
 * Computes a short stateless HMAC-SHA256 signature for anti-bot CAPTCHA tokens.
 */
function signCaptchaToken(secret, userId, publicId, expectedValue) {
  return crypto
    .createHmac('sha256', `${secret}:captcha`)
    .update(`${userId}:${publicId}:${expectedValue}`)
    .digest('hex')
    .slice(0, 12);
}

/**
 * Generates a simple arithmetic CAPTCHA challenge with 4 shuffled unique options.
 */
function createCaptchaChallenge(secret, userId, publicId) {
  const a = crypto.randomInt(2, 10);
  const b = crypto.randomInt(2, 10);
  const answer = a + b;
  const sig = signCaptchaToken(secret, userId, publicId, answer);

  const decoys = new Set([answer]);
  while (decoys.size < 4) {
    const offset = crypto.randomInt(-5, 6);
    const candidate = answer + offset;
    if (candidate > 0 && candidate !== answer) {
      decoys.add(candidate);
    }
  }
  const choices = Array.from(decoys).sort((x, y) => x - y);
  return { question: `${a} + ${b} = ?`, answer, choices, sig };
}

/**
 * Builds a clickable Telegram channel/post URL when available, handling private supergroups.
 */
function buildChannelPostUrl(channel, chatId, messageId) {
  const username = channel?.username ? channel.username.replace(/^@/, '') : '';
  if (username && messageId) {
    return `https://t.me/${username}/${messageId}`;
  }
  if (chatId && messageId) {
    const strId = String(chatId);
    if (strId.startsWith('-100')) {
      return `https://t.me/c/${strId.slice(4)}/${messageId}`;
    }
  }
  return channel?.invite_link || (username ? `https://t.me/${username}` : '');
}

/**
 * Formats a short readable status summary for a giveaway duration or participant goal.
 */
function formatChannelLabel(ch) {
  if (!ch) return 'Channel';
  if (ch.username) return `@${ch.username.replace(/^@/, '')}`;
  return ch.title || 'Private Channel';
}

module.exports = {
  MAX_TELEGRAM_CAPTION,
  MAX_TELEGRAM_TEXT,
  escapeHtml,
  escapeCsvCell,
  buildParticipantsCsv,
  truncateText,
  signCaptchaToken,
  createCaptchaChallenge,
  buildChannelPostUrl,
  formatChannelLabel
};
