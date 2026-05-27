const { all, getCareerState, run } = require('../database');
const { leagueMatchDay } = require('./seasonCalendar');

async function europeanMatchDaySet(userId, teamId) {
  const rows = await all(`
    SELECT DISTINCT match_day
    FROM european_matches
    WHERE user_id = ? AND (home_team_id = ? OR away_team_id = ?)
  `, [userId, teamId, teamId]);
  return new Set(rows.map((row) => Number(row.match_day)).filter((day) => Number.isFinite(day) && day > 0));
}

function hasEuropeanConflict(day, euroDays) {
  for (const euroDay of euroDays) {
    if (Math.abs(Number(euroDay) - Number(day)) <= 1) return true;
  }
  return false;
}

function avoidEuropeanConflict(baseDay, euroDays) {
  let day = Number(baseDay || 1);
  let guard = 0;
  while (hasEuropeanConflict(day, euroDays) && guard < 6) {
    day += 3;
    guard += 1;
  }
  return day;
}

async function adjustedLeagueMatchDay(userId, teamId, week, existingEuroDays = null) {
  const euroDays = existingEuroDays || await europeanMatchDaySet(userId, teamId);
  return avoidEuropeanConflict(leagueMatchDay(week), euroDays);
}

async function syncCareerLeagueMatchDay(userId, teamId, state, totalLeagueWeeks) {
  let currentState = state || await getCareerState(userId);
  if (Number(currentState.week || 1) > Number(totalLeagueWeeks || 0)) return currentState;
  const expectedDay = await adjustedLeagueMatchDay(userId, teamId, currentState.week || 1);
  if (Number(currentState.next_match_day || 0) !== expectedDay) {
    await run('UPDATE career_states SET next_match_day = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?', [expectedDay, userId]);
    currentState = await getCareerState(userId);
  }
  return currentState;
}

async function leagueMatchDayMap(userId, teamId, startWeek, totalLeagueWeeks) {
  const euroDays = await europeanMatchDaySet(userId, teamId);
  const days = new Map();
  for (let week = Number(startWeek || 1); week <= Number(totalLeagueWeeks || 0); week += 1) {
    days.set(week, avoidEuropeanConflict(leagueMatchDay(week), euroDays));
  }
  return days;
}

module.exports = {
  adjustedLeagueMatchDay,
  leagueMatchDayMap,
  syncCareerLeagueMatchDay
};
