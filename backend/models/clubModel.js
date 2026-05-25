const { get, run, all } = require('../database');
const { buildSeasonPlan } = require('../utils/seasonPlanning');

async function createClub(userId, name, teamId = null) {
  const team = teamId ? await get('SELECT * FROM teams WHERE id = ?', [teamId]) : null;
  const plan = buildSeasonPlan(team || {});
  const budget = plan.transferBudget || team?.budget || 5000000;
  const salaryBudget = plan.salaryBudget || 0;
  const fans = team?.fans || 16000;
  const stadiumCapacity = team ? Math.max(12000, Math.round(team.fans / 1200)) : 18000;
  return run(
    `INSERT INTO clubs
      (user_id, team_id, name, currency, budget, salary_budget, season_objectives_json, season_intro_seen, season_summary_seen, stadium_capacity, fans)
     VALUES (?, ?, ?, 'EUR', ?, ?, ?, 0, 0, ?, ?)`,
    [userId, teamId, name, budget, salaryBudget, JSON.stringify(plan), stadiumCapacity, fans]
  );
}

async function getByUserId(userId) {
  return get(`
    SELECT c.id, c.user_id, c.team_id, c.currency, COALESCE(t.name, c.name) AS name,
      c.budget, c.salary_budget, c.season_objectives_json, c.season_intro_seen, c.season_summary_seen,
      c.stadium_capacity, c.fans, c.points, c.wins, c.draws, c.losses,
      c.goals_for, c.goals_against, c.last_match, t.name AS team_name,
      t.logo_url, t.city, t.stadium, t.overall AS team_overall,
      t.attack_overall, t.midfield_overall, t.defense_overall, t.goalkeeper_overall,
      t.default_formation, COALESCE(ls.form, '') AS form
    FROM clubs c
    LEFT JOIN teams t ON t.id = c.team_id
    LEFT JOIN league_standings ls ON ls.team_id = c.team_id AND ls.user_id = c.user_id
    WHERE c.user_id = ?
  `, [userId]);
}

async function getById(id) {
  return get('SELECT * FROM clubs WHERE id = ?', [id]);
}

async function updateClub(userId, payload) {
  const club = await getByUserId(userId);
  const name = payload.name?.trim() || club.name;
  const stadiumCapacity = Number(payload.stadium_capacity || club.stadium_capacity);
  return run('UPDATE clubs SET name = ?, stadium_capacity = ? WHERE user_id = ?', [name, stadiumCapacity, userId]);
}

async function table(userId) {
  if (userId) {
    return all(`
      SELECT t.id, t.name, t.short_name, t.logo_url, t.city, t.stadium,
        COALESCE(ls.points, 0) AS points,
        COALESCE(ls.wins, 0) AS wins,
        COALESCE(ls.draws, 0) AS draws,
        COALESCE(ls.losses, 0) AS losses,
        COALESCE(ls.goals_for, 0) AS goals_for,
        COALESCE(ls.goals_against, 0) AS goals_against,
        COALESCE(ls.form, '') AS form,
        (COALESCE(ls.wins, 0) + COALESCE(ls.draws, 0) + COALESCE(ls.losses, 0)) AS played,
        (COALESCE(ls.goals_for, 0) - COALESCE(ls.goals_against, 0)) AS goal_difference
      FROM teams t
      LEFT JOIN league_standings ls ON ls.team_id = t.id AND ls.user_id = ?
      ORDER BY points DESC, goal_difference DESC, goals_for DESC, t.name ASC
    `, [userId]);
  }

  return all(`
    SELECT id, name, short_name, logo_url, city, stadium, points, wins, draws, losses, goals_for, goals_against,
      (wins + draws + losses) AS played,
      (goals_for - goals_against) AS goal_difference
    FROM teams
    ORDER BY points DESC, goal_difference DESC, goals_for DESC, name ASC
  `);
}

module.exports = {
  createClub,
  getByUserId,
  getById,
  updateClub,
  table
};
