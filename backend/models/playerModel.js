const { all, get, run } = require('../database');

async function getClubPlayers(clubId) {
  const club = await get('SELECT * FROM clubs WHERE id = ?', [clubId]);
  if (club?.team_id) {
    return all('SELECT * FROM players WHERE team_id = ? ORDER BY is_starting_eleven DESC, position, overall DESC, name', [club.team_id]);
  }
  return all('SELECT * FROM players WHERE club_id = ? ORDER BY position, overall DESC, name', [clubId]);
}

async function getClubPlayer(clubId, playerId) {
  const club = await get('SELECT * FROM clubs WHERE id = ?', [clubId]);
  if (club?.team_id) return get('SELECT * FROM players WHERE id = ? AND team_id = ?', [playerId, club.team_id]);
  return get('SELECT * FROM players WHERE id = ? AND club_id = ?', [playerId, clubId]);
}

async function updatePlayerRole(clubId, playerId, role) {
  const club = await get('SELECT * FROM clubs WHERE id = ?', [clubId]);
  if (club?.team_id) return run('UPDATE players SET lineup_role = ?, is_starting_eleven = ? WHERE id = ? AND team_id = ?', [role, role === 'starter' ? 1 : 0, playerId, club.team_id]);
  return run('UPDATE players SET lineup_role = ? WHERE id = ? AND club_id = ?', [role, playerId, clubId]);
}

async function resetLineup(clubId) {
  const club = await get('SELECT * FROM clubs WHERE id = ?', [clubId]);
  if (club?.team_id) return run("UPDATE players SET lineup_role = 'reserve', is_starting_eleven = 0 WHERE team_id = ?", [club.team_id]);
  return run("UPDATE players SET lineup_role = 'reserve' WHERE club_id = ?", [clubId]);
}

async function averageStarterPower(clubId) {
  const club = await get('SELECT * FROM clubs WHERE id = ?', [clubId]);
  const ownerClause = club?.team_id ? 'team_id = ?' : 'club_id = ?';
  const ownerId = club?.team_id || clubId;
  const row = await get(`
    SELECT AVG(overall) AS power, AVG(stamina) AS stamina, AVG(morale) AS morale
    FROM (
      SELECT overall, stamina, morale
      FROM players
      WHERE ${ownerClause} AND injured = 0
      ORDER BY is_starting_eleven DESC, CASE lineup_role WHEN 'starter' THEN 0 ELSE 1 END, overall DESC
      LIMIT 11
    )
  `, [ownerId]);

  return {
    power: Number(row?.power || 45),
    stamina: Number(row?.stamina || 50),
    morale: Number(row?.morale || 50)
  };
}

module.exports = {
  getClubPlayers,
  getClubPlayer,
  updatePlayerRole,
  resetLineup,
  averageStarterPower
};
