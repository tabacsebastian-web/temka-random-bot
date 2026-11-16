const { finalizeDueGiveaways } = require('./bot');

let timer = null;
let isChecking = false;

async function runSchedulerCheck() {
  if (isChecking) return;
  isChecking = true;
  try {
    await finalizeDueGiveaways();
  } catch (err) {
    console.error('[Scheduler] Error checking giveaways:', err);
  } finally {
    isChecking = false;
  }
}

function startScheduler(intervalMs = 10000) {
  if (timer) clearInterval(timer);

  timer = setInterval(() => {
    runSchedulerCheck();
  }, intervalMs);

  console.log(`[Scheduler] Started (checking every ${intervalMs / 1000}s)`);
}

function stopScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  runSchedulerCheck,
  startScheduler,
  stopScheduler
};
