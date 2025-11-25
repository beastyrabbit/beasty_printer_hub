/**
 * Scheduler for running tasks at specific times each day.
 * Properly handles day filters for weekly/specific-day tasks.
 */

function msUntilNext(timeStr) {
  const [h, m] = timeStr.split(':').map((v) => parseInt(v, 10));
  const now = new Date();
  const next = new Date();
  next.setHours(h || 0, m || 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

/**
 * Creates a runner that executes a function at a specific time each day.
 * @param {Function} fn - The async function to run
 * @param {string} timeStr - Time in HH:MM format (24h)
 * @param {Function|null} dayFilter - Optional filter (date) => boolean, runs only when true
 */
function createDailyRunner(fn, timeStr, dayFilter = null) {
  let timer = null;

  const scheduleNext = () => {
    const wait = msUntilNext(timeStr);
    clearTimeout(timer);
    
    timer = setTimeout(async () => {
      try {
        const now = new Date();
        if (!dayFilter || dayFilter(now)) {
          await fn();
        }
      } catch (err) {
        console.error('Scheduled run failed:', err.message);
      }
      // Always schedule the next run (this properly handles dayFilter each time)
      scheduleNext();
    }, wait);
  };

  scheduleNext();

  return {
    reschedule: scheduleNext,
    stop: () => clearTimeout(timer)
  };
}

module.exports = { createDailyRunner, msUntilNext };
