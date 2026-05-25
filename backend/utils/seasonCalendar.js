const SEASON_START = new Date(Date.UTC(2025, 7, 1));

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

module.exports = {
  seasonDate,
  withSeasonDates
};
