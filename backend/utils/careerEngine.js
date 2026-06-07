const clubModel = require('../models/clubModel');
const { all, get, run, getCareerState } = require('../database');
const { createInboxMessage } = require('./inboxEngine');
const { seasonDate } = require('./seasonCalendar');
const { buildSeasonPlan } = require('./seasonPlanning');

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
}

function seeded(day, salt = 1) {
  const raw = Math.sin((Number(day || 1) + salt) * 9301) * 10000;
  return raw - Math.floor(raw);
}

function boardStatus(confidence) {
  if (confidence < 25) return 'Kovulma Tehlikesi';
  if (confidence < 45) return 'Kritik';
  if (confidence < 62) return 'Baskı Altında';
  return 'Güvende';
}

async function ensureCareerMood(userId) {
  const club = await clubModel.getByUserId(userId);
  if (!club) return null;
  const table = await clubModel.table(userId);
  const rank = table.findIndex((team) => Number(team.id) === Number(club.team_id)) + 1 || 10;
  const row = table[rank - 1] || {};
  const played = Number(row.played || 0);
  const form = String(row.form || '').slice(-5);
  const formScore = [...form].reduce((sum, char) => sum + (char === 'G' ? 7 : char === 'B' ? 1 : char === 'M' ? -6 : 0), 0);
  const rankScore = played < 4 ? 0 : rank <= 4 ? 12 : rank <= 8 ? 4 : rank <= 13 ? -7 : -16;
  const fan = clamp((club.fan_satisfaction ?? 65) + Math.round((formScore + rankScore) / 8), 0, 100);
  const confidence = clamp((club.board_confidence ?? 70) + Math.round((fan - 55) / 12) + (rank <= 4 ? 2 : rank > 13 ? -4 : 0), 0, 100);
  const status = boardStatus(confidence);
  await run('UPDATE clubs SET fan_satisfaction = ?, board_confidence = ?, board_status = ? WHERE user_id = ?', [fan, confidence, status, userId]);
  return { ...club, fan_satisfaction: fan, board_confidence: confidence, board_status: status, rank, played };
}

async function updateClubMoodAfterMatch(userId, result) {
  const club = await clubModel.getByUserId(userId);
  const featured = result?.featured;
  if (!club || !featured?.match) return null;
  const isHome = Number(featured.home?.id || featured.home?.team_id) === Number(club.team_id);
  const goalsFor = isHome ? Number(featured.match.home_score || 0) : Number(featured.match.away_score || 0);
  const goalsAgainst = isHome ? Number(featured.match.away_score || 0) : Number(featured.match.home_score || 0);
  const delta = goalsFor > goalsAgainst ? 5 : goalsFor === goalsAgainst ? 0 : -6;
  const fan = clamp(Number(club.fan_satisfaction ?? 65) + delta);
  const confidence = clamp(Number(club.board_confidence ?? 70) + Math.round(delta * 0.7));
  const status = boardStatus(confidence);
  await run('UPDATE clubs SET fan_satisfaction = ?, board_confidence = ?, board_status = ? WHERE user_id = ?', [fan, confidence, status, userId]);
  if (fan <= 28) {
    const state = await getCareerState(userId);
    await createInboxMessage(userId, {
      teamId: club.team_id,
      day: state.current_day,
      category: 'management',
      priority: 'urgent',
      uniqueKey: `fan_pressure_${club.team_id}_${state.current_day}`,
      title: 'Taraftar tepkisi yükseldi',
      summary: `Taraftar memnuniyeti %${fan}. Tribünlerden reaksiyon bekleniyor.`,
      body: `Son sonuçların ardından taraftar memnuniyeti %${fan} seviyesine düştü. Yönetim kısa sürede oyun ve sonuçlarda toparlanma bekliyor.`
    });
  }
  if (confidence <= 28 && !Number(club.ultimatum_until_day || 0)) {
    const state = await getCareerState(userId);
    const until = Number(state.current_day || 1) + 21;
    await run('UPDATE clubs SET ultimatum_until_day = ? WHERE user_id = ?', [until, userId]);
    await createInboxMessage(userId, {
      teamId: club.team_id,
      day: state.current_day,
      category: 'management',
      priority: 'urgent',
      uniqueKey: `ultimatum_${club.team_id}_${state.current_day}`,
      title: 'Yönetim ultimatom verdi',
      summary: `Yönetim ${seasonDate(until)} tarihine kadar toparlanma bekliyor.`,
      body: `Yönetim güveni kritik seviyeye indi. Önümüzdeki maçlarda belirgin toparlanma olmazsa görev değişikliği masaya gelebilir.`
    });
  }
  return { fanSatisfaction: fan, boardConfidence: confidence, boardStatus: status };
}

async function checkUltimatum(userId) {
  const club = await clubModel.getByUserId(userId);
  const state = await getCareerState(userId);
  if (!club || !Number(club.ultimatum_until_day || 0)) return;
  if (Number(state.current_day || 1) < Number(club.ultimatum_until_day || 0)) return;
  if (Number(club.board_confidence || 70) >= 36) {
    await run('UPDATE clubs SET ultimatum_until_day = 0 WHERE user_id = ?', [userId]);
    return;
  }
  await run('UPDATE clubs SET fired = 1, board_status = ?, ultimatum_until_day = 0 WHERE user_id = ?', ['Kovuldu', userId]);
  await createInboxMessage(userId, {
    teamId: club.team_id,
    day: state.current_day,
    category: 'management',
    priority: 'urgent',
    uniqueKey: `fired_${club.team_id}_${state.current_day}`,
    title: 'Görevden ayrılık kararı',
    summary: 'Yönetim görev değişikliği kararı aldı. Kariyerin bitmedi, yeni kulüp tekliflerini bekleyebilirsin.',
    body: 'Kulüp yönetimi kötü gidiş nedeniyle teknik ekipte değişiklik kararı aldı. Menajer kariyerin devam ediyor; yeni teklif geldiğinde farklı kulübe geçebilirsin.'
  });
}

async function maybeCreateClubOffer(userId, day) {
  const club = await clubModel.getByUserId(userId);
  const profile = await get('SELECT total_xp FROM manager_profiles WHERE user_id = ?', [userId]);
  const totalXp = Number(profile?.total_xp || 0);
  const fan = Number(club?.fan_satisfaction || 65);
  if (!club || (totalXp < 300 && fan < 72 && !Number(club.fired || 0))) return;
  if (day % 9 !== 0 && !Number(club.fired || 0)) return;
  const existing = await get("SELECT id FROM club_offers WHERE user_id = ? AND status = 'pending' AND expires_day >= ?", [userId, day]);
  if (existing) return;
  const teams = await all('SELECT * FROM teams WHERE id != ? ORDER BY overall DESC', [club.team_id]);
  const pool = teams.filter((team) => Number(team.overall || 0) <= Math.max(88, Number(club.team_overall || 70) + Math.floor(totalXp / 700) + 4));
  const target = pool[Math.floor(seeded(day, userId) * Math.max(1, pool.length))] || teams[0];
  if (!target) return;
  const inserted = await run(`
    INSERT INTO club_offers (user_id, from_team_id, title, offered_day, expires_day)
    VALUES (?, ?, ?, ?, ?)
  `, [userId, target.id, `${target.name} teknik direktörlük teklifi`, day, day + 21]);
  await createInboxMessage(userId, {
    teamId: club.team_id,
    day,
    category: 'management',
    priority: Number(target.overall || 70) >= 78 ? 'important' : 'normal',
    uniqueKey: `club_offer_${inserted.id}`,
    title: `${target.name} seni istiyor`,
    summary: `${target.name}, kariyer performansın sonrası görüşmek istiyor.`,
    body: `${target.name} yönetimi seninle çalışmak istiyor. Kabul edersen mevcut kariyer menajer profilin korunur ve yeni kulüpte devam edersin.`,
    actionType: 'club_offer',
    payload: { offerId: inserted.id, teamId: target.id, teamName: target.name }
  });
}

async function maybeSponsorOffer(userId, day) {
  if (day % 12 !== 0) return;
  const club = await clubModel.getByUserId(userId);
  if (!club) return;
  const active = await get("SELECT id FROM sponsor_deals WHERE user_id = ? AND status IN ('offer','active') AND end_day >= ?", [userId, day]);
  if (active) return;
  const names = ['TactiBank', 'Anadolu Enerji', 'MaviNet', 'Sportiva', 'ArenaPlus'];
  const sponsorName = names[day % names.length];
  const base = 800000 + Number(club.fan_satisfaction || 65) * 28000 + Number(club.team_overall || 70) * 45000;
  const income = Math.round(base / 50000) * 50000;
  const inserted = await run(`
    INSERT INTO sponsor_deals (user_id, sponsor_name, income, bonus, status, start_day, end_day)
    VALUES (?, ?, ?, ?, 'offer', ?, ?)
  `, [userId, sponsorName, income, Math.round(income * 0.15), day, 305]);
  await createInboxMessage(userId, {
    teamId: club.team_id,
    day,
    category: 'management',
    priority: 'important',
    uniqueKey: `sponsor_offer_${inserted.id}`,
    title: 'Yeni sponsor teklifi',
    summary: `${sponsorName}, sezonluk ${Math.round(income / 35).toLocaleString('tr-TR')} EUR gelir öneriyor.`,
    body: `${sponsorName} kulübe sezonluk sponsorluk teklif etti. Performans yükseldikçe bonus geliri de artacak.`,
    actionType: 'sponsor_offer',
    payload: { sponsorId: inserted.id, sponsorName, income }
  });
}

async function maybeAcademyReport(userId, day) {
  if (day % 21 !== 0) return;
  const club = await clubModel.getByUserId(userId);
  if (!club) return;
  const existing = await get('SELECT id FROM academy_reports WHERE user_id = ? AND report_day = ?', [userId, day]);
  if (existing) return;
  const positions = ['GK', 'DEF', 'MID', 'FWD'];
  const position = positions[day % positions.length];
  const overall = 55 + Math.floor(seeded(day, club.team_id) * 10);
  const potential = Math.min(88, overall + 10 + Math.floor(seeded(day, userId + 77) * 12));
  const names = ['Akademi Umut', 'Genç Yıldız', 'Altyapı Aslanı', 'Yeni Nesil', 'TactiCore Genci'];
  const name = `${names[day % names.length]} ${day}`;
  const salary = 35000 * 35;
  const value = Math.round((250000 + (potential - 65) * 65000) * 35);
  const created = await run(`
    INSERT INTO players
      (team_id, name, age, nationality, position, overall, pace, shooting, passing, dribbling, defending, physical, stamina, morale, salary, market_value, base_market_value, potential, contract_until, happiness, playing_time, lineup_role)
    VALUES (?, ?, 17, 'Türkiye', ?, ?, ?, ?, ?, ?, ?, ?, 72, 70, ?, ?, ?, ?, 2029, 72, 20, 'reserve')
  `, [
    club.team_id,
    name,
    position,
    overall,
    58 + Math.floor(seeded(day, 2) * 18),
    45 + Math.floor(seeded(day, 3) * 18),
    50 + Math.floor(seeded(day, 4) * 18),
    52 + Math.floor(seeded(day, 5) * 18),
    48 + Math.floor(seeded(day, 6) * 18),
    54 + Math.floor(seeded(day, 7) * 18),
    salary,
    value,
    value,
    potential
  ]);
  const summary = `${name} akademiden A takıma önerildi. OVR ${overall}, potansiyel ${potential}.`;
  await run('INSERT INTO academy_reports (user_id, player_id, report_day, summary) VALUES (?, ?, ?, ?)', [userId, created.id, day, summary]);
  await createInboxMessage(userId, {
    teamId: club.team_id,
    day,
    category: 'scout',
    priority: potential >= 80 ? 'important' : 'normal',
    uniqueKey: `academy_${created.id}`,
    title: 'Akademiden genç oyuncu raporu',
    summary,
    body: `Altyapı ekibi ${name} için olumlu rapor verdi. Doğru antrenmanla gelişim gösterebilir.`,
    actionType: 'scout_review',
    payload: { playerId: created.id, playerName: name, redirect: '/squad.html' }
  });
}

async function processSpyReportsForDay(userId, day) {
  const reports = await all(`
    SELECT sr.*, t.name AS target_team_name
    FROM spy_reports sr
    JOIN teams t ON t.id = sr.target_team_id
    WHERE sr.user_id = ? AND sr.status = 'pending' AND sr.reveal_day > 0 AND sr.reveal_day <= ?
  `, [userId, day]);
  for (const report of reports) {
    await run("UPDATE spy_reports SET status = 'completed' WHERE id = ?", [report.id]);
    await createInboxMessage(userId, {
      teamId: report.target_team_id,
      day,
      category: 'scout',
      priority: Number(report.success || 0) ? 'important' : 'urgent',
      uniqueKey: `spy_ready_${report.id}`,
      title: Number(report.success || 0) ? 'Casus raporu hazır' : 'Casus yakalandı',
      summary: Number(report.success || 0)
        ? `${report.target_team_name} raporu hazırlandı.`
        : `${report.target_team_name} operasyonunda casus yakalandı.`,
      body: Number(report.success || 0)
        ? `${report.target_team_name} için hazırlanan casus raporu Casus Merkezi'nde açıldı.`
        : 'Casus yakalandığı için bilgi alınamadı ve harcanan coin iade edilmedi.',
      actionType: 'scout_review',
      payload: { redirect: '/spy.html' }
    });
  }
}

async function dailyRandomEvent(userId, day) {
  const club = await clubModel.getByUserId(userId);
  if (!club) return;
  const roll = seeded(day, userId);
  const players = await all('SELECT id, name, morale, stamina FROM players WHERE team_id = ? ORDER BY RANDOM() LIMIT 1', [club.team_id]);
  const player = players[0];
  if (roll < 0.18 && player) {
    const delta = seeded(day, 11) > 0.5 ? 4 : -4;
    await run('UPDATE players SET morale = MAX(1, MIN(99, morale + ?)) WHERE id = ?', [delta, player.id]);
    await createInboxMessage(userId, {
      teamId: club.team_id,
      day,
      category: 'player',
      uniqueKey: `daily_morale_${day}_${player.id}`,
      title: delta > 0 ? 'Oyuncu morali yükseldi' : 'Oyuncu morali düştü',
      summary: `${player.name} moralinde ${delta > 0 ? 'yükseliş' : 'düşüş'} var.`,
      body: `${player.name} için günlük moral değişimi raporlandı.`
    });
  } else if (false && roll < 0.27 && player) {
    const type = roll < 0.21 ? 'hafif' : roll < 0.25 ? 'orta' : 'ağır';
    const daysOut = type === 'hafif' ? 7 : type === 'orta' ? 21 : 45;
    await run('UPDATE players SET injured = 1, injury_type = ?, injury_return_day = ? WHERE id = ?', [type, day + daysOut, player.id]);
    await createInboxMessage(userId, {
      teamId: club.team_id,
      day,
      category: 'health',
      priority: type === 'ağır' ? 'urgent' : 'important',
      uniqueKey: `daily_injury_${day}_${player.id}`,
      title: `${player.name} sakatlandı`,
      summary: `${type} sakatlık. Tahmini dönüş: ${seasonDate(day + daysOut)}.`,
      body: `Sağlık ekibi ${player.name} için ${type} sakatlık raporu verdi. Oyuncu ${seasonDate(day + daysOut)} civarında dönebilir.`
    });
  } else if (roll < 0.36) {
    const delta = seeded(day, 13) > 0.5 ? 2 : -2;
    await run('UPDATE clubs SET fan_satisfaction = MAX(0, MIN(100, fan_satisfaction + ?)) WHERE user_id = ?', [delta, userId]);
    await createInboxMessage(userId, {
      teamId: club.team_id,
      day,
      category: 'management',
      uniqueKey: `daily_fans_${day}`,
      title: 'Taraftar nabzı değişti',
      summary: `Taraftar memnuniyeti ${delta > 0 ? 'arttı' : 'azaldı'}.`,
      body: 'Günlük medya ve tribün etkisi taraftar algısında küçük bir değişim yarattı.'
    });
  }
}

async function processInjuryReturns(userId, day) {
  const club = await clubModel.getByUserId(userId);
  if (!club) return;
  const players = await all(`
    SELECT id, name
    FROM players
    WHERE team_id = ? AND injured = 1 AND injury_return_day > 0 AND injury_return_day <= ?
  `, [club.team_id, day]);
  for (const player of players) {
    await run("UPDATE players SET injured = 0, injury_type = '', injury_return_day = 0 WHERE id = ?", [player.id]);
    await createInboxMessage(userId, {
      teamId: club.team_id,
      day,
      category: 'health',
      priority: 'normal',
      uniqueKey: `injury_return_${player.id}_${day}`,
      title: `${player.name} sahalara dondu`,
      summary: `${player.name} tedavisini tamamladı ve mac kadrosuna alinabilir.`,
      body: `Saglik ekibi ${player.name} icin olumlu rapor verdi. Oyuncu antrenmana ve mac kadrosuna donebilir.`
    });
  }
}

async function processDailyCareerEvents(userId, fromDay, toDay) {
  for (let day = Number(fromDay || 1) + 1; day <= Number(toDay || fromDay || 1); day += 1) {
    await processSpyReportsForDay(userId, day);
    await processInjuryReturns(userId, day);
    await dailyRandomEvent(userId, day);
    await maybeSponsorOffer(userId, day);
    await maybeAcademyReport(userId, day);
    await maybeCreateClubOffer(userId, day);
  }
  await ensureCareerMood(userId);
  await checkUltimatum(userId);
}

async function acceptClubOffer(userId, offerId) {
  const offer = await get("SELECT co.*, t.name AS team_name FROM club_offers co JOIN teams t ON t.id = co.from_team_id WHERE co.id = ? AND co.user_id = ? AND co.status = 'pending'", [offerId, userId]);
  if (!offer) throw new Error('Kulüp teklifi bulunamadı.');
  const team = await get('SELECT * FROM teams WHERE id = ?', [offer.from_team_id]);
  const plan = buildSeasonPlan(team || {});
  await run(`
    UPDATE clubs
    SET team_id = ?, name = ?, fan_satisfaction = 65, board_confidence = 72, board_status = 'Güvende',
      ultimatum_until_day = 0, fired = 0
    WHERE user_id = ?
  `, [team.id, team.name, userId]);
  await run('UPDATE clubs SET budget = ?, salary_budget = ?, season_objectives_json = ? WHERE user_id = ?', [
    plan.transferBudget,
    plan.salaryBudget,
    JSON.stringify(plan),
    userId
  ]);
  await run("UPDATE club_offers SET status = 'accepted' WHERE id = ?", [offer.id]);
  await run("UPDATE club_offers SET status = 'expired' WHERE user_id = ? AND status = 'pending' AND id != ?", [userId, offer.id]);
  return { message: `${team.name} teklifini kabul ettin. Yeni kulübünde göreve başladın.`, redirect: '/dashboard.html' };
}

async function acceptSponsorOffer(userId, sponsorId) {
  const sponsor = await get("SELECT * FROM sponsor_deals WHERE id = ? AND user_id = ? AND status = 'offer'", [sponsorId, userId]);
  if (!sponsor) throw new Error('Sponsor teklifi bulunamadı.');
  await run("UPDATE sponsor_deals SET status = 'active' WHERE id = ?", [sponsor.id]);
  await run('UPDATE clubs SET budget = budget + ? WHERE user_id = ?', [sponsor.income, userId]);
  return { message: `${sponsor.sponsor_name} sponsorluğu imzalandı. Bütçeye gelir eklendi.` };
}

module.exports = {
  ensureCareerMood,
  updateClubMoodAfterMatch,
  processDailyCareerEvents,
  acceptClubOffer,
  acceptSponsorOffer
};
