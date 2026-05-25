const formations = {
  '4-4-2': [
    ['GK', 50, 92], ['LB', 18, 72], ['CB', 39, 75], ['CB', 61, 75], ['RB', 82, 72],
    ['LM', 18, 48], ['CM', 39, 50], ['CM', 61, 50], ['RM', 82, 48], ['ST', 42, 22], ['ST', 58, 22]
  ],
  '4-3-3': [
    ['GK', 50, 92], ['LB', 18, 72], ['CB', 39, 75], ['CB', 61, 75], ['RB', 82, 72],
    ['CM', 32, 51], ['CM', 50, 55], ['CM', 68, 51], ['LW', 23, 24], ['ST', 50, 20], ['RW', 77, 24]
  ],
  '4-2-3-1': [
    ['GK', 50, 92], ['LB', 18, 72], ['CB', 39, 75], ['CB', 61, 75], ['RB', 82, 72],
    ['DM', 40, 58], ['DM', 60, 58], ['AM', 50, 39], ['LW', 24, 33], ['RW', 76, 33], ['ST', 50, 18]
  ],
  '3-5-2': [
    ['GK', 50, 92], ['CB', 30, 75], ['CB', 50, 78], ['CB', 70, 75], ['LM', 18, 49],
    ['CM', 38, 52], ['CM', 50, 48], ['CM', 62, 52], ['RM', 82, 49], ['ST', 42, 20], ['ST', 58, 20]
  ],
  '3-4-3': [
    ['GK', 50, 92], ['CB', 30, 75], ['CB', 50, 78], ['CB', 70, 75], ['LM', 25, 52],
    ['CM', 43, 52], ['CM', 57, 52], ['RM', 75, 52], ['LW', 25, 22], ['ST', 50, 18], ['RW', 75, 22]
  ],
  '5-3-2': [
    ['GK', 50, 92], ['LWB', 13, 70], ['CB', 32, 77], ['CB', 50, 80], ['CB', 68, 77], ['RWB', 87, 70],
    ['CM', 34, 50], ['CM', 50, 54], ['CM', 66, 50], ['ST', 42, 20], ['ST', 58, 20]
  ],
  '4-1-2-1-2': [
    ['GK', 50, 92], ['LB', 18, 72], ['CB', 39, 75], ['CB', 61, 75], ['RB', 82, 72],
    ['DM', 50, 60], ['CM', 38, 47], ['CM', 62, 47], ['AM', 50, 35], ['ST', 42, 18], ['ST', 58, 18]
  ],
  '4-5-1': [
    ['GK', 50, 92], ['LB', 18, 72], ['CB', 39, 75], ['CB', 61, 75], ['RB', 82, 72],
    ['LM', 18, 48], ['CM', 37, 52], ['CM', 50, 55], ['CM', 63, 52], ['RM', 82, 48], ['ST', 50, 18]
  ],
  '4-1-4-1': [
    ['GK', 50, 92], ['LB', 18, 72], ['CB', 39, 75], ['CB', 61, 75], ['RB', 82, 72],
    ['DM', 50, 61], ['LM', 22, 42], ['CM', 42, 45], ['CM', 58, 45], ['RM', 78, 42], ['ST', 50, 18]
  ]
};

function slotGroup(slot) {
  if (slot === 'GK') return 'GK';
  if (['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(slot)) return 'DEF';
  if (['DM', 'CM', 'AM', 'LM', 'RM'].includes(slot)) return 'MID';
  return 'FWD';
}

function positionPenalty(playerPosition, slot) {
  return playerPosition === slotGroup(slot) ? 0 : playerPosition === 'MID' && slotGroup(slot) !== 'GK' ? 4 : 9;
}

function validateLineup(players, formation) {
  const slots = formations[formation] || formations['4-2-3-1'];
  const selected = players.slice(0, 11);
  const used = new Set();
  const warnings = [];

  const lineup = slots.map((slot, index) => {
    const player = selected[index];
    if (!player) warnings.push(`${slot[0]} slotu bos kaldi.`);
    if (player && used.has(player.id)) warnings.push(`${player.name} birden fazla kullanildi.`);
    if (player) used.add(player.id);

    const penalty = player ? positionPenalty(player.position, slot[0]) : 0;
    if (player && penalty > 0) warnings.push(`${player.name} ${slot[0]} slotunda oynadigi için overall -${penalty}.`);

    return {
      player,
      position_slot: slot[0],
      x_position: slot[1],
      y_position: slot[2],
      penalty
    };
  });

  return { lineup, warnings, isValid: selected.length === 11 && new Set(selected.map((player) => player.id)).size === 11 };
}

module.exports = {
  formations,
  validateLineup,
  positionPenalty,
  slotGroup
};

