const { all, get, run } = require('../database');
const { spendCoins } = require('./coinManager');
const { recordTaskProgress } = require('./taskEngine');

const SPY_TYPES = {
  normal: { label: 'Normal Casus', cost: 50, successRate: 0.65 },
  advanced: { label: 'Gelişmiş Casus', cost: 80, successRate: 0.8 },
  elite: { label: 'Elit Casus', cost: 120, successRate: 0.9 }
};

function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
}

function weakAreas(team) {
  const rows = [
    ['Hücum', team.attack_overall],
    ['Orta saha', team.midfield_overall],
    ['Savunma', team.defense_overall],
    ['Kaleci', team.goalkeeper_overall]
  ].sort((a, b) => Number(a[1] || 0) - Number(b[1] || 0));
  return rows.slice(0, 2).map(([label]) => label);
}

async function listSpyTeams(userId, ownTeamId) {
  const teams = await all('SELECT id, name, overall, default_formation FROM teams WHERE id != ? ORDER BY overall DESC, name ASC', [ownTeamId]);
  const reports = await all('SELECT * FROM spy_reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 8', [userId]);
  return { spyTypes: SPY_TYPES, teams, recentReports: reports.map((row) => ({ ...row, report_json: parseJson(row.report_json, {}) })) };
}

async function buildReport(teamId) {
  const team = await get('SELECT * FROM teams WHERE id = ?', [teamId]);
  if (!team) throw new Error('Takım bulunamadı.');
  const lineup = await all(`
    SELECT name, position, overall, stamina, morale, injured
    FROM players
    WHERE team_id = ?
    ORDER BY is_starting_eleven DESC, CASE lineup_role WHEN 'starter' THEN 0 WHEN 'substitute' THEN 1 ELSE 2 END, overall DESC
    LIMIT 11
  `, [teamId]);
  const stars = await all('SELECT name, position, overall FROM players WHERE team_id = ? ORDER BY overall DESC LIMIT 3', [teamId]);
  const injured = await all('SELECT name, position, overall FROM players WHERE team_id = ? AND injured = 1 ORDER BY overall DESC', [teamId]);
  const avgMorale = Math.round(lineup.reduce((sum, p) => sum + Number(p.morale || 0), 0) / Math.max(1, lineup.length));
  const avgStamina = Math.round(lineup.reduce((sum, p) => sum + Number(p.stamina || 0), 0) / Math.max(1, lineup.length));
  const style = Number(team.attack_overall || 0) >= Number(team.defense_overall || 0) + 3
    ? 'Önde baskı ve hızlı hücum'
    : Number(team.defense_overall || 0) >= Number(team.attack_overall || 0) + 3
      ? 'Kompakt savunma ve geçiş oyunu'
      : 'Dengeli pas oyunu';
  return {
    teamName: team.name,
    formation: team.default_formation || '4-2-3-1',
    overall: team.overall,
    lineup,
    strongPlayers: stars,
    weakAreas: weakAreas(team),
    injuredPlayers: injured,
    morale: avgMorale,
    stamina: avgStamina,
    tacticGuess: style
  };
}

async function sendSpy(userId, ownTeamId, targetTeamId, spyType = 'normal') {
  const config = SPY_TYPES[spyType] || SPY_TYPES.normal;
  if (Number(targetTeamId) === Number(ownTeamId)) throw new Error('Kendi takımına casus gönderemezsin.');
  const target = await get('SELECT id, name FROM teams WHERE id = ?', [targetTeamId]);
  if (!target) throw new Error('Rakip takım bulunamadı.');
  await spendCoins(userId, config.cost, `${target.name} casus raporu`);
  await recordTaskProgress(userId, 'spy_send');
  const success = Math.random() <= config.successRate;
  const report = success
    ? await buildReport(targetTeamId)
    : { teamName: target.name, caught: true, message: 'Casus yakalandı. Bilgi alınamadı.' };
  const inserted = await run(`
    INSERT INTO spy_reports (user_id, target_team_id, spy_type, cost, success, report_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [userId, targetTeamId, spyType, config.cost, success ? 1 : 0, JSON.stringify(report)]);
  return get('SELECT * FROM spy_reports WHERE id = ?', [inserted.id]);
}

module.exports = {
  SPY_TYPES,
  listSpyTeams,
  sendSpy
};
