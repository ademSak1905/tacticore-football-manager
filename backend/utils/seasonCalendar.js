const SEASON_START = new Date(Date.UTC(2025, 8, 1));
const FIRST_LEAGUE_MATCH_DAY = 7;
const LEAGUE_MATCH_INTERVAL = 8;

function seasonDate(day) {
  const safeDay = Math.max(1, Number(day) || 1);
  const date = new Date(SEASON_START);
  date.setUTCDate(SEASON_START.getUTCDate() + safeDay - 1);
  return date.toISOString().slice(0, 10);
}

function withSeasonDates(state) {
  return {
    ...state,
    current_date: seasonDate(state.current_day),
    next_match_date: seasonDate(state.next_match_day)
  };
}

function leagueMatchDay(week = 1) {
  return FIRST_LEAGUE_MATCH_DAY + (Math.max(1, Number(week) || 1) - 1) * LEAGUE_MATCH_INTERVAL;
}

module.exports = {
  seasonDate,
  withSeasonDates,
  leagueMatchDay,
  FIRST_LEAGUE_MATCH_DAY,
  LEAGUE_MATCH_INTERVAL
};
