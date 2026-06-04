const express = require('express');
const clubModel = require('../models/clubModel');
const { all, get, run } = require('../database');
const { getBalance, addCoins, spendCoins } = require('../utils/coinManager');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ message: 'Oturum gerekli.' });
  next();
}

function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
}

async function inventory(userId) {
  return all('SELECT * FROM user_boosters WHERE user_id = ? AND quantity > 0 ORDER BY item_key', [userId]);
}

router.use(requireAuth);

router.get('/coins', async (req, res, next) => {
  try {
    const transactions = await all('SELECT * FROM coin_transactions WHERE user_id = ? ORDER BY id DESC LIMIT 12', [req.session.userId]);
    res.json({ balance: await getBalance(req.session.userId), transactions });
  } catch (error) {
    next(error);
  }
});

router.get('/market/items', async (req, res, next) => {
  try {
    const items = await all('SELECT * FROM market_items WHERE active = 1 ORDER BY item_type, price ASC, id ASC');
    res.json({
      balance: await getBalance(req.session.userId),
      inventory: await inventory(req.session.userId),
      items: items.map((item) => ({ ...item, effect: parseJson(item.effect_json, {}) }))
    });
  } catch (error) {
    next(error);
  }
});

router.post('/market/buy', async (req, res, next) => {
  try {
    const item = await get('SELECT * FROM market_items WHERE item_key = ? AND active = 1', [req.body.itemKey]);
    if (!item) return res.status(404).json({ message: 'Market ürünü bulunamadı.' });
    if (item.item_type === 'coin_pack') {
      await addCoins(req.session.userId, Number(item.coin_amount || 0), `${item.name} demo satın alma`, 'demo_purchase');
    } else {
      await spendCoins(req.session.userId, Number(item.price || 0), item.name);
      await run(`
        INSERT INTO user_boosters (user_id, item_key, quantity)
        VALUES (?, ?, 1)
        ON CONFLICT(user_id, item_key) DO UPDATE SET quantity = quantity + 1, updated_at = CURRENT_TIMESTAMP
      `, [req.session.userId, item.item_key]);
    }
    res.json({ message: `${item.name} alındı.`, balance: await getBalance(req.session.userId), inventory: await inventory(req.session.userId) });
  } catch (error) {
    next(error);
  }
});

router.post('/boosters/use', async (req, res, next) => {
  try {
    const userId = req.session.userId;
    const item = await get('SELECT * FROM market_items WHERE item_key = ?', [req.body.itemKey]);
    const owned = await get('SELECT * FROM user_boosters WHERE user_id = ? AND item_key = ? AND quantity > 0', [userId, req.body.itemKey]);
    if (!item || !owned) return res.status(400).json({ message: 'Bu güçlendirici envanterinde yok.' });
    const effect = parseJson(item.effect_json, {});
    const club = await clubModel.getByUserId(userId);
    let message = `${item.name} kullanıldı.`;
    if (effect.stat) {
      const player = await get('SELECT * FROM players WHERE id = ? AND team_id = ?', [Number(req.body.playerId), club.team_id]);
      if (!player) return res.status(404).json({ message: 'Oyuncu bulunamadı.' });
      const column = effect.stat === 'morale' ? 'morale' : 'stamina';
      await run(`UPDATE players SET ${column} = MIN(99, ${column} + ?) WHERE id = ?`, [Number(effect.amount || 0), player.id]);
      message = `${player.name} için ${item.name} kullanıldı.`;
    } else if (effect.healInjury) {
      const player = await get('SELECT * FROM players WHERE id = ? AND team_id = ?', [Number(req.body.playerId), club.team_id]);
      if (!player) return res.status(404).json({ message: 'Oyuncu bulunamadı.' });
      await run('UPDATE players SET injured = 0 WHERE id = ?', [player.id]);
      message = `${player.name} sakatlık kartıyla iyileştirildi.`;
    }
    await run('UPDATE user_boosters SET quantity = quantity - 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND item_key = ?', [userId, item.item_key]);
    res.json({ message, balance: await getBalance(userId), inventory: await inventory(userId) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
