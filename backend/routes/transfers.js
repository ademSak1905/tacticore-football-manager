const express = require('express');
const clubModel = require('../models/clubModel');
const playerModel = require('../models/playerModel');
const { all, get, run } = require('../database');
const { dynamicMarket, negotiateTransfer, pendingOffersForUser } = require('../utils/transferEngine');
const { createTransferStory } = require('../utils/feedEngine');
const { recordTaskProgress } = require('../utils/taskEngine');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ message: 'Oturum gerekli.' });
  next();
}

router.use(requireAuth);

router.get('/market', async (req, res, next) => {
  try {
    const club = await clubModel.getByUserId(req.session.userId);
    res.json(await dynamicMarket(club, { category: req.query.category || 'all', q: req.query.q || '' }));
  } catch (error) {
    next(error);
  }
});

router.get('/pending', async (req, res, next) => {
  try {
    res.json(await pendingOffersForUser(req.session.userId));
  } catch (error) {
    next(error);
  }
});

router.post('/buy', async (req, res, next) => {
  try {
    const club = await clubModel.getByUserId(req.session.userId);
    const result = await negotiateTransfer(club, req.body);
    if (result.status === 'error') return res.status(400).json(result);
    if (result.status === 'closed') return res.status(409).json(result);
    if (result.status === 'counter') return res.status(202).json(result);
    if (result.status === 'pending') await recordTaskProgress(req.session.userId, 'transfer_offer');
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/sell', async (req, res, next) => {
  try {
    const playerId = Number(req.body.playerId);
    const club = await clubModel.getByUserId(req.session.userId);
    const player = await playerModel.getClubPlayer(club.id, playerId);
    if (!player) return res.status(404).json({ message: 'Oyuncu bulunamadı.' });

    const price = Math.round(player.market_value * 0.82);
    await run('UPDATE clubs SET budget = budget + ? WHERE id = ?', [price, club.id]);
    await run('DELETE FROM lineups WHERE player_id = ?', [player.id]);
    await run("UPDATE players SET team_id = NULL, club_id = NULL, is_starting_eleven = 0, lineup_role = 'reserve' WHERE id = ? AND team_id = ?", [player.id, club.team_id]);
    await run('INSERT INTO transfers (player_id, from_club_id, to_club_id, price) VALUES (?, ?, NULL, ?)', [player.id, club.id, price]);
    await run(`
      INSERT INTO transfer_history (player_id, from_team_id, to_team_id, category, price, wage, status, day)
      VALUES (?, ?, NULL, 'listed', ?, ?, 'completed', (SELECT current_day FROM game_state WHERE id = 1))
    `, [player.id, club.team_id, price, player.salary]);
    await createTransferStory({ teamId: club.team_id, playerId: player.id, category: 'transfer', status: 'completed', price });
    res.json({ message: `${player.name} ${price.toLocaleString('tr-TR')} TL bedelle satıldı.` });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

