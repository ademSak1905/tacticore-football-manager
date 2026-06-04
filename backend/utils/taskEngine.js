const { all, get, run } = require('../database');
const { addCoins } = require('./coinManager');
const { addXp } = require('./managerEngine');

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function ensureDailyRows(userId, dateKey = todayKey()) {
  const tasks = await all('SELECT * FROM daily_tasks ORDER BY id ASC');
  for (const task of tasks) {
    await run(
      'INSERT OR IGNORE INTO user_daily_tasks (user_id, task_key, date_key) VALUES (?, ?, ?)',
      [userId, task.task_key, dateKey]
    );
  }
  return tasks;
}

async function getDailyTasks(userId) {
  const dateKey = todayKey();
  await ensureDailyRows(userId, dateKey);
  const rows = await all(`
    SELECT dt.*, COALESCE(udt.progress, 0) AS progress, COALESCE(udt.claimed, 0) AS claimed
    FROM daily_tasks dt
    LEFT JOIN user_daily_tasks udt ON udt.task_key = dt.task_key AND udt.user_id = ? AND udt.date_key = ?
    ORDER BY dt.id ASC
  `, [userId, dateKey]);
  return {
    dateKey,
    tasks: rows.map((row) => ({
      ...row,
      done: Number(row.progress || 0) >= Number(row.target || 1),
      claimed: Boolean(row.claimed)
    }))
  };
}

async function recordTaskProgress(userId, taskKey, amount = 1) {
  if (!userId || !taskKey) return null;
  const dateKey = todayKey();
  await ensureDailyRows(userId, dateKey);
  await run(`
    UPDATE user_daily_tasks
    SET progress = progress + ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND task_key = ? AND date_key = ? AND claimed = 0
  `, [Math.max(1, Number(amount || 1)), userId, taskKey, dateKey]);
  return getDailyTasks(userId);
}

async function claimDailyTask(userId, taskKey) {
  const dateKey = todayKey();
  await ensureDailyRows(userId, dateKey);
  const task = await get(`
    SELECT dt.*, udt.progress, udt.claimed
    FROM daily_tasks dt
    JOIN user_daily_tasks udt ON udt.task_key = dt.task_key
    WHERE udt.user_id = ? AND udt.date_key = ? AND dt.task_key = ?
  `, [userId, dateKey, taskKey]);
  if (!task) throw new Error('Görev bulunamadı.');
  if (Number(task.claimed || 0)) throw new Error('Bu görev ödülü zaten alındı.');
  if (Number(task.progress || 0) < Number(task.target || 1)) throw new Error('Görev henüz tamamlanmadı.');

  if (task.reward_type === 'xp') {
    await addXp(userId, `daily_${dateKey}_${task.task_key}`, Number(task.reward_amount || 0), task.title);
  } else {
    await addCoins(userId, Number(task.reward_amount || 0), task.title, 'daily_reward');
  }
  await run(
    'UPDATE user_daily_tasks SET claimed = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND task_key = ? AND date_key = ?',
    [userId, taskKey, dateKey]
  );
  return getDailyTasks(userId);
}

module.exports = {
  getDailyTasks,
  recordTaskProgress,
  claimDailyTask
};
