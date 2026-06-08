const express = require('express');
const bcrypt = require('bcryptjs');
const clubModel = require('../models/clubModel');
const { all, get, run, getCareerState, ensureCareerForUser } = require('../database');
const { seasonDate, withSeasonDates, leagueMatchDay } = require('../utils/seasonCalendar');
const { ensureDailyFeed, combinedFeed } = require('../utils/feedEngine');
const { simulateAiTransfers, processPendingTransferOffers } = require('../utils/transferEngine');
const { ensureEuropeanSeason, nextEuropeanMatch } = require('../utils/europeEngine');
const { leagueWeeksForTeamCount } = require('../utils/matchEngine');
const { awardSeasonXp, incrementSeasonCount } = require('../utils/managerEngine');
const { ensureCareerMood, processDailyCareerEvents } = require('../utils/careerEngine');
const { syncCareerLeagueMatchDay } = require('../utils/scheduleEngine');
const {
  buildSeasonPlan,
  parseSeasonPlan,
  evaluateLeague,
  evaluateChampionsLeague,
  managementVerdict
} = require('../utils/seasonPlanning');

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

function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) {
    return res.status(403).json({ message: 'Admin yetkisi gerekli.' });
  }
  next();
}

function cleanText(value, fallback = '') {
  return String(value || fallback).trim().slice(0, 180);
}

function numberInRange(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

const fanNames = ['Taktik Ustasi', 'Tribun Sesi', 'Futbol Delisi', 'Kale Arkasi', 'Saha Ici', 'Mansetci', 'Hater FC', 'Analiz Masasi', 'Eski Krampon'];
const postTemplates = [
  '{team} antrenman temposunu artırmalı, pas ritmi henüz tam oturmadı.',
  '{team} taraftarı transfer bekliyor ama önce mevcut kadronun kondisyonu toparlanmalı.',
  'Lig uzun maraton, puan farkı kimseyi rahatlatmasın.',
  '{team} orta sahada daha hızlı pas yaparsa oyun kalitesi yükselir.',
  'Teknik direktörün antrenman tercihleri sosyal medyada tartışılıyor.',
  'Hater yorumu: Bu savunmayla şampiyonluk hayal, net bir stoper lazım.',
  'Övgü: {team} geçiş oyununda ligin en keyifli takımlarından biri olabilir.',
  'Gazete manşeti: {team} tesislerinde hareketli günler.',
  'Eksik analizi: Kanatlar hızlı ama bitiricilik daha iyi olmalı.',
  'Soyunma odası iddiası: Oyuncular moral olarak yükselişte.'
];

function renderTemplate(template, teamName) {
  return template.replaceAll('{team}', teamName || 'Takım');
}

async function makeSocialPosts(day, teamName) {
  const club = await get('SELECT team_id FROM clubs WHERE name = ?', [teamName]);
  if (club?.team_id) await ensureDailyFeed(club.team_id);
}

async function europeanDrawEvents(userId, teamId) {
  const matches = await all(`
    SELECT em.*, ec.short_name, ec.theme,
      COALESCE(ht.name, het.name) AS home_name,
      COALESCE(at.name, aet.name) AS away_name
    FROM european_matches em
    JOIN european_competitions ec ON ec.code = em.competition_code
    LEFT JOIN teams ht ON ht.id = em.home_team_id
    LEFT JOIN teams at ON at.id = em.away_team_id
    LEFT JOIN european_teams het ON het.id = em.home_european_team_id
    LEFT JOIN european_teams aet ON aet.id = em.away_european_team_id
    WHERE em.user_id = ?
      AND (em.home_team_id = ? OR em.away_team_id = ?)
    ORDER BY em.match_day ASC, em.id ASC
  `, [userId, teamId, teamId]);
  const groups = new Map();
  for (const match of matches) {
    const key = `${match.competition_code}_${match.phase}_${match.round_name}`;
    const drawDay = Math.max(1, Number(match.match_day || 1) - 7);
    const existing = groups.get(key) || {
      id: `europe_draw_${key}`,
      competitionType: 'europe_draw',
      sourceCompetitionType: EUROPE_TYPE_BY_CODE[match.competition_code] || match.competition_code,
      competitionLabel: match.short_name,
      day: drawDay,
      date: seasonDate(drawDay),
      label: `${match.short_name} ${match.round_name} kura günü`,
      drawRevealed: false,
      drawFixtures: []
    };
    existing.day = Math.min(existing.day, drawDay);
    existing.date = seasonDate(existing.day);
    existing.drawFixtures.push({
      id: match.id,
      sequence: existing.drawFixtures.length + 1,
      matchDay: match.match_day,
      matchDate: match.match_date,
      roundName: match.round_name,
      homeName: match.home_name,
      awayName: match.away_name,
      opponentName: Number(match.home_team_id) === Number(teamId) ? match.away_name : match.home_name,
      venue: Number(match.home_team_id) === Number(teamId) ? 'Ev sahibi' : 'Deplasman'
    });
    groups.set(key, existing);
  }
  return [...groups.values()].map((event) => {
    event.drawFixtures.sort((a, b) => Number(a.matchDay || 0) - Number(b.matchDay || 0) || Number(a.id || 0) - Number(b.id || 0));
    event.drawFixtures = event.drawFixtures.map((fixture, index) => ({ ...fixture, sequence: index + 1 }));
    return event;
  }).sort((a, b) => Number(a.day || 0) - Number(b.day || 0));
}

async function nextEuropeanDrawEvent(userId, teamId, currentDay, beforeDay, includeToday = false) {
  const startDay = Number(currentDay || 1);
  const limitDay = Number(beforeDay || Number.MAX_SAFE_INTEGER);
  const events = await europeanDrawEvents(userId, teamId);
  return events.find((event) => {
    const day = Number(event.day || 0);
    const afterStart = includeToday ? day >= startDay : day > startDay;
    return afterStart && day < limitDay;
  }) || null;
}

async function nextEuropeanDrawDay(userId, teamId, currentDay, beforeDay, includeToday = false) {
  const event = await nextEuropeanDrawEvent(userId, teamId, currentDay, beforeDay, includeToday);
  return event?.day ? Number(event.day) : null;
}

router.get('/game/state', requireAuth, async (req, res, next) => {
  try {
    const club = await clubModel.getByUserId(req.session.userId);
    const moodClub = await ensureCareerMood(req.session.userId);
    await ensureEuropeanSeason(req.session.userId, club.team_id);
    let state = await getCareerState(req.session.userId);
    const teamCount = await get('SELECT COUNT(*) AS count FROM teams');
    const totalLeagueWeeks = leagueWeeksForTeamCount(teamCount?.count || 18);
    state = await syncCareerLeagueMatchDay(req.session.userId, club.team_id, state, totalLeagueWeeks);
    const leagueFinished = Number(state.week || 1) > totalLeagueWeeks;
    const europeNext = await nextEuropeanMatch(req.session.userId, club.team_id);
    const nextLeagueDay = leagueFinished ? Number.MAX_SAFE_INTEGER : state.next_match_day;
    const nextFixtureDay = Math.min(nextLeagueDay, europeNext?.match_day || nextLeagueDay);
    const nextDrawEvent = await nextEuropeanDrawEvent(req.session.userId, club.team_id, Number(state.current_day || 1), nextFixtureDay, true);
    const nextDrawDay = nextDrawEvent?.day || null;
    const drawIsNext = nextDrawDay && nextDrawDay <= nextFixtureDay;
    const nextCompetitionType = drawIsNext
      ? 'europe_draw'
      : europeNext && europeNext.match_day <= nextLeagueDay
      ? (europeNext.competition_code === 'UCL' ? 'champions_league' : europeNext.competition_code === 'UEL' ? 'europa_league' : 'conference_league')
      : leagueFinished ? 'season_end' : 'super_lig';
    console.log('NEXT MATCH CHECK', {
      nextMatch: nextCompetitionType === 'super_lig' ? 'Süper Lig' : europeNext?.short_name,
      competitionType: nextCompetitionType,
      date: seasonDate(nextFixtureDay)
    });
    res.json({
      ...withSeasonDates(state),
      next_fixture_day: nextFixtureDay,
      next_fixture_date: Number.isFinite(nextFixtureDay) && nextFixtureDay < Number.MAX_SAFE_INTEGER ? seasonDate(nextFixtureDay) : null,
      next_draw_day: nextDrawDay,
      next_draw_date: nextDrawDay ? seasonDate(nextDrawDay) : null,
      next_draw_event: drawIsNext ? { ...nextDrawEvent, drawRevealed: Number(state.current_day || 1) >= Number(nextDrawDay || 0) } : null,
      next_event_day: drawIsNext ? nextDrawDay : nextFixtureDay,
      next_event_date: drawIsNext ? seasonDate(nextDrawDay) : Number.isFinite(nextFixtureDay) && nextFixtureDay < Number.MAX_SAFE_INTEGER ? seasonDate(nextFixtureDay) : null,
      next_match_competition_type: nextCompetitionType,
      leagueFinished,
      totalLeagueWeeks,
      next_european_match: europeNext,
      matchAvailable: state.current_day >= nextFixtureDay,
      club: moodClub || club
    });
  } catch (error) {
    next(error);
  }
});

router.post('/game/advance', requireAuth, async (req, res, next) => {
  try {
    const requestedDays = Number(req.body.days);
    const days = [1, 3, 7].includes(requestedDays) ? requestedDays : 1;
    const club = await clubModel.getByUserId(req.session.userId);
    await ensureEuropeanSeason(req.session.userId, club.team_id);
    let currentState = await getCareerState(req.session.userId);
    const teamCount = await get('SELECT COUNT(*) AS count FROM teams');
    const totalLeagueWeeks = leagueWeeksForTeamCount(teamCount?.count || 18);
    currentState = await syncCareerLeagueMatchDay(req.session.userId, club.team_id, currentState, totalLeagueWeeks);
    const leagueFinished = Number(currentState.week || 1) > totalLeagueWeeks;
    const europeNext = await nextEuropeanMatch(req.session.userId, club.team_id);
    const nextLeagueDay = leagueFinished ? Number.MAX_SAFE_INTEGER : currentState.next_match_day;
    const nextFixtureDay = Math.min(nextLeagueDay, europeNext?.match_day || nextLeagueDay);
    const nextDrawDay = await nextEuropeanDrawDay(req.session.userId, club.team_id, Number(currentState.current_day || 1), nextFixtureDay);
    if (leagueFinished && !europeNext) {
      return res.status(400).json({ message: 'Lig sezonu tamamlandı. Yeni sezona geçmelisin.' });
    }
    if (currentState.current_day >= nextFixtureDay) {
      return res.status(400).json({ message: 'Maç günü geldi. Önce maçını oyna ya da atla, sonra günü ilerletebilirsin.' });
    }
    const currentDay = Number(currentState.current_day || 1);
    const requestedTargetDay = Number(req.body.targetDay || req.body.target_day || 0);
    const requestedStopDay = requestedTargetDay > currentDay && requestedTargetDay <= nextFixtureDay ? requestedTargetDay : null;
    const stopDays = (days === 7 ? [requestedStopDay, nextDrawDay, nextFixtureDay] : [currentDay + days, requestedStopDay, nextDrawDay, nextFixtureDay])
      .map((day) => Number(day))
      .filter((day) => Number.isFinite(day) && day > currentDay);
    const targetDay = stopDays.length ? Math.min(...stopDays) : currentDay + days;
    const safeTargetDay = Math.max(currentDay + 1, targetDay);
    await run('UPDATE career_states SET current_day = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?', [safeTargetDay, req.session.userId]);
    await processDailyCareerEvents(req.session.userId, currentDay, safeTargetDay);
    const state = await getCareerState(req.session.userId);
    const updatedEuropeNext = await nextEuropeanMatch(req.session.userId, club.team_id);
    const updatedLeagueFinished = Number(state.week || 1) > totalLeagueWeeks;
    const updatedLeagueDay = updatedLeagueFinished ? Number.MAX_SAFE_INTEGER : state.next_match_day;
    const updatedFixtureDay = Math.min(updatedLeagueDay, updatedEuropeNext?.match_day || updatedLeagueDay);
    const updatedDrawEvent = await nextEuropeanDrawEvent(req.session.userId, club.team_id, Number(state.current_day || 1), updatedFixtureDay, true);
    const updatedDrawDay = updatedDrawEvent?.day || null;
    const updatedDrawIsNext = updatedDrawDay && updatedDrawDay <= updatedFixtureDay;
    const updatedCompetitionType = updatedDrawIsNext
      ? 'europe_draw'
      : updatedEuropeNext && updatedEuropeNext.match_day <= updatedLeagueDay
      ? (updatedEuropeNext.competition_code === 'UCL' ? 'champions_league' : updatedEuropeNext.competition_code === 'UEL' ? 'europa_league' : 'conference_league')
      : updatedLeagueFinished ? 'season_end' : 'super_lig';
    await ensureDailyFeed(club.team_id);
    await simulateAiTransfers(club.team_id);
    await processPendingTransferOffers(req.session.userId);
    res.json({
      ...withSeasonDates(state),
      next_fixture_day: updatedFixtureDay,
      next_fixture_date: Number.isFinite(updatedFixtureDay) && updatedFixtureDay < Number.MAX_SAFE_INTEGER ? seasonDate(updatedFixtureDay) : null,
      next_draw_day: updatedDrawDay,
      next_draw_date: updatedDrawDay ? seasonDate(updatedDrawDay) : null,
      next_draw_event: updatedDrawIsNext ? { ...updatedDrawEvent, drawRevealed: Number(state.current_day || 1) >= Number(updatedDrawDay || 0) } : null,
      next_event_day: updatedDrawIsNext ? updatedDrawDay : updatedFixtureDay,
      next_event_date: updatedDrawIsNext ? seasonDate(updatedDrawDay) : Number.isFinite(updatedFixtureDay) && updatedFixtureDay < Number.MAX_SAFE_INTEGER ? seasonDate(updatedFixtureDay) : null,
      next_match_competition_type: updatedCompetitionType,
      next_european_match: updatedEuropeNext,
      leagueFinished: updatedLeagueFinished,
      matchAvailable: state.current_day >= updatedFixtureDay
    });
  } catch (error) {
    next(error);
  }
});

router.post('/game/next-season', requireAuth, async (req, res, next) => {
  try {
    const club = await clubModel.getByUserId(req.session.userId);
    const pendingEurope = await nextEuropeanMatch(req.session.userId, club.team_id);
    if (pendingEurope) {
      return res.status(400).json({
        message: `${pendingEurope.short_name || 'Avrupa'} fikstürün devam ediyor. Yeni sezona geçmeden önce Avrupa maçlarını bitirmelisin.`
      });
    }
    const state = await getCareerState(req.session.userId);
    const currentDay = Number(state?.current_day || 1);
    const seasonXpAward = await awardSeasonXp(req.session.userId);
    const nextStartDay = 1;
    const firstMatchDay = leagueMatchDay(1);
    const team = await get('SELECT * FROM teams WHERE id = ?', [club.team_id]);
    const plan = buildSeasonPlan(team || club);
    await run('DELETE FROM league_standings WHERE user_id = ?', [req.session.userId]);
    await run('DELETE FROM match_player_ratings WHERE match_id IN (SELECT id FROM matches WHERE user_id = ?)', [req.session.userId]);
    await run('DELETE FROM match_events WHERE match_id IN (SELECT id FROM matches WHERE user_id = ?)', [req.session.userId]);
    await run('DELETE FROM matches WHERE user_id = ?', [req.session.userId]);
    await run('DELETE FROM european_matches WHERE user_id = ?', [req.session.userId]);
    await run('DELETE FROM european_standings WHERE user_id = ?', [req.session.userId]);
    await run('DELETE FROM european_entries WHERE user_id = ?', [req.session.userId]);
    await run("DELETE FROM european_draws WHERE user_id = ? AND competition_code != 'CONFIG'", [req.session.userId]);
    await run('DELETE FROM european_awards WHERE user_id = ?', [req.session.userId]);
    await run('DELETE FROM european_history WHERE user_id = ?', [req.session.userId]);
    await run('UPDATE players SET age = age + 1, contract_until = MAX(2025, contract_until - 1), injured = 0, stamina = MIN(99, stamina + 8), morale = MIN(99, morale + 5) WHERE team_id = ?', [club.team_id]);
    await run(`UPDATE clubs
      SET currency = 'EUR', budget = ?, salary_budget = ?, season_objectives_json = ?, season_intro_seen = 0,
        season_summary_seen = 0, points = 0, wins = 0, draws = 0, losses = 0,
        goals_for = 0, goals_against = 0, last_match = NULL
      WHERE user_id = ?`, [plan.transferBudget, plan.salaryBudget, JSON.stringify(plan), req.session.userId]);
    await run('UPDATE career_states SET current_day = ?, next_match_day = ?, week = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?', [
      nextStartDay,
      firstMatchDay,
      req.session.userId
    ]);
    await incrementSeasonCount(req.session.userId);
    await ensureCareerForUser(req.session.userId);
    await ensureEuropeanSeason(req.session.userId, club.team_id);
    console.log('SEASON RESET CHECK', {
      previousDay: currentDay,
      newCurrentDay: nextStartDay,
      newNextMatchDay: firstMatchDay
    });
    res.json({ message: 'Yeni sezon başladı.', current_day: nextStartDay, next_match_day: firstMatchDay, week: 1, seasonPlan: plan, xpAward: seasonXpAward });
  } catch (error) {
    next(error);
  }
});

router.get('/game/season-plan', requireAuth, async (req, res, next) => {
  try {
    const club = await clubModel.getByUserId(req.session.userId);
    const team = await get('SELECT * FROM teams WHERE id = ?', [club.team_id]);
    const plan = parseSeasonPlan(club.season_objectives_json, team || club);
    if (!club.season_objectives_json || club.season_objectives_json === '{}') {
      await run("UPDATE clubs SET currency = 'EUR', season_objectives_json = ?, budget = ?, salary_budget = ? WHERE user_id = ?", [
        JSON.stringify(plan),
        plan.transferBudget,
        plan.salaryBudget,
        req.session.userId
      ]);
    }
    res.json({
      ...plan,
      transferBudget: club.budget || plan.transferBudget,
      salaryBudget: club.salary_budget || plan.salaryBudget,
      seen: Boolean(club.season_intro_seen)
    });
  } catch (error) {
    next(error);
  }
});

router.post('/game/season-plan/seen', requireAuth, async (req, res, next) => {
  try {
    await run('UPDATE clubs SET season_intro_seen = 1 WHERE user_id = ?', [req.session.userId]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

function uclStageLabel(phase, champion = false) {
  if (champion) return { stage: 'champion', label: 'Şampiyonluk' };
  const labels = {
    league: 'Lig asamasi',
    qualifying: 'Eleme',
    knockout_playoff: 'Play-off',
    round_of_16: 'Son 16',
    quarter_final: 'Ceyrek final',
    semi_final: 'Yari final',
    final: 'Final'
  };
  return { stage: phase || 'none', label: labels[phase] || 'Katilmadi' };
}

async function championsLeagueResult(userId, teamId) {
  const matches = await all(`
    SELECT phase, round_name, home_team_id, away_team_id, home_score, away_score, played
    FROM european_matches
    WHERE user_id = ? AND competition_code = 'UCL' AND (home_team_id = ? OR away_team_id = ?)
    ORDER BY match_day ASC, id ASC
  `, [userId, teamId, teamId]);
  if (!matches.length) return null;
  const unfinished = matches.find((match) => !match.played);
  if (unfinished) return { stage: unfinished.phase || 'league', label: `${unfinished.round_name || 'UCL'} devam ediyor` };
  const final = matches.find((match) => match.phase === 'final');
  if (final) {
    const isHome = final.home_team_id === teamId;
    const goalsFor = isHome ? final.home_score : final.away_score;
    const goalsAgainst = isHome ? final.away_score : final.home_score;
    return uclStageLabel('final', goalsFor > goalsAgainst);
  }
  const order = ['league', 'qualifying', 'knockout_playoff', 'round_of_16', 'quarter_final', 'semi_final'];
  const reached = matches.reduce((best, match) => (
    order.indexOf(match.phase) > order.indexOf(best) ? match.phase : best
  ), 'league');
  return uclStageLabel(reached);
}

router.get('/game/season-review', requireAuth, async (req, res, next) => {
  try {
    const club = await clubModel.getByUserId(req.session.userId);
    const team = await get('SELECT * FROM teams WHERE id = ?', [club.team_id]);
    const plan = parseSeasonPlan(club.season_objectives_json, team || club);
    const table = await clubModel.table(req.session.userId);
    const rank = table.findIndex((item) => item.id === club.team_id) + 1;
    const leagueRow = table.find((item) => item.id === club.team_id) || {};
    const user = await get('SELECT username FROM users WHERE id = ?', [req.session.userId]);
    const homeAway = await get(`
      SELECT
        SUM(CASE WHEN home_club_id = ? THEN 1 ELSE 0 END) AS home_played,
        SUM(CASE WHEN home_club_id = ? AND home_score > away_score THEN 1 ELSE 0 END) AS home_wins,
        SUM(CASE WHEN home_club_id = ? AND home_score = away_score THEN 1 ELSE 0 END) AS home_draws,
        SUM(CASE WHEN home_club_id = ? AND home_score < away_score THEN 1 ELSE 0 END) AS home_losses,
        SUM(CASE WHEN away_club_id = ? THEN 1 ELSE 0 END) AS away_played,
        SUM(CASE WHEN away_club_id = ? AND away_score > home_score THEN 1 ELSE 0 END) AS away_wins,
        SUM(CASE WHEN away_club_id = ? AND away_score = home_score THEN 1 ELSE 0 END) AS away_draws,
        SUM(CASE WHEN away_club_id = ? AND away_score < home_score THEN 1 ELSE 0 END) AS away_losses
      FROM matches
      WHERE user_id = ? AND (home_club_id = ? OR away_club_id = ?)
    `, [club.team_id, club.team_id, club.team_id, club.team_id, club.team_id, club.team_id, club.team_id, club.team_id, req.session.userId, club.team_id, club.team_id]);
    const leaders = await all(`
      SELECT p.name,
        COALESCE(SUM(r.goals), 0) AS goals,
        COALESCE(SUM(r.assists), 0) AS assists,
        COUNT(*) AS appearances,
        AVG(r.rating) AS average_rating,
        MAX(r.rating) AS best_rating,
        p.age,
        p.overall
      FROM match_player_ratings r
      JOIN players p ON p.id = r.player_id
      JOIN matches m ON m.id = r.match_id
      WHERE m.user_id = ? AND r.team_id = ?
      GROUP BY p.id
      ORDER BY goals DESC, assists DESC, p.overall DESC
      LIMIT 12
    `, [req.session.userId, club.team_id]);
    const topScorer = leaders.find((item) => Number(item.goals) > 0) || leaders[0] || null;
    const topAssist = [...leaders].sort((a, b) => Number(b.assists || 0) - Number(a.assists || 0))[0] || null;
    const bestRated = [...leaders].sort((a, b) => Number(b.average_rating || 0) - Number(a.average_rating || 0))[0] || null;
    const mostAppearances = [...leaders].sort((a, b) => Number(b.appearances || 0) - Number(a.appearances || 0))[0] || null;
    const bestYoung = [...leaders].filter((item) => Number(item.age || 99) <= 23).sort((a, b) => Number(b.average_rating || 0) - Number(a.average_rating || 0))[0] || null;
    const worstRated = [...leaders].filter((item) => Number(item.appearances || 0) >= 3).sort((a, b) => Number(a.average_rating || 0) - Number(b.average_rating || 0))[0] || null;
    const transfers = await all(`
      SELECT th.*, p.name AS player_name
      FROM transfer_history th
      LEFT JOIN players p ON p.id = th.player_id
      WHERE th.from_team_id = ? OR th.to_team_id = ?
      ORDER BY th.day ASC, th.id ASC
    `, [club.team_id, club.team_id]);
    const incoming = transfers.filter((item) => Number(item.to_team_id) === Number(club.team_id));
    const outgoing = transfers.filter((item) => Number(item.from_team_id) === Number(club.team_id));
    const totalSpent = incoming.reduce((sum, item) => sum + Number(item.price || 0), 0);
    const totalIncome = outgoing.reduce((sum, item) => sum + Number(item.price || 0), 0);
    const leagueEvaluation = evaluateLeague(plan, rank);
    const uclEvaluation = evaluateChampionsLeague(plan, await championsLeagueResult(req.session.userId, club.team_id));
    const evaluations = [leagueEvaluation, uclEvaluation].filter(Boolean);
    const successCount = evaluations.filter((item) => item.success).length;
    const verdict = managementVerdict(successCount, evaluations.length);
    res.json({
      seen: Boolean(club.season_summary_seen),
      season: {
        year: 2025,
        teamName: club.name,
        managerName: user?.username || 'Teknik direktör',
        leagueName: 'Süper Lig'
      },
      league: {
        rank,
        points: leagueRow.points || 0,
        wins: leagueRow.wins || 0,
        draws: leagueRow.draws || 0,
        losses: leagueRow.losses || 0,
        goals_for: leagueRow.goals_for || 0,
        goals_against: leagueRow.goals_against || 0,
        goal_difference: (leagueRow.goals_for || 0) - (leagueRow.goals_against || 0),
        home: homeAway || {},
        away: homeAway || {}
      },
      topScorer: topScorer ? { name: topScorer.name, goals: topScorer.goals || 0 } : null,
      topAssist: topAssist ? { name: topAssist.name, assists: topAssist.assists || 0 } : null,
      playerPerformance: {
        bestRated: bestRated ? { name: bestRated.name, rating: Number(bestRated.average_rating || 0).toFixed(1) } : null,
        mostAppearances: mostAppearances ? { name: mostAppearances.name, appearances: mostAppearances.appearances || 0 } : null,
        bestYoung: bestYoung ? { name: bestYoung.name, rating: Number(bestYoung.average_rating || 0).toFixed(1) } : null,
        worstRated: worstRated ? { name: worstRated.name, rating: Number(worstRated.average_rating || 0).toFixed(1) } : null
      },
      awards: {
        goalKing: topScorer ? { title: 'Gol Krali', name: topScorer.name, value: topScorer.goals || 0 } : null,
        assistKing: topAssist ? { title: 'Asist Krali', name: topAssist.name, value: topAssist.assists || 0 } : null,
        playerOfYear: bestRated ? { title: 'Yilin Oyuncusu', name: bestRated.name, value: Number(bestRated.average_rating || 0).toFixed(1) } : null,
        youngPlayerOfYear: bestYoung ? { title: 'Yilin Genc Oyuncusu', name: bestYoung.name, value: Number(bestYoung.average_rating || 0).toFixed(1) } : null,
        managerOfYear: rank <= 2 || verdict.score >= 80 ? { title: 'Yilin Menajeri', name: user?.username || 'Menajer', value: verdict.label } : null
      },
      transfers: {
        incoming: incoming.map((item) => ({ name: item.player_name || 'Oyuncu', price: item.price || 0 })),
        outgoing: outgoing.map((item) => ({ name: item.player_name || 'Oyuncu', price: item.price || 0 })),
        totalSpent,
        totalIncome,
        budgetUsed: Math.max(0, totalSpent - totalIncome),
        bestTransfer: incoming[0] ? { name: incoming[0].player_name || 'Oyuncu', price: incoming[0].price || 0 } : null,
        worstTransfer: incoming[incoming.length - 1] ? { name: incoming[incoming.length - 1].player_name || 'Oyuncu', price: incoming[incoming.length - 1].price || 0 } : null
      },
      evaluations,
      verdict: {
        ...verdict,
        fanSatisfaction: Math.max(20, Math.min(100, 50 + successCount * 18 + (rank <= 4 ? 12 : 0))),
        mediaComment: successCount >= evaluations.length ? 'Sezon başındaki hedeflerin çoğu başarıldı. Yönetim yeni sezon için güveniyor.' : 'Yönetim daha net bir gelişim bekliyor.',
        reputationChange: successCount > 0 ? '+5' : '-3',
        trustStatus: successCount >= evaluations.length ? 'Güven yüksek' : 'Dikkatli takip',
        sackRisk: verdict.score < 45 ? 'Var' : 'Yok'
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/game/season-review/seen', requireAuth, async (req, res, next) => {
  try {
    await run('UPDATE clubs SET season_summary_seen = 1 WHERE user_id = ?', [req.session.userId]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/game/currency', requireAuth, async (req, res, next) => {
  try {
    const currency = ['TRY', 'USD', 'EUR'].includes(req.body.currency) ? req.body.currency : 'EUR';
    await run('UPDATE clubs SET currency = ? WHERE user_id = ?', [currency, req.session.userId]);
    res.json({ currency });
  } catch (error) {
    next(error);
  }
});

router.get('/social/feed', requireAuth, async (req, res, next) => {
  try {
    const club = await clubModel.getByUserId(req.session.userId);
    const state = await getCareerState(req.session.userId);
    await ensureDailyFeed(club.team_id);
    res.json(await combinedFeed({ day: state.current_day, filter: req.query.filter || 'all', limit: 80 }));
  } catch (error) {
    next(error);
  }
});

async function adminOverview() {
  const [state, users, teams, matches, clubs, recentMatches, posts, pendingTransfers, transferHistory, stats] = await Promise.all([
    get('SELECT * FROM game_state WHERE id = 1'),
    all(`
      SELECT u.id, u.username, u.email, u.is_active, u.role, u.created_at, c.id AS club_id, c.name AS club_name,
        c.budget, c.fans, c.stadium_capacity, c.currency, tr.name AS team_name
      FROM users u
      LEFT JOIN clubs c ON c.user_id = u.id
      LEFT JOIN teams tr ON tr.id = c.team_id
      ORDER BY u.id DESC
      LIMIT 80
    `),
    all('SELECT * FROM teams ORDER BY points DESC, (goals_for - goals_against) DESC, name ASC'),
    get('SELECT COUNT(*) AS count FROM matches'),
    all(`
      SELECT c.*, u.username, tr.name AS team_name, tr.logo_url
      FROM clubs c
      LEFT JOIN users u ON u.id = c.user_id
      LEFT JOIN teams tr ON tr.id = c.team_id
      ORDER BY c.id ASC
    `),
    all(`
      SELECT m.*, ht.name AS home_name, at.name AS away_name
      FROM matches m
      LEFT JOIN teams ht ON ht.id = m.home_club_id
      LEFT JOIN teams at ON at.id = m.away_club_id
      ORDER BY m.id DESC
      LIMIT 10
    `),
    all('SELECT * FROM social_posts ORDER BY id DESC LIMIT 10')
    ,
    all(`
      SELECT ti.*, p.name AS player_name, ft.name AS from_team_name, it.name AS interested_team_name
      FROM transfer_interest ti
      JOIN players p ON p.id = ti.player_id
      LEFT JOIN teams ft ON ft.id = ti.from_team_id
      LEFT JOIN teams it ON it.id = ti.interested_team_id
      ORDER BY ti.id DESC
      LIMIT 20
    `),
    all(`
      SELECT th.*, p.name AS player_name, ft.name AS from_team_name, tt.name AS to_team_name
      FROM transfer_history th
      JOIN players p ON p.id = th.player_id
      LEFT JOIN teams ft ON ft.id = th.from_team_id
      LEFT JOIN teams tt ON tt.id = th.to_team_id
      ORDER BY th.id DESC
      LIMIT 20
    `),
    get(`
      SELECT
        (SELECT COUNT(*) FROM users) AS user_count,
        (SELECT COUNT(*) FROM users WHERE is_active = 0) AS passive_users,
        (SELECT COUNT(*) FROM players) AS player_count,
        (SELECT COUNT(*) FROM transfer_interest WHERE status IN ('pending','counter','club_accepted')) AS open_transfer_count,
        (SELECT COUNT(*) FROM inbox_messages WHERE is_read = 0) AS unread_messages
    `)
  ]);

  return {
    state,
    users,
    teams,
    clubs,
    recentMatches,
    posts,
    pendingTransfers,
    transferHistory,
    stats,
    matches: matches.count,
    adminUserHint: process.env.ADMIN_USERNAME || process.env.ADMIN_USER || 'admin'
  };
}

router.get('/admin/summary', requireAdmin, async (req, res, next) => {
  try {
    const overview = await adminOverview();
    res.json({
      state: overview.state,
      users: overview.users.length,
      teams: overview.teams.length,
      matches: overview.matches,
      adminUserHint: overview.adminUserHint
    });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/overview', requireAdmin, async (req, res, next) => {
  try {
    res.json(await adminOverview());
  } catch (error) {
    next(error);
  }
});

router.get('/admin/teams', requireAdmin, async (req, res, next) => {
  try {
    res.json(await all('SELECT * FROM teams ORDER BY name ASC'));
  } catch (error) {
    next(error);
  }
});

async function updateAdminTeam(teamId, body = {}) {
  const team = await get('SELECT * FROM teams WHERE id = ?', [teamId]);
  if (!team) return null;
  const allowedFormations = ['4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '3-4-3', '5-3-2', '4-1-4-1'];
  const formation = allowedFormations.includes(body.default_formation) ? body.default_formation : team.default_formation;
  const name = cleanText(body.name, team.name);
  const shortName = cleanText(body.short_name, team.short_name || name.slice(0, 3).toUpperCase()).slice(0, 24);
  const incomingLogo = typeof body.logo_url === 'string' ? body.logo_url.trim() : null;
  const currentLogo = team.logo_url || '';
  const currentIsUrl = /^https?:\/\//i.test(currentLogo);
  const incomingIsLocal = incomingLogo && incomingLogo.startsWith('/assets/logos/');
  const logoUrl = incomingLogo && !(currentIsUrl && incomingIsLocal)
    ? cleanText(incomingLogo, currentLogo)
    : currentLogo;
  const city = cleanText(body.city, team.city || '');
  const stadium = cleanText(body.stadium, team.stadium || '');
  const budget = numberInRange(body.budget, team.budget, 0, 999999999);
  const fans = numberInRange(body.fans, team.fans, 0, 999999999);
  const points = numberInRange(body.points, team.points, 0, 200);
  const overall = numberInRange(body.overall, team.overall, 1, 99);
  const attack = numberInRange(body.attack_overall, team.attack_overall, 1, 99);
  const midfield = numberInRange(body.midfield_overall, team.midfield_overall, 1, 99);
  const defense = numberInRange(body.defense_overall, team.defense_overall, 1, 99);
  const goalkeeper = numberInRange(body.goalkeeper_overall, team.goalkeeper_overall, 1, 99);

  await run(
    `UPDATE teams SET name = ?, short_name = ?, logo_url = ?, city = ?, stadium = ?, budget = ?, fans = ?,
      points = ?, overall = ?, attack_overall = ?, midfield_overall = ?, defense_overall = ?,
      goalkeeper_overall = ?, default_formation = ? WHERE id = ?`,
    [name, shortName, logoUrl, city, stadium, budget, fans, points, overall, attack, midfield, defense, goalkeeper, formation, team.id]
  );
  await run('UPDATE league_standings SET points = ? WHERE team_id = ?', [points, team.id]);
  await run(
    `UPDATE clubs SET name = ?, budget = ?, fans = ?, stadium_capacity = MAX(stadium_capacity, 12000)
     WHERE team_id = ?`,
    [name, budget, fans, team.id]
  );
  return get('SELECT * FROM teams WHERE id = ?', [team.id]);
}

router.post('/admin/teams', requireAdmin, async (req, res, next) => {
  try {
    const name = cleanText(req.body.name);
    if (name.length < 2) return res.status(400).json({ message: 'Takım adı gerekli.' });
    const shortName = cleanText(req.body.short_name, name.slice(0, 3).toUpperCase()).slice(0, 24);
    const budget = numberInRange(req.body.budget, 0, 0, 999999999);
    const fans = numberInRange(req.body.fans, 0, 0, 999999999);
    const overall = numberInRange(req.body.overall, 60, 1, 99);
    const attack = numberInRange(req.body.attack_overall, overall, 1, 99);
    const midfield = numberInRange(req.body.midfield_overall, overall, 1, 99);
    const defense = numberInRange(req.body.defense_overall, overall, 1, 99);
    const goalkeeper = numberInRange(req.body.goalkeeper_overall, overall, 1, 99);
    const result = await run(
      `INSERT INTO teams
        (name, short_name, logo_url, city, stadium, budget, fans, overall, attack_overall, midfield_overall,
         defense_overall, goalkeeper_overall, default_formation, points)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        shortName,
        cleanText(req.body.logo_url),
        cleanText(req.body.city),
        cleanText(req.body.stadium),
        budget,
        fans,
        overall,
        attack,
        midfield,
        defense,
        goalkeeper,
        cleanText(req.body.default_formation, '4-2-3-1'),
        numberInRange(req.body.points, 0, 0, 200)
      ]
    );
    await run('INSERT OR IGNORE INTO league_standings (user_id, team_id, points) SELECT id, ?, ? FROM users', [result.id, numberInRange(req.body.points, 0, 0, 200)]);
    res.status(201).json(await adminOverview());
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return res.status(409).json({ message: 'Bu takım adı zaten var.' });
    next(error);
  }
});

router.patch('/admin/teams/:id', requireAdmin, async (req, res, next) => {
  try {
    const team = await updateAdminTeam(req.params.id, req.body);
    if (!team) return res.status(404).json({ message: 'Takım bulunamadı.' });
    res.json(await adminOverview());
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return res.status(409).json({ message: 'Bu takım adı zaten var.' });
    next(error);
  }
});

router.delete('/admin/teams/:id', requireAdmin, async (req, res, next) => {
  try {
    const team = await get('SELECT * FROM teams WHERE id = ?', [req.params.id]);
    if (!team) return res.status(404).json({ message: 'Takım bulunamadı.' });
    const activeClub = await get('SELECT id FROM clubs WHERE team_id = ? LIMIT 1', [team.id]);
    if (activeClub) return res.status(409).json({ message: 'Bu takım bir kullanıcı kariyerinde kullanılıyor. Önce kullanıcı kariyerini değiştirin veya silin.' });
    await run('DELETE FROM league_standings WHERE team_id = ?', [team.id]);
    await run('DELETE FROM lineups WHERE team_id = ?', [team.id]);
    await run('UPDATE players SET team_id = NULL, lineup_role = "reserve", is_starting_eleven = 0 WHERE team_id = ?', [team.id]);
    await run('DELETE FROM teams WHERE id = ?', [team.id]);
    res.json(await adminOverview());
  } catch (error) {
    next(error);
  }
});

router.get('/admin/players', requireAdmin, async (req, res, next) => {
  try {
    const teamId = Number(req.query.teamId || 0);
    const clubId = Number(req.query.clubId || 0);
    const query = `%${cleanText(req.query.q).toLowerCase()}%`;
    const where = [];
    const params = [];
    if (teamId) {
      where.push('p.team_id = ?');
      params.push(teamId);
    }
    if (clubId) {
      where.push('p.club_id = ?');
      params.push(clubId);
    }
    if (cleanText(req.query.q)) {
      where.push('LOWER(p.name) LIKE ?');
      params.push(query);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const players = await all(`
      SELECT p.*, tr.name AS team_name, c.name AS club_name
      FROM players p
      LEFT JOIN teams tr ON tr.id = p.team_id
      LEFT JOIN clubs c ON c.id = p.club_id
      ${clause}
      ORDER BY p.overall DESC, p.name ASC
      LIMIT 80
    `, params);
    res.json(players);
  } catch (error) {
    next(error);
  }
});

function adminPlayerPayload(body = {}, player = {}) {
  const position = ['GK', 'DEF', 'MID', 'FWD'].includes(body.position) ? body.position : (player.position || 'MID');
  const overall = numberInRange(body.overall, player.overall || 65, 1, 99);
  return {
    name: cleanText(body.name, player.name || 'Yeni Oyuncu'),
    team_id: Number(body.team_id || player.team_id || 0) || null,
    club_id: Number(body.club_id || player.club_id || 0) || null,
    age: numberInRange(body.age, player.age || 22, 15, 45),
    nationality: cleanText(body.nationality, player.nationality || 'Türkiye'),
    position,
    overall,
    pace: numberInRange(body.pace, player.pace || overall, 1, 99),
    shooting: numberInRange(body.shooting, player.shooting || overall, 1, 99),
    passing: numberInRange(body.passing, player.passing || overall, 1, 99),
    dribbling: numberInRange(body.dribbling, player.dribbling || overall, 1, 99),
    defending: numberInRange(body.defending, player.defending || overall, 1, 99),
    physical: numberInRange(body.physical, player.physical || overall, 1, 99),
    stamina: numberInRange(body.stamina, player.stamina || 75, 1, 100),
    morale: numberInRange(body.morale, player.morale || 70, 1, 100),
    salary: numberInRange(body.salary, player.salary || 0, 0, 999999999),
    market_value: numberInRange(body.market_value, player.market_value || 0, 0, 999999999),
    potential: numberInRange(body.potential, player.potential || overall, overall, 99),
    contract_until: numberInRange(body.contract_until, player.contract_until || 2027, 2025, 2040),
    injured: body.injured ? 1 : 0,
    injury_type: body.injured ? cleanText(body.injury_type, player.injury_type || 'Hafif sakatlık') : '',
    injury_return_day: body.injured ? numberInRange(body.injury_return_day, player.injury_return_day || 7, 0, 999) : 0,
    image_url: cleanText(body.image_url, player.image_url || ''),
    lineup_role: body.is_starting_eleven || body.lineup_role === 'starter' ? 'starter' : (player.lineup_role || 'reserve'),
    is_starting_eleven: body.is_starting_eleven || body.lineup_role === 'starter' ? 1 : 0
  };
}

router.post('/admin/players', requireAdmin, async (req, res, next) => {
  try {
    const payload = adminPlayerPayload(req.body);
    if (!payload.team_id && !payload.club_id) return res.status(400).json({ message: 'Oyuncu için takım seçmelisin.' });
    const result = await run(
      `INSERT INTO players
        (club_id, team_id, name, age, nationality, position, overall, pace, shooting, passing, dribbling,
         defending, physical, stamina, morale, salary, market_value, base_market_value, potential,
         contract_until, injured, injury_type, injury_return_day, image_url, lineup_role, is_starting_eleven)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.club_id, payload.team_id, payload.name, payload.age, payload.nationality, payload.position,
        payload.overall, payload.pace, payload.shooting, payload.passing, payload.dribbling, payload.defending,
        payload.physical, payload.stamina, payload.morale, payload.salary, payload.market_value,
        payload.market_value, payload.potential, payload.contract_until, payload.injured, payload.injury_type,
        payload.injury_return_day, payload.image_url, payload.lineup_role, payload.is_starting_eleven
      ]
    );
    if (payload.is_starting_eleven && payload.team_id) {
      await run('DELETE FROM lineups WHERE team_id = ?', [payload.team_id]);
    }
    res.status(201).json({ player: await get('SELECT * FROM players WHERE id = ?', [result.id]), overview: await adminOverview() });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/game-state', requireAdmin, async (req, res, next) => {
  try {
    const currentDay = numberInRange(req.body.current_day, 1, 1, 999);
    const nextMatchDay = numberInRange(req.body.next_match_day, currentDay, 1, 999);
    const week = numberInRange(req.body.week, 1, 1, 80);
    await run(
      'UPDATE game_state SET current_day = ?, next_match_day = ?, week = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
      [currentDay, nextMatchDay, week]
    );
    res.json(await adminOverview());
  } catch (error) {
    next(error);
  }
});

router.post('/admin/clubs/:id', requireAdmin, async (req, res, next) => {
  try {
    const club = await get('SELECT * FROM clubs WHERE id = ?', [req.params.id]);
    if (!club) return res.status(404).json({ message: 'Kulüp bulunamadı.' });
    const name = cleanText(req.body.name, club.name);
    const budget = numberInRange(req.body.budget, club.budget, 0, 999999999);
    const fans = numberInRange(req.body.fans, club.fans, 0, 99999999);
    const stadium = numberInRange(req.body.stadium_capacity, club.stadium_capacity, 1000, 250000);
    const currency = ['TRY', 'USD', 'EUR'].includes(req.body.currency) ? req.body.currency : club.currency;
    await run(
      'UPDATE clubs SET name = ?, budget = ?, fans = ?, stadium_capacity = ?, currency = ? WHERE id = ?',
      [name, budget, fans, stadium, currency, club.id]
    );
    res.json(await adminOverview());
  } catch (error) {
    next(error);
  }
});

router.post('/admin/users/:id/password', requireAdmin, async (req, res, next) => {
  try {
    const user = await get('SELECT id, username, email FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    const password = String(req.body.password || '').trim();
    if (password.length < 6) return res.status(400).json({ message: 'Yeni şifre en az 6 karakter olmali.' });
    const passwordHash = await bcrypt.hash(password, 12);
    await run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, user.id]);
    res.json({ message: `${user.username} için şifre yenilendi. Giriste kullanıcı/e-posta: ${user.email}` });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/users/:id', requireAdmin, async (req, res, next) => {
  try {
    const user = await get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    const username = cleanText(req.body.username, user.username);
    const email = cleanText(req.body.email, user.email).toLowerCase();
    const isActive = req.body.is_active === false || req.body.is_active === '0' ? 0 : 1;
    if (username.length < 3 || !email.includes('@')) return res.status(400).json({ message: 'Kullanıcı adı veya e-posta hatalı.' });
    await run('UPDATE users SET username = ?, email = ?, is_active = ? WHERE id = ?', [username, email, isActive, user.id]);
    await run('UPDATE manager_profiles SET manager_name = ? WHERE user_id = ?', [username, user.id]);
    res.json(await adminOverview());
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return res.status(409).json({ message: 'Bu kullanıcı adı/e-posta kullanılıyor.' });
    next(error);
  }
});

router.post('/admin/users/:id/toggle-active', requireAdmin, async (req, res, next) => {
  try {
    const user = await get('SELECT id, is_active FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    await run('UPDATE users SET is_active = ? WHERE id = ?', [Number(user.is_active) === 1 ? 0 : 1, user.id]);
    res.json(await adminOverview());
  } catch (error) {
    next(error);
  }
});

router.delete('/admin/users/:id', requireAdmin, async (req, res, next) => {
  try {
    const user = await get('SELECT id FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    await run('DELETE FROM users WHERE id = ?', [user.id]);
    res.json(await adminOverview());
  } catch (error) {
    next(error);
  }
});

router.post('/admin/teams/:id', requireAdmin, async (req, res, next) => {
  try {
    const team = await updateAdminTeam(req.params.id, req.body);
    if (!team) return res.status(404).json({ message: 'Takım bulunamadı.' });
    res.json(await adminOverview());
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/players/:id', requireAdmin, async (req, res, next) => {
  try {
    const player = await get('SELECT * FROM players WHERE id = ?', [req.params.id]);
    if (!player) return res.status(404).json({ message: 'Oyuncu bulunamadı.' });
    const payload = adminPlayerPayload(req.body, player);
    await run(
      `UPDATE players SET club_id = ?, team_id = ?, name = ?, age = ?, nationality = ?, position = ?,
        overall = ?, pace = ?, shooting = ?, passing = ?, dribbling = ?, defending = ?, physical = ?,
        stamina = ?, morale = ?, salary = ?, market_value = ?, base_market_value = ?, potential = ?,
        contract_until = ?, injured = ?, injury_type = ?, injury_return_day = ?, image_url = ?,
        lineup_role = ?, is_starting_eleven = ? WHERE id = ?`,
      [
        payload.club_id, payload.team_id, payload.name, payload.age, payload.nationality, payload.position,
        payload.overall, payload.pace, payload.shooting, payload.passing, payload.dribbling, payload.defending,
        payload.physical, payload.stamina, payload.morale, payload.salary, payload.market_value,
        payload.market_value, payload.potential, payload.contract_until, payload.injured, payload.injury_type,
        payload.injury_return_day, payload.image_url, payload.lineup_role, payload.is_starting_eleven, player.id
      ]
    );
    if (Number(player.team_id || 0) !== Number(payload.team_id || 0) || payload.team_id || payload.is_starting_eleven) {
      if (player.team_id) await run('DELETE FROM lineups WHERE team_id = ?', [player.team_id]);
      if (payload.team_id) await run('DELETE FROM lineups WHERE team_id = ?', [payload.team_id]);
    }
    res.json({ message: 'Oyuncu güncellendi.', player: await get('SELECT * FROM players WHERE id = ?', [player.id]) });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/players/:id', requireAdmin, async (req, res, next) => {
  try {
    const player = await get('SELECT * FROM players WHERE id = ?', [req.params.id]);
    if (!player) return res.status(404).json({ message: 'Oyuncu bulunamadı.' });
    const payload = adminPlayerPayload(req.body, player);
    await run(
      `UPDATE players SET club_id = ?, team_id = ?, name = ?, age = ?, nationality = ?, position = ?,
        overall = ?, pace = ?, shooting = ?, passing = ?, dribbling = ?, defending = ?, physical = ?,
        stamina = ?, morale = ?, salary = ?, market_value = ?, base_market_value = ?, potential = ?,
        contract_until = ?, injured = ?, injury_type = ?, injury_return_day = ?, image_url = ?,
        lineup_role = ?, is_starting_eleven = ? WHERE id = ?`,
      [
        payload.club_id, payload.team_id, payload.name, payload.age, payload.nationality, payload.position,
        payload.overall, payload.pace, payload.shooting, payload.passing, payload.dribbling, payload.defending,
        payload.physical, payload.stamina, payload.morale, payload.salary, payload.market_value,
        payload.market_value, payload.potential, payload.contract_until, payload.injured, payload.injury_type,
        payload.injury_return_day, payload.image_url, payload.lineup_role, payload.is_starting_eleven, player.id
      ]
    );
    if (Number(player.team_id || 0) !== Number(payload.team_id || 0) || payload.team_id || payload.is_starting_eleven) {
      if (player.team_id) await run('DELETE FROM lineups WHERE team_id = ?', [player.team_id]);
      if (payload.team_id) await run('DELETE FROM lineups WHERE team_id = ?', [payload.team_id]);
    }
    res.json({ message: 'Oyuncu güncellendi.' });
  } catch (error) {
    next(error);
  }
});

router.delete('/admin/players/:id', requireAdmin, async (req, res, next) => {
  try {
    const player = await get('SELECT * FROM players WHERE id = ?', [req.params.id]);
    if (!player) return res.status(404).json({ message: 'Oyuncu bulunamadı.' });
    if (player.team_id) await run('DELETE FROM lineups WHERE team_id = ?', [player.team_id]);
    await run('DELETE FROM match_player_ratings WHERE player_id = ?', [player.id]);
    await run('UPDATE match_events SET scorer_id = NULL WHERE scorer_id = ?', [player.id]);
    await run('UPDATE match_events SET assist_id = NULL WHERE assist_id = ?', [player.id]);
    await run('DELETE FROM players WHERE id = ?', [player.id]);
    res.json({ message: 'Oyuncu silindi.', overview: await adminOverview() });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/social', requireAdmin, async (req, res, next) => {
  try {
    const state = await get('SELECT * FROM game_state WHERE id = 1');
    const day = numberInRange(req.body.day, state.current_day, 1, 999);
    const type = req.body.type === 'newspaper' ? 'newspaper' : 'social';
    const author = cleanText(req.body.author, type === 'newspaper' ? 'TactiCore Gazete' : 'Admin');
    const content = cleanText(req.body.content);
    if (content.length < 3) return res.status(400).json({ message: 'Paylaşım metni boş olamaz.' });
    await run('INSERT INTO social_posts (day, type, author, content) VALUES (?, ?, ?, ?)', [day, type, author, content]);
    res.json(await adminOverview());
  } catch (error) {
    next(error);
  }
});

router.post('/admin/league/reset', requireAdmin, async (req, res, next) => {
  try {
    await run('DELETE FROM match_player_ratings');
    await run('DELETE FROM match_events');
    await run('DELETE FROM matches');
    await run("UPDATE teams SET points = 0, wins = 0, draws = 0, losses = 0, goals_for = 0, goals_against = 0, form = ''");
    await run('UPDATE clubs SET points = 0, wins = 0, draws = 0, losses = 0, goals_for = 0, goals_against = 0, last_match = NULL');
    await run('UPDATE game_state SET current_day = 1, next_match_day = 7, week = 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1');
    res.json(await adminOverview());
  } catch (error) {
    next(error);
  }
});

module.exports = router;


