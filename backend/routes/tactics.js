const express = require('express');
const clubModel = require('../models/clubModel');
const { all, get, run } = require('../database');
const { FORMATIONS, ATTACK_STYLES, DEFENSE_STYLES, TEMPOS, normalizeTactic } = require('../utils/tacticEngine');
const { validateLineup } = require('../utils/lineupValidator');

const router = express.Router();
const formations = Object.keys(FORMATIONS).filter((item) => item !== 'custom');
const mentalities = ['defensive', 'balanced', 'attacking'];
const passingStyles = ['short', 'mixed', 'direct'];
const attackStyles = Object.keys(ATTACK_STYLES);
const defenseStyles = Object.keys(DEFENSE_STYLES);
const tempoLabels = Object.keys(TEMPOS);

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ message: 'Oturum gerekli.' });
  next();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || min));
}

async function rebuildLineupForFormation(teamId, formation) {
  const current = await all(`
    SELECT p.*
    FROM lineups l
    JOIN players p ON p.id = l.player_id
    WHERE l.team_id = ?
    ORDER BY l.y_position DESC, l.x_position ASC
  `, [teamId]);
  const fallback = await all(`
    SELECT *
    FROM players
    WHERE team_id = ?
    ORDER BY is_starting_eleven DESC, CASE lineup_role WHEN 'starter' THEN 0 ELSE 1 END, overall DESC
    LIMIT 11
  `, [teamId]);
  const selected = (current.length >= 11 ? current : fallback).slice(0, 11);
  const validation = validateLineup(selected, formation);
  if (!validation.isValid) return { updated: false, warnings: validation.warnings };

  await run('DELETE FROM lineups WHERE team_id = ?', [teamId]);
  for (const slot of validation.lineup) {
    await run(`
      INSERT INTO lineups (team_id, player_id, formation, position_slot, x_position, y_position)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [teamId, slot.player.id, formation, slot.position_slot, slot.x_position, slot.y_position]);
  }
  await run("UPDATE players SET is_starting_eleven = 0, lineup_role = 'reserve' WHERE team_id = ?", [teamId]);
  for (const slot of validation.lineup) {
    await run("UPDATE players SET is_starting_eleven = 1, lineup_role = 'starter' WHERE id = ?", [slot.player.id]);
  }
  return { updated: true, warnings: validation.warnings };
}

router.use(requireAuth);

router.get('/formations', async (req, res) => {
  res.json({
    formations: Object.entries(FORMATIONS).map(([id, item]) => ({ id, ...item })),
    attackStyles: Object.entries(ATTACK_STYLES).map(([id, label]) => ({ id, label })),
    defenseStyles: Object.entries(DEFENSE_STYLES).map(([id, label]) => ({ id, label })),
    tempos: Object.entries(TEMPOS).map(([id, item]) => ({ id, label: item.label, value: item.value }))
  });
});

router.get('/', async (req, res, next) => {
  try {
    const club = await clubModel.getByUserId(req.session.userId);
    const tactic = await get('SELECT * FROM tactics WHERE club_id = ?', [club.id]);
    res.json(normalizeTactic(tactic || {}, club));
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const club = await clubModel.getByUserId(req.session.userId);
    const formation = formations.includes(req.body.formation) ? req.body.formation : '4-4-2';
    const mentality = mentalities.includes(req.body.mentality) ? req.body.mentality : 'balanced';
    const passingStyle = passingStyles.includes(req.body.passing_style) ? req.body.passing_style : 'mixed';
    const attackStyle = attackStyles.includes(req.body.attack_style) ? req.body.attack_style : 'balanced';
    const defenseStyle = defenseStyles.includes(req.body.defense_style) ? req.body.defense_style : 'zonal';
    const tempoLabel = tempoLabels.includes(req.body.tempo_label) ? req.body.tempo_label : 'normal';
    const pressing = clamp(req.body.pressing, 0, 100);
    const defensiveLine = clamp(req.body.defensive_line, 0, 100);
    const aggression = clamp(req.body.aggression, 0, 100);
    const width = clamp(req.body.width, 0, 100);
    const tempo = clamp(req.body.tempo, 1, 100);

    await run(`
      INSERT INTO tactics
        (club_id, formation, mentality, attack_style, defense_style, pressing, passing_style, tempo,
         tempo_label, defensive_line, aggression, width)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(club_id) DO UPDATE SET
        formation = excluded.formation,
        mentality = excluded.mentality,
        attack_style = excluded.attack_style,
        defense_style = excluded.defense_style,
        pressing = excluded.pressing,
        passing_style = excluded.passing_style,
        tempo = excluded.tempo,
        tempo_label = excluded.tempo_label,
        defensive_line = excluded.defensive_line,
        aggression = excluded.aggression,
        width = excluded.width
    `, [
      club.id, formation, mentality, attackStyle, defenseStyle, pressing, passingStyle, tempo,
      tempoLabel, defensiveLine, aggression, width
    ]);

    await run('UPDATE teams SET default_formation = ? WHERE id = ?', [formation, club.team_id]);
    const lineupUpdate = await rebuildLineupForFormation(club.team_id, formation);

    const tactic = await get('SELECT * FROM tactics WHERE club_id = ?', [club.id]);
    res.json({ ...normalizeTactic(tactic, club), lineupUpdated: lineupUpdate.updated, lineupWarnings: lineupUpdate.warnings });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
