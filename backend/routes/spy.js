const express = require('express');
const clubModel = require('../models/clubModel');
const { all, getCareerState } = require('../database');
const { getBalance } = require('../utils/coinManager');
const { listSpyTeams, refreshReadyReports, sendSpy } = require('../utils/spyEngine');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ message: 'Oturum gerekli.' });
  next();
}

function normalizeReport(row, currentDay = 0) {
  const revealAt = row.reveal_at || row.created_at;
  const revealDay = Number(row.reveal_day || 0);
  const ready = row.status === 'completed'
    || (revealDay > 0 && revealDay <= Number(currentDay || 0))
    || (!revealDay && (!revealAt || new Date(revealAt).getTime() <= Date.now()));
  if (!ready) {
    return {
      ...row,
      status: 'pending',
      success: null,
      isReady: false,
      reveal_at: revealAt,
      reveal_day: revealDay,
      days_left: revealDay ? Math.max(1, revealDay - Number(currentDay || 0)) : null,
      report: {
        teamName: row.target_team_name || 'Rakip',
        message: 'Casus ekibi rakip tesise sızmaya çalışıyor.'
      }
    };
  }
  try {
    const report = typeof row.report_json === 'object'
      ? row.report_json
      : JSON.parse(row.report_json || '{}');
    return { ...row, status: 'completed', success: Boolean(row.success), isReady: true, report };
  } catch {
    return { ...row, status: 'completed', success: Boolean(row.success), isReady: true, report: {} };
  }
}

router.use(requireAuth);

router.get('/spy/teams', async (req, res, next) => {
  try {
    const club = await clubModel.getByUserId(req.session.userId);
    const data = await listSpyTeams(req.session.userId, club.team_id);
    const state = await getCareerState(req.session.userId);
    res.json({ ...data, recentReports: data.recentReports.map((row) => normalizeReport(row, state.current_day)), balance: await getBalance(req.session.userId) });
  } catch (error) {
    next(error);
  }
});

router.post('/spy/send', async (req, res, next) => {
  try {
    const club = await clubModel.getByUserId(req.session.userId);
    const report = await sendSpy(req.session.userId, club.team_id, Number(req.body.teamId), req.body.spyType || 'normal');
    const state = await getCareerState(req.session.userId);
    res.json({ report: normalizeReport(report, state.current_day), balance: await getBalance(req.session.userId) });
  } catch (error) {
    next(error);
  }
});

router.get('/spy/reports', async (req, res, next) => {
  try {
    await refreshReadyReports(req.session.userId);
    const state = await getCareerState(req.session.userId);
    const rows = await all(`
      SELECT sr.*, t.name AS target_team_name
      FROM spy_reports sr
      JOIN teams t ON t.id = sr.target_team_id
      WHERE sr.user_id = ?
      ORDER BY sr.created_at DESC
      LIMIT 20
    `, [req.session.userId]);
    res.json(rows.map((row) => normalizeReport(row, state.current_day)));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
