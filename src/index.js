const http = require('http');
const { run } = require('@grammyjs/runner');
const { bot } = require('./bot');
const { startScheduler, stopScheduler } = require('./scheduler');
const config = require('./config');

const SERVER_START_TIME = new Date().toISOString();
const VERSION = '2.2.0-auto-recover';

async function main() {
  console.log(`🤖 Starting ${config.BOT_NAME} (@${config.BOT_USERNAME}) v${VERSION}...`);

  // Start background scheduler for finishing contests
  startScheduler(10000);

  // Start concurrent bot runner
  const runner = run(bot);

  // Lightweight HTTP server for Cloud Health checks (Render, Koyeb, Uptime monitors)
  const port = process.env.PORT || 3000;
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      bot: config.BOT_USERNAME,
      version: VERSION,
      startedAt: SERVER_START_TIME,
      time: new Date().toISOString()
    }));
  });

  server.listen(port, () => {
    console.log(`🌐 Health-check HTTP server listening on port ${port}`);
  });

  console.log(`✅ ${config.BOT_NAME} is running and ready!`);

  const stop = () => {
    console.log('Shutting down gracefully...');
    stopScheduler();
    server.close();
    if (runner.isRunning()) {
      runner.stop();
    }
    process.exit(0);
  };

  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

main().catch((err) => {
  console.error('Fatal error starting bot:', err);
  process.exit(1);
});
