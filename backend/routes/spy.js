const express = require('express');
const clubModel = require('../models/clubModel');
const { all } = require('../database');
const { getBalance } = require('../utils/coinManager');
const { listSpyTeams, sendSpy } = require('../utils/spyEngine');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ message: 'Oturum gerekli.' });
  next();
}

function normalizeReport(row) {
  try {
    return { ...row, success: Boolean(row.success), report: JSON.parse(row.report_json || '{}') };
  } catch {
    return { ...row, success: Boolean(row.success), report: {} };
  }
}

router.use(requireAuth);

router.get('/spy/teams', async (req, res, next) => {
  try {
    const club = await clubModel.getByUserId(req.session.userId);
    const data = await listSpyTeams(req.session.userId, club.team_id);
    res.json({ ...data, balance: await getBalance(req.session.userId) });
  } catch (error) {
    next(error);
  }
});

router.post('/spy/send', async (req, res, next) => {
  try {
    const club = await clubModel.getByUserId(req.session.userId);
    const report = await sendSpy(req.session.userId, club.team_id, Number(req.body.teamId), req.body.spyType || 'normal');
    res.json({ report: normalizeReport(report), balance: await getBalance(req.session.userId) });
  } catch (error) {
    next(error);
  }
});

router.get('/spy/reports', async (req, res, next) => {
  try {
    const rows = await all(`
      SELECT sr.*, t.name AS target_team_name
      FROM spy_reports sr
      JOIN teams t ON t.id = sr.target_team_id
      WHERE sr.user_id = ?
      ORDER BY sr.created_at DESC
      LIMIT 20
    `, [req.session.userId]);
    res.json(rows.map(normalizeReport));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
