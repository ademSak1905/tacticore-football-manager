const path = require('path');
const teams = require(path.join(__dirname, '..', '..', 'frontend', 'data', 'superlig-teams-2026.json'));
const players = require(path.join(__dirname, '..', '..', 'frontend', 'data', 'superlig-players-2026.json'));
const { formations } = require('../utils/lineupValidator');
const {
  clubTransferBudget,
  calculateBaseMarketValue,
  normalizeInternalMoney
} = require('../utils/financeEngine');

function value(base, spread = 4) {
  return Math.max(45, Math.min(89, base + Math.floor(Math.random() * spread * 2 + 1) - spread));
}

function normalizePlayer(player, team) {
  const base = player.overall || team.overall || 70;
  const byPosition = {
    GK: { pace: 42, shooting: 18, passing: 60, dribbling: 45, defending: base + 5, physical: base },
    DEF: { pace: base, shooting: 45, passing: base - 2, dribbling: base - 3, defending: base + 5, physical: base + 3 },
    MID: { pace: base, shooting: base - 1, passing: base + 5, dribbling: base + 3, defending: base - 1, physical: base },
    FWD: { pace: base + 4, shooting: base + 5, passing: base - 2, dribbling: base + 4, defending: 45, physical: base }
  };
  const defaults = byPosition[player.position] || byPosition.MID;

  return {
    age: player.age || 25,
    nationality: player.nationality || 'Türkiye',
    preferred_foot: player.preferred_foot || 'right',
    overall: base,
    pace: player.pace || value(defaults.pace),
    shooting: player.shooting || value(defaults.shooting),
    passing: player.passing || value(defaults.passing),
    dribbling: player.dribbling || value(defaults.dribbling),
    defending: player.defending || value(defaults.defending),
    physical: player.physical || value(defaults.physical),
    stamina: player.stamina || value(74),
    morale: player.morale || value(72),
    market_value: calculateBaseMarketValue({ ...player, overall: base, potential: player.potential || base }),
    salary: normalizeInternalMoney(player.salary || Math.round(base * 18500), 25000000),
    injured: player.injured ? 1 : 0,
    image_url: player.image_url || '',
    is_starting_eleven: player.is_starting_eleven ? 1 : 0
  };
}

async function seedSuperLigData(db) {
  for (const team of teams) {
    await db.run(`
      INSERT INTO teams
        (id, name, short_name, logo_url, city, stadium, budget, fans, overall, attack_overall,
         midfield_overall, defense_overall, goalkeeper_overall, default_formation)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        short_name = excluded.short_name,
        logo_url = COALESCE(NULLIF(teams.logo_url, ''), excluded.logo_url),
        city = excluded.city,
        stadium = excluded.stadium,
        budget = excluded.budget,
        fans = excluded.fans,
        overall = excluded.overall,
        attack_overall = excluded.attack_overall,
        midfield_overall = excluded.midfield_overall,
        defense_overall = excluded.defense_overall,
        goalkeeper_overall = excluded.goalkeeper_overall,
        default_formation = excluded.default_formation
    `, [
      team.id, team.name, team.short_name, team.logo_url, team.city, team.stadium, clubTransferBudget(team), team.fans,
      team.overall, team.attack_overall, team.midfield_overall, team.defense_overall, team.goalkeeper_overall,
      team.default_formation
    ]);
  }

  const existingPlayers = await db.get('SELECT COUNT(*) AS count FROM players WHERE team_id IS NOT NULL');
  if (existingPlayers.count > 0) return;

  for (const player of players) {
    const team = teams.find((item) => item.id === player.team_id) || teams[0];
    const normalized = normalizePlayer(player, team);
    await db.run(`
      INSERT INTO players
        (team_id, name, age, nationality, position, preferred_foot, overall, pace, shooting, passing,
         dribbling, defending, physical, stamina, morale, salary, market_value, base_market_value, injured, image_url,
         is_starting_eleven, lineup_role)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      player.team_id, player.name, normalized.age, normalized.nationality, player.position, normalized.preferred_foot,
      normalized.overall, normalized.pace, normalized.shooting, normalized.passing, normalized.dribbling,
      normalized.defending, normalized.physical, normalized.stamina, normalized.morale, normalized.salary,
      normalized.market_value, normalized.market_value, normalized.injured, normalized.image_url, normalized.is_starting_eleven,
      normalized.is_starting_eleven ? 'starter' : 'reserve'
    ]);
  }

  for (const team of teams) {
    const starters = await db.all('SELECT * FROM players WHERE team_id = ? ORDER BY is_starting_eleven DESC, overall DESC LIMIT 11', [team.id]);
    const slots = formations[team.default_formation] || formations['4-2-3-1'];
    for (let index = 0; index < Math.min(starters.length, slots.length); index += 1) {
      await db.run(
        'INSERT INTO lineups (team_id, formation, player_id, position_slot, x_position, y_position) VALUES (?, ?, ?, ?, ?, ?)',
        [team.id, team.default_formation, starters[index].id, slots[index][0], slots[index][1], slots[index][2]]
      );
    }
  }
}

module.exports = { seedSuperLigData };
