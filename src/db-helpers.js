const DEFAULT_GIVEAWAY_SETTINGS = {
  referralsEnabled: true,
  requireCaptcha: false,
  requireUsername: false,
  requirePremium: false,
  creatorUsername: '',
  postChannelIndex: 0,
  hasPhoto: false
};

/**
 * Safely parses giveaway settings JSON with defaults.
 */
function parseSettings(raw) {
  if (!raw) return { ...DEFAULT_GIVEAWAY_SETTINGS };
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...DEFAULT_GIVEAWAY_SETTINGS, ...raw };
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ...DEFAULT_GIVEAWAY_SETTINGS, ...parsed };
    }
  } catch (err) {}
  return { ...DEFAULT_GIVEAWAY_SETTINGS };
}

/**
 * Serializes giveaway settings consistently before storing in SQLite/D1.
 */
function serializeSettings(settings) {
  return JSON.stringify(parseSettings(settings));
}

/**
 * Normalizes a database row from giveaways into an application object.
 */
function parseGiveawayRow(row, defaultLang = 'en') {
  if (!row) return null;
  if (typeof row.required_channels === 'string') {
    try {
      row.required_channels = JSON.parse(row.required_channels || '[]');
    } catch (err) {
      row.required_channels = [];
    }
  } else if (!Array.isArray(row.required_channels)) {
    row.required_channels = [];
  }

  row.settings = parseSettings(row.settings || row.settings_json);

  if (typeof row.winners_json === 'string' && row.winners_json) {
    try {
      row.winners = JSON.parse(row.winners_json);
    } catch (err) {
      row.winners = [];
    }
  } else if (!Array.isArray(row.winners)) {
    row.winners = [];
  }

  row.lang = row.lang === 'ru' ? 'ru' : (row.lang === 'en' ? 'en' : defaultLang);
  row.photo_file_id = row.photo_file_id || null;
  row.end_count = Number(row.end_count || 0);
  return row;
}

module.exports = {
  DEFAULT_GIVEAWAY_SETTINGS,
  parseSettings,
  serializeSettings,
  parseGiveawayRow
};
