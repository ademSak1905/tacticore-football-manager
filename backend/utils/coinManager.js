const { get, run } = require('../database');

async function getBalance(userId) {
  const row = await get('SELECT tacticoins FROM users WHERE id = ?', [userId]);
  return Number(row?.tacticoins || 0);
}

async function addCoins(userId, amount, reason = 'Coin kazanımı', type = 'earn') {
  const safeAmount = Math.max(0, Math.round(Number(amount || 0)));
  if (!safeAmount) return { balance: await getBalance(userId), amount: 0 };
  await run('UPDATE users SET tacticoins = COALESCE(tacticoins, 100) + ? WHERE id = ?', [safeAmount, userId]);
  const balance = await getBalance(userId);
  await run(
    'INSERT INTO coin_transactions (user_id, amount, type, reason, balance_after) VALUES (?, ?, ?, ?, ?)',
    [userId, safeAmount, type, reason, balance]
  );
  return { balance, amount: safeAmount };
}

async function spendCoins(userId, amount, reason = 'Coin harcaması') {
  const safeAmount = Math.max(0, Math.round(Number(amount || 0)));
  const balance = await getBalance(userId);
  if (balance < safeAmount) {
    const error = new Error('Yeterli TactiCoins yok.');
    error.status = 400;
    throw error;
  }
  await run('UPDATE users SET tacticoins = tacticoins - ? WHERE id = ?', [safeAmount, userId]);
  const balanceAfter = await getBalance(userId);
  await run(
    'INSERT INTO coin_transactions (user_id, amount, type, reason, balance_after) VALUES (?, ?, ?, ?, ?)',
    [userId, -safeAmount, 'spend', reason, balanceAfter]
  );
  return { balance: balanceAfter, amount: -safeAmount };
}

module.exports = {
  getBalance,
  addCoins,
  spendCoins
};
