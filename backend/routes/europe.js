const express = require('express');
const clubModel = require('../models/clubModel');
const { all, get } = require('../database');
const {
  ensureEuropeanSeason,
  europeanOverview,
  europeanStandings,
  nextEuropeanMatch,
  restoreLastSquadSnapshot
} = require('../utils/europeEngine');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ message: 'Oturum gerekli.' });
  next();
}

router.use(requireAuth);

router.get('/europe/overview', async (req, res, next) => {
  try {
    const club = await clubModel.getByUserId(req.session.userId);
    await ensureEuropeanSeason(req.session.userId, club.team_id);
    res.json(await europeanOverview(req.session.userId, club.team_id));
  } catch (error) {
    next(error);
  }
});

router.post('/europe/setup', async (req, res, next) => {
  try {
    const club = await clubModel.getByUserId(req.session.userId);
    await ensureEuropeanSeason(req.session.userId, club.team_id);
    res.json(await europeanOverview(req.session.userId, club.team_id));
  } catch (error) {
    next(error);
  }
});

router.get('/europe/next', async (req, res, next) => {
  try {
    const club = await clubModel.getByUserId(req.session.userId);
    res.json(await nextEuropeanMatch(req.session.userId, club.team_id));
  } catch (error) {
    next(error);
  }
});

router.get('/europe/standings/:code', async (req, res, next) => {
  try {
    const code = String(req.params.code || 'UCL').toUpperCase();
    res.json(await europeanStandings(req.session.userId, code));
  } catch (error) {
    next(error);
  }
});

router.get('/europe/matches', async (req, res, next) => {
  try {
    const club = await clubModel.getByUserId(req.session.userId);
    const rows = await all(`
      SELECT em.*, ec.short_name, ec.theme,
        COALESCE(ht.name, het.name) AS home_name,
        COALESCE(at.name, aet.name) AS away_name,
        COALESCE(ht.logo_url, het.logo_url) AS home_logo,
        COALESCE(at.logo_url, aet.logo_url) AS away_logo
      FROM european_matches em
      JOIN european_competitions ec ON ec.code = em.competition_code
      LEFT JOIN teams ht ON ht.id = em.home_team_id
      LEFT JOIN teams at ON at.id = em.away_team_id
      LEFT JOIN european_teams het ON het.id = em.home_european_team_id
      LEFT JOIN european_teams aet ON aet.id = em.away_european_team_id
      WHERE em.user_id = ? AND (em.home_team_id = ? OR em.away_team_id = ?)
      ORDER BY em.match_day ASC, em.id ASC
      LIMIT 40
    `, [req.session.userId, club.team_id, club.team_id]);
    const state = await get('SELECT * FROM career_states WHERE user_id = ?', [req.session.userId]);
    const currentDay = Number(state?.current_day || 1);
    res.json(rows.map((row) => {
      const drawDay = Math.max(1, Number(row.match_day || 1) - 7);
      if (row.played || currentDay >= drawDay) return { ...row, draw_day: drawDay, draw_revealed: true };
      return {
        ...row,
        home_name: 'Kura bekleniyor',
        away_name: 'Kura bekleniyor',
        draw_day: drawDay,
        draw_revealed: false
      };
    }));
  } catch (error) {
    next(error);
  }
});

router.get('/europe/draws', async (req, res, next) => {
  try {
    const draws = await all("SELECT * FROM european_draws WHERE user_id = ? AND competition_code != 'CONFIG' ORDER BY id DESC LIMIT 20", [req.session.userId]);
    res.json(draws.map((row) => ({ ...row, draw_data: JSON.parse(row.draw_data || '[]') })));
  } catch (error) {
    next(error);
  }
});

router.post('/squad/restore-snapshot', async (req, res, next) => {
  try {
    const club = await clubModel.getByUserId(req.session.userId);
    res.json(await restoreLastSquadSnapshot(club.team_id));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
