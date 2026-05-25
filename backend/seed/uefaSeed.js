const EUROPEAN_COMPETITIONS = [
  { code: 'UCL', name: 'UEFA Şampiyonlar Ligi', short_name: 'Şampiyonlar Ligi', theme: 'champions', logo_url: '/assets/logos/placeholder.svg', league_matches: 6 },
  { code: 'UEL', name: 'UEFA Avrupa Ligi', short_name: 'Avrupa Ligi', theme: 'europa', logo_url: '/assets/logos/placeholder.svg', league_matches: 6 },
  { code: 'UECL', name: 'UEFA Konferans Ligi', short_name: 'Konferans Ligi', theme: 'conference', logo_url: '/assets/logos/placeholder.svg', league_matches: 6 }
];

const QUALIFICATION_RULES = [
  { rank: 1, competition: 'UCL', stage: 'league_phase', label: 'Süper Lig şampiyonu' },
  { rank: 2, competition: 'UCL', stage: 'qualifying', label: 'Süper Lig ikincisi' },
  { rank: 3, competition: 'UEL', stage: 'league_phase', label: 'Süper Lig üçüncüsü' },
  { rank: 4, competition: 'UECL', stage: 'qualifying', label: 'Süper Lig dördüncüsü' },
  { cupWinner: true, competition: 'UEL', stage: 'qualifying', label: 'Türkiye Kupası şampiyonu' }
];

const EUROPEAN_TEAMS = [
  ['Real Madrid', 'RMA', 'İspanya', 'LaLiga', 92, 'elite', 1],
  ['Barcelona', 'BAR', 'İspanya', 'LaLiga', 90, 'elite', 1],
  ['Manchester City', 'MCI', 'İngiltere', 'Premier League', 91, 'elite', 1],
  ['Liverpool', 'LIV', 'İngiltere', 'Premier League', 89, 'elite', 1],
  ['Arsenal', 'ARS', 'İngiltere', 'Premier League', 88, 'elite', 1],
  ['Bayern Münih', 'BAY', 'Almanya', 'Bundesliga', 90, 'elite', 1],
  ['PSG', 'PSG', 'Fransa', 'Ligue 1', 88, 'elite', 1],
  ['Inter', 'INT', 'İtalya', 'Serie A', 88, 'elite', 1],
  ['Milan', 'MIL', 'İtalya', 'Serie A', 85, 'strong', 2],
  ['Juventus', 'JUV', 'İtalya', 'Serie A', 85, 'strong', 2],
  ['Napoli', 'NAP', 'İtalya', 'Serie A', 84, 'strong', 2],
  ['Dortmund', 'BVB', 'Almanya', 'Bundesliga', 84, 'strong', 2],
  ['Atletico Madrid', 'ATM', 'İspanya', 'LaLiga', 86, 'strong', 2],
  ['Chelsea', 'CHE', 'İngiltere', 'Premier League', 85, 'strong', 2],
  ['Benfica', 'BEN', 'Portekiz', 'Primeira Liga', 82, 'strong', 2],
  ['Porto', 'POR', 'Portekiz', 'Primeira Liga', 81, 'strong', 2],
  ['Ajax', 'AJA', 'Hollanda', 'Eredivisie', 79, 'strong', 3],
  ['Sporting CP', 'SCP', 'Portekiz', 'Primeira Liga', 82, 'strong', 2],
  ['Leverkusen', 'B04', 'Almanya', 'Bundesliga', 86, 'strong', 2],
  ['RB Leipzig', 'RBL', 'Almanya', 'Bundesliga', 83, 'strong', 2],
  ['Tottenham', 'TOT', 'İngiltere', 'Premier League', 83, 'strong', 2],
  ['Manchester United', 'MUN', 'İngiltere', 'Premier League', 84, 'strong', 2],
  ['Roma', 'ROM', 'İtalya', 'Serie A', 81, 'strong', 3],
  ['Lazio', 'LAZ', 'İtalya', 'Serie A', 80, 'strong', 3],
  ['Marseille', 'OM', 'Fransa', 'Ligue 1', 80, 'strong', 3],
  ['Lyon', 'LYO', 'Fransa', 'Ligue 1', 79, 'strong', 3],
  ['Monaco', 'ASM', 'Fransa', 'Ligue 1', 81, 'strong', 3],
  ['PSV', 'PSV', 'Hollanda', 'Eredivisie', 81, 'strong', 3],
  ['Feyenoord', 'FEY', 'Hollanda', 'Eredivisie', 80, 'strong', 3],
  ['Celtic', 'CEL', 'İskoçya', 'Premiership', 77, 'balanced', 4],
  ['Rangers', 'RAN', 'İskoçya', 'Premiership', 76, 'balanced', 4],
  ['Shakhtar Donetsk', 'SHA', 'Ukrayna', 'Premier League', 77, 'balanced', 4],
  ['Club Brugge', 'BRU', 'Belçika', 'Pro League', 78, 'balanced', 4],
  ['Anderlecht', 'AND', 'Belçika', 'Pro League', 75, 'balanced', 4],
  ['Olympiacos', 'OLY', 'Yunanistan', 'Super League', 77, 'balanced', 4],
  ['Dinamo Zagreb', 'DZG', 'Hırvatistan', 'HNL', 75, 'balanced', 4],
  ['Slavia Prag', 'SLP', 'Çekya', 'Fortuna Liga', 75, 'balanced', 4],
  ['Kopenhag', 'FCK', 'Danimarka', 'Superliga', 74, 'balanced', 4],
  ['Braga', 'BRA', 'Portekiz', 'Primeira Liga', 78, 'balanced', 3],
  ['Villarreal', 'VIL', 'İspanya', 'LaLiga', 80, 'strong', 3],
  ['Real Sociedad', 'RSO', 'İspanya', 'LaLiga', 80, 'strong', 3],
  ['Aston Villa', 'AVL', 'İngiltere', 'Premier League', 82, 'strong', 2],
  ['West Ham', 'WHU', 'İngiltere', 'Premier League', 79, 'strong', 3],
  ['Fiorentina', 'FIO', 'İtalya', 'Serie A', 79, 'strong', 3],
  ['Atalanta', 'ATA', 'İtalya', 'Serie A', 82, 'strong', 2],
  ['Nice', 'NIC', 'Fransa', 'Ligue 1', 78, 'balanced', 3],
  ['Lille', 'LIL', 'Fransa', 'Ligue 1', 79, 'strong', 3],
  ['Union Berlin', 'FCU', 'Almanya', 'Bundesliga', 76, 'balanced', 4]
];

async function seedEuropeanData({ run, get }) {
  for (const item of EUROPEAN_COMPETITIONS) {
    await run(`
      INSERT OR IGNORE INTO european_competitions
        (code, name, short_name, theme, logo_url, league_matches, direct_qualify_count, playoff_start, playoff_end)
      VALUES (?, ?, ?, ?, ?, ?, 8, 9, 24)
    `, [item.code, item.name, item.short_name, item.theme, item.logo_url, item.league_matches]);
  }

  for (const [name, shortName, country, league, overall, powerLevel, pot] of EUROPEAN_TEAMS) {
    const attack = Math.min(95, overall + 2);
    const midfield = overall;
    const defense = Math.max(60, overall - 1);
    const keeper = Math.max(60, overall - 2);
    await run(`
      INSERT OR IGNORE INTO european_teams
        (name, short_name, logo_url, country, league, overall, attack_overall, midfield_overall, defense_overall, goalkeeper_overall, power_level, pot)
      VALUES (?, ?, '/assets/logos/placeholder.svg', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [name, shortName, country, league, overall, attack, midfield, defense, keeper, powerLevel, pot]);
  }

  const existing = await get("SELECT COUNT(*) AS count FROM european_draws WHERE competition_code = 'CONFIG' AND phase = 'qualification_rules'");
  if (!existing?.count) {
    await run(`
      INSERT INTO european_draws (season, competition_code, phase, draw_data)
      VALUES (2025, 'CONFIG', 'qualification_rules', ?)
    `, [JSON.stringify(QUALIFICATION_RULES)]);
  }
}

module.exports = {
  seedEuropeanData,
  EUROPEAN_COMPETITIONS,
  QUALIFICATION_RULES
};
