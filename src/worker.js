import { webhookCallback } from 'grammy';
import botCorePkg from './bot-core.js';
import d1Pkg from './db-d1.js';
import indexHtml from '../public/index.html';

const { createBot } = botCorePkg;
const { createD1Database } = d1Pkg;

const VERSION = '3.0.0-cloudflare';
const botInfoCache = new Map();

function logInfo(event, details = {}) {
  console.log(JSON.stringify({ level: 'info', event, ...details }));
}

function logError(event, error, details = {}) {
  console.error(JSON.stringify({
    level: 'error',
    event,
    error: error instanceof Error ? error.message : String(error),
    ...details
  }));
}

async function getWebhookSecret(env) {
  if (env.WEBHOOK_SECRET) {
    return env.WEBHOOK_SECRET;
  }
  if (!env.BOT_TOKEN) {
    return '';
  }
  const data = new TextEncoder().encode(`${env.BOT_TOKEN}:webhook`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function createWorkerRuntime(env) {
  if (!env.BOT_TOKEN) {
    throw new Error('Missing BOT_TOKEN secret in Cloudflare Worker environment');
  }
  if (!env.DB) {
    throw new Error('Missing DB (D1) binding in Cloudflare Worker environment');
  }

  const defaultLang = env.DEFAULT_LANG || 'ru';
  const db = createD1Database(env.DB, defaultLang);

  let botInfo = botInfoCache.get(env.BOT_TOKEN);
  if (!botInfo && env.BOT_INFO) {
    try {
      botInfo = JSON.parse(env.BOT_INFO);
      botInfoCache.set(env.BOT_TOKEN, botInfo);
    } catch (err) {}
  }

  const runtime = createBot({
    token: env.BOT_TOKEN,
    defaultLang,
    db,
    botInfo
  });

  return { ...runtime, db };
}

async function ensureBotInitialized(env, bot) {
  if (!bot.isInited()) {
    await bot.init();
    botInfoCache.set(env.BOT_TOKEN, bot.botInfo);
  }
}

async function buildHealthResponse(env) {
  let d1Status = 'missing';
  if (env.DB) {
    try {
      const db = createD1Database(env.DB, env.DEFAULT_LANG || 'ru');
      await db.ping();
      d1Status = 'connected';
    } catch (err) {
      d1Status = 'error';
    }
  }

  return Response.json({
    status: d1Status === 'connected' ? 'ok' : 'degraded',
    bot: env.BOT_USERNAME || 'TemkaDrawBot',
    version: VERSION,
    runtime: 'cloudflare-workers',
    mode: 'webhook',
    d1: d1Status,
    configured: Boolean(env.BOT_TOKEN),
    time: new Date().toISOString()
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/webhook' && request.method === 'POST') {
      try {
        const { bot, finalizeDueGiveaways } = createWorkerRuntime(env);
        await ensureBotInitialized(env, bot);
        const secretToken = await getWebhookSecret(env);

        const handleWebhook = webhookCallback(bot, 'cloudflare-mod', {
          secretToken,
          onTimeout: 'return',
          timeoutMilliseconds: 25000
        });

        ctx.waitUntil(
          finalizeDueGiveaways().catch((err) => {
            logError('webhook_scheduler_error', err);
          })
        );

        return await handleWebhook(request);
      } catch (err) {
        logError('webhook_handler_error', err);
        return Response.json({ ok: false, error: err.message }, { status: 500 });
      }
    }

    if (path === '/setup' && request.method === 'POST') {
      const secretToken = await getWebhookSecret(env);
      const providedSecret = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
      if (!secretToken || !timingSafeEqual(providedSecret, secretToken)) {
        return new Response('Unauthorized', { status: 401 });
      }

      const { bot } = createWorkerRuntime(env);
      const webhookUrl = `${url.origin}/webhook`;
      await bot.api.setWebhook(webhookUrl, {
        secret_token: secretToken,
        drop_pending_updates: false
      });

      logInfo('webhook_registered', { webhookUrl });
      return Response.json({ ok: true, webhookUrl });
    }

    if (path === '/health' || path === '/api/status') {
      if (env.BOT_TOKEN && env.DB) {
        ctx.waitUntil(
          (async () => {
            const { finalizeDueGiveaways } = createWorkerRuntime(env);
            await finalizeDueGiveaways();
          })().catch((err) => logError('health_scheduler_error', err))
        );
      }
      return buildHealthResponse(env);
    }

    if (path === '/') {
      const accept = request.headers.get('Accept') || '';
      const wantsJson = accept.includes('application/json') || url.searchParams.get('format') === 'json';
      if (!wantsJson) {
        if (env.ASSETS) {
          return env.ASSETS.fetch(request);
        }
        return new Response(indexHtml, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }
      return buildHealthResponse(env);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      (async () => {
        if (!env.BOT_TOKEN || !env.DB) {
          logInfo('cron_skipped', { reason: 'missing_env' });
          return;
        }
        const { finalizeDueGiveaways } = createWorkerRuntime(env);
        const finalized = await finalizeDueGiveaways();
        logInfo('cron_completed', { scheduledTime: controller.scheduledTime, finalized });
      })()
    );
  }
};
