const config = require('./config');
const db = require('./db');
const { createBot } = require('./bot-core');

const { bot, finalizeGiveaway, finalizeDueGiveaways } = createBot({
  token: config.BOT_TOKEN,
  defaultLang: config.DEFAULT_LANG,
  db
});

module.exports = {
  bot,
  finalizeGiveaway,
  finalizeDueGiveaways
};
