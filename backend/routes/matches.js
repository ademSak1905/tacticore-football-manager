const express = require('express');
const clubModel = require('../models/clubModel');
const matchModel = require('../models/matchModel');
const { playLeagueRound, getLeaguePairingsForWeek, leagueWeeksForTeamCount } = require('../utils/matchEngine');
const { seasonDate, withSeasonDates } = require('../utils/seasonCalendar');
const { all, get, getCareerState } = require('../database');
const { createMatchStories } = require('../utils/feedEngine');
const { ensureEuropeanSeason, dueEuropeanMatch, playDueEuropeanMatch, nextEuropeanMatch } = require('../utils/europeEngine');

const router = express.Router();
const EUROPE_TYPE_BY_CODE = {
  UCL: 'champions_league',
  UEL: 'europa_league',
  UECL: 'conference_league'
};

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ message: 'Oturum gerekli.' });
  next();
}

function withDisplayDate(match) {
  if (!match) return match;
  const displayDate = match.match_day ? seasonDate(match.match_day) : String(match.match_date || '').slice(0, 10);
  return { ...match, display_date: displayDate };
}

router.post('/match/play', requireAuth, async (req, res, next) => {
  try {
    const club = await clubModel.getByUserId(req.session.userId);
    await ensureEuropeanSeason(req.session.userId, club.team_id);
    const state = await getCareerState(req.session.userId);
    const teamCount = await get('SELECT COUNT(*) AS count FROM teams');
    const totalLeagueWeeks = leagueWeeksForTeamCount(teamCount?.count || 18);
    const leagueFinished = Number(state.week || 1) > totalLeagueWeeks;
    const europeDue = await dueEuropeanMatch(req.session.userId, club.team_id, state.current_day);
    const nextEurope = await nextEuropeanMatch(req.session.userId, club.team_id);
    const nextLeagueDay = leagueFinished ? Number.MAX_SAFE_INTEGER : state.next_match_day;
    const nextFixtureDay = Math.min(nextLeagueDay, nextEurope?.match_day || nextLeagueDay);
    const nextMatchDebug = nextEurope && nextEurope.match_day < nextLeagueDay
      ? { competitionType: EUROPE_TYPE_BY_CODE[nextEurope.competition_code] || nextEurope.competition_code, date: seasonDate(nextEurope.match_day), match_day: nextEurope.match_day }
      : leagueFinished
        ? { competitionType: 'season_end', date: null, match_day: null }
        : { competitionType: 'super_lig', date: seasonDate(state.next_match_day), match_day: state.next_match_day };
    console.log('NEXT MATCH CHECK', {
      nextMatch: nextMatchDebug,
      competitionType: nextMatchDebug.competitionType,
      date: nextMatchDebug.date
    });
    if (state.current_day < nextFixtureDay) {
      return res.status(400).json({ message: `Maç tarihi ${seasonDate(nextFixtureDay)}. Önce takvimi ilerletmelisiniz.` });
    }
    const leagueDue = !leagueFinished && state.current_day >= state.next_match_day;
    if (europeDue && (leagueFinished || !leagueDue || europeDue.match_day < state.next_match_day)) {
      const europeanResult = await playDueEuropeanMatch(req.session.userId, club.team_id, state.current_day);
      return res.json(europeanResult);
    }
    if (leagueFinished && nextEurope) {
      return res.status(400).json({ message: `${nextEurope.short_name || 'Avrupa'} maçı ${seasonDate(nextEurope.match_day)} tarihinde. Avrupa macerası bitmeden yeni sezona geçme.` });
    }
    const result = await playLeagueRound(club.team_id, req.session.userId);
    result.competitionType = 'super_lig';
    result.standingsCompetition = 'super_lig';
    result.shownStandingsCompetition = 'super_lig';
    await createMatchStories(result, club.team_id, req.session.userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/matches', requireAuth, async (req, res, next) => {
  try {
    const club = await clubModel.getByUserId(req.session.userId);
    const matches = await all(`
      SELECT m.*, h.name AS home_name, h.logo_url AS home_logo, a.name AS away_name, a.logo_url AS away_logo
      FROM matches m
      JOIN teams h ON h.id = m.home_club_id
      JOIN teams a ON a.id = m.away_club_id
      WHERE m.user_id = ? AND (m.home_club_id = ? OR m.away_club_id = ?)
      ORDER BY m.match_date DESC, m.id DESC
      LIMIT 20
    `, [req.session.userId, club.team_id, club.team_id]);
    res.json(matches.map(withDisplayDate));
  } catch (error) {
    next(error);
  }
});

router.get('/calendar', requireAuth, async (req, res, next) => {
  try {
    const club = await clubModel.getByUserId(req.session.userId);
    const [state, teams, pastMatches] = await Promise.all([
      getCareerState(req.session.userId),
      all('SELECT id, name, short_name, logo_url FROM teams ORDER BY id ASC'),
      all(`
        SELECT m.*, h.name AS home_name, h.logo_url AS home_logo, a.name AS away_name, a.logo_url AS away_logo
        FROM matches m
        JOIN teams h ON h.id = m.home_club_id
        JOIN teams a ON a.id = m.away_club_id
        WHERE m.user_id = ? AND (m.home_club_id = ? OR m.away_club_id = ?)
        ORDER BY m.id DESC
        LIMIT 12
      `, [req.session.userId, club.team_id, club.team_id])
    ]);
    await ensureEuropeanSeason(req.session.userId, club.team_id);
    const totalLeagueWeeks = leagueWeeksForTeamCount(teams.length);
    const leagueFinished = Number(state.week || 1) > totalLeagueWeeks;
    const europeMatches = await all(`
      SELECT em.*, ec.short_name, ec.theme,
        COALESCE(ht.name, het.name) AS home_name,
        COALESCE(at.name, aet.name) AS away_name
      FROM european_matches em
      JOIN european_competitions ec ON ec.code = em.competition_code
      LEFT JOIN teams ht ON ht.id = em.home_team_id
      LEFT JOIN teams at ON at.id = em.away_team_id
      LEFT JOIN european_teams het ON het.id = em.home_european_team_id
      LEFT JOIN european_teams aet ON aet.id = em.away_european_team_id
      WHERE em.user_id = ? AND (em.home_team_id = ? OR em.away_team_id = ?)
      ORDER BY em.match_day ASC, em.id ASC
      LIMIT 24
    `, [req.session.userId, club.team_id, club.team_id]);

    const upcoming = [];
    for (let offset = 0; offset < 8; offset += 1) {
      const week = state.week + offset;
      if (week > totalLeagueWeeks) continue;
      const day = state.next_match_day + offset * 7;
      const fixtures = getLeaguePairingsForWeek(teams, week).map(([home, away]) => ({
        home,
        away,
        isUserMatch: home.id === club.team_id || away.id === club.team_id
      }));
      const userFixture = fixtures.find((item) => item.isUserMatch);
      upcoming.push({
        week,
        day,
        date: seasonDate(day),
        competitionType: 'super_lig',
        matchAvailable: offset === 0 && state.current_day >= state.next_match_day,
        userFixture,
        fixtures
      });
    }
    const superLigMatches = upcoming
      .filter((round) => round.userFixture)
      .map((round) => ({
        id: `super_lig_${round.week}_${round.userFixture.home.id}_${round.userFixture.away.id}`,
        competitionType: 'super_lig',
        competitionLabel: 'Süper Lig',
        week: round.week,
        day: round.day,
        date: round.date,
        homeTeamId: round.userFixture.home.id,
        awayTeamId: round.userFixture.away.id,
        home_name: round.userFixture.home.name,
        away_name: round.userFixture.away.name,
        played: false,
        isUserMatch: true,
        label: `Süper Lig Hafta ${round.week}`
      }));
    const turkishCupMatches = [];
    const europeanCalendarMatches = europeMatches.map((match) => ({
      id: `europe_${match.id}`,
      competitionType: EUROPE_TYPE_BY_CODE[match.competition_code] || match.competition_code,
      competitionLabel: match.short_name,
      week: null,
      day: match.match_day,
      date: match.match_date,
      home_name: match.home_name,
      away_name: match.away_name,
      homeTeamId: match.home_team_id || match.home_european_team_id,
      awayTeamId: match.away_team_id || match.away_european_team_id,
      home_score: match.home_score,
      away_score: match.away_score,
      played: Boolean(match.played),
      isUserMatch: true,
      label: `${match.short_name} ${match.round_name}`
    }));
    const calendarMatches = [
      ...superLigMatches,
      ...turkishCupMatches,
      ...europeanCalendarMatches
    ].sort((a, b) => a.day - b.day);
    const next5Matches = [
      ...upcoming.filter((round) => round.userFixture).map((round) => ({
        competitionType: 'super_lig',
        date: round.date,
        day: round.day,
        label: `Süper Lig Hafta ${round.week}`
      })),
      ...europeMatches.filter((match) => !match.played).map((match) => ({
        competitionType: EUROPE_TYPE_BY_CODE[match.competition_code] || match.competition_code,
        date: match.match_date,
        day: match.match_day,
        label: `${match.short_name} ${match.round_name}`
      }))
    ].sort((a, b) => a.day - b.day).slice(0, 5);
    const nextEuropean = europeMatches.find((match) => !match.played);
    const nextLeagueDay = leagueFinished ? Number.MAX_SAFE_INTEGER : state.next_match_day;
    const nextFixtureDay = Math.min(nextLeagueDay, nextEuropean?.match_day || nextLeagueDay);
    const nextCompetitionType = nextEuropean && nextEuropean.match_day < nextLeagueDay
      ? EUROPE_TYPE_BY_CODE[nextEuropean.competition_code] || nextEuropean.competition_code
      : leagueFinished ? 'season_end' : 'super_lig';
    console.log('CALENDAR CHECK', {
      superLigCount: superLigMatches.length,
      europeanCount: europeanCalendarMatches.length,
      totalMatches: calendarMatches.length,
      next5Matches
    });

    res.json({
      state: {
        ...withSeasonDates(state),
        next_fixture_day: nextFixtureDay,
        next_fixture_date: Number.isFinite(nextFixtureDay) && nextFixtureDay < Number.MAX_SAFE_INTEGER ? seasonDate(nextFixtureDay) : null,
        next_match_competition_type: nextCompetitionType
      },
      club,
      upcoming,
      europeanMatches: europeMatches,
      turkishCupMatches,
      calendarMatches,
      next5Matches,
      pastMatches: pastMatches.map(withDisplayDate)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/match/:id', requireAuth, async (req, res, next) => {
  try {
    const club = await clubModel.getByUserId(req.session.userId);
    const match = await get(`
      SELECT m.*, h.name AS home_name, h.logo_url AS home_logo, a.name AS away_name, a.logo_url AS away_logo
      FROM matches m
      JOIN teams h ON h.id = m.home_club_id
      JOIN teams a ON a.id = m.away_club_id
      WHERE m.id = ? AND m.user_id = ?
    `, [req.params.id, req.session.userId]);
    if (!match || (match.home_club_id !== club.team_id && match.away_club_id !== club.team_id)) {
      return res.status(404).json({ message: 'Maç bulunamadı.' });
    }
    const events = await all('SELECT * FROM match_events WHERE match_id = ? ORDER BY minute ASC', [req.params.id]);
    const playerRatings = await all('SELECT tr.*, p.name, p.position FROM match_player_ratings tr JOIN players p ON p.id = tr.player_id WHERE tr.match_id = ? ORDER BY rating DESC', [req.params.id]);
    res.json({ match: withDisplayDate(match), events, playerRatings });
  } catch (error) {
    next(error);
  }
});

router.get('/match/:id/events', requireAuth, async (req, res, next) => {
  try {
    const match = await get('SELECT id FROM matches WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
    if (!match) return res.status(404).json({ message: 'Maç bulunamadı.' });
    res.json(await all('SELECT * FROM match_events WHERE match_id = ? ORDER BY minute ASC', [req.params.id]));
  } catch (error) {
    next(error);
  }
});

module.exports = router;


