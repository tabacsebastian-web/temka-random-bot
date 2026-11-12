const db = require('./db');
const { finalizeGiveaway } = require('./bot');

let timer = null;

function startScheduler(intervalMs = 10000) {
  if (timer) clearInterval(timer);

  timer = setInterval(async () => {
    try {
      const dueGiveaways = db.giveaways.getActiveToFinish();
      for (const g of dueGiveaways) {
        console.log(`[Scheduler] Finalizing giveaway #${g.id} (${g.prize})...`);
        await finalizeGiveaway(g.id);
      }
    } catch (err) {
      console.error('[Scheduler] Error checking giveaways:', err);
    }
  }, intervalMs);

  console.log(`[Scheduler] Started (checking every ${intervalMs / 1000}s)`);
}

function stopScheduler() {
  if (timer) clearInterval(timer);
}

module.exports = {
  startScheduler,
  stopScheduler
};
