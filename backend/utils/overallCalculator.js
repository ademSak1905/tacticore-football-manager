const { positionPenalty } = require('./lineupValidator');

function average(numbers) {
  if (!numbers.length) return 0;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function calculateLineupPower(lineupRows, team) {
  const adjusted = lineupRows.map((row) => {
    const penalty = positionPenalty(row.position, row.position_slot || row.position);
    return Math.max(35, row.overall - penalty);
  });

  return {
    lineupOverall: Math.round(average(adjusted)),
    attack: Math.round((team.attack_overall + average(lineupRows.filter((p) => p.position === 'FWD').map((p) => p.overall))) / 2),
    midfield: Math.round((team.midfield_overall + average(lineupRows.filter((p) => p.position === 'MID').map((p) => p.overall))) / 2),
    defense: Math.round((team.defense_overall + average(lineupRows.filter((p) => p.position === 'DEF').map((p) => p.overall))) / 2),
    goalkeeper: Math.round((team.goalkeeper_overall + average(lineupRows.filter((p) => p.position === 'GK').map((p) => p.overall))) / 2),
    morale: Math.round(average(lineupRows.map((p) => p.morale || 70))),
    stamina: Math.round(average(lineupRows.map((p) => p.stamina || 70)))
  };
}

function calculateTeamStrength(lineupRows, team, options = {}) {
  const power = calculateLineupPower(lineupRows, team);
  const homeBonus = options.home ? 3 : 0;
  const formBonus = (team.form || '').split('').slice(-5).reduce((sum, item) => sum + (item === 'W' ? 1.5 : item === 'D' ? 0.5 : -0.5), 0);
  const conditionBonus = (power.morale - 70) * 0.07 + (power.stamina - 70) * 0.06;
  const tacticBonus = options.tacticFit || 0;
  const sectionAverage = (power.attack + power.midfield + power.defense + power.goalkeeper) / 4;

  return {
    ...power,
    total: Math.round(team.overall * 0.35 + power.lineupOverall * 0.45 + sectionAverage * 0.2 + homeBonus + formBonus + conditionBonus + tacticBonus)
  };
}

module.exports = {
  calculateLineupPower,
  calculateTeamStrength
};
