const express = require('express');
const { getManagerProfile, getManagerSummary, getManagerLeaderboard } = require('../utils/managerEngine');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ message: 'Oturum gerekli.' });
  next();
}

router.get('/manager/leaderboard', async (req, res, next) => {
  try {
    res.json(await getManagerLeaderboard(10));
  } catch (error) {
    next(error);
  }
});

router.get('/manager/profile', requireAuth, async (req, res, next) => {
  try {
    res.json(await getManagerProfile(req.session.userId));
  } catch (error) {
    next(error);
  }
});

router.get('/manager/summary', requireAuth, async (req, res, next) => {
  try {
    res.json(await getManagerSummary(req.session.userId));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
