const {
  db,
  initDatabase,
  run,
  get,
  all,
  ensureCareerForUser,
  ensureInitialCareerSave,
  createCareerSave,
  restoreCareerSave
} = require('../database');
const {
  ensureEuropeanSeason,
  maybeCreateEuropeanKnockoutsForAll,
  playDueEuropeanMatch
} = require('../utils/europeEngine');

function closeDb() {
  return new Promise((resolve, reject) => {
    db.close((error) => (error ? reject(error) : resolve()));
  });
}

async function phaseCount(userId, phase) {
  const row = await get(
    "SELECT COUNT(*) AS count FROM european_matches WHERE user_id = ? AND competition_code = 'UCL' AND phase = ?",
    [userId, phase]
  );
  return Number(row?.count || 0);
}

async function markPhasePlayed(userId, phase) {
  const matches = await all(
    "SELECT id FROM european_matches WHERE user_id = ? AND competition_code = 'UCL' AND phase = ? ORDER BY id ASC",
    [userId, phase]
  );
  for (let index = 0; index < matches.length; index += 1) {
    await run(
      'UPDATE european_matches SET played = 1, home_score = ?, away_score = ? WHERE id = ?',
      [index % 2 ? 1 : 2, index % 2 ? 2 : 1, matches[index].id]
    );
  }
}

async function createTestCareer(label, teamId, points) {
  const stamp = `${Date.now()}_${label}`;
  const user = await run(
    'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
    [`europe_${stamp}`, `europe_${stamp}@test.local`, 'test']
  );
  await run(
    'INSERT INTO clubs (user_id, team_id, name, budget, fans) VALUES (?, ?, ?, 5000000, 15000)',
    [user.id, teamId, `Europe Test ${stamp}`]
  );
  await ensureCareerForUser(user.id);
  await run('UPDATE league_standings SET points = 0, wins = 0, draws = 0, losses = 0 WHERE user_id = ?', [user.id]);
  await run('UPDATE league_standings SET points = ?, wins = 20 WHERE user_id = ? AND team_id = ?', [points, user.id, teamId]);
  return user.id;
}

async function main() {
  await initDatabase();
  await run('BEGIN IMMEDIATE TRANSACTION');
  try {
    const teams = await all('SELECT id FROM teams ORDER BY overall DESC, name ASC LIMIT 2');
    if (teams.length < 2) throw new Error('Test icin yeterli takim bulunamadi.');

    const userA = await createTestCareer('a', teams[0].id, 99);
    const userB = await createTestCareer('b', teams[1].id, 98);

    await ensureEuropeanSeason(userA, teams[0].id);
    await ensureEuropeanSeason(userB, teams[1].id);

    const counts = await all('SELECT user_id, COUNT(*) AS count FROM european_matches WHERE user_id IN (?, ?) GROUP BY user_id', [userA, userB]);
    if (counts.length !== 2 || counts.some((row) => Number(row.count) === 0)) {
      throw new Error('Avrupa fiksturu kullanici bazinda olusmadi.');
    }

    const firstDue = await get(
      "SELECT * FROM european_matches WHERE user_id = ? AND competition_code = 'UCL' AND phase = 'league' AND played = 0 AND (home_team_id = ? OR away_team_id = ?) ORDER BY match_day ASC LIMIT 1",
      [userA, teams[0].id, teams[0].id]
    );
    if (!firstDue) throw new Error('UCL kullanici maci bulunamadi.');
    await run('UPDATE career_states SET current_day = ?, next_match_day = ? WHERE user_id = ?', [firstDue.match_day, firstDue.match_day + 1, userA]);
    await playDueEuropeanMatch(userA, teams[0].id, firstDue.match_day);
    const shifted = await get('SELECT next_match_day FROM career_states WHERE user_id = ?', [userA]);
    if (Number(shifted.next_match_day) !== Number(firstDue.match_day) + 3) {
      throw new Error('Lig-Avrupa cakisma kaydinda kullanici takvimi kaydirilmadi.');
    }

    await run("UPDATE european_matches SET played = 1, home_score = 2, away_score = 1 WHERE user_id = ? AND competition_code = 'UCL' AND phase = 'league'", [userA]);
    const standings = await all("SELECT id FROM european_standings WHERE user_id = ? AND competition_code = 'UCL' ORDER BY id ASC", [userA]);
    for (let index = 0; index < standings.length; index += 1) {
      await run('UPDATE european_standings SET played = 6, points = ?, goals_for = ?, goals_against = ? WHERE id = ?', [60 - index, 20 - (index % 6), index % 5, standings[index].id]);
    }

    await maybeCreateEuropeanKnockoutsForAll(userA);
    const expected = [
      ['round_of_16', 16],
      ['quarter_final', 8],
      ['semi_final', 4],
      ['final', 1]
    ];
    if (await phaseCount(userA, 'round_of_16') !== 16) throw new Error('Son 16 eslesmeleri eksik.');
    for (const [phase, count] of expected.slice(0, -1)) {
      await markPhasePlayed(userA, phase);
      await maybeCreateEuropeanKnockoutsForAll(userA);
      const next = expected[expected.findIndex((item) => item[0] === phase) + 1];
      if ((await phaseCount(userA, next[0])) !== next[1]) throw new Error(`${next[0]} eslesmeleri eksik.`);
      if ((await phaseCount(userB, next[0])) !== 0) throw new Error('Avrupa eleme turlari baska kullaniciya karisti.');
    }

    const firstSave = await ensureInitialCareerSave(userA);
    await createCareerSave(userA, teams[1].id, 'Europe Save Test');
    await restoreCareerSave(userA, firstSave.id);
    if ((await phaseCount(userA, 'final')) !== 1) {
      throw new Error('Kariyer kaydi Avrupa final fiksturunu geri yuklemedi.');
    }

    console.log(JSON.stringify({
      ok: true,
      checks: {
        isolatedUsers: counts.map((row) => ({ userId: row.user_id, matches: row.count })),
        clashShiftedToCareerDay: shifted.next_match_day,
        roundOf16: await phaseCount(userA, 'round_of_16'),
        quarterFinal: await phaseCount(userA, 'quarter_final'),
        semiFinal: await phaseCount(userA, 'semi_final'),
        final: await phaseCount(userA, 'final')
      }
    }));
  } finally {
    await run('ROLLBACK');
    await closeDb();
  }
}

main().catch(async (error) => {
  try {
    await run('ROLLBACK');
  } catch {}
  try {
    await closeDb();
  } catch {}
  console.error(error);
  process.exit(1);
});
