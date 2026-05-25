const express = require('express');
const clubModel = require('../models/clubModel');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ message: 'Oturum gerekli.' });
  next();
}

router.get('/table', requireAuth, async (req, res, next) => {
  try {
    const table = await clubModel.table(req.session.userId);
    res.json(table);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
