const http = require('http');
const crypto = require('crypto');
const { webhookCallback } = require('grammy');
const { run } = require('@grammyjs/runner');
const { bot } = require('./bot');
const { runSchedulerCheck, startScheduler, stopScheduler } = require('./scheduler');
const db = require('./db');
const backup = require('./backup');
const config = require('./config');

const SERVER_START_TIME = new Date().toISOString();
const VERSION = '2.3.0-webhook-persist';

function resolveWebhookBaseUrl() {
  const explicit = process.env.WEBHOOK_URL || process.env.RENDER_EXTERNAL_URL;
  if (explicit) {
    return explicit.replace(/\/+$/, '');
  }
  if (process.env.RENDER === 'true') {
    const serviceName = process.env.RENDER_SERVICE_NAME || 'temka-random-bot';
    return `https://${serviceName}.onrender.com`;
  }
  return '';
}

function buildWebhookSecret() {
  if (process.env.WEBHOOK_SECRET) {
    return process.env.WEBHOOK_SECRET;
  }
  return crypto
    .createHash('sha256')
    .update(`${config.BOT_TOKEN}:webhook`)
    .digest('hex')
    .slice(0, 32);
}

async function setWebhookWithRetry(webhookUrl, secretToken, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await bot.api.setWebhook(webhookUrl, {
        secret_token: secretToken,
        drop_pending_updates: false
      });
      return true;
    } catch (err) {
      console.error(`[Webhook] setWebhook attempt ${attempt}/${attempts} failed:`, err.message);
      if (attempt < attempts) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
  return false;
}

async function main() {
  console.log(`🤖 Starting ${config.BOT_NAME} (@${config.BOT_USERNAME}) v${VERSION}...`);

  db.onChange(() => backup.scheduleBackup());
  await backup.restoreBackup();

  const webhookBaseUrl = resolveWebhookBaseUrl();
  const useWebhook = Boolean(webhookBaseUrl);
  const webhookPath = '/webhook';
  const secretToken = buildWebhookSecret();
  const handleWebhook = useWebhook
    ? webhookCallback(bot, 'http', {
        onTimeout: 'return',
        timeoutMilliseconds: 25000,
        secretToken
      })
    : null;

  let webhookReady = false;
  let runner = null;
  let stopping = false;
  const backupEnabled = Boolean(process.env.BACKUP_GH_TOKEN || process.env.GH_TOKEN);

  const port = process.env.PORT || 3000;
  const server = http.createServer(async (req, res) => {
    const reqPath = (req.url || '/').split('?')[0];

    if (useWebhook && req.method === 'POST' && reqPath === webhookPath) {
      runSchedulerCheck().catch((err) => console.error('[Scheduler] Trigger error:', err));
      try {
        await handleWebhook(req, res);
      } catch (err) {
        console.error('[Webhook] Request handling failed:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false }));
        }
      }
      return;
    }

    runSchedulerCheck().catch((err) => console.error('[Scheduler] Trigger error:', err));

    const payload = JSON.stringify({
      status: 'ok',
      bot: config.BOT_USERNAME,
      version: VERSION,
      mode: useWebhook ? 'webhook' : 'polling',
      webhookReady,
      backupEnabled,
      startedAt: SERVER_START_TIME,
      time: new Date().toISOString()
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    res.end(payload);
  });

  await new Promise((resolve) => {
    server.listen(port, '0.0.0.0', () => {
      console.log(`🌐 HTTP server listening on 0.0.0.0:${port}`);
      resolve();
    });
  });

  if (useWebhook) {
    const fullWebhookUrl = `${webhookBaseUrl}${webhookPath}`;
    await bot.init();
    webhookReady = await setWebhookWithRetry(fullWebhookUrl, secretToken);
    console.log(`🔗 Webhook mode configured (${fullWebhookUrl}, ready=${webhookReady})`);
  } else {
    await bot.api.deleteWebhook({ drop_pending_updates: false });
    runner = run(bot);
    console.log('📡 Long-polling mode started');
  }

  startScheduler(10000);
  await runSchedulerCheck();

  console.log(`✅ ${config.BOT_NAME} is running and ready!`);

  const stop = async () => {
    if (stopping) return;
    stopping = true;
    console.log('Shutting down gracefully...');
    stopScheduler();
    if (runner && runner.isRunning()) {
      runner.stop();
    }
    try {
      await backup.flushBackup();
    } catch (err) {
      console.error('[Backup] Flush on shutdown failed:', err);
    }
    server.close();
    process.exit(0);
  };

  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

main().catch((err) => {
  console.error('Fatal error starting bot:', err);
  process.exit(1);
});
