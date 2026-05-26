const express = require('express');
const clubModel = require('../models/clubModel');
const playerModel = require('../models/playerModel');
const { run } = require('../database');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ message: 'Oturum gerekli.' });
  next();
}

router.get('/players', requireAuth, async (req, res, next) => {
  try {
    const club = await clubModel.getByUserId(req.session.userId);
    const players = await playerModel.getClubPlayers(club.id);
    res.json(players);
  } catch (error) {
    next(error);
  }
});

router.put('/players/:id', requireAuth, async (req, res, next) => {
  try {
    const role = ['starter', 'substitute', 'reserve'].includes(req.body.lineup_role) ? req.body.lineup_role : 'reserve';
    const club = await clubModel.getByUserId(req.session.userId);
    const player = await playerModel.getClubPlayer(club.id, req.params.id);
    if (!player) return res.status(404).json({ message: 'Oyuncu bulunamadı.' });

    await playerModel.updatePlayerRole(club.id, req.params.id, role);
    res.json({ message: 'Oyuncu güncellendi.' });
  } catch (error) {
    next(error);
  }
});

router.post('/lineup', requireAuth, async (req, res, next) => {
  try {
    const starterIds = Array.isArray(req.body.starters) ? req.body.starters.map(Number) : [];
    const substituteIds = Array.isArray(req.body.substitutes) ? req.body.substitutes.map(Number) : [];
    if (starterIds.length !== 11) return res.status(400).json({ message: 'İlk 11 için tam 11 oyuncu seçmelisiniz.' });
    if (new Set(starterIds).size !== starterIds.length) return res.status(400).json({ message: 'Ayni oyuncu birden fazla secilemez.' });

    const club = await clubModel.getByUserId(req.session.userId);
    const players = await playerModel.getClubPlayers(club.id);
    const ownedIds = new Set(players.map((player) => player.id));
    const allSelected = [...starterIds, ...substituteIds];
    if (allSelected.some((id) => !ownedIds.has(id))) return res.status(403).json({ message: 'Sadece kendi oyuncularinizi secebilirsiniz.' });

    await playerModel.resetLineup(club.id);
    await run('DELETE FROM lineups WHERE team_id = ?', [club.team_id]);
    for (const id of starterIds) {
      await run("UPDATE players SET lineup_role = 'starter', is_starting_eleven = 1 WHERE id = ? AND team_id = ?", [id, club.team_id]);
    }
    for (const id of substituteIds.slice(0, 7)) {
      if (!starterIds.includes(id)) await run("UPDATE players SET lineup_role = 'substitute', is_starting_eleven = 0 WHERE id = ? AND team_id = ?", [id, club.team_id]);
    }

    res.json({ message: 'Kadro kaydedildi.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;


