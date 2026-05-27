const EUROPEAN_COMPETITIONS = [
  { code: 'UCL', name: 'UEFA Şampiyonlar Ligi', short_name: 'Şampiyonlar Ligi', theme: 'champions', logo_url: '/assets/logos/placeholder.svg', league_matches: 8 },
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
  ['Real Madrid', 'RMA', 'Ispanya', 'LaLiga', 92, 'elite', 1],
  ['Barcelona', 'BAR', 'Ispanya', 'LaLiga', 90, 'elite', 1],
  ['Manchester City', 'MCI', 'Ingiltere', 'Premier League', 91, 'elite', 1],
  ['Liverpool', 'LIV', 'Ingiltere', 'Premier League', 89, 'elite', 1],
  ['Arsenal', 'ARS', 'Ingiltere', 'Premier League', 88, 'elite', 1],
  ['Bayern Munih', 'BAY', 'Almanya', 'Bundesliga', 90, 'elite', 1],
  ['PSG', 'PSG', 'Fransa', 'Ligue 1', 88, 'elite', 1],
  ['Inter', 'INT', 'Italya', 'Serie A', 88, 'elite', 1],
  ['Milan', 'MIL', 'Italya', 'Serie A', 85, 'strong', 2],
  ['Juventus', 'JUV', 'Italya', 'Serie A', 85, 'strong', 2],
  ['Napoli', 'NAP', 'Italya', 'Serie A', 84, 'strong', 2],
  ['Dortmund', 'BVB', 'Almanya', 'Bundesliga', 84, 'strong', 2],
  ['Atletico Madrid', 'ATM', 'Ispanya', 'LaLiga', 86, 'strong', 2],
  ['Chelsea', 'CHE', 'Ingiltere', 'Premier League', 85, 'strong', 2],
  ['Benfica', 'BEN', 'Portekiz', 'Primeira Liga', 82, 'strong', 2],
  ['Porto', 'POR', 'Portekiz', 'Primeira Liga', 81, 'strong', 2],
  ['Ajax', 'AJA', 'Hollanda', 'Eredivisie', 79, 'strong', 3],
  ['Sporting CP', 'SCP', 'Portekiz', 'Primeira Liga', 82, 'strong', 2],
  ['Leverkusen', 'B04', 'Almanya', 'Bundesliga', 86, 'strong', 2],
  ['RB Leipzig', 'RBL', 'Almanya', 'Bundesliga', 83, 'strong', 2],
  ['Tottenham', 'TOT', 'Ingiltere', 'Premier League', 83, 'strong', 2],
  ['Manchester United', 'MUN', 'Ingiltere', 'Premier League', 84, 'strong', 2],
  ['Roma', 'ROM', 'Italya', 'Serie A', 81, 'strong', 3],
  ['Lazio', 'LAZ', 'Italya', 'Serie A', 80, 'strong', 3],
  ['Marseille', 'OM', 'Fransa', 'Ligue 1', 80, 'strong', 3],
  ['Lyon', 'LYO', 'Fransa', 'Ligue 1', 79, 'strong', 3],
  ['Monaco', 'ASM', 'Fransa', 'Ligue 1', 81, 'strong', 3],
  ['PSV', 'PSV', 'Hollanda', 'Eredivisie', 81, 'strong', 3],
  ['Feyenoord', 'FEY', 'Hollanda', 'Eredivisie', 80, 'strong', 3],
  ['Celtic', 'CEL', 'Iskocya', 'Premiership', 77, 'balanced', 4],
  ['Rangers', 'RAN', 'Iskocya', 'Premiership', 76, 'balanced', 4],
  ['Shakhtar Donetsk', 'SHA', 'Ukrayna', 'Premier League', 77, 'balanced', 4],
  ['Club Brugge', 'BRU', 'Belcika', 'Pro League', 78, 'balanced', 4],
  ['Anderlecht', 'AND', 'Belcika', 'Pro League', 75, 'balanced', 4],
  ['Olympiacos', 'OLY', 'Yunanistan', 'Super League', 77, 'balanced', 4],
  ['Dinamo Zagreb', 'DZG', 'Hirvatistan', 'HNL', 75, 'balanced', 4],
  ['Slavia Prag', 'SLP', 'Cekya', 'Fortuna Liga', 75, 'balanced', 4],
  ['Kopenhag', 'FCK', 'Danimarka', 'Superliga', 74, 'balanced', 4],
  ['Braga', 'BRA', 'Portekiz', 'Primeira Liga', 78, 'balanced', 3],
  ['Villarreal', 'VIL', 'Ispanya', 'LaLiga', 80, 'strong', 3],
  ['Real Sociedad', 'RSO', 'Ispanya', 'LaLiga', 80, 'strong', 3],
  ['Aston Villa', 'AVL', 'Ingiltere', 'Premier League', 82, 'strong', 2],
  ['West Ham', 'WHU', 'Ingiltere', 'Premier League', 79, 'strong', 3],
  ['Fiorentina', 'FIO', 'Italya', 'Serie A', 79, 'strong', 3],
  ['Atalanta', 'ATA', 'Italya', 'Serie A', 82, 'strong', 2],
  ['Nice', 'NIC', 'Fransa', 'Ligue 1', 78, 'balanced', 3],
  ['Lille', 'LIL', 'Fransa', 'Ligue 1', 79, 'strong', 3],
  ['Union Berlin', 'FCU', 'Almanya', 'Bundesliga', 76, 'balanced', 4],
  ['Newcastle United', 'NEW', 'Ingiltere', 'Premier League', 82, 'strong', 2],
  ['Sevilla', 'SEV', 'Ispanya', 'LaLiga', 79, 'strong', 3],
  ['Athletic Club', 'ATH', 'Ispanya', 'LaLiga', 80, 'strong', 3],
  ['Stuttgart', 'VFB', 'Almanya', 'Bundesliga', 79, 'strong', 3],
  ['Eintracht Frankfurt', 'SGE', 'Almanya', 'Bundesliga', 78, 'balanced', 3],
  ['Salzburg', 'RBS', 'Avusturya', 'Bundesliga', 77, 'balanced', 4],
  ['Young Boys', 'YB', 'Isvicre', 'Super League', 74, 'balanced', 4],
  ['Basel', 'BAS', 'Isvicre', 'Super League', 73, 'balanced', 4],
  ['AZ Alkmaar', 'AZ', 'Hollanda', 'Eredivisie', 76, 'balanced', 4],
  ['Twente', 'TWE', 'Hollanda', 'Eredivisie', 74, 'balanced', 4],
  ['Lens', 'RCL', 'Fransa', 'Ligue 1', 77, 'balanced', 4],
  ['Rennes', 'REN', 'Fransa', 'Ligue 1', 78, 'balanced', 3],
  ['Bologna', 'BOL', 'Italya', 'Serie A', 78, 'balanced', 3],
  ['Girona', 'GIR', 'Ispanya', 'LaLiga', 79, 'strong', 3],
  ['Real Betis', 'BET', 'Ispanya', 'LaLiga', 79, 'strong', 3],
  ['Sparta Prag', 'SPA', 'Cekya', 'Fortuna Liga', 75, 'balanced', 4]
];

async function seedEuropeanData({ run, get }) {
  for (const item of EUROPEAN_COMPETITIONS) {
    await run(`
      INSERT OR IGNORE INTO european_competitions
        (code, name, short_name, theme, logo_url, league_matches, direct_qualify_count, playoff_start, playoff_end)
      VALUES (?, ?, ?, ?, ?, ?, 8, 9, 24)
    `, [item.code, item.name, item.short_name, item.theme, item.logo_url, item.league_matches]);
    await run(`
      UPDATE european_competitions
      SET league_matches = ?, direct_qualify_count = 8, playoff_start = 9, playoff_end = 24
      WHERE code = ?
    `, [item.league_matches, item.code]);
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
