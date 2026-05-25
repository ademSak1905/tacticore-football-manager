const { run, get, all } = require('../database');
const playerModel = require('../models/playerModel');

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function tacticBonus(tactic = {}) {
  const mentality = tactic.mentality || 'balanced';
  const formation = tactic.formation || '4-4-2';
  let attack = 0;
  let defense = 0;

  if (mentality === 'attacking') attack += 4;
  if (mentality === 'defensive') defense += 4;
  if (formation === '4-3-3') attack += 3;
  if (formation === '3-5-2') attack += 2;
  if (formation === '4-2-3-1') defense += 2;
  if (formation === '4-4-2') defense += 1;

  return { attack, defense };
}

async function getTactic(clubId) {
  return get('SELECT * FROM tactics WHERE club_id = ?', [clubId]);
}

async function calculateTeamScore(clubId) {
  const [power, tactic] = await Promise.all([
    playerModel.averageStarterPower(clubId),
    getTactic(clubId)
  ]);
  const bonus = tacticBonus(tactic);
  const conditioning = (power.stamina - 50) * 0.09;
  const morale = (power.morale - 50) * 0.1;
  const tempo = ((tactic?.tempo || 55) - 50) * 0.03;
  const pressing = ((tactic?.pressing || 55) - 50) * 0.02;

  return {
    raw: power.power,
    attack: power.power + bonus.attack + conditioning + morale + tempo + rand(-5, 5),
    defense: power.power + bonus.defense + conditioning + morale + pressing + rand(-5, 5),
    morale: power.morale,
    stamina: power.stamina
  };
}

function buildEvents(homeName, awayName, homeGoals, awayGoals, stats) {
  const events = [
    { minute: rand(2, 8), event_text: 'Hakem maçı başlattı, iki takım da oyuna kontrollü girdi.' },
    { minute: rand(10, 18), event_text: `12. dakika civari ${homeName} kanattan hızlı çıktı.` },
    { minute: rand(22, 33), event_text: `${awayName} tehlikeli geldi, savunma son anda araya girdi.` },
    { minute: rand(55, 70), event_text: `Orta sahada tempo yukseldi, topa sahip olma ${stats.possessionHome}-${100 - stats.possessionHome}.` }
  ];

  for (let i = 0; i < homeGoals; i += 1) {
    events.push({ minute: rand(15, 88), event_text: `GOOOL! ${homeName} forveti kaleciyle karşı karşıya kaldi ve bitirdi.` });
  }
  for (let i = 0; i < awayGoals; i += 1) {
    events.push({ minute: rand(15, 88), event_text: `GOOOL! ${awayName} duran top sonrasi fileleri havalandirdi.` });
  }
  events.push({ minute: 90, event_text: `Maç bitti. Skor: ${homeName} ${homeGoals} - ${awayGoals} ${awayName}.` });

  return events.sort((a, b) => a.minute - b.minute);
}

function goalsFromPressure(attack, defense) {
  const edge = attack - defense;
  const expected = clamp(1.1 + edge * 0.055 + Math.random() * 1.3, 0, 4.7);
  let goals = 0;
  for (let i = 0; i < 5; i += 1) {
    if (Math.random() < expected / (3.4 + i)) goals += 1;
  }
  return clamp(goals, 0, 6);
}

async function applyLeagueResult(homeClubId, awayClubId, homeScore, awayScore) {
  const homePoints = homeScore > awayScore ? 3 : homeScore === awayScore ? 1 : 0;
  const awayPoints = awayScore > homeScore ? 3 : homeScore === awayScore ? 1 : 0;

  await run(`
    UPDATE clubs
    SET points = points + ?,
        wins = wins + ?,
        draws = draws + ?,
        losses = losses + ?,
        goals_for = goals_for + ?,
        goals_against = goals_against + ?
    WHERE id = ?
  `, [homePoints, homeScore > awayScore ? 1 : 0, homeScore === awayScore ? 1 : 0, homeScore < awayScore ? 1 : 0, homeScore, awayScore, homeClubId]);

  await run(`
    UPDATE clubs
    SET points = points + ?,
        wins = wins + ?,
        draws = draws + ?,
        losses = losses + ?,
        goals_for = goals_for + ?,
        goals_against = goals_against + ?
    WHERE id = ?
  `, [awayPoints, awayScore > homeScore ? 1 : 0, homeScore === awayScore ? 1 : 0, awayScore < homeScore ? 1 : 0, awayScore, homeScore, awayClubId]);
}

async function applyEconomy(clubId, result, stadiumCapacity) {
  const prize = result === 'win' ? 450000 : result === 'draw' ? 180000 : 70000;
  const ticketIncome = Math.round(stadiumCapacity * rand(12, 24));
  const sponsor = rand(90000, 180000);
  const salaries = await get('SELECT COALESCE(SUM(salary), 0) AS total FROM players WHERE club_id = ?', [clubId]);
  const wageCost = Math.round((salaries.total || 0) / 4);
  const net = prize + ticketIncome + sponsor - wageCost;
  await run('UPDATE clubs SET budget = budget + ? WHERE id = ?', [net, clubId]);
  return { prize, ticketIncome, sponsor, wageCost, net };
}

async function chooseOpponent(clubId) {
  return get('SELECT * FROM clubs WHERE id != ? ORDER BY RANDOM() LIMIT 1', [clubId]);
}

async function playMatch(userClub) {
  const opponent = await chooseOpponent(userClub.id);
  if (!opponent) throw new Error('Rakip takım bulunamadı.');

  const isHome = Math.random() > 0.45;
  const home = isHome ? userClub : opponent;
  const away = isHome ? opponent : userClub;
  const [homeScoreData, awayScoreData] = await Promise.all([
    calculateTeamScore(home.id),
    calculateTeamScore(away.id)
  ]);

  const homeGoals = goalsFromPressure(homeScoreData.attack + 2, awayScoreData.defense);
  const awayGoals = goalsFromPressure(awayScoreData.attack, homeScoreData.defense + 1);
  const possessionHome = clamp(Math.round(50 + (homeScoreData.raw - awayScoreData.raw) * 0.55 + rand(-9, 9)), 35, 65);
  const stats = {
    possessionHome,
    shotsHome: clamp(homeGoals * 3 + rand(3, 9), 2, 22),
    shotsAway: clamp(awayGoals * 3 + rand(3, 9), 2, 22),
    shotsOnHome: clamp(homeGoals + rand(1, 5), homeGoals, 12),
    shotsOnAway: clamp(awayGoals + rand(1, 5), awayGoals, 12),
    passHome: clamp(72 + Math.round((homeScoreData.raw - 55) * 0.25) + rand(-5, 7), 58, 91),
    passAway: clamp(72 + Math.round((awayScoreData.raw - 55) * 0.25) + rand(-5, 7), 58, 91),
    foulsHome: rand(7, 17),
    foulsAway: rand(7, 17),
    cornersHome: clamp(Math.floor((homeGoals + rand(1, 8))), 0, 12),
    cornersAway: clamp(Math.floor((awayGoals + rand(1, 8))), 0, 12)
  };

  const match = await run(
    `INSERT INTO matches
      (home_club_id, away_club_id, home_score, away_score, played, possession_home, shots_home, shots_away,
       shots_on_home, shots_on_away, pass_home, pass_away, fouls_home, fouls_away, corners_home, corners_away)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      home.id,
      away.id,
      homeGoals,
      awayGoals,
      stats.possessionHome,
      stats.shotsHome,
      stats.shotsAway,
      stats.shotsOnHome,
      stats.shotsOnAway,
      stats.passHome,
      stats.passAway,
      stats.foulsHome,
      stats.foulsAway,
      stats.cornersHome,
      stats.cornersAway
    ]
  );

  const events = buildEvents(home.name, away.name, homeGoals, awayGoals, stats);
  for (const event of events) {
    await run('INSERT INTO match_events (match_id, minute, event_text) VALUES (?, ?, ?)', [match.id, event.minute, event.event_text]);
  }

  await applyLeagueResult(home.id, away.id, homeGoals, awayGoals);
  const userGoals = isHome ? homeGoals : awayGoals;
  const opponentGoals = isHome ? awayGoals : homeGoals;
  const result = userGoals > opponentGoals ? 'win' : userGoals === opponentGoals ? 'draw' : 'loss';
  const economy = await applyEconomy(userClub.id, result, userClub.stadium_capacity);
  await run('UPDATE clubs SET last_match = ? WHERE id = ?', [`${userGoals}-${opponentGoals} ${opponent.name}`, userClub.id]);

  await run(`
    UPDATE players
    SET stamina = MAX(35, stamina - ?),
        morale = MIN(99, MAX(30, morale + ?))
    WHERE club_id = ?
  `, [rand(3, 9), result === 'win' ? 4 : result === 'draw' ? 1 : -3, userClub.id]);

  const storedMatch = await get('SELECT * FROM matches WHERE id = ?', [match.id]);
  return {
    match: storedMatch,
    home,
    away,
    events,
    stats,
    economy
  };
}

async function nextOpponent(clubId) {
  return chooseOpponent(clubId);
}

module.exports = {
  playMatch,
  nextOpponent,
  calculateTeamScore
};


