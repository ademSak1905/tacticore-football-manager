const FORMATIONS = {
  '4-4-2': { width: 66, defenseDensity: 64, midfieldControl: 58, attackShape: 62, label: 'Klasik iki forvet' },
  '4-2-3-1': { width: 62, defenseDensity: 70, midfieldControl: 72, attackShape: 68, label: 'Dengeli merkez kontrolü' },
  '4-3-3': { width: 76, defenseDensity: 58, midfieldControl: 66, attackShape: 74, label: 'Geniş kanat hücumu' },
  '3-5-2': { width: 60, defenseDensity: 66, midfieldControl: 78, attackShape: 66, label: 'Orta saha baskısı' },
  '5-3-2': { width: 54, defenseDensity: 82, midfieldControl: 61, attackShape: 55, label: 'Kalabalık savunma' },
  '4-1-2-1-2': { width: 42, defenseDensity: 68, midfieldControl: 80, attackShape: 64, label: 'Dar elmas orta saha' },
  '4-5-1': { width: 64, defenseDensity: 76, midfieldControl: 75, attackShape: 52, label: 'Sıkı orta blok' },
  custom: { width: 60, defenseDensity: 62, midfieldControl: 62, attackShape: 62, label: 'Özel plan' }
};

const ATTACK_STYLES = {
  counter: 'Kontra Atak',
  tiki_taka: 'Tiki Taka',
  long_ball: 'Uzun Top',
  wide: 'Kanatlardan Oyna',
  press_attack: 'Presli Hücum',
  balanced: 'Dengeli'
};

const DEFENSE_STYLES = {
  deep_block: 'Geriye Yaslan',
  zonal: 'Alan Savunması',
  man_marking: 'Adam Adama',
  high_press: 'Önde Baskı',
  ultra_defense: 'Ultra Defans'
};

const TEMPOS = {
  slow: { label: 'Yavaş', value: 36, staminaCost: -0.8, attack: -2, possession: 4 },
  normal: { label: 'Normal', value: 55, staminaCost: 0, attack: 0, possession: 0 },
  fast: { label: 'Hızlı', value: 72, staminaCost: 1.2, attack: 3, possession: -1 },
  very_fast: { label: 'Çok Hızlı', value: 88, staminaCost: 2.2, attack: 5, possession: -3 }
};

const ROLE_LABELS = {
  poacher: 'Bitirici',
  target_forward: 'Pivot',
  pressing_forward: 'Pres Forveti',
  false_nine: 'Sahte 9',
  playmaker: 'Oyun Kurucu',
  box_to_box: 'Box to Box',
  defensive_midfielder: 'Defansif Orta Saha',
  mezzala: 'Mezzala',
  inside_forward: 'İçe Kat Eden',
  winger: 'Çizgi Kanadı',
  speed_winger: 'Hızlı Kanat',
  ball_playing_defender: 'Toplu Stoper',
  stopper: 'Sert Stoper',
  libero: 'Libero',
  goalkeeper: 'Kaleci'
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function average(players, field) {
  if (!players.length) return 60;
  return players.reduce((sum, player) => sum + Number(player[field] || 0), 0) / players.length;
}

function tempoKeyFromValue(value) {
  const numeric = Number(value || 55);
  if (numeric < 45) return 'slow';
  if (numeric < 65) return 'normal';
  if (numeric < 82) return 'fast';
  return 'very_fast';
}

function roleForPlayer(player) {
  if (player.role) return player.role;
  if (player.position === 'GK') return 'goalkeeper';
  if (player.position === 'DEF') {
    if (player.passing > 72) return 'ball_playing_defender';
    if (player.physical > 74 || player.defending > 76) return 'stopper';
    return 'libero';
  }
  if (player.position === 'MID') {
    if (player.passing > 76 && player.dribbling > 70) return 'playmaker';
    if (player.stamina > 78 && player.physical > 70) return 'box_to_box';
    if (player.defending > 72) return 'defensive_midfielder';
    return 'mezzala';
  }
  if (player.position === 'FWD') {
    if (player.shooting > 77) return 'poacher';
    if (player.physical > 76) return 'target_forward';
    if (player.stamina > 76) return 'pressing_forward';
    return 'false_nine';
  }
  return 'box_to_box';
}

function normalizeTactic(row = {}, team = {}) {
  const formation = FORMATIONS[row.formation] ? row.formation : (FORMATIONS[team.default_formation] ? team.default_formation : '4-2-3-1');
  const legacyStyle = row.passing_style === 'short' ? 'tiki_taka' : row.passing_style === 'direct' ? 'long_ball' : 'balanced';
  const tempoKey = row.tempo_label || tempoKeyFromValue(row.tempo);

  return {
    formation,
    attack_style: ATTACK_STYLES[row.attack_style] ? row.attack_style : legacyStyle,
    defense_style: DEFENSE_STYLES[row.defense_style] ? row.defense_style : 'zonal',
    tempo_label: TEMPOS[tempoKey] ? tempoKey : 'normal',
    pressing: clamp(row.pressing ?? 55, 0, 100),
    defensive_line: clamp(row.defensive_line ?? 50, 0, 100),
    aggression: clamp(row.aggression ?? 50, 0, 100),
    width: clamp(row.width ?? FORMATIONS[formation].width, 0, 100),
    mentality: row.mentality || 'balanced',
    passing_style: row.passing_style || 'mixed'
  };
}

function createAiTactic(team = {}, scoreDiff = 0) {
  const formation = FORMATIONS[team.default_formation] ? team.default_formation : '4-2-3-1';
  const stronger = Number(team.overall || 70) >= 74;
  const losing = scoreDiff < 0;
  const winning = scoreDiff > 0;

  return normalizeTactic({
    formation,
    attack_style: losing ? 'press_attack' : stronger ? 'tiki_taka' : 'counter',
    defense_style: winning ? 'deep_block' : losing ? 'high_press' : 'zonal',
    tempo_label: losing ? 'fast' : winning ? 'slow' : 'normal',
    pressing: losing ? 76 : winning ? 42 : 58,
    defensive_line: losing ? 70 : winning ? 35 : 54,
    aggression: losing ? 68 : 52,
    width: FORMATIONS[formation].width
  }, team);
}

function roleBonus(lineup, tactic) {
  let bonus = 0;
  const roles = lineup.map(roleForPlayer);

  if (tactic.attack_style === 'counter') bonus += lineup.filter((p) => p.position === 'FWD' && p.pace >= 76).length * 1.7;
  if (tactic.attack_style === 'tiki_taka') bonus += lineup.filter((p) => ['playmaker', 'mezzala', 'false_nine'].includes(roleForPlayer(p))).length * 1.2;
  if (tactic.attack_style === 'long_ball') bonus += roles.filter((role) => ['target_forward', 'ball_playing_defender'].includes(role)).length * 1.4;
  if (tactic.attack_style === 'wide') bonus += lineup.filter((p) => p.pace >= 72 && (p.position === 'MID' || p.position === 'FWD')).length * 1.1;
  if (tactic.attack_style === 'press_attack') bonus += roles.filter((role) => ['pressing_forward', 'box_to_box', 'stopper'].includes(role)).length * 1.2;
  if (tactic.defense_style === 'man_marking') bonus += roles.filter((role) => ['stopper', 'defensive_midfielder'].includes(role)).length * 0.9;
  if (tactic.defense_style === 'high_press') bonus += lineup.filter((p) => p.stamina >= 74).length * 0.7;

  return clamp(bonus, 0, 14);
}

function chemistryBonus(lineup, tactic) {
  const formation = FORMATIONS[tactic.formation] || FORMATIONS.custom;
  const morale = average(lineup, 'morale');
  const stamina = average(lineup, 'stamina');
  const nationalityCounts = lineup.reduce((map, player) => {
    const key = player.nationality || 'Bilinmiyor';
    map[key] = (map[key] || 0) + 1;
    return map;
  }, {});
  const nationBonus = Math.max(...Object.values(nationalityCounts), 0) >= 5 ? 1.5 : 0;
  const shapeBonus = (formation.midfieldControl + formation.defenseDensity + formation.attackShape) / 100;

  return clamp((morale - 60) * 0.06 + (stamina - 62) * 0.04 + nationBonus + shapeBonus, -4, 9);
}

function styleModifiers(lineup, tactic, base, isHome) {
  const forwards = lineup.filter((player) => player.position === 'FWD');
  const mids = lineup.filter((player) => player.position === 'MID');
  const defs = lineup.filter((player) => player.position === 'DEF');
  const formation = FORMATIONS[tactic.formation] || FORMATIONS.custom;
  const tempo = TEMPOS[tactic.tempo_label] || TEMPOS.normal;
  const passing = average(mids, 'passing');
  const pace = average([...forwards, ...mids], 'pace');
  const defending = average(defs, 'defending');
  const stamina = average(lineup, 'stamina');
  const role = roleBonus(lineup, tactic);
  const chemistry = chemistryBonus(lineup, tactic);

  const model = {
    attack: base.attack + formation.attackShape * 0.07 + tempo.attack + role * 0.45,
    midfield: base.midfield + formation.midfieldControl * 0.08 + chemistry,
    defense: base.defense + formation.defenseDensity * 0.08,
    goalkeeper: base.goalkeeper,
    possessionBias: formation.midfieldControl * 0.045 + (passing - 68) * 0.08 + tempo.possession,
    shotBias: 0,
    goalQuality: 0,
    foulBias: tactic.aggression * 0.045,
    fatigueRisk: clamp((tactic.pressing - 45) * 0.045 + tempo.staminaCost + (62 - stamina) * 0.055, -2, 8),
    successfulPress: clamp(Math.round(tactic.pressing * 0.23 + stamina * 0.12 + role), 4, 34),
    tacticScore: 50,
    notes: [],
    livePhrases: [],
    summary: '',
    tactic
  };

  if (isHome) {
    model.attack += 1.5;
    model.midfield += 1;
  }

  if (tactic.attack_style === 'counter') {
    model.attack += (pace - 68) * 0.16;
    model.shotBias += 1;
    model.possessionBias -= 5;
    model.livePhrases.push('kontra atağa çıktı');
    model.notes.push('Hızlı oyuncular kontra planına güç verdi.');
  }
  if (tactic.attack_style === 'tiki_taka') {
    model.midfield += (passing - 68) * 0.22;
    model.possessionBias += 7;
    model.goalQuality += 0.03;
    model.livePhrases.push('kısa paslarla oyunu kurdu');
    model.notes.push('Pas kalitesi topa sahip olmayı artırdı.');
  }
  if (tactic.attack_style === 'long_ball') {
    model.attack += average(forwards, 'physical') * 0.08;
    model.possessionBias -= 4;
    model.shotBias += 1.4;
    model.livePhrases.push('uzun topla savunma arkasını denedi');
    model.notes.push('Uzun toplar rakip çizginin arkasına tehdit yarattı.');
  }
  if (tactic.attack_style === 'wide') {
    model.attack += (tactic.width - 50) * 0.08;
    model.shotBias += 0.8;
    model.livePhrases.push('kanattan etkili orta aradı');
    model.notes.push('Genişlik kanat hücumlarını belirginleştirdi.');
  }
  if (tactic.attack_style === 'press_attack') {
    model.attack += tactic.pressing * 0.045;
    model.midfield += 2;
    model.fatigueRisk += 1.8;
    model.livePhrases.push('önde baskıyla topu kaptı');
    model.notes.push('Pres hücumları hızlı pozisyon üretti ama kondisyonu zorladı.');
  }

  if (tactic.defense_style === 'deep_block') {
    model.defense += 5;
    model.possessionBias -= 4;
    model.notes.push('Geri blok ceza sahası çevresini kapattı.');
  }
  if (tactic.defense_style === 'ultra_defense') {
    model.defense += 8;
    model.attack -= 4;
    model.possessionBias -= 7;
    model.notes.push('Ultra defans gol riskini azalttı ama hücum sayısını düşürdü.');
  }
  if (tactic.defense_style === 'high_press') {
    model.midfield += 3;
    model.defense += 1;
    model.fatigueRisk += 1.4;
    model.livePhrases.push('önde baskı kurdu');
  }
  if (tactic.defense_style === 'man_marking') {
    model.defense += defending * 0.055;
    model.foulBias += 1.4;
  }

  model.tacticScore = clamp(Math.round(52 + role * 1.7 + chemistry * 1.8 + (model.successfulPress - 12) * 0.45 - Math.max(0, model.fatigueRisk - 4) * 1.8), 25, 96);
  return model;
}

function applyCounterEffects(home, away) {
  const a = { ...home, notes: [...home.notes], livePhrases: [...home.livePhrases] };
  const b = { ...away, notes: [...away.notes], livePhrases: [...away.livePhrases] };

  function counter(attacker, defender, name) {
    if (attacker.tactic.attack_style === 'counter' && defender.tactic.defensive_line > 68) {
      attacker.attack += 5;
      attacker.goalQuality += 0.05;
      attacker.tacticScore += 6;
      attacker.notes.push(`${name} yüksek savunma çizgisine karşı kontra fırsatı buldu.`);
      attacker.livePhrases.push('savunma çizgisi çok önde yakalandı');
    }
    if (attacker.tactic.attack_style === 'long_ball' && defender.tactic.defensive_line > 62) {
      attacker.attack += 3.5;
      attacker.shotBias += 1;
      attacker.notes.push(`${name} uzun toplarla savunma arkasını zorladı.`);
    }
    if (attacker.tactic.attack_style === 'wide' && defender.tactic.width < 45) {
      attacker.attack += 4;
      attacker.notes.push(`${name} dar savunmaya karşı kanatları iyi kullandı.`);
    }
    if (attacker.tactic.attack_style === 'tiki_taka' && defender.tactic.defense_style === 'man_marking') {
      attacker.midfield -= 2;
      defender.defense += 2;
      defender.notes.push('Adam adama savunma kısa pas ritmini bozdu.');
    }
    if (defender.tactic.defense_style === 'ultra_defense' && attacker.tactic.tempo_label === 'slow') {
      attacker.shotBias -= 1.5;
      defender.defense += 2;
    }
  }

  counter(a, b, 'Ev sahibi');
  counter(b, a, 'Deplasman');

  a.tacticScore = clamp(Math.round(a.tacticScore), 20, 99);
  b.tacticScore = clamp(Math.round(b.tacticScore), 20, 99);
  a.summary = a.notes[0] || 'Dengeli oyun planı uygulandı.';
  b.summary = b.notes[0] || 'Dengeli oyun planı uygulandı.';
  return { homeModel: a, awayModel: b };
}

function calculateTacticalModels(homeInput, awayInput) {
  const homeRaw = styleModifiers(homeInput.lineup, homeInput.tactic, homeInput.base, true);
  const awayRaw = styleModifiers(awayInput.lineup, awayInput.tactic, awayInput.base, false);
  return applyCounterEffects(homeRaw, awayRaw);
}

function minuteModel(model, minute, scoreDiff = 0) {
  const lateFatigue = minute > 62 ? (minute - 62) * 0.035 * Math.max(0, model.fatigueRisk) : 0;
  const chasingBoost = scoreDiff < 0 && minute > 60 ? 2.4 : 0;
  const protectingLead = scoreDiff > 0 && minute > 70 ? 2 : 0;

  return {
    ...model,
    attack: model.attack + chasingBoost - protectingLead * 0.8,
    midfield: model.midfield - lateFatigue * 0.45,
    defense: model.defense - lateFatigue + protectingLead,
    shotBias: model.shotBias + chasingBoost * 0.35,
    fatigueRisk: model.fatigueRisk + lateFatigue
  };
}

module.exports = {
  FORMATIONS,
  ATTACK_STYLES,
  DEFENSE_STYLES,
  TEMPOS,
  ROLE_LABELS,
  normalizeTactic,
  createAiTactic,
  roleForPlayer,
  calculateTacticalModels,
  minuteModel,
  clamp
};
