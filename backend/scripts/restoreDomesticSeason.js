const { all, run, get } = require('../database');

const MAX_LEAGUE_DAY = 34 * 7;

function emptyStats(team) {
  return {
    id: team.id,
    points: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goals_for: 0,
    goals_against: 0,
    form: ''
  };
}

function applyResult(stats, gf, ga) {
  stats.goals_for += gf;
  stats.goals_against += ga;
  if (gf > ga) {
    stats.points += 3;
    stats.wins += 1;
    stats.form = `${stats.form}W`.slice(-5);
  } else if (gf === ga) {
    stats.points += 1;
    stats.draws += 1;
    stats.form = `${stats.form}D`.slice(-5);
  } else {
    stats.losses += 1;
    stats.form = `${stats.form}L`.slice(-5);
  }
}

async function main() {
  const teams = await all('SELECT id, name FROM teams ORDER BY id ASC');
  const stats = new Map(teams.map((team) => [team.id, emptyStats(team)]));
  const matches = await all(`
    SELECT *
    FROM matches
    WHERE played = 1 AND match_day <= ?
    ORDER BY match_day ASC, id ASC
  `, [MAX_LEAGUE_DAY]);

  for (const match of matches) {
    const home = stats.get(match.home_club_id);
    const away = stats.get(match.away_club_id);
    if (!home || !away) continue;
    applyResult(home, Number(match.home_score || 0), Number(match.away_score || 0));
    applyResult(away, Number(match.away_score || 0), Number(match.home_score || 0));
  }

  for (const team of stats.values()) {
    await run(`
      UPDATE teams
      SET points = ?, wins = ?, draws = ?, losses = ?, goals_for = ?, goals_against = ?, form = ?
      WHERE id = ?
    `, [team.points, team.wins, team.draws, team.losses, team.goals_for, team.goals_against, team.form, team.id]);
    await run(`
      UPDATE clubs
      SET points = ?, wins = ?, draws = ?, losses = ?, goals_for = ?, goals_against = ?
      WHERE team_id = ?
    `, [team.points, team.wins, team.draws, team.losses, team.goals_for, team.goals_against, team.id]);
  }

  const state = await get('SELECT * FROM game_state WHERE id = 1');
  await run('UPDATE game_state SET week = 35, next_match_day = ?, current_day = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1', [
    Number(state?.next_match_day || 325),
    Number(state?.current_day || 318)
  ]);

  const table = await all(`
    SELECT name, points, wins, draws, losses, goals_for, goals_against
    FROM teams
    ORDER BY points DESC, (goals_for - goals_against) DESC, goals_for DESC, name ASC
    LIMIT 5
  `);
  console.log('DOMESTIC SEASON RESTORE CHECK', {
    countedMatches: matches.length,
    maxLeagueDay: MAX_LEAGUE_DAY,
    state: await get('SELECT current_day, next_match_day, week FROM game_state WHERE id = 1'),
    topFive: table
  });
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
