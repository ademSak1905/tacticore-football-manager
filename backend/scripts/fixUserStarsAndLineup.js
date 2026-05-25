const { all, get, run } = require('../database');
const { formations, validateLineup, slotGroup } = require('../utils/lineupValidator');

async function upsertPlayer(club, name, data, role = 'reserve') {
  const player = await get('SELECT * FROM players WHERE name = ?', [name]);
  if (player) {
    await run(`
      UPDATE players
      SET team_id = ?,
          club_id = ?,
          is_starting_eleven = ?,
          lineup_role = ?,
          transfer_status = 'normal',
          loan_available = 0,
          injured = 0,
          morale = MAX(morale, ?),
          stamina = MAX(stamina, ?)
      WHERE id = ?
    `, [club.team_id, club.id, role === 'starter' ? 1 : 0, role, data.morale, data.stamina, player.id]);
    return;
  }

  await run(`
    INSERT INTO players (
      club_id, team_id, name, age, nationality, position, preferred_foot,
      overall, pace, shooting, passing, dribbling, defending, physical,
      stamina, morale, salary, market_value, potential, contract_until,
      happiness, playing_time, transfer_status, loan_available, injured,
      image_url, is_starting_eleven, lineup_role
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'normal', 0, 0, '', ?, ?)
  `, [
    club.id,
    club.team_id,
    name,
    data.age,
    data.nationality,
    data.position,
    data.preferred_foot,
    data.overall,
    data.pace,
    data.shooting,
    data.passing,
    data.dribbling,
    data.defending,
    data.physical,
    data.stamina,
    data.morale,
    data.salary,
    data.market_value,
    data.potential,
    data.contract_until,
    data.happiness,
    data.playing_time,
    role === 'starter' ? 1 : 0,
    role
  ]);
}

async function upsertStar(club, name, data) {
  return upsertPlayer(club, name, data, 'starter');
}

async function rebuildLineup(club) {
  const players = await all(`
    SELECT *
    FROM players
    WHERE team_id = ?
    ORDER BY
      CASE
        WHEN name = 'Victor Osimhen' THEN 0
        WHEN name = 'Leroy Sané' THEN 1
        ELSE 2
      END,
      is_starting_eleven DESC,
      overall DESC
  `, [club.team_id]);

  const formation = formations[club.default_formation] ? club.default_formation : '4-2-3-1';
  const slots = formations[formation];
  const used = new Set();
  const starters = slots.map((slot) => {
    const group = slotGroup(slot[0]);
    const available = players.filter((player) => !used.has(player.id));
    let player = null;

    if (slot[0] === 'ST') {
      player = available.find((item) => item.name === 'Victor Osimhen');
    }
    if (!player && ['LW', 'RW', 'LM', 'RM'].includes(slot[0])) {
      player = available.find((item) => item.name === 'Leroy Sané');
      if (!player) {
        player = available
          .filter((item) => item.position === 'FWD' && item.name !== 'Victor Osimhen')
          .sort((a, b) => ((b.pace || 0) + (b.dribbling || 0) + (b.passing || 0)) - ((a.pace || 0) + (a.dribbling || 0) + (a.passing || 0)))[0];
      }
    }
    if (!player) {
      player = available.find((item) => item.position === group && (slot[0] === 'ST' || item.name !== 'Victor Osimhen'));
    }
    if (!player && group === 'FWD') {
      player = available.find((item) => item.name === 'Victor Osimhen' || item.name === 'Leroy Sané');
    }
    if (!player) {
      player = available[0];
    }

    if (player) used.add(player.id);
    return player;
  }).filter(Boolean);
  const substitutes = players.filter((player) => !used.has(player.id)).slice(0, 7);
  const validation = validateLineup(starters, formation);
  if (!validation.isValid) {
    throw new Error(`Diziliş için yeterli oyuncu yok. Oyuncu sayısı: ${players.length}`);
  }

  await run('DELETE FROM lineups WHERE team_id = ?', [club.team_id]);
  await run("UPDATE players SET is_starting_eleven = 0, lineup_role = 'reserve' WHERE team_id = ?", [club.team_id]);

  for (const player of substitutes) {
    await run("UPDATE players SET lineup_role = 'substitute', club_id = ? WHERE id = ?", [club.id, player.id]);
  }

  for (const row of validation.lineup) {
    await run('INSERT INTO lineups (team_id, formation, player_id, position_slot, x_position, y_position) VALUES (?, ?, ?, ?, ?, ?)', [
      club.team_id,
      formation,
      row.player.id,
      row.position_slot,
      row.x_position,
      row.y_position
    ]);
    await run("UPDATE players SET is_starting_eleven = 1, lineup_role = 'starter', club_id = ? WHERE id = ?", [club.id, row.player.id]);
  }
}

async function main() {
  const club = await get(`
    SELECT c.*, t.default_formation
    FROM clubs c
    JOIN teams t ON t.id = c.team_id
    WHERE c.user_id IS NOT NULL
    ORDER BY c.id DESC
    LIMIT 1
  `);
  if (!club) throw new Error('Kullanıcı kulübü bulunamadı.');

  await upsertStar(club, 'Victor Osimhen', {
    age: 27,
    nationality: 'Nijerya',
    position: 'FWD',
    preferred_foot: 'right',
    overall: 88,
    pace: 90,
    shooting: 88,
    passing: 74,
    dribbling: 82,
    defending: 45,
    physical: 86,
    stamina: 90,
    morale: 88,
    salary: 4200000,
    market_value: 85000000,
    potential: 90,
    contract_until: 2028,
    happiness: 86,
    playing_time: 88
  });

  await upsertStar(club, 'Leroy Sané', {
    age: 30,
    nationality: 'Almanya',
    position: 'FWD',
    preferred_foot: 'left',
    overall: 84,
    pace: 86,
    shooting: 82,
    passing: 80,
    dribbling: 86,
    defending: 42,
    physical: 70,
    stamina: 86,
    morale: 84,
    salary: 3600000,
    market_value: 38000000,
    potential: 84,
    contract_until: 2028,
    happiness: 84,
    playing_time: 84
  });

  const squadDepth = [
    ['Lucas Torreira', {
      age: 30,
      nationality: 'Uruguay',
      position: 'MID',
      preferred_foot: 'right',
      overall: 82,
      pace: 72,
      shooting: 68,
      passing: 79,
      dribbling: 78,
      defending: 82,
      physical: 78,
      stamina: 88,
      morale: 82,
      salary: 2500000,
      market_value: 18000000,
      potential: 82,
      contract_until: 2028,
      happiness: 82,
      playing_time: 78
    }],
    ['Kaan Ayhan', {
      age: 31,
      nationality: 'Türkiye',
      position: 'DEF',
      preferred_foot: 'right',
      overall: 77,
      pace: 66,
      shooting: 58,
      passing: 72,
      dribbling: 66,
      defending: 78,
      physical: 77,
      stamina: 78,
      morale: 76,
      salary: 1200000,
      market_value: 6500000,
      potential: 77,
      contract_until: 2027,
      happiness: 76,
      playing_time: 55
    }],
    ['Yunus Akgün', {
      age: 25,
      nationality: 'Türkiye',
      position: 'FWD',
      preferred_foot: 'left',
      overall: 77,
      pace: 82,
      shooting: 75,
      passing: 74,
      dribbling: 81,
      defending: 45,
      physical: 65,
      stamina: 80,
      morale: 78,
      salary: 1000000,
      market_value: 9000000,
      potential: 80,
      contract_until: 2028,
      happiness: 78,
      playing_time: 58
    }],
    ['Günay Güvenç', {
      age: 35,
      nationality: 'Türkiye',
      position: 'GK',
      preferred_foot: 'right',
      overall: 72,
      pace: 48,
      shooting: 35,
      passing: 62,
      dribbling: 48,
      defending: 72,
      physical: 70,
      stamina: 74,
      morale: 76,
      salary: 750000,
      market_value: 1200000,
      potential: 72,
      contract_until: 2027,
      happiness: 76,
      playing_time: 35
    }],
    ['Berkan Kutlu', {
      age: 28,
      nationality: 'Türkiye',
      position: 'MID',
      preferred_foot: 'left',
      overall: 75,
      pace: 75,
      shooting: 63,
      passing: 74,
      dribbling: 73,
      defending: 72,
      physical: 76,
      stamina: 84,
      morale: 76,
      salary: 900000,
      market_value: 5000000,
      potential: 76,
      contract_until: 2027,
      happiness: 76,
      playing_time: 48
    }],
    ['Roland Sallai', {
      age: 29,
      nationality: 'Macaristan',
      position: 'FWD',
      preferred_foot: 'right',
      overall: 78,
      pace: 80,
      shooting: 76,
      passing: 75,
      dribbling: 79,
      defending: 52,
      physical: 74,
      stamina: 82,
      morale: 78,
      salary: 1400000,
      market_value: 8500000,
      potential: 78,
      contract_until: 2028,
      happiness: 78,
      playing_time: 56
    }],
    ['Victor Nelsson', {
      age: 27,
      nationality: 'Danimarka',
      position: 'DEF',
      preferred_foot: 'right',
      overall: 77,
      pace: 64,
      shooting: 45,
      passing: 68,
      dribbling: 62,
      defending: 80,
      physical: 79,
      stamina: 79,
      morale: 76,
      salary: 1300000,
      market_value: 7000000,
      potential: 78,
      contract_until: 2027,
      happiness: 76,
      playing_time: 50
    }],
    ['Elias Jelert', {
      age: 23,
      nationality: 'Danimarka',
      position: 'DEF',
      preferred_foot: 'right',
      overall: 74,
      pace: 78,
      shooting: 45,
      passing: 68,
      dribbling: 70,
      defending: 73,
      physical: 68,
      stamina: 80,
      morale: 75,
      salary: 850000,
      market_value: 5500000,
      potential: 80,
      contract_until: 2029,
      happiness: 75,
      playing_time: 42
    }]
  ];

  for (const [name, data] of squadDepth) {
    await upsertPlayer(club, name, data, name === 'Lucas Torreira' ? 'starter' : 'substitute');
  }

  await rebuildLineup(club);

  const stars = await all('SELECT id, name, team_id, club_id, is_starting_eleven, lineup_role FROM players WHERE name IN (?, ?) ORDER BY name', [
    'Leroy Sané',
    'Victor Osimhen'
  ]);
  const lineup = await all(`
    SELECT p.name, l.position_slot
    FROM lineups l
    JOIN players p ON p.id = l.player_id
    WHERE l.team_id = ?
    ORDER BY l.y_position DESC, l.x_position ASC
  `, [club.team_id]);

  console.log(JSON.stringify({ club: { id: club.id, team_id: club.team_id, name: club.name }, stars, lineup }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
