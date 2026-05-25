const { all, get } = require('../database');
const { ensureEuropeanSeason, rebuildEuropeanStandings } = require('../utils/europeEngine');

async function main() {
  const club = await get('SELECT team_id FROM clubs WHERE user_id IS NOT NULL ORDER BY id DESC LIMIT 1');
  await ensureEuropeanSeason(club?.team_id || 1);
  await rebuildEuropeanStandings();
  const rows = await all(`
    SELECT id, competition_code, match_day, home_team_id, away_team_id,
      home_european_team_id, away_european_team_id, played
    FROM european_matches
    WHERE season = 2025 AND played = 0
    ORDER BY match_day, id
    LIMIT 80
  `);
  console.log(JSON.stringify(rows, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
