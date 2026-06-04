const { all, get, run } = require('../database');
const clubModel = require('../models/clubModel');
const { evaluateLeague, evaluateChampionsLeague, managementVerdict, parseSeasonPlan } = require('./seasonPlanning');

const DERBY_TEAM_IDS = new Set([1, 2, 3, 4]);

function levelInfo(totalXp = 0) {
  let level = 1;
  let remaining = Math.max(0, Number(totalXp || 0));
  let needed = 500;
  while (remaining >= needed) {
    remaining -= needed;
    level += 1;
    needed = level * 500;
  }
  return { level, currentXp: remaining, nextXp: needed, totalXp: Number(totalXp || 0) };
}

async function ensureManagerProfile(userId) {
  const existing = await get('SELECT * FROM manager_profiles WHERE user_id = ?', [userId]);
  if (existing) return existing;
  const user = await get('SELECT username FROM users WHERE id = ?', [userId]);
  await run('INSERT INTO manager_profiles (user_id, manager_name) VALUES (?, ?)', [userId, user?.username || 'Menajer']);
  return get('SELECT * FROM manager_profiles WHERE user_id = ?', [userId]);
}

async function unlockAchievement(userId, key, title, description = '') {
  const existing = await get('SELECT id FROM manager_achievements WHERE user_id = ? AND achievement_key = ?', [userId, key]);
  if (existing) return null;
  await run(`
    INSERT INTO manager_achievements (user_id, achievement_key, title, description)
    VALUES (?, ?, ?, ?)
  `, [userId, key, title, description]);
  return { key, title, description };
}

async function addXp(userId, eventKey, amount, reason) {
  const safeAmount = Math.max(0, Math.round(Number(amount || 0)));
  if (!safeAmount) return null;
  await ensureManagerProfile(userId);
  const before = await get('SELECT total_xp, last_xp_gain FROM manager_profiles WHERE user_id = ?', [userId]);
  const duplicate = await get('SELECT id FROM manager_xp_events WHERE user_id = ? AND event_key = ?', [userId, eventKey]);
  if (duplicate) {
    const profile = await getManagerProfile(userId);
    return { gained: 0, reason, duplicate: true, profile };
  }
  const beforeInfo = levelInfo(before?.total_xp || 0);
  await run('INSERT INTO manager_xp_events (user_id, event_key, amount, reason) VALUES (?, ?, ?, ?)', [userId, eventKey, safeAmount, reason]);
  await run(`
    UPDATE manager_profiles
    SET total_xp = total_xp + ?, last_xp_gain = ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `, [safeAmount, safeAmount, userId]);
  const profile = await getManagerProfile(userId);
  return {
    gained: safeAmount,
    reason,
    levelUp: profile.level > beforeInfo.level,
    profile
  };
}

function sideForTeam(featured, teamId) {
  const homeId = Number(featured?.home?.team_id || featured?.home?.id || 0);
  const awayId = Number(featured?.away?.team_id || featured?.away?.id || 0);
  if (homeId === Number(teamId)) return {
    mine: featured.home,
    opponent: featured.away,
    goalsFor: Number(featured.match.home_score || 0),
    goalsAgainst: Number(featured.match.away_score || 0)
  };
  if (awayId === Number(teamId)) return {
    mine: featured.away,
    opponent: featured.home,
    goalsFor: Number(featured.match.away_score || 0),
    goalsAgainst: Number(featured.match.home_score || 0)
  };
  return null;
}

function matchXpAmount(result, side, teamId) {
  const won = side.goalsFor > side.goalsAgainst;
  const drew = side.goalsFor === side.goalsAgainst;
  if (!won && !drew) return { amount: 0, reason: 'Maç kaybı' };

  if (result.european) {
    const code = result.tableCompetitionCode || (result.competitionType === 'champions_league' ? 'UCL' : 'UEFA');
    let amount = won ? (code === 'UCL' ? 180 : 120) : 25;
    if (result.knockout && won) amount += 90;
    const roundName = result.featured?.match?.round_name || result.standingsTitle || 'Avrupa';
    if (String(roundName).toLowerCase().includes('final') && won) amount += 450;
    return { amount, reason: `${code} ${won ? 'galibiyeti' : 'beraberliği'}` };
  }

  let amount = won ? 80 : 15;
  const opponentId = Number(side.opponent?.id || side.opponent?.team_id || 0);
  if (won && DERBY_TEAM_IDS.has(Number(teamId)) && DERBY_TEAM_IDS.has(opponentId) && opponentId !== Number(teamId)) {
    amount += 70;
  }
  return { amount, reason: won ? 'Lig galibiyeti' : 'Lig beraberliği' };
}

async function awardMatchXp(userId, club, result) {
  if (!result?.featured?.match || !club?.team_id) return null;
  const featured = result.featured;
  const side = sideForTeam(featured, club.team_id);
  if (!side) return null;
  const { amount, reason } = matchXpAmount(result, side, club.team_id);
  if (!amount) return null;
  const matchPrefix = result.european ? 'europe' : 'league';
  const award = await addXp(userId, `${matchPrefix}_match_${featured.match.id}`, amount, reason);
  const achievements = [];
  if (side.goalsFor > side.goalsAgainst) {
    const firstWin = await unlockAchievement(userId, 'first_win', 'Ilk Galibiyet', 'Kariyerindeki ilk galibiyeti aldın.');
    if (firstWin) achievements.push(firstWin);
    const opponentId = Number(side.opponent?.id || side.opponent?.team_id || 0);
    if (DERBY_TEAM_IDS.has(Number(club.team_id)) && DERBY_TEAM_IDS.has(opponentId) && opponentId !== Number(club.team_id)) {
      const derby = await unlockAchievement(userId, 'first_derby_win', 'Ilk Derbi Zaferi', 'Büyük maçta üç puanı aldın.');
      if (derby) achievements.push(derby);
    }
    if (result.competitionType === 'champions_league') {
      const ucl = await unlockAchievement(userId, 'first_ucl_win', 'Sampiyonlar Ligi Ilk Galibiyet', 'Avrupa sahnesinde ilk galibiyet geldi.');
      if (ucl) achievements.push(ucl);
    }
  }
  return award ? { ...award, achievements } : null;
}

async function championsLeagueResult(userId, teamId) {
  const matches = await all(`
    SELECT phase, round_name, home_team_id, away_team_id, home_score, away_score, played
    FROM european_matches
    WHERE user_id = ? AND competition_code = 'UCL' AND (home_team_id = ? OR away_team_id = ?)
    ORDER BY match_day ASC, id ASC
  `, [userId, teamId, teamId]);
  if (!matches.length) return null;
  if (matches.some((match) => !match.played)) return { stage: 'active', label: 'Devam ediyor' };
  const final = matches.find((match) => match.phase === 'final');
  if (final) {
    const isHome = final.home_team_id === teamId;
    const goalsFor = isHome ? final.home_score : final.away_score;
    const goalsAgainst = isHome ? final.away_score : final.home_score;
    return { stage: goalsFor > goalsAgainst ? 'champion' : 'final', label: goalsFor > goalsAgainst ? 'Şampiyonluk' : 'Final' };
  }
  const order = ['league', 'knockout_playoff', 'round_of_16', 'quarter_final', 'semi_final'];
  const reached = matches.reduce((best, match) => (order.indexOf(match.phase) > order.indexOf(best) ? match.phase : best), 'league');
  const labels = { league: 'Lig aşaması', round_of_16: 'Son 16', quarter_final: 'Çeyrek final', semi_final: 'Yarı final' };
  return { stage: reached, label: labels[reached] || 'Katıldı' };
}

async function awardSeasonXp(userId) {
  const club = await clubModel.getByUserId(userId);
  if (!club) return null;
  const table = await clubModel.table(userId);
  const rank = table.findIndex((item) => item.id === club.team_id) + 1;
  const team = await get('SELECT * FROM teams WHERE id = ?', [club.team_id]);
  const plan = parseSeasonPlan(club.season_objectives_json, team || club);
  const leagueEvaluation = evaluateLeague(plan, rank);
  const uclEvaluation = evaluateChampionsLeague(plan, await championsLeagueResult(userId, club.team_id));
  const evaluations = [leagueEvaluation, uclEvaluation].filter(Boolean);
  const successCount = evaluations.filter((item) => item.success).length;
  const verdict = managementVerdict(successCount, evaluations.length);
  let amount = successCount * 220;
  if (rank === 1) amount += 900;
  if (verdict.score >= 80) amount += 180;
  const profile = await ensureManagerProfile(userId);
  const state = await get('SELECT week FROM career_states WHERE user_id = ?', [userId]);
  const award = await addXp(userId, `season_review_${profile.seasons || 1}_${club.team_id}_${state?.week || 0}`, amount, 'Sezon hedefleri');
  const achievements = [];
  if (successCount > 0) {
    const target = await unlockAchievement(userId, 'season_target_done', 'Sezon Hedefini Basardin', 'Yönetimin hedeflerinden en az birini tamamladın.');
    if (target) achievements.push(target);
  }
  if (rank === 1) {
    const champion = await unlockAchievement(userId, 'first_championship', 'Ilk Sampiyonluk', 'Lig şampiyonluğunu kazandın.');
    if (champion) achievements.push(champion);
  }
  if (award) return { ...award, achievements };
  return null;
}

async function getManagerProfile(userId) {
  const profile = await ensureManagerProfile(userId);
  const info = levelInfo(profile.total_xp || 0);
  return {
    managerName: profile.manager_name,
    totalXp: profile.total_xp || 0,
    lastXpGain: profile.last_xp_gain || 0,
    seasons: profile.seasons || 1,
    ...info
  };
}

async function getManagerSummary(userId) {
  const profile = await getManagerProfile(userId);
  const club = await clubModel.getByUserId(userId);
  const user = await get('SELECT username, created_at FROM users WHERE id = ?', [userId]);
  const leagueStats = await get(`
    SELECT
      COUNT(*) AS played,
      SUM(CASE
        WHEN home_club_id = ? AND home_score > away_score THEN 1
        WHEN away_club_id = ? AND away_score > home_score THEN 1
        ELSE 0 END) AS wins,
      SUM(CASE WHEN home_score = away_score THEN 1 ELSE 0 END) AS draws,
      SUM(CASE
        WHEN home_club_id = ? AND home_score < away_score THEN 1
        WHEN away_club_id = ? AND away_score < home_score THEN 1
        ELSE 0 END) AS losses
    FROM matches
    WHERE user_id = ? AND played = 1 AND (home_club_id = ? OR away_club_id = ?)
  `, [club.team_id, club.team_id, club.team_id, club.team_id, userId, club.team_id, club.team_id]);
  const euroStats = await get(`
    SELECT
      COUNT(*) AS played,
      SUM(CASE
        WHEN home_team_id = ? AND home_score > away_score THEN 1
        WHEN away_team_id = ? AND away_score > home_score THEN 1
        ELSE 0 END) AS wins,
      SUM(CASE WHEN home_score = away_score THEN 1 ELSE 0 END) AS draws,
      SUM(CASE
        WHEN home_team_id = ? AND home_score < away_score THEN 1
        WHEN away_team_id = ? AND away_score < home_score THEN 1
        ELSE 0 END) AS losses
    FROM european_matches
    WHERE user_id = ? AND played = 1 AND (home_team_id = ? OR away_team_id = ?)
  `, [club.team_id, club.team_id, club.team_id, club.team_id, userId, club.team_id, club.team_id]);
  const played = Number(leagueStats?.played || 0) + Number(euroStats?.played || 0);
  const wins = Number(leagueStats?.wins || 0) + Number(euroStats?.wins || 0);
  const draws = Number(leagueStats?.draws || 0) + Number(euroStats?.draws || 0);
  const losses = Number(leagueStats?.losses || 0) + Number(euroStats?.losses || 0);
  const achievements = await all('SELECT * FROM manager_achievements WHERE user_id = ? ORDER BY unlocked_at DESC', [userId]);
  const events = await all('SELECT * FROM manager_xp_events WHERE user_id = ? ORDER BY id DESC LIMIT 8', [userId]);
  return {
    user,
    profile,
    club,
    stats: {
      played,
      wins,
      draws,
      losses,
      winRate: played ? Math.round((wins / played) * 100) : 0,
      trophies: achievements.filter((item) => item.achievement_key.includes('championship') || item.achievement_key.includes('cup')).length
    },
    achievements,
    history: [
      { title: `${club.name} kariyeri`, description: `${user?.username || profile.managerName} teknik direktör olarak göreve başladı.` },
      ...events.map((event) => ({ title: `+${event.amount} XP`, description: event.reason }))
    ]
  };
}

async function playedStatsFor(userId, teamId) {
  if (!teamId) return { played: 0, wins: 0, draws: 0, losses: 0, winRate: 0 };
  const leagueStats = await get(`
    SELECT
      COUNT(*) AS played,
      SUM(CASE
        WHEN home_club_id = ? AND home_score > away_score THEN 1
        WHEN away_club_id = ? AND away_score > home_score THEN 1
        ELSE 0 END) AS wins,
      SUM(CASE WHEN home_score = away_score THEN 1 ELSE 0 END) AS draws,
      SUM(CASE
        WHEN home_club_id = ? AND home_score < away_score THEN 1
        WHEN away_club_id = ? AND away_score < home_score THEN 1
        ELSE 0 END) AS losses
    FROM matches
    WHERE user_id = ? AND played = 1 AND (home_club_id = ? OR away_club_id = ?)
  `, [teamId, teamId, teamId, teamId, userId, teamId, teamId]);
  const euroStats = await get(`
    SELECT
      COUNT(*) AS played,
      SUM(CASE
        WHEN home_team_id = ? AND home_score > away_score THEN 1
        WHEN away_team_id = ? AND away_score > home_score THEN 1
        ELSE 0 END) AS wins,
      SUM(CASE WHEN home_score = away_score THEN 1 ELSE 0 END) AS draws,
      SUM(CASE
        WHEN home_team_id = ? AND home_score < away_score THEN 1
        WHEN away_team_id = ? AND away_score < home_score THEN 1
        ELSE 0 END) AS losses
    FROM european_matches
    WHERE user_id = ? AND played = 1 AND (home_team_id = ? OR away_team_id = ?)
  `, [teamId, teamId, teamId, teamId, userId, teamId, teamId]);
  const played = Number(leagueStats?.played || 0) + Number(euroStats?.played || 0);
  const wins = Number(leagueStats?.wins || 0) + Number(euroStats?.wins || 0);
  const draws = Number(leagueStats?.draws || 0) + Number(euroStats?.draws || 0);
  const losses = Number(leagueStats?.losses || 0) + Number(euroStats?.losses || 0);
  return {
    played,
    wins,
    draws,
    losses,
    winRate: played ? Math.round((wins / played) * 100) : 0
  };
}

async function getManagerLeaderboard(limit = 10) {
  const safeLimit = Math.min(10, Math.max(1, Number(limit || 10)));
  const rows = await all(`
    SELECT
      u.id AS user_id,
      u.username,
      COALESCE(u.is_active, 1) AS is_active,
      COALESCE(mp.total_xp, 0) AS total_xp,
      COALESCE(mp.seasons, 1) AS seasons,
      c.team_id,
      COALESCE(t.name, c.name, 'Takim secilmedi') AS team_name
    FROM users u
    LEFT JOIN manager_profiles mp ON mp.user_id = u.id
    LEFT JOIN clubs c ON c.user_id = u.id
    LEFT JOIN teams t ON t.id = c.team_id
    WHERE COALESCE(u.is_active, 1) = 1
    ORDER BY COALESCE(mp.total_xp, 0) DESC, u.id ASC
    LIMIT ?
  `, [safeLimit]);

  const enriched = [];
  for (const row of rows) {
    const info = levelInfo(row.total_xp || 0);
    const stats = await playedStatsFor(row.user_id, row.team_id);
    enriched.push({
      userId: row.user_id,
      username: row.username,
      teamName: row.team_name,
      totalXp: info.totalXp,
      level: info.level,
      currentXp: info.currentXp,
      nextXp: info.nextXp,
      seasons: Number(row.seasons || 1),
      ...stats
    });
  }
  return enriched;
}

async function incrementSeasonCount(userId) {
  await ensureManagerProfile(userId);
  await run('UPDATE manager_profiles SET seasons = seasons + 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?', [userId]);
}

module.exports = {
  ensureManagerProfile,
  addXp,
  getManagerProfile,
  getManagerSummary,
  getManagerLeaderboard,
  awardMatchXp,
  awardSeasonXp,
  incrementSeasonCount
};
