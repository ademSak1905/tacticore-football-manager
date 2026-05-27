const express = require('express');
const clubModel = require('../models/clubModel');
const matchModel = require('../models/matchModel');
const { playLeagueRound, getLeaguePairingsForWeek, leagueWeeksForTeamCount, buildSeasonSummary } = require('../utils/matchEngine');
const { seasonDate, withSeasonDates, leagueMatchDay } = require('../utils/seasonCalendar');
const { all, get, getCareerState } = require('../database');
const { createMatchStories } = require('../utils/feedEngine');
const { ensureEuropeanSeason, dueEuropeanMatch, playDueEuropeanMatch, nextEuropeanMatch } = require('../utils/europeEngine');
const { awardMatchXp } = require('../utils/managerEngine');
const { leagueMatchDayMap, syncCareerLeagueMatchDay } = require('../utils/scheduleEngine');

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
    let state = await getCareerState(req.session.userId);
    const teamCount = await get('SELECT COUNT(*) AS count FROM teams');
    const totalLeagueWeeks = leagueWeeksForTeamCount(teamCount?.count || 18);
    state = await syncCareerLeagueMatchDay(req.session.userId, club.team_id, state, totalLeagueWeeks);
    const leagueFinished = Number(state.week || 1) > totalLeagueWeeks;
    const europeDue = await dueEuropeanMatch(req.session.userId, club.team_id, state.current_day);
    const nextEurope = await nextEuropeanMatch(req.session.userId, club.team_id);
    const nextLeagueDay = leagueFinished ? Number.MAX_SAFE_INTEGER : state.next_match_day;
    const nextFixtureDay = Math.min(nextLeagueDay, nextEurope?.match_day || nextLeagueDay);
    const nextMatchDebug = nextEurope && nextEurope.match_day <= nextLeagueDay
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
    if (europeDue && (leagueFinished || !leagueDue || europeDue.match_day <= state.next_match_day)) {
      const europeanResult = await playDueEuropeanMatch(req.session.userId, club.team_id, state.current_day);
      const xpAward = await awardMatchXp(req.session.userId, club, europeanResult);
      if (xpAward) europeanResult.xpAward = xpAward;
      const stateAfterEurope = await getCareerState(req.session.userId);
      const leagueFinishedAfterEurope = Number(stateAfterEurope.week || 1) > totalLeagueWeeks;
      const nextEuropeAfterMatch = await nextEuropeanMatch(req.session.userId, club.team_id);
      await syncCareerLeagueMatchDay(req.session.userId, club.team_id, stateAfterEurope, totalLeagueWeeks);
      if (leagueFinishedAfterEurope && !nextEuropeAfterMatch && europeanResult) {
        const table = await clubModel.table(req.session.userId);
        europeanResult.seasonComplete = true;
        europeanResult.seasonSummary = buildSeasonSummary(table, club.team_id, totalLeagueWeeks);
      }
      return res.json(europeanResult);
    }
    if (leagueFinished && nextEurope) {
      return res.status(400).json({ message: `${nextEurope.short_name || 'Avrupa'} maçı ${seasonDate(nextEurope.match_day)} tarihinde. Avrupa macerası bitmeden yeni sezona geçme.` });
    }
    const result = await playLeagueRound(club.team_id, req.session.userId);
    if (!result.seasonComplete) await syncCareerLeagueMatchDay(req.session.userId, club.team_id, null, totalLeagueWeeks);
    result.competitionType = 'super_lig';
    result.standingsCompetition = 'super_lig';
    result.shownStandingsCompetition = 'super_lig';
    if (result.seasonComplete) {
      const nextEuropeAfterLeague = await nextEuropeanMatch(req.session.userId, club.team_id);
      if (nextEuropeAfterLeague) {
        result.leagueSeasonComplete = true;
        result.seasonComplete = false;
        result.seasonSummary = null;
      }
    }
    const xpAward = await awardMatchXp(req.session.userId, club, result);
    if (xpAward) result.xpAward = xpAward;
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
    let [state, teams, pastMatches] = await Promise.all([
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
    state = await syncCareerLeagueMatchDay(req.session.userId, club.team_id, state, totalLeagueWeeks);
    const leagueFinished = Number(state.week || 1) > totalLeagueWeeks;
    const leagueDays = await leagueMatchDayMap(req.session.userId, club.team_id, state.week || 1, totalLeagueWeeks);
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
      LIMIT 40
    `, [req.session.userId, club.team_id, club.team_id]);

    const upcoming = [];
    for (let week = Number(state.week || 1); week <= totalLeagueWeeks; week += 1) {
      if (week > totalLeagueWeeks) continue;
      const day = leagueDays.get(week) || leagueMatchDay(week);
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
        matchAvailable: week === Number(state.week || 1) && state.current_day >= state.next_match_day,
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
    const europePhaseDrawDays = new Map();
    for (const match of europeMatches) {
      const key = `${match.competition_code}_${match.phase}_${match.round_name}`;
      const drawDay = Math.max(1, Number(match.match_day || 1) - 7);
      const currentDrawDay = europePhaseDrawDays.get(key);
      europePhaseDrawDays.set(key, currentDrawDay ? Math.min(currentDrawDay, drawDay) : drawDay);
    }
    const europeanCalendarMatches = europeMatches.map((match) => {
      const type = EUROPE_TYPE_BY_CODE[match.competition_code] || match.competition_code;
      const drawKey = `${match.competition_code}_${match.phase}_${match.round_name}`;
      const drawDay = europePhaseDrawDays.get(drawKey) || Math.max(1, Number(match.match_day || 1) - 7);
      const drawRevealed = Boolean(match.played) || Number(state.current_day || 1) >= drawDay;
      return {
        id: `europe_${match.id}`,
        competitionType: type,
        competitionLabel: match.short_name,
        week: null,
        day: match.match_day,
        date: match.match_date,
        home_name: drawRevealed ? match.home_name : 'Kura bekleniyor',
        away_name: drawRevealed ? match.away_name : 'Kura bekleniyor',
        homeTeamId: match.home_team_id || match.home_european_team_id,
        awayTeamId: match.away_team_id || match.away_european_team_id,
        home_score: match.home_score,
        away_score: match.away_score,
        played: Boolean(match.played),
        isUserMatch: true,
        drawRevealed,
        label: `${match.short_name} ${match.round_name}`
      };
    }).filter((match) => !match.played && match.drawRevealed);
    const drawGroups = new Map();
    for (const match of europeMatches.filter((item) => item.phase !== 'league' || item.played || item.match_day >= state.current_day - 90)) {
      const key = `${match.competition_code}_${match.phase}_${match.round_name}`;
      const type = EUROPE_TYPE_BY_CODE[match.competition_code] || match.competition_code;
      const drawDay = Math.max(1, Number(match.match_day || 1) - 7);
      const existingGroup = drawGroups.get(key) || {
        id: `europe_draw_${key}`,
        competitionType: 'europe_draw',
        sourceCompetitionType: type,
        competitionLabel: match.short_name,
        week: null,
        day: drawDay,
        date: seasonDate(drawDay),
        home_name: 'UEFA kura merkezi',
        away_name: 'Rakipler kura günü açıklanacak',
        played: false,
        isUserMatch: true,
        label: `${match.short_name} ${match.round_name} kura günü`,
        drawFixtures: []
      };
      existingGroup.day = Math.min(existingGroup.day, drawDay);
      existingGroup.date = seasonDate(existingGroup.day);
      existingGroup.drawFixtures.push({
        id: match.id,
        sequence: existingGroup.drawFixtures.length + 1,
        matchDay: match.match_day,
        matchDate: match.match_date,
        roundName: match.round_name,
        homeName: match.home_name,
        awayName: match.away_name,
        opponentName: match.home_team_id === club.team_id ? match.away_name : match.home_name,
        venue: match.home_team_id === club.team_id ? 'Ev sahibi' : 'Deplasman'
      });
      drawGroups.set(key, existingGroup);
    }
    const currentDay = Number(state.current_day || 1);
    const europeanDrawEvents = [...drawGroups.values()].map((event) => {
      event.drawFixtures.sort((a, b) => a.matchDay - b.matchDay || a.id - b.id);
      event.drawFixtures = event.drawFixtures.map((item, index) => ({ ...item, sequence: index + 1 }));
      const isRevealed = currentDay >= event.day;
      return {
        ...event,
        away_name: isRevealed ? `${event.drawFixtures.length} rakip kura çekilecek` : 'Rakipler kura günü açıklanacak',
        drawRevealed: isRevealed
      };
    }).filter((event) => currentDay <= Number(event.day || 0));
    const calendarMatches = [
      ...superLigMatches,
      ...turkishCupMatches,
      ...europeanDrawEvents,
      ...europeanCalendarMatches
    ].sort((a, b) => a.day - b.day);
    const next5Matches = [
      ...upcoming.filter((round) => round.userFixture).map((round) => ({
        competitionType: 'super_lig',
        date: round.date,
        day: round.day,
        label: `Süper Lig Hafta ${round.week}`
      })),
      ...europeanDrawEvents.map((event) => ({
        competitionType: 'europe_draw',
        date: event.date,
        day: event.day,
        label: event.label
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
    const nextDrawEvent = europeanDrawEvents.find((event) => Number(event.day || 0) >= Number(state.current_day || 1) && Number(event.day || 0) <= nextFixtureDay);
    const nextCompetitionType = nextDrawEvent
      ? 'europe_draw'
      : nextEuropean && nextEuropean.match_day <= nextLeagueDay
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
        next_draw_day: nextDrawEvent?.day || null,
        next_draw_date: nextDrawEvent?.date || null,
        next_event_day: nextDrawEvent?.day || nextFixtureDay,
        next_event_date: nextDrawEvent?.date || (Number.isFinite(nextFixtureDay) && nextFixtureDay < Number.MAX_SAFE_INTEGER ? seasonDate(nextFixtureDay) : null),
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


