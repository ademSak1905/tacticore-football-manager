const express = require('express');
const bcrypt = require('bcryptjs');
const clubModel = require('../models/clubModel');
const { all, get, run, getCareerState, ensureCareerForUser } = require('../database');
const { seasonDate, withSeasonDates } = require('../utils/seasonCalendar');
const { ensureDailyFeed, combinedFeed } = require('../utils/feedEngine');
const { simulateAiTransfers } = require('../utils/transferEngine');
const { ensureEuropeanSeason, nextEuropeanMatch } = require('../utils/europeEngine');
const { leagueWeeksForTeamCount } = require('../utils/matchEngine');
const {
  buildSeasonPlan,
  parseSeasonPlan,
  evaluateLeague,
  evaluateChampionsLeague,
  managementVerdict
} = require('../utils/seasonPlanning');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ message: 'Oturum gerekli.' });
  next();
}

function adminCode(req) {
  return req.query.code || req.body.code || req.headers['x-admin-code'];
}

function requireAdmin(req, res, next) {
  if (adminCode(req) !== (process.env.ADMIN_CODE || 'tacticore-admin')) {
    return res.status(401).json({ message: 'Admin kodu hatalı.' });
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

router.get('/game/state', requireAuth, async (req, res, next) => {
  try {
    const club = await clubModel.getByUserId(req.session.userId);
    await ensureEuropeanSeason(req.session.userId, club.team_id);
    const state = await getCareerState(req.session.userId);
    const teamCount = await get('SELECT COUNT(*) AS count FROM teams');
    const totalLeagueWeeks = leagueWeeksForTeamCount(teamCount?.count || 18);
    const leagueFinished = Number(state.week || 1) > totalLeagueWeeks;
    const europeNext = await nextEuropeanMatch(req.session.userId, club.team_id);
    const nextLeagueDay = leagueFinished ? Number.MAX_SAFE_INTEGER : state.next_match_day;
    const nextFixtureDay = Math.min(nextLeagueDay, europeNext?.match_day || nextLeagueDay);
    const nextCompetitionType = europeNext && europeNext.match_day < nextLeagueDay
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
      next_match_competition_type: nextCompetitionType,
      leagueFinished,
      totalLeagueWeeks,
      next_european_match: europeNext,
      matchAvailable: state.current_day >= nextFixtureDay,
      club
    });
  } catch (error) {
    next(error);
  }
});

router.post('/game/advance', requireAuth, async (req, res, next) => {
  try {
    const days = Number(req.body.days) === 7 ? 7 : 1;
    const club = await clubModel.getByUserId(req.session.userId);
    await ensureEuropeanSeason(req.session.userId, club.team_id);
    const currentState = await getCareerState(req.session.userId);
    const teamCount = await get('SELECT COUNT(*) AS count FROM teams');
    const totalLeagueWeeks = leagueWeeksForTeamCount(teamCount?.count || 18);
    const leagueFinished = Number(currentState.week || 1) > totalLeagueWeeks;
    const europeNext = await nextEuropeanMatch(req.session.userId, club.team_id);
    const nextLeagueDay = leagueFinished ? Number.MAX_SAFE_INTEGER : currentState.next_match_day;
    const nextFixtureDay = Math.min(nextLeagueDay, europeNext?.match_day || nextLeagueDay);
    if (leagueFinished && !europeNext) {
      return res.status(400).json({ message: 'Lig sezonu tamamlandı. Yeni sezona geçmelisin.' });
    }
    if (currentState.current_day >= nextFixtureDay) {
      return res.status(400).json({ message: 'Maç günü geldi. Önce maçını oyna ya da atla, sonra günü ilerletebilirsin.' });
    }
    const targetDay = Math.min(currentState.current_day + days, nextFixtureDay);
    await run('UPDATE career_states SET current_day = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?', [targetDay, req.session.userId]);
    const state = await getCareerState(req.session.userId);
    const updatedEuropeNext = await nextEuropeanMatch(req.session.userId, club.team_id);
    const updatedLeagueFinished = Number(state.week || 1) > totalLeagueWeeks;
    const updatedLeagueDay = updatedLeagueFinished ? Number.MAX_SAFE_INTEGER : state.next_match_day;
    const updatedFixtureDay = Math.min(updatedLeagueDay, updatedEuropeNext?.match_day || updatedLeagueDay);
    const updatedCompetitionType = updatedEuropeNext && updatedEuropeNext.match_day < updatedLeagueDay
      ? (updatedEuropeNext.competition_code === 'UCL' ? 'champions_league' : updatedEuropeNext.competition_code === 'UEL' ? 'europa_league' : 'conference_league')
      : updatedLeagueFinished ? 'season_end' : 'super_lig';
    await ensureDailyFeed(club.team_id);
    await simulateAiTransfers(club.team_id);
    res.json({
      ...withSeasonDates(state),
      next_fixture_day: updatedFixtureDay,
      next_fixture_date: Number.isFinite(updatedFixtureDay) && updatedFixtureDay < Number.MAX_SAFE_INTEGER ? seasonDate(updatedFixtureDay) : null,
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
    const nextStartDay = Math.max(currentDay + 14, Number(state?.next_match_day || currentDay) + 14);
    const team = await get('SELECT * FROM teams WHERE id = ?', [club.team_id]);
    const plan = buildSeasonPlan(team || club);
    await run('DELETE FROM league_standings WHERE user_id = ?', [req.session.userId]);
    await run(`UPDATE clubs
      SET currency = 'EUR', budget = ?, salary_budget = ?, season_objectives_json = ?, season_intro_seen = 0,
        season_summary_seen = 0, points = 0, wins = 0, draws = 0, losses = 0,
        goals_for = 0, goals_against = 0, last_match = NULL
      WHERE user_id = ?`, [plan.transferBudget, plan.salaryBudget, JSON.stringify(plan), req.session.userId]);
    await run('UPDATE career_states SET current_day = ?, next_match_day = ?, week = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?', [
      nextStartDay,
      nextStartDay + 7,
      req.session.userId
    ]);
    await ensureCareerForUser(req.session.userId);
    console.log('SEASON RESET CHECK', {
      previousDay: currentDay,
      newCurrentDay: nextStartDay,
      newNextMatchDay: nextStartDay + 7
    });
    res.json({ message: 'Yeni sezon başladı.', current_day: nextStartDay, next_match_day: nextStartDay + 7, week: 1, seasonPlan: plan });
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
  const order = ['league', 'qualifying', 'round_of_16', 'quarter_final', 'semi_final'];
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
    const leaders = await all(`
      SELECT p.name,
        COALESCE(SUM(r.goals), 0) AS goals,
        COALESCE(SUM(r.assists), 0) AS assists
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
    const leagueEvaluation = evaluateLeague(plan, rank);
    const uclEvaluation = evaluateChampionsLeague(plan, await championsLeagueResult(req.session.userId, club.team_id));
    const evaluations = [leagueEvaluation, uclEvaluation].filter(Boolean);
    const successCount = evaluations.filter((item) => item.success).length;
    res.json({
      seen: Boolean(club.season_summary_seen),
      league: {
        rank,
        points: leagueRow.points || 0,
        wins: leagueRow.wins || 0,
        draws: leagueRow.draws || 0,
        losses: leagueRow.losses || 0,
        goals_for: leagueRow.goals_for || 0,
        goals_against: leagueRow.goals_against || 0
      },
      topScorer: topScorer ? { name: topScorer.name, goals: topScorer.goals || 0 } : null,
      topAssist: topAssist ? { name: topAssist.name, assists: topAssist.assists || 0 } : null,
      evaluations,
      verdict: managementVerdict(successCount, evaluations.length)
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
  const [state, users, teams, matches, clubs, recentMatches, posts] = await Promise.all([
    get('SELECT * FROM game_state WHERE id = 1'),
    all(`
      SELECT u.id, u.username, u.email, u.created_at, c.id AS club_id, c.name AS club_name,
        c.budget, c.fans, c.stadium_capacity, c.currency, tr.name AS team_name
      FROM users u
      LEFT JOIN clubs c ON c.user_id = u.id
      LEFT JOIN teams tr ON tr.id = c.team_id
      ORDER BY u.id DESC
      LIMIT 30
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
  ]);

  return {
    state,
    users,
    teams,
    clubs,
    recentMatches,
    posts,
    matches: matches.count,
    adminCodeHint: 'Varsayilan kod: tacticore-admin'
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
      adminCodeHint: overview.adminCodeHint
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

router.post('/admin/teams/:id', requireAdmin, async (req, res, next) => {
  try {
    const team = await get('SELECT * FROM teams WHERE id = ?', [req.params.id]);
    if (!team) return res.status(404).json({ message: 'Takım bulunamadı.' });
    const allowedFormations = ['4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '3-4-3', '5-3-2', '4-1-4-1'];
    const formation = allowedFormations.includes(req.body.default_formation) ? req.body.default_formation : team.default_formation;
    await run(
      `UPDATE teams SET budget = ?, fans = ?, overall = ?, attack_overall = ?, midfield_overall = ?,
        defense_overall = ?, goalkeeper_overall = ?, default_formation = ? WHERE id = ?`,
      [
        numberInRange(req.body.budget, team.budget, 0, 999999999),
        numberInRange(req.body.fans, team.fans, 0, 99999999),
        numberInRange(req.body.overall, team.overall, 1, 99),
        numberInRange(req.body.attack_overall, team.attack_overall, 1, 99),
        numberInRange(req.body.midfield_overall, team.midfield_overall, 1, 99),
        numberInRange(req.body.defense_overall, team.defense_overall, 1, 99),
        numberInRange(req.body.goalkeeper_overall, team.goalkeeper_overall, 1, 99),
        formation,
        team.id
      ]
    );
    res.json(await adminOverview());
  } catch (error) {
    next(error);
  }
});

router.post('/admin/players/:id', requireAdmin, async (req, res, next) => {
  try {
    const player = await get('SELECT * FROM players WHERE id = ?', [req.params.id]);
    if (!player) return res.status(404).json({ message: 'Oyuncu bulunamadı.' });
    await run(
      `UPDATE players SET overall = ?, pace = ?, shooting = ?, passing = ?, dribbling = ?, defending = ?,
        physical = ?, stamina = ?, morale = ?, salary = ?, market_value = ?, injured = ? WHERE id = ?`,
      [
        numberInRange(req.body.overall, player.overall, 1, 99),
        numberInRange(req.body.pace, player.pace, 1, 99),
        numberInRange(req.body.shooting, player.shooting, 1, 99),
        numberInRange(req.body.passing, player.passing, 1, 99),
        numberInRange(req.body.dribbling, player.dribbling, 1, 99),
        numberInRange(req.body.defending, player.defending, 1, 99),
        numberInRange(req.body.physical, player.physical, 1, 99),
        numberInRange(req.body.stamina, player.stamina, 1, 100),
        numberInRange(req.body.morale, player.morale, 1, 100),
        numberInRange(req.body.salary, player.salary, 0, 99999999),
        numberInRange(req.body.market_value, player.market_value, 0, 999999999),
        req.body.injured ? 1 : 0,
        player.id
      ]
    );
    res.json({ message: 'Oyuncu güncellendi.' });
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


