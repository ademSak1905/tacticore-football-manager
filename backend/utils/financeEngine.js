const INTERNAL_EUR_RATE = 35;

const CLUB_MARKET_VALUES_EUR = {
  Galatasaray: 305000000,
  Fenerbahçe: 285000000,
  'Fenerbahce': 285000000,
  Beşiktaş: 165000000,
  Besiktas: 165000000,
  Trabzonspor: 112000000,
  'İstanbul Başakşehir': 68000000,
  'Istanbul Basaksehir': 68000000,
  Samsunspor: 52000000,
  Göztepe: 47000000,
  Goztepe: 47000000,
  Eyüpspor: 43000000,
  Eyupspor: 43000000,
  Konyaspor: 36000000,
  'Çaykur Rizespor': 34000000,
  'Caykur Rizespor': 34000000,
  Antalyaspor: 33000000,
  Gaziantep: 32000000,
  'Gaziantep FK': 32000000,
  Kasımpaşa: 30000000,
  Kasimpasa: 30000000,
  Alanyaspor: 28500000,
  Kayserispor: 26000000,
  Kocaelispor: 23000000,
  'Fatih Karagümrük': 22000000,
  'Fatih Karagumruk': 22000000,
  Gençlerbirliği: 20000000,
  Genclerbirligi: 20000000
};

Object.assign(CLUB_MARKET_VALUES_EUR, {
  Galatasaray: 344750000,
  ['Fenerbah\u00e7e']: 247900000,
  Fenerbahce: 247900000,
  ['Be\u015fikta\u015f']: 185100000,
  Besiktas: 185100000,
  'Besiktas JK': 185100000,
  Trabzonspor: 114500000,
  ['\u0130stanbul Ba\u015fak\u015fehir']: 72100000,
  'Istanbul Basaksehir': 72100000,
  'Basaksehir FK': 72100000,
  ['G\u00f6ztepe']: 57125000,
  Goztepe: 57125000,
  Samsunspor: 52350000,
  ['\u00c7aykur Rizespor']: 40000000,
  'Caykur Rizespor': 40000000,
  Konyaspor: 37650000,
  Alanyaspor: 30850000,
  Gaziantep: 30000000,
  'Gaziantep FK': 30000000,
  Kayserispor: 27900000,
  ['Kas\u0131mpa\u015fa']: 27750000,
  Kasimpasa: 27750000,
  ['Gen\u00e7lerbirli\u011fi']: 27250000,
  Genclerbirligi: 27250000,
  'Genclerbirligi Ankara': 27250000,
  Kocaelispor: 25500000,
  Antalyaspor: 22400000,
  ['Fatih Karag\u00fcmr\u00fck']: 14850000,
  'Fatih Karagumruk': 14850000,
  ['Ey\u00fcpspor']: 13750000,
  Eyupspor: 13750000
});

function seededRatio(seed) {
  const raw = Math.sin(Number(seed || 1) * 999) * 10000;
  return raw - Math.floor(raw);
}

function roundInternalEuro(value, step = 50000) {
  const euro = Math.max(0, Number(value || 0) / INTERNAL_EUR_RATE);
  return Math.round(Math.round(euro / step) * step * INTERNAL_EUR_RATE);
}

function toInternalEuro(value) {
  return Math.round(Number(value || 0) * INTERNAL_EUR_RATE);
}

function normalizeInternalMoney(value, euroThreshold = 250000000) {
  const numeric = Number(value || 0);
  if (!numeric) return 0;
  return numeric < euroThreshold ? toInternalEuro(numeric) : Math.round(numeric);
}

function teamNameForFinance(team = {}) {
  const name = String(team.name || '').trim();
  const teamName = String(team.team_name || '').trim();
  if (CLUB_MARKET_VALUES_EUR[name]) return name;
  if (CLUB_MARKET_VALUES_EUR[teamName]) return teamName;
  return teamName || name;
}

function clubMarketValueEuro(team = {}) {
  const name = teamNameForFinance(team);
  if (CLUB_MARKET_VALUES_EUR[name]) return CLUB_MARKET_VALUES_EUR[name];
  const overall = Number(team.overall || team.team_overall || 70);
  const base = Math.max(18000000, Math.round((overall - 58) * (overall - 58) * 95000));
  return Math.round(base + seededRatio(team.team_id || team.id || name.length || 1) * 8000000);
}

function budgetRateForTeam(team = {}) {
  const name = teamNameForFinance(team);
  const seed = Number(team.team_id || team.id || 1);
  const noise = seededRatio(seed + 17);
  if (['Galatasaray', 'Fenerbahçe', 'Fenerbahce'].includes(name)) return 0.12 + noise * 0.06;
  if (['Beşiktaş', 'Besiktas', 'Trabzonspor'].includes(name)) return 0.09 + noise * 0.04;
  const overall = Number(team.overall || team.team_overall || 70);
  if (overall >= 74) return 0.09 + noise * 0.05;
  return 0.05 + noise * 0.04;
}

function clubTransferBudget(team = {}) {
  return roundInternalEuro(toInternalEuro(clubMarketValueEuro(team) * budgetRateForTeam(team)), 250000);
}

function clubSalaryBudget(team = {}) {
  const market = clubMarketValueEuro(team);
  const overall = Number(team.overall || team.team_overall || 70);
  const rate = overall >= 82 ? 0.18 : overall >= 78 ? 0.15 : overall >= 74 ? 0.12 : 0.09;
  return roundInternalEuro(toInternalEuro(market * rate), 100000);
}

function estimatePlayerValueEuro(player = {}) {
  const overall = Number(player.overall || 65);
  let value = 160000;
  if (overall >= 88) value = 18000000 + (overall - 88) * 3300000;
  else if (overall >= 85) value = 8500000 + (overall - 85) * 2100000;
  else if (overall >= 82) value = 4200000 + (overall - 82) * 1050000;
  else if (overall >= 78) value = 1450000 + (overall - 78) * 430000;
  else if (overall >= 74) value = 450000 + (overall - 74) * 210000;
  else if (overall >= 70) value = 150000 + (overall - 70) * 80000;
  else value = Math.max(50000, 70000 + (overall - 60) * 22000);
  return value;
}

function marketAnchor(player = {}) {
  const rawValue = Number(player.market_value || 0);
  const estimateEuro = estimatePlayerValueEuro(player);
  if (!rawValue) return toInternalEuro(estimateEuro);
  const rawEuro = normalizeInternalMoney(rawValue) / INTERNAL_EUR_RATE;
  const cappedEuro = Math.min(rawEuro, estimateEuro * 0.85);
  return toInternalEuro(Math.max(estimateEuro * 0.55, cappedEuro));
}

function calculateBaseMarketValue(player = {}, options = {}) {
  const storedBase = Number(player.base_market_value || 0);
  if (!options.ignoreStored && storedBase > 0) return roundInternalEuro(normalizeInternalMoney(storedBase), 50000);

  const anchor = marketAnchor(player);
  const age = Number(player.age || 25);
  const overall = Number(player.overall || 65);
  const potential = Math.max(overall, Number(player.potential || overall));
  const contractUntil = Number(player.contract_until || 2027);
  const morale = Number(player.morale || 70);
  const happiness = Number(player.happiness || 70);

  const ageFactor = age <= 20 ? 1.18 : age <= 23 ? 1.1 : age <= 27 ? 1.02 : age <= 30 ? 0.96 : age <= 33 ? 0.76 : 0.55;
  const potentialFactor = 1 + Math.min(0.22, Math.max(0, potential - overall) * 0.032);
  const positionFactor = { GK: 0.78, DEF: 0.92, MID: 1, FWD: 1.04 }[player.position] || 1;
  const contractFactor = contractUntil <= 2026 ? 0.68 : contractUntil === 2027 ? 0.88 : contractUntil >= 2029 ? 1.06 : 1;
  const formFactor = 0.88 + Math.max(0, Math.min(16, ((morale + happiness) / 2) - 60)) / 115;
  const starFactor = overall >= 85 ? 1.1 : overall >= 82 ? 1.05 : 1;

  return roundInternalEuro(anchor * ageFactor * potentialFactor * positionFactor * contractFactor * formFactor * starFactor, 50000);
}

function rebalancePlayerMarketValue(player = {}) {
  return calculateBaseMarketValue(player, { ignoreStored: true });
}

function minimumWageForPlayer(player = {}, buyerTeam = {}) {
  const current = normalizeInternalMoney(player.salary || 0, 25000000);
  const prestige = Number(buyerTeam.overall || buyerTeam.team_overall || 70);
  const age = Number(player.age || 25);
  const prestigeFactor = prestige >= 82 ? 1.14 : prestige >= 78 ? 1.08 : 1;
  const ageFactor = age <= 23 ? 1.08 : age >= 32 ? 0.92 : 1;
  return roundInternalEuro(Math.max(current * prestigeFactor * ageFactor, calculateBaseMarketValue(player) * 0.028), 50000);
}

module.exports = {
  INTERNAL_EUR_RATE,
  clubMarketValueEuro,
  clubTransferBudget,
  clubSalaryBudget,
  calculateBaseMarketValue,
  rebalancePlayerMarketValue,
  minimumWageForPlayer,
  normalizeInternalMoney,
  roundInternalEuro,
  seededRatio,
  toInternalEuro
};
