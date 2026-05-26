const express = require('express');
const { getManagerProfile, getManagerSummary } = require('../utils/managerEngine');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ message: 'Oturum gerekli.' });
  next();
}

router.use(requireAuth);

router.get('/manager/profile', async (req, res, next) => {
  try {
    res.json(await getManagerProfile(req.session.userId));
  } catch (error) {
    next(error);
  }
});

router.get('/manager/summary', async (req, res, next) => {
  try {
    res.json(await getManagerSummary(req.session.userId));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
