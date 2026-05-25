const { run, get, all } = require('../database');

const teamTraining = {
  attack: { text: 'Hücum organizasyonu gelişti', columns: ['shooting', 'passing'] },
  defense: { text: 'Savunma yerleşimi gelişti', columns: ['defending', 'physical'] },
  pressing: { text: 'Pres çalışması takıma enerji kattı', columns: ['stamina', 'defending'] },
  passing: { text: 'Pas oyunu gelişti', columns: ['passing', 'dribbling'] },
  fitness: { text: 'Kondisyon çalışması tamamlandı', columns: ['stamina', 'physical'] },
  set_piece: { text: 'Duran top varyasyonları çalışıldı', columns: ['shooting', 'passing'] },
  shooting: { text: 'Şut çalışması tamamlandı', columns: ['shooting'] },
  morale: { text: 'Takım morali yükseldi', columns: ['morale'] }
};

const playerTraining = {
  pace: 'pace',
  finishing: 'shooting',
  passing: 'passing',
  dribbling: 'dribbling',
  defense: 'defending',
  physical: 'physical',
  stamina: 'stamina',
  goalkeeping: 'defending'
};

function growthFor(player, intensity) {
  const ageBonus = player.age <= 23 ? 1 : player.age >= 32 ? -1 : 0;
  const moraleBonus = player.morale < 55 ? -1 : player.morale > 78 ? 1 : 0;
  const intensityBonus = intensity === 'heavy' ? 2 : intensity === 'light' ? 0 : 1;
  return Math.max(1, intensityBonus + ageBonus + moraleBonus);
}

async function record(clubId, playerId, text) {
  await run('INSERT INTO training_results (club_id, player_id, result_text) VALUES (?, ?, ?)', [clubId, playerId || null, text]);
}

async function applyTeamTraining(club, type, intensity) {
  const config = teamTraining[type] || teamTraining.fitness;
  const players = await all('SELECT * FROM players WHERE team_id = ?', [club.team_id]);
  const results = [config.text];

  for (const player of players) {
    if (player.injured) continue;
    const growth = growthFor(player, intensity);
    for (const column of config.columns) {
      await run(`UPDATE players SET ${column} = MIN(99, ${column} + ?) WHERE id = ?`, [growth, player.id]);
    }
  }

  if (intensity === 'heavy') {
    await run('UPDATE players SET stamina = MAX(35, stamina - 5) WHERE team_id = ? AND injured = 0', [club.team_id]);
    results.push('Ağır antrenman nedeniyle kondisyon -5');
  }
  if (type === 'morale') {
    await run('UPDATE players SET morale = MIN(99, morale + 3) WHERE team_id = ?', [club.team_id]);
    results.push('Takım morali +3');
  }

  await run('INSERT INTO training (club_id, type, intensity) VALUES (?, ?, ?)', [club.id, type, intensity]);
  for (const text of results) await record(club.id, null, text);
  return results;
}

async function applyPlayerTraining(club, playerId, type, intensity) {
  const player = await get('SELECT * FROM players WHERE id = ? AND team_id = ?', [playerId, club.team_id]);
  if (!player) throw new Error('Oyuncu bulunamadı.');
  if (player.injured) throw new Error('Sakat oyuncu antrenman yapamaz.');

  const column = playerTraining[type] || 'stamina';
  const growth = growthFor(player, intensity);
  await run(`UPDATE players SET ${column} = MIN(99, ${column} + ?), stamina = MAX(35, stamina - ?) WHERE id = ?`, [
    growth,
    intensity === 'heavy' ? 4 : intensity === 'normal' ? 2 : 0,
    player.id
  ]);
  const text = `${player.name} +${growth} ${column}`;
  await run('INSERT INTO training (club_id, player_id, type, intensity) VALUES (?, ?, ?, ?)', [club.id, player.id, type, intensity]);
  await record(club.id, player.id, text);
  return [text, intensity === 'heavy' ? 'Ağır bireysel antrenman kondisyonu düşürdü' : 'Bireysel çalışma tamamlandı'];
}

module.exports = {
  applyTeamTraining,
  applyPlayerTraining
};


