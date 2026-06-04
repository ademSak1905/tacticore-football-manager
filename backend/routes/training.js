const express = require('express');
const clubModel = require('../models/clubModel');
const { all, get, run, getCareerState } = require('../database');
const { applyTeamTraining, applyPlayerTraining } = require('../utils/trainingEngine');
const { recordTaskProgress } = require('../utils/taskEngine');

const router = express.Router();
const trainingTypes = ['attack', 'defense', 'pressing', 'passing', 'fitness', 'set_piece', 'shooting', 'morale'];
const intensities = ['light', 'normal', 'heavy'];

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ message: 'Oturum gerekli.' });
  next();
}

router.use(requireAuth);

router.post('/', async (req, res, next) => {
  try {
    const type = trainingTypes.includes(req.body.type) ? req.body.type : 'fitness';
    const intensity = intensities.includes(req.body.intensity) ? req.body.intensity : 'normal';
    const club = await clubModel.getByUserId(req.session.userId);
    const last = await get("SELECT * FROM training WHERE club_id = ? AND datetime(created_at) > datetime('now', '-7 days') ORDER BY created_at DESC LIMIT 1", [club.id]);
    if (last) return res.status(429).json({ message: 'Haftada bir antrenman yapabilirsiniz.' });
    const results = await applyTeamTraining(club, type, intensity);
    await recordTaskProgress(req.session.userId, 'training_done');
    res.json({ message: 'Antrenman tamamlandi.', type, intensity, results });
  } catch (error) {
    next(error);
  }
});

router.post('/team', async (req, res, next) => {
  try {
    const type = trainingTypes.includes(req.body.type) ? req.body.type : 'fitness';
    const intensity = intensities.includes(req.body.intensity) ? req.body.intensity : 'normal';
    const club = await clubModel.getByUserId(req.session.userId);
    const state = await getCareerState(req.session.userId);
    const last = await get('SELECT * FROM training WHERE club_id = ? AND game_day = ? ORDER BY created_at DESC LIMIT 1', [club.id, state.current_day]);
    if (last) return res.status(429).json({ message: 'Bugünkü antrenman bitti. Yeni antrenman için gün ilerletmelisiniz.' });
    const results = await applyTeamTraining(club, type, intensity);
    await run('UPDATE training SET game_day = ? WHERE club_id = ? AND game_day IS NULL', [state.current_day, club.id]);
    await recordTaskProgress(req.session.userId, 'training_done');
    res.json({ message: 'Takım antrenmanı tamamlandı.', results });
  } catch (error) {
    next(error);
  }
});

router.post('/player', async (req, res, next) => {
  try {
    const club = await clubModel.getByUserId(req.session.userId);
    const state = await getCareerState(req.session.userId);
    const last = await get('SELECT * FROM training WHERE club_id = ? AND game_day = ? ORDER BY created_at DESC LIMIT 1', [club.id, state.current_day]);
    if (last) return res.status(429).json({ message: 'Bugünkü antrenman bitti. Yeni antrenman için gün ilerletmelisiniz.' });
    const intensity = intensities.includes(req.body.intensity) ? req.body.intensity : 'normal';
    const results = await applyPlayerTraining(club, Number(req.body.playerId), req.body.type, intensity);
    await run('UPDATE training SET game_day = ? WHERE club_id = ? AND game_day IS NULL', [state.current_day, club.id]);
    await recordTaskProgress(req.session.userId, 'training_done');
    res.json({ message: 'Bireysel antrenman tamamlandı.', results });
  } catch (error) {
    next(error);
  }
});

router.get('/history', async (req, res, next) => {
  try {
    const club = await clubModel.getByUserId(req.session.userId);
    const history = await all('SELECT * FROM training WHERE club_id = ? ORDER BY created_at DESC LIMIT 12', [club.id]);
    res.json(history);
  } catch (error) {
    next(error);
  }
});

router.get('/results', async (req, res, next) => {
  try {
    const club = await clubModel.getByUserId(req.session.userId);
    const results = await all(`
      SELECT tr.*, p.name AS player_name
      FROM training_results tr
      LEFT JOIN players p ON p.id = tr.player_id
      WHERE tr.club_id = ?
      ORDER BY tr.created_at DESC
      LIMIT 30
    `, [club.id]);
    res.json(results);
  } catch (error) {
    next(error);
  }
});

module.exports = router;


