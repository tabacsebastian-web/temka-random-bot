import { webhookCallback } from 'grammy';
import botCorePkg from './bot-core.js';
import d1Pkg from './db-d1.js';
import profilePkg from './profile.js';
import indexHtml from '../public/index.html';

const { createBot } = botCorePkg;
const { createD1Database } = d1Pkg;
const { syncBotProfile } = profilePkg;

const VERSION = '3.3.0-cloudflare';
const botInfoCache = new Map();
const webhookSecretCache = new Map();
const isolateCaches = {
  users: new Map(),
  stats: { value: null, updatedAt: 0 },
  channelRefresh: new Map()
};
let lastSweepAt = 0;
const SWEEP_THROTTLE_MS = 45000;

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

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function getWebhookSecret(env) {
  if (env.WEBHOOK_SECRET) {
    return env.WEBHOOK_SECRET;
  }
  if (!env.BOT_TOKEN) {
    return '';
  }
  const cached = webhookSecretCache.get(env.BOT_TOKEN);
  if (cached) return cached;
  const computed = (await sha256Hex(`${env.BOT_TOKEN}:webhook`)).slice(0, 32);
  webhookSecretCache.set(env.BOT_TOKEN, computed);
  return computed;
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

function createWorkerRuntime(env, scheduleBackground = undefined) {
  if (!env.BOT_TOKEN) {
    throw new Error('Missing BOT_TOKEN secret in Cloudflare Worker environment');
  }
  if (!env.DB) {
    throw new Error('Missing DB (D1) binding in Cloudflare Worker environment');
  }

  const defaultLang = env.DEFAULT_LANG || 'en';
  const db = createD1Database(env.DB, defaultLang);

  let botInfo = botInfoCache.get(env.BOT_TOKEN);
  if (!botInfo && env.BOT_INFO) {
    try {
      botInfo = typeof env.BOT_INFO === 'string' ? JSON.parse(env.BOT_INFO) : env.BOT_INFO;
      if (botInfo && typeof botInfo === 'object') {
        botInfoCache.set(env.BOT_TOKEN, botInfo);
      }
    } catch (err) {}
  }

  const runtime = createBot({
    token: env.BOT_TOKEN,
    defaultLang,
    db,
    botInfo,
    botUsername: env.BOT_USERNAME || 'TemkaDrawBot',
    caches: isolateCaches,
    scheduleBackground
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
  let stats = { activeUsers30d: 0, totalGiveaways: 0, totalParticipants: 0 };
  if (env.DB) {
    try {
      const db = createD1Database(env.DB, env.DEFAULT_LANG || 'en');
      await db.ping();
      d1Status = 'connected';
      stats = await db.stats.getPublicStats();
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
    stats,
    time: new Date().toISOString()
  });
}

async function buildVerifyApiResponse(env, seed) {
  const cleanSeed = String(seed || '').trim();
  if (!cleanSeed) {
    return Response.json({ ok: false, error: 'Missing seed parameter' }, { status: 400 });
  }

  const computedHash = await sha256Hex(cleanSeed);
  let matched = null;

  if (env.DB) {
    try {
      const db = createD1Database(env.DB, env.DEFAULT_LANG || 'en');
      const g = await db.giveaways.getBySeedHash(computedHash);
      if (g && g.status === 'finished') {
        const participantsCount = await db.participants.count(g.id);
        matched = {
          public_id: g.public_id,
          prize: g.prize,
          status: g.status,
          winners_count: g.winners_count,
          participants_count: participantsCount,
          finished_at: g.finished_at,
          seed_hash: g.seed_hash,
          winners: (g.winners || []).map((w) => ({
            username: w.username || null,
            first_name: w.first_name || 'Winner'
          }))
        };
      }
    } catch (err) {
      logError('verify_api_error', err);
    }
  }

  return Response.json({
    ok: true,
    computed_hash: computedHash,
    matched_giveaway: matched
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/webhook' && request.method === 'POST') {
      try {
        const scheduleBg = (promise) => {
          ctx.waitUntil(
            Promise.resolve(promise).catch((err) => {
              logError('webhook_bg_error', err);
            })
          );
        };
        const { bot, finalizeDueGiveaways } = createWorkerRuntime(env, scheduleBg);
        const [, secretToken] = await Promise.all([
          ensureBotInitialized(env, bot),
          getWebhookSecret(env)
        ]);

        const handleWebhook = webhookCallback(bot, 'cloudflare-mod', {
          secretToken,
          onTimeout: 'return',
          timeoutMilliseconds: 25000
        });

        const now = Date.now();
        if (now - lastSweepAt >= SWEEP_THROTTLE_MS) {
          lastSweepAt = now;
          ctx.waitUntil(
            finalizeDueGiveaways().catch((err) => {
              logError('webhook_scheduler_error', err);
            })
          );
        }

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
        allowed_updates: ['message', 'callback_query', 'my_chat_member'],
        max_connections: 100,
        drop_pending_updates: false
      });
      const profileSynced = await syncBotProfile(bot.api);

      logInfo('webhook_registered', { webhookUrl, profileSynced });
      return Response.json({ ok: true, webhookUrl, profileSynced });
    }

    if (path === '/api/verify' && request.method === 'GET') {
      return buildVerifyApiResponse(env, url.searchParams.get('seed'));
    }

    if (path === '/health' || path === '/api/status') {
      if (env.BOT_TOKEN && env.DB && Date.now() - lastSweepAt >= SWEEP_THROTTLE_MS) {
        lastSweepAt = Date.now();
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
