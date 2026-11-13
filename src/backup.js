const db = require('./db');

const GH_API = 'https://api.github.com';
const DEFAULT_REPO_NAME = 'temka-bot-data';
const BACKUP_PATH = 'backup.json';

let cachedRepoFull = null;
let cachedFileSha = null;
let backupTimer = null;
let inFlightBackup = null;
let needsAnotherBackup = false;

function getToken() {
  return process.env.BACKUP_GH_TOKEN || process.env.GH_TOKEN || '';
}

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'temka-random-bot',
    'Content-Type': 'application/json'
  };
}

async function resolveRepo(token) {
  if (cachedRepoFull) return cachedRepoFull;

  const configured = process.env.BACKUP_GH_REPO;
  if (configured && configured.includes('/')) {
    cachedRepoFull = configured;
    return cachedRepoFull;
  }

  const userRes = await fetch(`${GH_API}/user`, { headers: ghHeaders(token) });
  if (!userRes.ok) {
    throw new Error(`GitHub /user failed: ${userRes.status}`);
  }
  const userData = await userRes.json();
  const repoName = configured || DEFAULT_REPO_NAME;
  cachedRepoFull = `${userData.login}/${repoName}`;
  return cachedRepoFull;
}

async function ensurePrivateRepo(token, repoFull) {
  const check = await fetch(`${GH_API}/repos/${repoFull}`, { headers: ghHeaders(token) });
  if (check.ok) return true;
  if (check.status !== 404) {
    throw new Error(`GitHub repo check failed: ${check.status}`);
  }

  const repoName = repoFull.split('/')[1];
  const createRes = await fetch(`${GH_API}/user/repos`, {
    method: 'POST',
    headers: ghHeaders(token),
    body: JSON.stringify({
      name: repoName,
      private: true,
      description: 'Private persistent backup storage for Temka Random Bot',
      auto_init: true
    })
  });
  if (!createRes.ok && createRes.status !== 422) {
    throw new Error(`GitHub create private repo failed: ${createRes.status}`);
  }
  return true;
}

async function restoreBackup() {
  const token = getToken();
  if (!token) {
    console.log('[Backup] BACKUP_GH_TOKEN not set; using local SQLite + message auto-recovery.');
    return { enabled: false };
  }

  try {
    const repoFull = await resolveRepo(token);
    await ensurePrivateRepo(token, repoFull);

    const res = await fetch(`${GH_API}/repos/${repoFull}/contents/${BACKUP_PATH}`, {
      headers: ghHeaders(token)
    });

    if (res.status === 404) {
      console.log(`[Backup] Initialized private repo ${repoFull}; no prior backup yet.`);
      return { enabled: true, restored: false };
    }
    if (!res.ok) {
      throw new Error(`GitHub read backup failed: ${res.status}`);
    }

    const fileData = await res.json();
    cachedFileSha = fileData.sha;
    const rawJson = Buffer.from(fileData.content || '', 'base64').toString('utf8');
    if (rawJson.trim()) {
      const parsed = JSON.parse(rawJson);
      db.importState(parsed);
      console.log(
        `[Backup] Restored from ${repoFull}: ${(parsed.giveaways || []).length} giveaways, ${(parsed.participants || []).length} participants.`
      );
    }
    return { enabled: true, restored: true };
  } catch (err) {
    console.error('[Backup] Restore error:', err.message);
    return { enabled: true, error: err.message };
  }
}

async function performBackup() {
  const token = getToken();
  if (!token) return;

  if (inFlightBackup) {
    needsAnotherBackup = true;
    return inFlightBackup;
  }

  inFlightBackup = (async () => {
    try {
      const repoFull = await resolveRepo(token);
      await ensurePrivateRepo(token, repoFull);

      if (!cachedFileSha) {
        const metaRes = await fetch(`${GH_API}/repos/${repoFull}/contents/${BACKUP_PATH}`, {
          headers: ghHeaders(token)
        });
        if (metaRes.ok) {
          const meta = await metaRes.json();
          cachedFileSha = meta.sha;
        }
      }

      const payload = JSON.stringify(db.exportState());
      const contentB64 = Buffer.from(payload, 'utf8').toString('base64');

      const body = {
        message: `Backup bot state (${new Date().toISOString()})`,
        content: contentB64
      };
      if (cachedFileSha) body.sha = cachedFileSha;

      let putRes = await fetch(`${GH_API}/repos/${repoFull}/contents/${BACKUP_PATH}`, {
        method: 'PUT',
        headers: ghHeaders(token),
        body: JSON.stringify(body)
      });

      if (putRes.status === 409 || putRes.status === 422) {
        const freshRes = await fetch(`${GH_API}/repos/${repoFull}/contents/${BACKUP_PATH}`, {
          headers: ghHeaders(token)
        });
        if (freshRes.ok) {
          const fresh = await freshRes.json();
          cachedFileSha = fresh.sha;
          body.sha = cachedFileSha;
          putRes = await fetch(`${GH_API}/repos/${repoFull}/contents/${BACKUP_PATH}`, {
            method: 'PUT',
            headers: ghHeaders(token),
            body: JSON.stringify(body)
          });
        }
      }

      if (!putRes.ok) {
        throw new Error(`GitHub write backup failed: ${putRes.status}`);
      }
      const saved = await putRes.json();
      cachedFileSha = saved.content?.sha || cachedFileSha;
    } catch (err) {
      console.error('[Backup] Save error:', err.message);
    } finally {
      inFlightBackup = null;
      if (needsAnotherBackup) {
        needsAnotherBackup = false;
        scheduleBackup(1000);
      }
    }
  })();

  return inFlightBackup;
}

function scheduleBackup(delayMs = 4000) {
  if (!getToken()) return;
  if (backupTimer) clearTimeout(backupTimer);
  backupTimer = setTimeout(() => {
    backupTimer = null;
    performBackup();
  }, delayMs);
}

async function flushBackup() {
  if (!getToken()) return;
  if (backupTimer) {
    clearTimeout(backupTimer);
    backupTimer = null;
  }
  await performBackup();
}

module.exports = {
  restoreBackup,
  scheduleBackup,
  flushBackup
};
