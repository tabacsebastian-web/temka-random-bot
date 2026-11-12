const path = require('path');
require('dotenv').config();

module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  DB_PATH: path.resolve(process.cwd(), process.env.DB_PATH || 'data/temka.db'),
  DEFAULT_LANG: process.env.DEFAULT_LANG || 'ru',
  BOT_USERNAME: 'TemkaDrawBot',
  BOT_NAME: 'Temka Random'
};
