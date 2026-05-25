const { run, get, all, getCareerState, ensureCareerForUser } = require('../database');
const { calculateTeamStrength } = require('./overallCalculator');
const { seasonDate } = require('./seasonCalendar');
const {
  normalizeTactic,
  createAiTactic,
  calculateTacticalModels,
  minuteModel,
  roleForPlayer,
  ROLE_LABELS
} = require('./tacticEngine');

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function chance(value) {
  return Math.random() < value;
}

function leagueWeeksForTeamCount(teamCount) {
  const evenCount = teamCount % 2 === 0 ? teamCount : teamCount + 1;
  return Math.max(1, (evenCount - 1) * 2);
}

function buildSeasonSummary(table, userTeamId, totalWeeks) {
  const champion = table[0] || null;
  const userIndex = table.findIndex((team) => Number(team.id) === Number(userTeamId));
  const userRow = userIndex >= 0 ? table[userIndex] : null;
  const achievements = [];
  if (userRow) {
    if (userIndex === 0) achievements.push('Süper Lig şampiyonluğu');
    if (userIndex < 4) achievements.push('Avrupa bileti');
    if ((userRow.goals_for || 0) >= 60) achievements.push('Güçlü hücum sezonu');
    if ((userRow.losses || 0) <= 5) achievements.push('Zor yenilen takım');
  }
  if (!achievements.length) achievements.push('Yeni sezon için sağlam temel');
  return {
    totalWeeks,
    champion: champion ? { id: champion.id, name: champion.name, points: champion.points } : null,
    userRank: userIndex >= 0 ? userIndex + 1 : null,
    userStats: userRow,
    achievements,
    nextSeasonAvailable: true
  };
}

async function lineupForTeam(teamId) {
  const rows = await all(`
    SELECT p.*, l.position_slot
    FROM lineups l
    JOIN players p ON p.id = l.player_id
    WHERE l.team_id = ?
    ORDER BY l.y_position DESC, l.x_position ASC
  `, [teamId]);
  if (rows.length >= 11) return rows;
  return all('SELECT *, position AS position_slot FROM players WHERE team_id = ? ORDER BY is_starting_eleven DESC, overall DESC LIMIT 11', [teamId]);
}

async function tacticForTeam(team, scoreDiff = 0) {
  const tactic = await get(`
    SELECT t.*
    FROM tactics t
    JOIN clubs c ON c.id = t.club_id
    WHERE c.team_id = ?
    LIMIT 1
  `, [team.id]);
  return tactic ? normalizeTactic(tactic, team) : createAiTactic(team, scoreDiff);
}

function event(minute, type, text, highlight = false, extra = {}) {
  return { minute, event_type: type, event_text: text, is_highlight: highlight ? 1 : 0, ...extra };
}

function getLeaguePairingsForWeek(teams, week = 1) {
  const sorted = [...teams].sort((a, b) => a.id - b.id);
  if (sorted.length % 2 !== 0) sorted.push({ id: 0, name: 'Bay' });
  const rounds = sorted.length - 1;
  const requestedWeek = Number(week) || 1;
  const totalWeeks = leagueWeeksForTeamCount(teams.length);
  if (requestedWeek > totalWeeks) return [];
  const roundIndex = (requestedWeek - 1) % rounds;
  const reverseLeg = requestedWeek > rounds;
  const fixed = sorted[0];
  const rotating = sorted.slice(1);

  for (let i = 0; i < roundIndex; i += 1) rotating.unshift(rotating.pop());

  const rawPairs = [[fixed, rotating[0]]];
  for (let i = 1; i < sorted.length / 2; i += 1) {
    rawPairs.push([rotating[i], rotating[rotating.length - i]]);
  }

  return rawPairs
    .filter(([a, b]) => a.id && b.id)
    .map(([a, b], index) => {
      const swap = (roundIndex + index + (reverseLeg ? 1 : 0)) % 2 === 1;
      return swap ? [b, a] : [a, b];
    });
}

function chooseAttacker(lineup) {
  const pool = lineup.filter((player) => ['FWD', 'MID'].includes(player.position));
  return pool[rand(0, pool.length - 1)] || lineup[rand(0, lineup.length - 1)];
}

function chooseAssist(lineup, scorer) {
  const pool = lineup.filter((player) => player.id !== scorer.id && player.position !== 'GK');
  return pool[rand(0, pool.length - 1)] || null;
}

function logEventPlayer(eventType, player, team) {
  console.log('EVENT PLAYER CHECK', {
    eventType,
    selectedPlayer: player?.name || '-',
    selectedTeam: team?.name || '-'
  });
}

function weightedXg(attacker, defender, minute) {
  const base = 0.1 + (attacker.attack - defender.defense) * 0.005 + attacker.goalQuality + attacker.shotBias * 0.01;
  const fatigueGap = Math.max(0, defender.fatigueRisk - attacker.fatigueRisk) * 0.012;
  const lateSpace = minute > 74 ? 0.035 : 0;
  return clamp(Number((base + fatigueGap + lateSpace + rand(-2, 5) / 100).toFixed(2)), 0.06, 0.62);
}

function calculateTeamAttackScore(team, model, tactic) {
  let score = Number(team.attack_overall || model.attack || 65);
  score += (model.attack - 70) * 0.65;
  score += tactic.tempo_label === 'fast' ? 4 : tactic.tempo_label === 'very_fast' ? 7 : 0;
  score += tactic.attack_style === 'press_attack' ? 4 : 0;
  score += tactic.attack_style === 'counter' ? 5 : 0;
  score += tactic.width > 70 ? 3 : 0;
  score += ((team.form || '').split('').slice(-5).filter((item) => item === 'W').length) * 1.4;
  score += (model.morale || 70) * 0.12;
  return Math.max(20, score);
}

function calculateExpectedGoals(attackingTeam, defendingTeam, attackerModel, defenderModel, tactic) {
  const attackScore = calculateTeamAttackScore(attackingTeam, attackerModel, tactic);
  const defenseScore = Number(defendingTeam.defense_overall || defenderModel.defense || 65) + (defenderModel.defense - 70) * 0.45;
  let xg = 1.15 + ((attackScore - defenseScore) / 34);

  if (tactic.tempo_label === 'fast' || tactic.tempo_label === 'very_fast') xg += 0.18;
  if (tactic.attack_style === 'press_attack') xg += 0.16;
  if (tactic.attack_style === 'counter') xg += defenderModel.tactic.defensive_line > 65 ? 0.24 : 0.1;
  if (tactic.pressing > 70) xg += 0.08;
  if (tactic.defense_style === 'ultra_defense') xg -= 0.22;
  if (tactic.defense_style === 'deep_block') xg -= 0.12;

  return clamp(Number(xg.toFixed(2)), 0.45, 3.1);
}

function generateGoalsFromXG(xg) {
  let goals = 0;
  const chances = Math.max(3, Math.round(xg * 4));
  for (let i = 0; i < chances; i += 1) {
    const goalChance = Math.min(0.32, Math.max(0.06, xg / 8));
    if (Math.random() < goalChance) goals += 1;
  }
  return goals;
}

function chanceText(team, player, opponent, model, type) {
  const phrase = model.livePhrases[rand(0, Math.max(0, model.livePhrases.length - 1))] || 'atak geliştirdi';
  const role = ROLE_LABELS[roleForPlayer(player)] || 'oyuncu';
  if (type === 'goal') return `GOOOOL! ${team.name} ${phrase}. ${player.name} (${role}) ceza sahasında soğukkanlı bitirdi!`;
  if (type === 'save') return `${team.name} ${phrase}. ${player.name} vurdu, ${opponent.name} kalecisi harika kurtardı!`;
  if (type === 'woodwork') return `${team.name} ${phrase}. ${player.name} çok sert vurdu, top direkten döndü!`;
  return `${team.name} ${phrase}. ${player.name} pozisyona girdi ama top az farkla auta çıktı.`;
}

function simulateMinuteMatch(home, away, homeLineup, awayLineup, homeBase, awayBase, homeTactic, awayTactic) {
  let liveHome = 0;
  let liveAway = 0;
  let homePossessionTicks = 0;
  let awayPossessionTicks = 0;
  let shotsHome = 0;
  let shotsAway = 0;
  let shotsOnHome = 0;
  let shotsOnAway = 0;
  let xgHome = 0;
  let xgAway = 0;
  let foulsHome = 0;
  let foulsAway = 0;
  let cornersHome = 0;
  let cornersAway = 0;
  let offsidesHome = 0;
  let offsidesAway = 0;
  let savesHome = 0;
  let savesAway = 0;
  const goals = [];

  const { homeModel, awayModel } = calculateTacticalModels(
    { lineup: homeLineup, tactic: homeTactic, base: homeBase },
    { lineup: awayLineup, tactic: awayTactic, base: awayBase }
  );
  const expectedHomeXg = calculateExpectedGoals(home, away, homeModel, awayModel, homeTactic);
  const expectedAwayXg = calculateExpectedGoals(away, home, awayModel, homeModel, awayTactic);

  const events = [
    event(1, 'commentary', `Hakem düdüğü çaldı. ${home.name} ${homeTactic.attack_style} planıyla, ${away.name} ${awayTactic.defense_style} savunmasıyla başladı.`, false, { home_score: 0, away_score: 0 })
  ];

  for (let minute = 2; minute <= 90; minute += 1) {
    const homeLive = minuteModel(homeModel, minute, liveHome - liveAway);
    const awayLive = minuteModel(awayModel, minute, liveAway - liveHome);
    const possessionHomeChance = clamp(50 + (homeLive.midfield - awayLive.midfield) * 0.55 + homeLive.possessionBias - awayLive.possessionBias, 28, 72) / 100;
    const homeHasBall = chance(possessionHomeChance);
    if (homeHasBall) homePossessionTicks += 1;
    else awayPossessionTicks += 1;

    const team = homeHasBall ? home : away;
    const opponent = homeHasBall ? away : home;
    const lineup = homeHasBall ? homeLineup : awayLineup;
    const model = homeHasBall ? homeLive : awayLive;
    const oppModel = homeHasBall ? awayLive : homeLive;
    const expectedAttackBoost = (homeHasBall ? expectedHomeXg : expectedAwayXg) * 0.012;
    const attackRate = clamp(0.09 + expectedAttackBoost + (model.attack - oppModel.defense) * 0.0034 + model.shotBias * 0.0085, 0.052, 0.26);
    const pressureMistake = minute > 68 && oppModel.fatigueRisk > 5 && chance(0.018 * oppModel.fatigueRisk);

    if (chance(attackRate) || pressureMistake) {
      const shooter = chooseAttacker(lineup);
      const assist = chooseAssist(lineup, shooter);
      logEventPlayer('shot', shooter, team);
      const xg = weightedXg(model, oppModel, minute);
      const keeperEffect = clamp((oppModel.goalkeeper - 70) * 0.004, -0.05, 0.08);
      const goalChance = clamp(0.115 + xg * 0.58 - keeperEffect, 0.052, 0.44);
      const onTarget = chance(clamp(0.4 + xg * 0.78 + (model.attack - oppModel.defense) * 0.003, 0.32, 0.84));
      const isGoal = onTarget && chance(goalChance);
      const sideHome = team.id === home.id;

      if (sideHome) {
        shotsHome += 1;
        xgHome += xg;
        if (onTarget) shotsOnHome += 1;
      } else {
        shotsAway += 1;
        xgAway += xg;
        if (onTarget) shotsOnAway += 1;
      }

      if (isGoal) {
        logEventPlayer('goal', shooter, team);
        if (sideHome) liveHome += 1;
        else liveAway += 1;
        goals.push({ player: shooter, assist, team });
        events.push(event(minute, 'goal', `${chanceText(team, shooter, opponent, model, 'goal')} Asist: ${assist?.name || 'asistsiz'}.`, true, {
          team_id: team.id,
          team_name: team.name,
          scorer_id: shooter.id,
          scorer_name: shooter.name,
          assist_id: assist?.id || null,
          assist_name: assist?.name || null,
          home_score: liveHome,
          away_score: liveAway
        }));
      } else if (onTarget) {
        if (sideHome) savesAway += 1;
        else savesHome += 1;
        events.push(event(minute, 'save', chanceText(team, shooter, opponent, model, 'save'), true, { team_id: team.id, playerId: shooter.id, playerName: shooter.name, scorer_id: shooter.id, scorer_name: shooter.name, home_score: liveHome, away_score: liveAway }));
      } else if (chance(0.12)) {
        events.push(event(minute, 'woodwork', chanceText(team, shooter, opponent, model, 'woodwork'), true, { team_id: team.id, playerId: shooter.id, playerName: shooter.name, scorer_id: shooter.id, scorer_name: shooter.name, home_score: liveHome, away_score: liveAway }));
      } else if (chance(0.42)) {
        events.push(event(minute, 'miss', chanceText(team, shooter, opponent, model, 'miss'), true, { team_id: team.id, playerId: shooter.id, playerName: shooter.name, scorer_id: shooter.id, scorer_name: shooter.name, home_score: liveHome, away_score: liveAway }));
      }

      if (chance(0.18)) sideHome ? cornersHome += 1 : cornersAway += 1;
      if (chance(0.09 + model.tactic.defensive_line * 0.0005)) sideHome ? offsidesHome += 1 : offsidesAway += 1;
    }

    if (chance(0.055 + (homeLive.foulBias + awayLive.foulBias) / 2000)) {
      const foulByHome = chance(0.5 + (homeLive.foulBias - awayLive.foulBias) / 200);
      if (foulByHome) foulsHome += 1;
      else foulsAway += 1;
      const foulingTeam = foulByHome ? home : away;
      const fouledTeam = foulByHome ? away : home;
      events.push(event(minute, 'foul', `${foulingTeam.name} agresif bastı, ${fouledTeam.name} atağı faulle kesildi.`, chance(0.18), {
        team_id: foulingTeam.id,
        home_score: liveHome,
        away_score: liveAway
      }));
    }

    if (minute === 35 && homeModel.tactic.defensive_line > 70) {
      events.push(event(minute, 'commentary', `${home.name} savunma çizgisi çok önde. Arkaya atılan toplar risk yaratıyor.`, true, { team_id: home.id, home_score: liveHome, away_score: liveAway }));
    }
    if (minute === 62 && (homeModel.fatigueRisk > 5 || awayModel.fatigueRisk > 5)) {
      const tired = homeModel.fatigueRisk > awayModel.fatigueRisk ? home : away;
      events.push(event(minute, 'commentary', `${tired.name} yüksek pres yüzünden yorulmaya başladı. Son bölümde savunma hatası riski artıyor.`, true, { team_id: tired.id, home_score: liveHome, away_score: liveAway }));
    }
    if (minute === 72) {
      const trailing = liveHome < liveAway ? home : liveAway < liveHome ? away : null;
      if (trailing) events.push(event(minute, 'substitution', `${trailing.name} geride olduğu için baskıyı artırıp kenardan hamle hazırlıyor.`, false, { team_id: trailing.id, home_score: liveHome, away_score: liveAway }));
    }
  }

  const totalPossession = homePossessionTicks + awayPossessionTicks || 1;
  const addSyntheticGoal = (sideHome, minute, addedXg = 0.28) => {
    const team = sideHome ? home : away;
    const opponent = sideHome ? away : home;
    const lineup = sideHome ? homeLineup : awayLineup;
    const model = sideHome ? homeModel : awayModel;
    const scorer = chooseAttacker(lineup);
    const assist = chooseAssist(lineup, scorer);
    logEventPlayer('goal', scorer, team);
    if (sideHome) {
      liveHome += 1;
      shotsHome += 1;
      shotsOnHome += 1;
      xgHome += addedXg;
    } else {
      liveAway += 1;
      shotsAway += 1;
      shotsOnAway += 1;
      xgAway += addedXg;
    }
    goals.push({ player: scorer, assist, team });
    events.push(event(minute, 'goal', `${chanceText(team, scorer, opponent, model, 'goal')} Asist: ${assist?.name || 'asistsiz'}.`, true, {
      team_id: team.id,
      team_name: team.name,
      scorer_id: scorer.id,
      scorer_name: scorer.name,
      assist_id: assist?.id || null,
      assist_name: assist?.name || null,
      home_score: liveHome,
      away_score: liveAway
    }));
  };

  if (liveHome === 0 && liveAway === 0 && chance(clamp((expectedHomeXg + expectedAwayXg - 1.4) * 0.28, 0.08, 0.45))) {
    const sideHome = chance(expectedHomeXg / Math.max(0.1, expectedHomeXg + expectedAwayXg));
    addSyntheticGoal(sideHome, rand(58, 72), 0.32);
  }

  if (liveHome + liveAway < 2 && chance(clamp((expectedHomeXg + expectedAwayXg - 1.7) * 0.32, 0.16, 0.62))) {
    const homeNeed = Math.max(0.1, expectedHomeXg - liveHome * 0.85);
    const awayNeed = Math.max(0.1, expectedAwayXg - liveAway * 0.85);
    addSyntheticGoal(chance(homeNeed / (homeNeed + awayNeed)), rand(74, 89), 0.26);
  }

  const possessionHome = clamp(Math.round((homePossessionTicks / totalPossession) * 100), 28, 72);
  const stats = {
    possession_home: possessionHome,
    shots_home: shotsHome,
    shots_away: shotsAway,
    shots_on_home: shotsOnHome,
    shots_on_away: shotsOnAway,
    pass_home: clamp(Math.round(70 + (homeModel.midfield - 68) * 0.32 + (homeTactic.attack_style === 'tiki_taka' ? 7 : 0)), 55, 94),
    pass_away: clamp(Math.round(70 + (awayModel.midfield - 68) * 0.32 + (awayTactic.attack_style === 'tiki_taka' ? 7 : 0)), 55, 94),
    fouls_home: foulsHome,
    fouls_away: foulsAway,
    corners_home: cornersHome,
    corners_away: cornersAway,
    offsides_home: offsidesHome,
    offsides_away: offsidesAway,
    xg_home: Number(xgHome.toFixed(2)),
    xg_away: Number(xgAway.toFixed(2)),
    saves_home: savesHome,
    saves_away: savesAway,
    tackles_home: clamp(Math.round(10 + homeModel.defense * 0.12 + homeTactic.aggression * 0.08), 8, 36),
    tackles_away: clamp(Math.round(10 + awayModel.defense * 0.12 + awayTactic.aggression * 0.08), 8, 36),
    successful_press_home: homeModel.successfulPress,
    successful_press_away: awayModel.successfulPress,
    tactic_score_home: homeModel.tacticScore,
    tactic_score_away: awayModel.tacticScore,
    tactical_summary: `${home.name}: ${homeModel.summary} ${away.name}: ${awayModel.summary}`,
    expected_xg_home: expectedHomeXg,
    expected_xg_away: expectedAwayXg,
    tactic_attack_bonus_home: Number((homeModel.attack - homeBase.attack).toFixed(1)),
    tactic_attack_bonus_away: Number((awayModel.attack - awayBase.attack).toFixed(1)),
    tactic_defense_bonus_home: Number((homeModel.defense - homeBase.defense).toFixed(1)),
    tactic_defense_bonus_away: Number((awayModel.defense - awayBase.defense).toFixed(1))
  };

  if (events.length < 8) {
    events.push(event(rand(48, 70), 'commentary', `${home.name} ve ${away.name} orta sahada taktik satranç oynuyor, tempo kontrollü.`, false, { home_score: liveHome, away_score: liveAway }));
  }
  events.push(event(90, 'commentary', `Maç bitti. Skor: ${home.name} ${liveHome} - ${liveAway} ${away.name}.`, false, { home_score: liveHome, away_score: liveAway }));

  return {
    homeGoals: liveHome,
    awayGoals: liveAway,
    stats,
    events: events.sort((a, b) => a.minute - b.minute),
    goals,
    models: { homeModel, awayModel }
  };
}

async function updateTable(userId, home, away, homeGoals, awayGoals) {
  await ensureCareerForUser(userId);
  const homePoints = homeGoals > awayGoals ? 3 : homeGoals === awayGoals ? 1 : 0;
  const awayPoints = awayGoals > homeGoals ? 3 : awayGoals === homeGoals ? 1 : 0;
  const homeForm = homeGoals > awayGoals ? 'W' : homeGoals === awayGoals ? 'D' : 'L';
  const awayForm = awayGoals > homeGoals ? 'W' : awayGoals === homeGoals ? 'D' : 'L';

  await run(`UPDATE league_standings SET points = points + ?, wins = wins + ?, draws = draws + ?, losses = losses + ?,
    goals_for = goals_for + ?, goals_against = goals_against + ?, form = substr(form || ?, -5)
    WHERE user_id = ? AND team_id = ?`, [homePoints, homeGoals > awayGoals ? 1 : 0, homeGoals === awayGoals ? 1 : 0, homeGoals < awayGoals ? 1 : 0, homeGoals, awayGoals, homeForm, userId, home.id]);
  await run(`UPDATE league_standings SET points = points + ?, wins = wins + ?, draws = draws + ?, losses = losses + ?,
    goals_for = goals_for + ?, goals_against = goals_against + ?, form = substr(form || ?, -5)
    WHERE user_id = ? AND team_id = ?`, [awayPoints, awayGoals > homeGoals ? 1 : 0, awayGoals === homeGoals ? 1 : 0, awayGoals < homeGoals ? 1 : 0, awayGoals, homeGoals, awayForm, userId, away.id]);
}

async function playPair(userId, home, away, matchDay = null) {
  const [homeLineup, awayLineup, homeTactic, awayTactic] = await Promise.all([
    lineupForTeam(home.id),
    lineupForTeam(away.id),
    tacticForTeam(home),
    tacticForTeam(away)
  ]);
  const homePower = calculateTeamStrength(homeLineup, home, { home: true });
  const awayPower = calculateTeamStrength(awayLineup, away, { home: false });
  const simulation = simulateMinuteMatch(home, away, homeLineup, awayLineup, homePower, awayPower, homeTactic, awayTactic);
  const { homeGoals, awayGoals, stats, events } = simulation;
  console.log('MATCH ENGINE CHECK', {
    homeTeam: home.name,
    awayTeam: away.name,
    homeXg: stats.xg_home,
    awayXg: stats.xg_away,
    expectedHomeXg: stats.expected_xg_home,
    expectedAwayXg: stats.expected_xg_away,
    homeGoals,
    awayGoals,
    tacticAttackBonus: {
      home: stats.tactic_attack_bonus_home,
      away: stats.tactic_attack_bonus_away
    },
    tacticDefenseBonus: {
      home: stats.tactic_defense_bonus_home,
      away: stats.tactic_defense_bonus_away
    }
  });
  const allPlayers = [...homeLineup, ...awayLineup];
  const man = [...allPlayers].sort((a, b) => b.overall - a.overall)[rand(0, Math.min(4, allPlayers.length - 1))] || allPlayers[0];

  const match = await run(`
    INSERT INTO matches
      (user_id, home_club_id, away_club_id, home_score, away_score, match_day, match_date, played, possession_home, shots_home, shots_away,
       shots_on_home, shots_on_away, pass_home, pass_away, fouls_home, fouls_away, corners_home, corners_away,
       offsides_home, offsides_away, xg_home, xg_away, saves_home, saves_away, tackles_home, tackles_away,
       successful_press_home, successful_press_away, tactic_score_home, tactic_score_away, tactical_summary, man_of_match)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    userId, home.id, away.id, homeGoals, awayGoals, matchDay, matchDay ? seasonDate(matchDay) : seasonDate(1), stats.possession_home, stats.shots_home, stats.shots_away,
    stats.shots_on_home, stats.shots_on_away, stats.pass_home, stats.pass_away, stats.fouls_home, stats.fouls_away,
    stats.corners_home, stats.corners_away, stats.offsides_home, stats.offsides_away, stats.xg_home, stats.xg_away,
    stats.saves_home, stats.saves_away, stats.tackles_home, stats.tackles_away, stats.successful_press_home,
    stats.successful_press_away, stats.tactic_score_home, stats.tactic_score_away, stats.tactical_summary, man?.name || '-'
  ]);

  for (const item of events) {
    await run('INSERT INTO match_events (match_id, minute, event_text, event_type, is_highlight, team_id, scorer_id, assist_id, home_score, away_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      match.id, item.minute, item.event_text, item.event_type, item.is_highlight, item.team_id || null, item.scorer_id || null, item.assist_id || null, item.home_score || 0, item.away_score || 0
    ]);
  }

  for (const player of allPlayers) {
    await run('INSERT INTO match_player_ratings (match_id, player_id, team_id, rating, goals, assists) VALUES (?, ?, ?, ?, ?, ?)', [
      match.id, player.id, player.team_id, Number((6 + Math.random() * 2.8 + (player.id === man?.id ? 1 : 0)).toFixed(1)),
      events.some((item) => item.scorer_id === player.id) ? 1 : 0,
      events.some((item) => item.assist_id === player.id) ? 1 : 0
    ]);
  }

  await updateTable(userId, home, away, homeGoals, awayGoals);
  return {
    match: await get('SELECT * FROM matches WHERE id = ?', [match.id]),
    home,
    away,
    events,
    stats,
    playerRatings: await all('SELECT tr.*, p.name, p.position FROM match_player_ratings tr JOIN players p ON p.id = tr.player_id WHERE tr.match_id = ? ORDER BY rating DESC', [match.id])
  };
}

async function playTeamMatch(userTeamId, userId = null) {
  const userTeam = await get('SELECT * FROM teams WHERE id = ?', [userTeamId]);
  const opponent = await get('SELECT * FROM teams WHERE id != ? ORDER BY RANDOM() LIMIT 1', [userTeamId]);
  const state = userId ? await getCareerState(userId) : await get('SELECT * FROM game_state WHERE id = 1');
  const home = Math.random() > 0.45 ? userTeam : opponent;
  const away = home.id === userTeam.id ? opponent : userTeam;
  return playPair(userId, home, away, state?.next_match_day || null);
}

async function playLeagueRound(userTeamId, userId) {
  await ensureCareerForUser(userId);
  const [teams, state] = await Promise.all([
    all('SELECT * FROM teams ORDER BY id ASC'),
    getCareerState(userId)
  ]);
  const currentWeek = Number(state.week || 1);
  const totalWeeks = leagueWeeksForTeamCount(teams.length);
  const existingTable = async () => all(`
    SELECT t.*, COALESCE(ls.points, 0) AS points, COALESCE(ls.wins, 0) AS wins,
      COALESCE(ls.draws, 0) AS draws, COALESCE(ls.losses, 0) AS losses,
      COALESCE(ls.goals_for, 0) AS goals_for, COALESCE(ls.goals_against, 0) AS goals_against,
      COALESCE(ls.form, '') AS form,
      (COALESCE(ls.wins, 0) + COALESCE(ls.draws, 0) + COALESCE(ls.losses, 0)) AS played,
      (COALESCE(ls.goals_for, 0) - COALESCE(ls.goals_against, 0)) AS goal_difference
    FROM teams t
    LEFT JOIN league_standings ls ON ls.team_id = t.id AND ls.user_id = ?
    ORDER BY points DESC, goal_difference DESC, goals_for DESC, t.name ASC
  `, [userId]);

  if (currentWeek > totalWeeks) {
    const table = await existingTable();
    return {
      competitionType: 'super_lig',
      standingsCompetition: 'super_lig',
      shownStandingsCompetition: 'super_lig',
      featured: null,
      results: [],
      table,
      seasonComplete: true,
      seasonSummary: buildSeasonSummary(table, userTeamId, totalWeeks)
    };
  }

  const pairList = getLeaguePairingsForWeek(teams, currentWeek);

  const results = [];
  let featured = null;
  for (const [home, away] of pairList) {
    const result = await playPair(userId, home, away, state.next_match_day);
    results.push(result);
    if (home.id === userTeamId || away.id === userTeamId) featured = result;
  }

  const table = await existingTable();
  const seasonComplete = currentWeek >= totalWeeks;
  await run('UPDATE career_states SET week = ?, next_match_day = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?', [
    seasonComplete ? totalWeeks + 1 : currentWeek + 1,
    seasonComplete ? state.next_match_day : state.next_match_day + 7,
    userId
  ]);
  return {
    competitionType: 'super_lig',
    standingsCompetition: 'super_lig',
    shownStandingsCompetition: 'super_lig',
    featured,
    results,
    table,
    seasonComplete,
    seasonSummary: seasonComplete ? buildSeasonSummary(table, userTeamId, totalWeeks) : null
  };
}

module.exports = {
  playTeamMatch,
  playLeagueRound,
  lineupForTeam,
  getLeaguePairingsForWeek,
  leagueWeeksForTeamCount,
  buildSeasonSummary
};
