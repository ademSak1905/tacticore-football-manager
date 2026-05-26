const express = require('express');
const clubModel = require('../models/clubModel');
const { all, get, run } = require('../database');
const { formations, validateLineup } = require('../utils/lineupValidator');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ message: 'Oturum gerekli.' });
  next();
}

router.get('/teams', async (req, res, next) => {
  try {
    res.json(await all('SELECT * FROM teams ORDER BY name'));
  } catch (error) {
    next(error);
  }
});

router.get('/teams/:id', async (req, res, next) => {
  try {
    const team = await get('SELECT * FROM teams WHERE id = ?', [req.params.id]);
    if (!team) return res.status(404).json({ message: 'Takım bulunamadı.' });
    res.json(team);
  } catch (error) {
    next(error);
  }
});

router.get('/teams/:id/players', async (req, res, next) => {
  try {
    res.json(await all('SELECT * FROM players WHERE team_id = ? ORDER BY is_starting_eleven DESC, position, overall DESC', [req.params.id]));
  } catch (error) {
    next(error);
  }
});

router.get('/teams/:id/lineup', async (req, res, next) => {
  try {
    const team = await get('SELECT * FROM teams WHERE id = ?', [req.params.id]);
    let lineup = await all(`
      SELECT l.*, p.name, p.position, p.overall, p.stamina, p.morale
      FROM lineups l
      JOIN players p ON p.id = l.player_id
      WHERE l.team_id = ? AND p.team_id = l.team_id AND p.injured = 0
      ORDER BY l.y_position DESC, l.x_position ASC
    `, [req.params.id]);
    if (!lineup.length && team) {
      const players = await all(`
        SELECT * FROM players
        WHERE team_id = ?
        ORDER BY is_starting_eleven DESC, CASE lineup_role WHEN 'starter' THEN 0 WHEN 'substitute' THEN 1 ELSE 2 END, overall DESC
        LIMIT 11
      `, [req.params.id]);
      const validation = validateLineup(players, team.default_formation || '4-2-3-1');
      lineup = validation.lineup.map((row) => ({
        team_id: Number(req.params.id),
        formation: team.default_formation || '4-2-3-1',
        player_id: row.player.id,
        position_slot: row.position_slot,
        x_position: row.x_position,
        y_position: row.y_position,
        name: row.player.name,
        position: row.player.position,
        overall: row.player.overall,
        stamina: row.player.stamina,
        morale: row.player.morale
      }));
    }
    res.json({ team, lineup, formations });
  } catch (error) {
    next(error);
  }
});

router.post('/teams/:id/lineup', requireAuth, async (req, res, next) => {
  try {
    const club = await clubModel.getByUserId(req.session.userId);
    const teamId = Number(req.params.id);
    if (club.team_id !== teamId) return res.status(403).json({ message: 'Sadece kendi takımınızın dizilişini değiştirebilirsiniz.' });

    const formation = formations[req.body.formation] ? req.body.formation : club.default_formation;
    const playerIds = Array.isArray(req.body.playerIds) ? req.body.playerIds.map(Number).slice(0, 11) : [];
    const players = playerIds.length
      ? await all(`SELECT * FROM players WHERE team_id = ? AND id IN (${playerIds.map(() => '?').join(',')})`, [teamId, ...playerIds])
      : await all('SELECT * FROM players WHERE team_id = ? ORDER BY is_starting_eleven DESC, overall DESC LIMIT 11', [teamId]);
    const ordered = playerIds.map((id) => players.find((player) => player.id === id)).filter(Boolean);
    const validation = validateLineup(ordered.length ? ordered : players, formation);
    if (!validation.isValid) return res.status(400).json({ message: 'Diziliş için 11 farklı oyuncu seçmelisiniz.', warnings: validation.warnings });

    await run('DELETE FROM lineups WHERE team_id = ?', [teamId]);
    await run('UPDATE players SET is_starting_eleven = 0, lineup_role = "reserve" WHERE team_id = ?', [teamId]);
    for (const row of validation.lineup) {
      await run('INSERT INTO lineups (team_id, formation, player_id, position_slot, x_position, y_position) VALUES (?, ?, ?, ?, ?, ?)', [
        teamId, formation, row.player.id, row.position_slot, row.x_position, row.y_position
      ]);
      await run('UPDATE players SET is_starting_eleven = 1, lineup_role = "starter" WHERE id = ?', [row.player.id]);
    }
    await run('UPDATE teams SET default_formation = ? WHERE id = ?', [formation, teamId]);
    res.json({ message: 'Diziliş kaydedildi.', warnings: validation.warnings });
  } catch (error) {
    next(error);
  }
});

router.get('/formations', (req, res) => {
  res.json(Object.keys(formations).map((name) => ({ name, slots: formations[name] })));
});

module.exports = router;


