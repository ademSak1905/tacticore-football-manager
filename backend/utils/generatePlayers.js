const firstNames = ['Arda', 'Mert', 'Emir', 'Kerem', 'Deniz', 'Efe', 'Bora', 'Kaan', 'Yigit', 'Can', 'Ozan', 'Eren', 'Tuna', 'Alp'];
const lastNames = ['Demir', 'Yilmaz', 'Kaya', 'Celik', 'Aydin', 'Sahin', 'Koc', 'Arslan', 'Gunes', 'Aksoy', 'Polat', 'Uslu'];

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(value, min = 1, max = 99) {
  return Math.max(min, Math.min(max, value));
}

function name(index = 0) {
  return `${firstNames[rand(0, firstNames.length - 1)]} ${lastNames[rand(0, lastNames.length - 1)]} ${index ? index : ''}`.trim();
}

function createPlayer(position, strength, index, role = 'reserve') {
  const base = clamp(strength + rand(-7, 8), 35, 88);
  const shootingBonus = position === 'FWD' ? 9 : position === 'MID' ? 2 : -6;
  const passingBonus = position === 'MID' ? 8 : position === 'DEF' ? 1 : 0;
  const defendingBonus = position === 'DEF' ? 10 : position === 'GK' ? 12 : -7;
  const paceBonus = position === 'FWD' ? 5 : position === 'DEF' ? -1 : 2;

  return {
    name: name(index),
    age: rand(18, 34),
    position,
    overall: base,
    pace: clamp(base + paceBonus + rand(-6, 6)),
    shooting: clamp(base + shootingBonus + rand(-7, 6)),
    passing: clamp(base + passingBonus + rand(-6, 7)),
    defending: clamp(base + defendingBonus + rand(-6, 6)),
    stamina: clamp(base + rand(-5, 10)),
    morale: clamp(62 + rand(-12, 18)),
    salary: Math.round((base * 900 + rand(5000, 18000)) / 100) * 100,
    market_value: Math.round((base * base * 950 + rand(150000, 900000)) / 1000) * 1000,
    injured: false,
    lineup_role: role
  };
}

function createPlayerBatch(strength = 60) {
  const squadPlan = [
    { position: 'GK', count: 2, starters: 1, substitutes: 1 },
    { position: 'DEF', count: 6, starters: 4, substitutes: 2 },
    { position: 'MID', count: 6, starters: 4, substitutes: 2 },
    { position: 'FWD', count: 4, starters: 2, substitutes: 2 }
  ];
  const players = [];
  let index = 1;

  for (const plan of squadPlan) {
    const { position, count, starters, substitutes } = plan;
    for (let i = 0; i < count; i += 1) {
      const role = i < starters ? 'starter' : i < starters + substitutes ? 'substitute' : 'reserve';
      players.push(createPlayer(position, strength, index, role));
      index += 1;
    }
  }

  return players;
}

function createMarketPlayers(count = 20) {
  const positions = ['GK', 'DEF', 'MID', 'FWD'];
  return Array.from({ length: count }, (_, index) => createPlayer(positions[index % positions.length], rand(54, 78), index + 60));
}

module.exports = {
  createPlayerBatch,
  createMarketPlayers
};
