const express = require('express');
const clubModel = require('../models/clubModel');
const playerModel = require('../models/playerModel');
const { get, all, getCareerState } = require('../database');
const { calculateTeamStrength } = require('../utils/overallCalculator');
const { lineupForTeam, leagueWeeksForTeamCount } = require('../utils/matchEngine');
const { ensureEuropeanSeason } = require('../utils/europeEngine');
const { syncCareerLeagueMatchDay } = require('../utils/scheduleEngine');
const { nextOpponentFixture } = require('../utils/inboxEngine');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ message: 'Oturum gerekli.' });
  next();
}

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const club = await clubModel.getByUserId(req.session.userId);
    const table = await clubModel.table(req.session.userId);
    const rank = table.findIndex((item) => item.id === club.team_id) + 1;
    await ensureEuropeanSeason(req.session.userId, club.team_id);
    const teamCount = await get('SELECT COUNT(*) AS count FROM teams');
    let state = await getCareerState(req.session.userId);
    state = await syncCareerLeagueMatchDay(req.session.userId, club.team_id, state, leagueWeeksForTeamCount(teamCount?.count || 18));
    const fixture = await nextOpponentFixture(req.session.userId, club, state);
    const isHome = Number(fixture?.home_team_id || 0) === Number(club.team_id);
    const opponentName = fixture ? (isHome ? fixture.away_name : fixture.home_name) : null;
    const team = await get('SELECT * FROM teams WHERE id = ?', [club.team_id]);
    const lineup = await lineupForTeam(club.team_id);
    const power = calculateTeamStrength(lineup, team, {});
    const salaries = await get('SELECT COALESCE(SUM(salary), 0) AS total FROM players WHERE team_id = ?', [club.team_id]);
    const bestPlayer = await get('SELECT * FROM players WHERE team_id = ? ORDER BY overall DESC LIMIT 1', [club.team_id]);
    const injuredPlayers = await all('SELECT * FROM players WHERE team_id = ? AND injured = 1 ORDER BY overall DESC', [club.team_id]);

    res.json({
      club,
      rank,
      nextOpponent: opponentName || 'Rakip bekleniyor',
      teamPower: power.total,
      power,
      weeklySalary: salaries.total || 0,
      bestPlayer,
      injuredPlayers
    });
  } catch (error) {
    next(error);
  }
});

router.put('/', async (req, res, next) => {
  try {
    await clubModel.updateClub(req.session.userId, req.body);
    const club = await clubModel.getByUserId(req.session.userId);
    res.json(club);
  } catch (error) {
    next(error);
  }
});

router.get('/economy', async (req, res, next) => {
  try {
    const club = await clubModel.getByUserId(req.session.userId);
    const salaries = await get('SELECT COALESCE(SUM(salary), 0) AS total FROM players WHERE team_id = ?', [club.team_id]);
    const recentTransfers = await all(`
      SELECT tr.*, p.name AS player_name
      FROM transfers tr
      JOIN players p ON p.id = tr.player_id
      WHERE tr.from_club_id = ? OR tr.to_club_id = ?
      ORDER BY tr.transfer_date DESC
      LIMIT 10
    `, [club.id, club.id]);

    res.json({
      club,
      weeklySalary: salaries.total || 0,
      estimatedTicketIncome: Math.round(club.stadium_capacity * 18),
      sponsorIncome: 130000,
      recentTransfers
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
