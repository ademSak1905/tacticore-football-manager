const FINANCE_VERSION = 2;

function seededNoise(seed, min, max) {
  const raw = Math.sin(Number(seed || 1) * 999) * 10000;
  const ratio = raw - Math.floor(raw);
  return Math.round(min + ratio * (max - min));
}

function planTier(team = {}) {
  const overall = Number(team.overall || team.team_overall || 70);
  if (overall >= 82) return 'giant';
  if (overall >= 79) return 'big';
  if (overall >= 75) return 'upper';
  if (overall >= 71) return 'middle';
  if (overall >= 68) return 'lower';
  return 'survival';
}

function projectedLeagueRank(team = {}) {
  const overall = Number(team.overall || team.team_overall || 70);
  if (overall >= 82) return 1;
  if (overall >= 79) return 3;
  if (overall >= 75) return 5;
  if (overall >= 71) return 9;
  if (overall >= 68) return 13;
  return 16;
}

function buildFinancialPlan(team = {}) {
  const tier = planTier(team);
  const id = Number(team.id || team.team_id || 1);
  const ranges = {
    giant: { transfer: [780000000, 1050000000], salary: [42000000, 60000000] },
    big: { transfer: [430000000, 620000000], salary: [27000000, 40000000] },
    upper: { transfer: [210000000, 340000000], salary: [16000000, 26000000] },
    middle: { transfer: [85000000, 155000000], salary: [8500000, 15500000] },
    lower: { transfer: [42000000, 82000000], salary: [5200000, 9200000] },
    survival: { transfer: [22000000, 52000000], salary: [3200000, 6200000] }
  };
  const selected = ranges[tier];
  return {
    transferBudget: seededNoise(id + 11, selected.transfer[0], selected.transfer[1]),
    salaryBudget: seededNoise(id + 29, selected.salary[0], selected.salary[1])
  };
}

function buildSeasonPlan(team = {}) {
  const tier = planTier(team);
  const rankHint = projectedLeagueRank(team);
  const finance = buildFinancialPlan(team);
  const leagueTargets = {
    giant: { code: 'champion', label: 'Sampiyonluk', rank: 1 },
    big: { code: 'top4', label: 'Ilk 4', rank: 4 },
    upper: { code: 'europe', label: 'Avrupa kupalarina katilma', rank: 5 },
    middle: { code: 'mid_table', label: 'Orta sira', rank: 10 },
    lower: { code: 'survival', label: 'Kumede kalma', rank: 15 },
    survival: { code: 'survival', label: 'Kumede kalma', rank: 15 }
  };
  const cupTargets = {
    giant: 'Final',
    big: 'Yari final',
    upper: 'Ceyrek final',
    middle: 'Son 16',
    lower: 'Son 16',
    survival: 'Tur gec'
  };
  const uclTargets = {
    giant: { code: 'quarter_final', label: 'Ceyrek final', stage: 3 },
    big: { code: 'round_of_16', label: 'Son 16', stage: 2 }
  };
  const hasChampionsLeague = rankHint <= 2;

  return {
    season: 2025,
    financeVersion: FINANCE_VERSION,
    generatedAt: new Date().toISOString(),
    tier,
    league: leagueTargets[tier],
    cup: { code: cupTargets[tier].toLowerCase().replaceAll(' ', '_'), label: cupTargets[tier] },
    championsLeague: hasChampionsLeague ? uclTargets[tier] || { code: 'league_phase', label: 'Gruplardan cikmak', stage: 1 } : null,
    transferBudget: finance.transferBudget,
    salaryBudget: finance.salaryBudget
  };
}

function parseSeasonPlan(value, team = {}) {
  try {
    const parsed = JSON.parse(value || '{}');
    if (parsed && parsed.league && parsed.transferBudget && parsed.financeVersion === FINANCE_VERSION) return parsed;
  } catch {
    // fall through
  }
  return buildSeasonPlan(team);
}

function evaluateLeague(plan, rank) {
  const targetRank = Number(plan?.league?.rank || 18);
  return {
    target: plan?.league?.label || 'Orta sira',
    result: `${rank || '-'} . sira`.replace(' .', '.'),
    success: Number(rank || 99) <= targetRank
  };
}

const UCL_STAGE_VALUE = {
  none: 0,
  league: 1,
  qualifying: 1,
  league_phase: 1,
  round_of_16: 2,
  quarter_final: 3,
  semi_final: 4,
  final: 5,
  champion: 6
};

function evaluateChampionsLeague(plan, result) {
  if (!plan?.championsLeague) return null;
  const reached = result?.stage || 'none';
  const reachedValue = UCL_STAGE_VALUE[reached] || 0;
  const targetValue = Number(plan.championsLeague.stage || UCL_STAGE_VALUE[plan.championsLeague.code] || 1);
  return {
    target: plan.championsLeague.label,
    result: result?.label || 'Katilmadi',
    success: reachedValue >= targetValue
  };
}

function managementVerdict(successCount, totalCount) {
  const ratio = totalCount ? successCount / totalCount : 0;
  if (ratio >= 0.85) return { label: 'Basarili sezon', score: 86, note: 'Yonetim yeni sozlesme teklifine sicak bakiyor.' };
  if (ratio >= 0.55) return { label: 'Ortalama sezon', score: 68, note: 'Yonetim devam karari icin gelisim bekliyor.' };
  if (ratio >= 0.3) return { label: 'Basarisiz sezon', score: 44, note: 'Yeni sezon basinda baski artacak.' };
  return { label: 'Kovulma riski', score: 28, note: 'Yonetim acil toparlanma bekliyor.' };
}

module.exports = {
  buildSeasonPlan,
  parseSeasonPlan,
  evaluateLeague,
  evaluateChampionsLeague,
  managementVerdict
};
