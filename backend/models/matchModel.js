const { all, get } = require('../database');

async function listForClub(clubId) {
  return all(`
    SELECT m.*, h.name AS home_name, a.name AS away_name
    FROM matches m
    JOIN clubs h ON h.id = m.home_club_id
    JOIN clubs a ON a.id = m.away_club_id
    WHERE m.home_club_id = ? OR m.away_club_id = ?
    ORDER BY m.match_date DESC, m.id DESC
    LIMIT 20
  `, [clubId, clubId]);
}

async function getMatch(matchId) {
  return get(`
    SELECT m.*, h.name AS home_name, a.name AS away_name
    FROM matches m
    JOIN clubs h ON h.id = m.home_club_id
    JOIN clubs a ON a.id = m.away_club_id
    WHERE m.id = ?
  `, [matchId]);
}

async function getEvents(matchId) {
  return all('SELECT minute, event_text FROM match_events WHERE match_id = ? ORDER BY minute ASC', [matchId]);
}

module.exports = {
  listForClub,
  getMatch,
  getEvents
};
