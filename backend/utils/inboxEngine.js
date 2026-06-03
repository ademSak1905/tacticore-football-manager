const clubModel = require('../models/clubModel');
const { all, get, run, getCareerState } = require('../database');
const { seasonDate } = require('./seasonCalendar');
const { parseSeasonPlan } = require('./seasonPlanning');
const { money: transferMoney } = require('./transferEngine');
const { calculateBaseMarketValue, roundInternalEuro, seededRatio } = require('./financeEngine');

const CATEGORIES = [
  { id: 'all', label: 'Tümü' },
  { id: 'management', label: 'Yönetim' },
  { id: 'transfer', label: 'Transfer' },
  { id: 'player', label: 'Oyuncu' },
  { id: 'health', label: 'Sakatlık' },
  { id: 'discipline', label: 'Ceza' },
  { id: 'scout', label: 'Scout' }
];

function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
}

function transferWindow(day) {
  const numeric = Number(day || 1);
  const summer = numeric >= 1 && numeric <= 45;
  const winter = numeric >= 153 && numeric <= 184;
  return {
    isOpen: summer || winter,
    name: summer ? 'Yaz transfer dönemi' : winter ? 'Devre arası transfer dönemi' : 'Transfer dönemi kapalı'
  };
}

function money(value) {
  return transferMoney ? transferMoney(value) : `${Math.round(Number(value || 0) / 35).toLocaleString('tr-TR')} EUR`;
}

async function createInboxMessage(userId, data) {
  if (!userId || !data?.uniqueKey) return null;
  const existing = await get('SELECT * FROM inbox_messages WHERE user_id = ? AND unique_key = ?', [userId, data.uniqueKey]);
  if (existing) return existing;
  const inserted = await run(`
    INSERT INTO inbox_messages
      (user_id, team_id, day, category, title, summary, body, priority, action_type, action_payload, unique_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    userId,
    data.teamId || null,
    Number(data.day || 1),
    data.category || 'management',
    data.title,
    data.summary,
    data.body || data.summary,
    data.priority || 'normal',
    data.actionType || null,
    JSON.stringify(data.payload || {}),
    data.uniqueKey
  ]);
  return get('SELECT * FROM inbox_messages WHERE id = ?', [inserted.id]);
}

async function createManagementMessages(userId, club, state) {
  const plan = parseSeasonPlan(club.season_objectives_json, club);
  await createInboxMessage(userId, {
    teamId: club.team_id,
    day: state.current_day,
    category: 'management',
    priority: 'important',
    uniqueKey: `management_targets_${club.team_id}_${plan.generatedAt || plan.season || 2025}`,
    title: 'Yönetim hedefleri açıklandı',
    summary: `Lig hedefi: ${plan.league?.label || 'Orta sıra'}. Transfer bütçesi: ${money(plan.transferBudget)}.`,
    body: [
      `Yönetim sezon başı hedeflerini paylaştı.`,
      `Lig hedefi: ${plan.league?.label || 'Orta sıra'}`,
      `Kupa hedefi: ${plan.cup?.label || 'Tur geçmek'}`,
      plan.championsLeague ? `Şampiyonlar Ligi hedefi: ${plan.championsLeague.label}` : null,
      `Transfer bütçesi: ${money(plan.transferBudget)}`,
      `Maaş bütçesi: ${money(plan.salaryBudget)}`
    ].filter(Boolean).join('\n')
  });

  const table = await clubModel.table(userId);
  const rank = table.findIndex((team) => Number(team.id) === Number(club.team_id)) + 1;
  const userRow = table[rank - 1];
  if (userRow && Number(userRow.played || 0) >= 6 && rank > 12) {
    await createInboxMessage(userId, {
      teamId: club.team_id,
      day: state.current_day,
      category: 'management',
      priority: 'urgent',
      uniqueKey: `management_warning_${club.team_id}_${Math.floor(Number(userRow.played || 0) / 4)}`,
      title: 'Yönetim kötü gidişten endişeli',
      summary: `${rank}. sıradasınız. Yönetim hızlı reaksiyon bekliyor.`,
      body: `Son haftalardaki sonuçlar yönetim kurulunda endişe yarattı. Takımın ligde ${rank}. sırada olması hedeflerin gerisinde kalındığını gösteriyor. Önümüzdeki maçlarda toparlanma bekleniyor.`
    });
  }
}

async function createHealthMessages(userId, club, state) {
  const injuredPlayers = await all(`
    SELECT id, name, position, injured
    FROM players
    WHERE team_id = ? AND injured = 1
    ORDER BY overall DESC, name ASC
    LIMIT 4
  `, [club.team_id]);
  for (const player of injuredPlayers) {
    const weeks = 2 + (Number(player.id) % 4);
    const returnDay = Number(state.current_day || 1) + weeks * 7;
    await createInboxMessage(userId, {
      teamId: club.team_id,
      day: state.current_day,
      category: 'health',
      priority: weeks >= 4 ? 'urgent' : 'important',
      uniqueKey: `injury_${player.id}_${weeks}`,
      title: `${player.name} sakatlandı`,
      summary: `Tahmini dönüş: ${formatDate(returnDay)}. Sağlık ekibi ${weeks} hafta dinlenme öneriyor.`,
      body: `Sağlık ekibi raporu: ${player.name} için yaklaşık ${weeks} haftalık tedavi süreci öngörülüyor. Oyuncunun tahmini dönüş tarihi ${formatDate(returnDay)}. Bu süreçte maç kadrosuna alınmaması tavsiye edilir.`
    });
  }
}

async function createDisciplineMessages(userId, club) {
  const rows = await all(`
    SELECT mpr.*, p.name, m.match_day
    FROM match_player_ratings mpr
    JOIN players p ON p.id = mpr.player_id
    JOIN matches m ON m.id = mpr.match_id
    WHERE m.user_id = ? AND mpr.team_id = ? AND (mpr.red_cards > 0 OR mpr.yellow_cards >= 2)
    ORDER BY m.match_day DESC, m.id DESC
    LIMIT 6
  `, [userId, club.team_id]);
  for (const row of rows) {
    const games = Number(row.red_cards || 0) > 0 ? 2 : 1;
    await createInboxMessage(userId, {
      teamId: club.team_id,
      day: row.match_day || 1,
      category: 'discipline',
      priority: 'important',
      uniqueKey: `suspension_${row.match_id}_${row.player_id}`,
      title: `${row.name} cezalı duruma düştü`,
      summary: `${row.name} ${games} maç forma giyemeyecek.`,
      body: `${row.name}, kart cezası nedeniyle ${games} maç oynayamayacak. Teknik ekibin sıradaki maç için alternatif plan hazırlaması gerekiyor.`
    });
  }
}

async function createPlayerRequestMessages(userId, club, state) {
  const players = await all(`
    SELECT id, name, position, morale, happiness, playing_time, salary, market_value, transfer_status, lineup_role
    FROM players
    WHERE team_id = ? AND (happiness < 52 OR morale < 52 OR playing_time < 36 OR transfer_status = 'unhappy')
    ORDER BY happiness ASC, morale ASC, playing_time ASC
    LIMIT 4
  `, [club.team_id]);
  for (const player of players) {
    const wantsTransfer = player.transfer_status === 'unhappy' || Number(player.happiness || 70) < 40;
    const topic = wantsTransfer
      ? 'transfer isteğini konuşmak istiyor'
      : Number(player.playing_time || 50) < 36
        ? 'daha fazla forma şansı istiyor'
        : Number(player.salary || 0) < Math.max(120000, Number(player.market_value || 0) * 0.015)
          ? 'maaş artışı talep ediyor'
          : 'takımdaki rolünü konuşmak istiyor';
    await createInboxMessage(userId, {
      teamId: club.team_id,
      day: state.current_day,
      category: 'player',
      priority: wantsTransfer ? 'important' : 'normal',
      uniqueKey: `player_request_${player.id}_${Math.floor(Number(state.current_day || 1) / 21)}`,
      title: `${player.name} görüşme istiyor`,
      summary: `${player.name} ${topic}.`,
      body: `${player.name} moral durumunun düştüğünü ve teknik ekiple görüşmek istediğini bildirdi. Güncel moral: ${player.morale}, mutluluk: ${player.happiness}, süre memnuniyeti: ${player.playing_time}.`,
      actionType: 'player_talk',
      payload: { playerId: player.id, playerName: player.name }
    });
  }
}

function tacticProfile(team = {}) {
  const attack = Number(team.attack_overall || team.overall || 70);
  const midfield = Number(team.midfield_overall || team.overall || 70);
  const defense = Number(team.defense_overall || team.overall || 70);
  const formation = team.default_formation
    || (attack >= defense + 4 ? '4-3-3' : defense >= attack + 4 ? '5-3-2' : midfield >= attack ? '4-2-3-1' : '4-4-2');
  const style = attack >= defense + 4
    ? 'Hucum agirlikli oynuyor, kanat ve onde baskiyi seviyor.'
    : defense >= attack + 4
      ? 'Daha temkinli oynuyor, savunma blogunu kalabalik tutmayi seviyor.'
      : midfield >= attack && midfield >= defense
        ? 'Orta saha kontrolunu seviyor, pas ritmiyle oyunu sakinlestiriyor.'
        : 'Dengeli oynuyor, macin gidisine gore tempo degistiriyor.';
  return { attack, midfield, defense, formation, style };
}

function resultTag(match, teamId, europeanTeamId = null) {
  const homeScore = Number(match.home_score || 0);
  const awayScore = Number(match.away_score || 0);
  const isHome = Number(match.home_team_id || match.home_club_id || 0) === Number(teamId)
    || (europeanTeamId && Number(match.home_european_team_id || 0) === Number(europeanTeamId));
  const teamScore = isHome ? homeScore : awayScore;
  const rivalScore = isHome ? awayScore : homeScore;
  if (teamScore > rivalScore) return 'G';
  if (teamScore < rivalScore) return 'M';
  return 'B';
}

function matchLine(match, teamId, europeanTeamId = null) {
  const competition = match.competition || 'Lig';
  const score = `${Number(match.home_score || 0)}-${Number(match.away_score || 0)}`;
  const tag = resultTag(match, teamId, europeanTeamId);
  return `${formatDate(match.match_day || 1)} - ${competition}: ${match.home_name || 'Ev sahibi'} ${score} ${match.away_name || 'Deplasman'} (${tag})`;
}

async function nextOpponentFixture(userId, club, state) {
  const teamId = Number(club.team_id);
  const currentDay = Math.max(1, Number(state.current_day || 1) - 1);
  const domestic = await get(`
    SELECT
      'league' AS source,
      'Süper Lig' AS competition,
      m.id,
      m.match_day,
      m.home_club_id AS home_team_id,
      m.away_club_id AS away_team_id,
      NULL AS home_european_team_id,
      NULL AS away_european_team_id,
      ht.name AS home_name,
      at.name AS away_name,
      ht.default_formation AS home_formation,
      at.default_formation AS away_formation,
      ht.overall AS home_overall,
      at.overall AS away_overall,
      ht.attack_overall AS home_attack,
      at.attack_overall AS away_attack,
      ht.midfield_overall AS home_midfield,
      at.midfield_overall AS away_midfield,
      ht.defense_overall AS home_defense,
      at.defense_overall AS away_defense
    FROM matches m
    LEFT JOIN teams ht ON ht.id = m.home_club_id
    LEFT JOIN teams at ON at.id = m.away_club_id
    WHERE m.user_id = ? AND m.played = 0 AND (m.home_club_id = ? OR m.away_club_id = ?) AND m.match_day >= ?
    ORDER BY m.match_day ASC, m.id ASC
    LIMIT 1
  `, [userId, teamId, teamId, currentDay]);
  const europe = await get(`
    SELECT
      'europe' AS source,
      em.round_name AS competition,
      em.id,
      em.match_day,
      em.home_team_id,
      em.away_team_id,
      em.home_european_team_id,
      em.away_european_team_id,
      COALESCE(ht.name, het.name) AS home_name,
      COALESCE(at.name, aet.name) AS away_name,
      ht.default_formation AS home_formation,
      at.default_formation AS away_formation,
      COALESCE(ht.overall, het.overall) AS home_overall,
      COALESCE(at.overall, aet.overall) AS away_overall,
      COALESCE(ht.attack_overall, het.attack_overall) AS home_attack,
      COALESCE(at.attack_overall, aet.attack_overall) AS away_attack,
      COALESCE(ht.midfield_overall, het.midfield_overall) AS home_midfield,
      COALESCE(at.midfield_overall, aet.midfield_overall) AS away_midfield,
      COALESCE(ht.defense_overall, het.defense_overall) AS home_defense,
      COALESCE(at.defense_overall, aet.defense_overall) AS away_defense
    FROM european_matches em
    LEFT JOIN teams ht ON ht.id = em.home_team_id
    LEFT JOIN teams at ON at.id = em.away_team_id
    LEFT JOIN european_teams het ON het.id = em.home_european_team_id
    LEFT JOIN european_teams aet ON aet.id = em.away_european_team_id
    WHERE em.user_id = ? AND em.played = 0 AND (em.home_team_id = ? OR em.away_team_id = ?) AND em.match_day >= ?
    ORDER BY em.match_day ASC, em.id ASC
    LIMIT 1
  `, [userId, teamId, teamId, currentDay]);
  return [domestic, europe]
    .filter(Boolean)
    .sort((a, b) => Number(a.match_day || 9999) - Number(b.match_day || 9999))[0] || null;
}

async function lastFiveForOpponent(userId, opponentTeamId, opponentEuropeanTeamId) {
  const teamId = Number(opponentTeamId || 0);
  const euroId = Number(opponentEuropeanTeamId || 0);
  const domestic = teamId ? await all(`
    SELECT
      'Süper Lig' AS competition,
      m.id,
      m.match_day,
      m.home_club_id AS home_team_id,
      m.away_club_id AS away_team_id,
      NULL AS home_european_team_id,
      NULL AS away_european_team_id,
      m.home_score,
      m.away_score,
      ht.name AS home_name,
      at.name AS away_name
    FROM matches m
    LEFT JOIN teams ht ON ht.id = m.home_club_id
    LEFT JOIN teams at ON at.id = m.away_club_id
    WHERE m.user_id = ? AND m.played = 1 AND (m.home_club_id = ? OR m.away_club_id = ?)
    ORDER BY m.match_day DESC, m.id DESC
    LIMIT 5
  `, [userId, teamId, teamId]) : [];
  const europe = await all(`
    SELECT
      em.round_name AS competition,
      em.id,
      em.match_day,
      em.home_team_id,
      em.away_team_id,
      em.home_european_team_id,
      em.away_european_team_id,
      em.home_score,
      em.away_score,
      COALESCE(ht.name, het.name) AS home_name,
      COALESCE(at.name, aet.name) AS away_name
    FROM european_matches em
    LEFT JOIN teams ht ON ht.id = em.home_team_id
    LEFT JOIN teams at ON at.id = em.away_team_id
    LEFT JOIN european_teams het ON het.id = em.home_european_team_id
    LEFT JOIN european_teams aet ON aet.id = em.away_european_team_id
    WHERE em.user_id = ? AND em.played = 1 AND (
      (? > 0 AND (em.home_team_id = ? OR em.away_team_id = ?))
      OR (? > 0 AND (em.home_european_team_id = ? OR em.away_european_team_id = ?))
    )
    ORDER BY em.match_day DESC, em.id DESC
    LIMIT 5
  `, [userId, teamId, teamId, teamId, euroId, euroId, euroId]);
  return [...domestic, ...europe]
    .sort((a, b) => Number(b.match_day || 0) - Number(a.match_day || 0) || Number(b.id || 0) - Number(a.id || 0))
    .slice(0, 5);
}

async function createOpponentReportMessages(userId, club, state) {
  const fixture = await nextOpponentFixture(userId, club, state);
  if (!fixture) return;
  const teamId = Number(club.team_id);
  const isHome = Number(fixture.home_team_id || 0) === teamId;
  const opponentTeamId = isHome ? fixture.away_team_id : fixture.home_team_id;
  const opponentEuropeanTeamId = isHome ? fixture.away_european_team_id : fixture.home_european_team_id;
  const opponentName = isHome ? fixture.away_name : fixture.home_name;
  if (!opponentName) return;
  const opponent = {
    default_formation: isHome ? fixture.away_formation : fixture.home_formation,
    overall: isHome ? fixture.away_overall : fixture.home_overall,
    attack_overall: isHome ? fixture.away_attack : fixture.home_attack,
    midfield_overall: isHome ? fixture.away_midfield : fixture.home_midfield,
    defense_overall: isHome ? fixture.away_defense : fixture.home_defense
  };
  const tactic = tacticProfile(opponent);
  const lastFive = await lastFiveForOpponent(userId, opponentTeamId, opponentEuropeanTeamId);
  const lastFiveText = lastFive.length
    ? lastFive.map((match) => `- ${matchLine(match, opponentTeamId, opponentEuropeanTeamId)}`).join('\n')
    : '- Bu kariyerde kayitli son mac bulunamadi.';
  const daysUntil = Number(fixture.match_day || state.current_day || 1) - Number(state.current_day || 1);
  await createInboxMessage(userId, {
    teamId: club.team_id,
    day: state.current_day,
    category: 'scout',
    priority: daysUntil <= 7 ? 'important' : 'normal',
    uniqueKey: `opponent_report_${club.team_id}_${fixture.source}_${fixture.id}_${fixture.match_day}`,
    title: `${opponentName} mac onu raporu`,
    summary: 'Siradaki rakibin son 5 maci ve sevdigi taktik hazir.',
    body: [
      `Siradaki mac: ${fixture.competition || 'Mac'} - ${opponentName}`,
      `Mac tarihi: ${formatDate(fixture.match_day || state.current_day)}`,
      `Sevdigi dizilis: ${tactic.formation}`,
      `Taktik egilim: ${tactic.style}`,
      `Guc notu: Hucum ${tactic.attack} / Orta saha ${tactic.midfield} / Savunma ${tactic.defense}`,
      'Son 5 mac:',
      lastFiveText
    ].join('\n'),
    payload: { opponentTeamId, opponentEuropeanTeamId, opponentName, matchId: fixture.id, source: fixture.source }
  });
}

async function createTransferMessages(userId, club, state) {
  const window = transferWindow(state.current_day);
  if (!window.isOpen) return;
  const day = Number(state.current_day || 1);
  const weekBucket = Math.floor((day - 1) / 7);
  const activeOffer = await get(`
    SELECT COUNT(*) AS count
    FROM inbox_messages
    WHERE user_id = ? AND action_type = 'transfer_offer' AND status = 'open'
  `, [userId]);
  if (Number(activeOffer?.count || 0) < 2) {
    const player = await get(`
      SELECT *
      FROM players
      WHERE team_id = ? AND market_value > 0 AND injured = 0
      ORDER BY
        CASE WHEN overall >= 85 THEN 5 WHEN overall >= 80 THEN 3 ELSE 0 END ASC,
        CASE WHEN is_starting_eleven = 1 OR lineup_role = 'starter' THEN 2 ELSE 0 END ASC,
        salary ASC,
        (potential - overall) DESC,
        playing_time ASC,
        ((id + ?) % 17) ASC
      LIMIT 1
    `, [club.team_id, day]);
    const buyer = await get('SELECT id, name, budget, overall FROM teams WHERE id != ? AND budget > 0 ORDER BY ((id + ?) % 19) ASC, overall DESC LIMIT 1', [club.team_id, day]);
    if (player && buyer) {
      const recentPlayerOffer = await get(`
        SELECT id
        FROM inbox_messages
        WHERE user_id = ? AND action_type = 'transfer_offer' AND day >= ? AND action_payload LIKE ?
        LIMIT 1
      `, [userId, Math.max(1, day - 28), `%"playerId":${Number(player.id)}%`]);
      const weeklyBuyerOffer = await get(`
        SELECT id
        FROM inbox_messages
        WHERE action_type = 'transfer_offer' AND unique_key LIKE ?
        LIMIT 1
      `, [`transfer_offer_${weekBucket}_%_${Number(buyer.id)}`]);
      const overall = Number(player.overall || 65);
      const buyerOverall = Number(buyer.overall || 70);
      const chance = seededRatio(Number(player.id) * 17 + Number(buyer.id) * 31 + weekBucket);
      const starBlocked = (overall >= 85 && buyerOverall < 80) || (overall >= 80 && chance > (buyerOverall >= 80 ? 0.22 : 0.08));
      const baseValue = calculateBaseMarketValue(player);
      const potentialGap = Math.max(0, Number(player.potential || overall) - overall);
      let ratio = 0.72 + seededRatio(Number(player.id) + Number(buyer.id) + day) * 0.26;
      if (overall >= 80) ratio += 0.08;
      if (potentialGap >= 6 && overall < 82) ratio += 0.08;
      if (player.lineup_role === 'starter' || Number(player.is_starting_eleven || 0) === 1) ratio += 0.08;
      const offerPrice = roundInternalEuro(baseValue * ratio, 50000);
      const budgetCap = Number(buyer.budget || 0) * (buyerOverall >= 80 ? 0.34 : 0.24);
      if (!recentPlayerOffer && !weeklyBuyerOffer && !starBlocked && offerPrice > 0 && offerPrice <= budgetCap) {
        await createInboxMessage(userId, {
        teamId: club.team_id,
        day,
        category: 'transfer',
        priority: overall >= 80 ? 'important' : 'normal',
        uniqueKey: `transfer_offer_${weekBucket}_${player.id}_${buyer.id}`,
        title: `${buyer.name}, ${player.name} için teklif yaptı`,
        summary: `Teklif: ${money(offerPrice)}. Kabul edebilir, reddedebilir veya pazarlık yapabilirsin.`,
        body: `${buyer.name}, ${player.name} için resmi transfer teklifi gönderdi. Oyuncunun piyasa değeri ${money(player.market_value)}. Kulüp ilk teklif olarak ${money(offerPrice)} öneriyor.`,
        actionType: 'transfer_offer',
        payload: { playerId: player.id, playerName: player.name, buyerTeamId: buyer.id, buyerTeamName: buyer.name, offerPrice }
        });
      }
    }
  }

  const marketPlayer = await get(`
    SELECT p.*, t.name AS team_name
    FROM players p
    LEFT JOIN teams t ON t.id = p.team_id
    WHERE (p.team_id IS NULL OR p.team_id != ?) AND p.overall >= 67
    ORDER BY ((p.id + ?) % 13) ASC, p.market_value ASC, p.potential DESC
    LIMIT 1
  `, [club.team_id, day]);
  if (marketPlayer) {
    const isFree = !marketPlayer.team_id;
    const fee = isFree ? 0 : Math.round(Number(marketPlayer.market_value || 0) * 0.58 / 50000) * 50000;
    await createInboxMessage(userId, {
      teamId: club.team_id,
      day: state.current_day,
      category: isFree ? 'scout' : 'transfer',
      priority: isFree || fee < Number(club.budget || 0) * 0.25 ? 'normal' : 'important',
      uniqueKey: `market_tip_${Math.floor(Number(state.current_day || 1) / 14)}_${marketPlayer.id}`,
      title: isFree ? `Bonservissiz fırsat: ${marketPlayer.name}` : `${marketPlayer.name} kulübe gelmeye sıcak`,
      summary: `${marketPlayer.age} yaş, ${marketPlayer.position}, güç ${marketPlayer.overall}. Maaş isteği: ${money(marketPlayer.salary)}.`,
      body: `Scout ekibi ${marketPlayer.name} için olumlu rapor verdi. Oyuncu ${marketPlayer.age} yaşında, mevki ${marketPlayer.position}, güç ${marketPlayer.overall}. ${isFree ? 'Bonservissiz alınabilir.' : `Tahmini bonservis ${money(fee)}.`} Maaş beklentisi ${money(marketPlayer.salary)}.`,
      actionType: 'scout_review',
      payload: { playerId: marketPlayer.id, playerName: marketPlayer.name, redirect: '/transfers.html' }
    });
  }
}

function formatDate(day) {
  return new Date(`${seasonDate(day)}T12:00:00`).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

async function ensureAutomaticInbox(userId) {
  const club = await clubModel.getByUserId(userId);
  if (!club?.team_id) return { created: 0 };
  const before = await get('SELECT COUNT(*) AS count FROM inbox_messages WHERE user_id = ?', [userId]);
  const state = await getCareerState(userId);
  await createManagementMessages(userId, club, state);
  await createHealthMessages(userId, club, state);
  await createDisciplineMessages(userId, club);
  await createPlayerRequestMessages(userId, club, state);
  await createOpponentReportMessages(userId, club, state);
  await createTransferMessages(userId, club, state);
  const after = await get('SELECT COUNT(*) AS count FROM inbox_messages WHERE user_id = ?', [userId]);
  return { created: Number(after?.count || 0) - Number(before?.count || 0) };
}

function normalizeMessage(row) {
  return {
    ...row,
    is_read: Boolean(row.is_read),
    action_payload: parseJson(row.action_payload, {})
  };
}

async function listInboxMessages(userId, options = {}) {
  await ensureAutomaticInbox(userId);
  const params = [userId];
  const where = ['user_id = ?'];
  if (options.category && options.category !== 'all') {
    where.push('category = ?');
    params.push(options.category);
  }
  if (options.unreadOnly) where.push('is_read = 0');
  const limit = Math.min(80, Math.max(1, Number(options.limit || 50)));
  params.push(limit);
  const messages = await all(`
    SELECT *
    FROM inbox_messages
    WHERE ${where.join(' AND ')}
    ORDER BY is_read ASC, day DESC, id DESC
    LIMIT ?
  `, params);
  const unread = await get('SELECT COUNT(*) AS count FROM inbox_messages WHERE user_id = ? AND is_read = 0', [userId]);
  return {
    categories: CATEGORIES,
    unreadCount: Number(unread?.count || 0),
    messages: messages.map(normalizeMessage)
  };
}

async function unreadCount(userId) {
  await ensureAutomaticInbox(userId);
  const row = await get('SELECT COUNT(*) AS count FROM inbox_messages WHERE user_id = ? AND is_read = 0', [userId]);
  return Number(row?.count || 0);
}

async function markMessageRead(userId, messageId) {
  await run('UPDATE inbox_messages SET is_read = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?', [messageId, userId]);
  const row = await get('SELECT * FROM inbox_messages WHERE id = ? AND user_id = ?', [messageId, userId]);
  return row ? normalizeMessage(row) : null;
}

async function markAllMessagesRead(userId) {
  await run('UPDATE inbox_messages SET is_read = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?', [userId]);
  return { ok: true };
}

async function completeOutgoingTransferFromMessage(userId, transferInterestId, action) {
  const club = await clubModel.getByUserId(userId);
  const offer = await get(`
    SELECT ti.*, p.name AS player_name, p.salary, p.position, p.overall, p.team_id,
      ft.name AS from_team_name
    FROM transfer_interest ti
    JOIN players p ON p.id = ti.player_id
    LEFT JOIN teams ft ON ft.id = ti.from_team_id
    WHERE ti.id = ? AND ti.user_id = ?
  `, [transferInterestId, userId]);
  if (!offer) throw new Error('Transfer teklifi bulunamadı.');
  if (action === 'reject') {
    await run("UPDATE transfer_interest SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?", [offer.id, userId]);
    return { message: 'Transfer görüşmesi reddedildi.' };
  }
  if (!['club_accepted', 'counter'].includes(offer.status)) throw new Error('Bu transfer artık tamamlanamaz.');
  const price = offer.status === 'counter' ? Number(offer.counter_offer || offer.asking_price || offer.offer_price || 0) : Number(offer.offer_price || 0);
  const totalCost = price + Number(offer.signing_bonus || 0) + Number(offer.loan_fee || 0);
  if (Number(club.budget || 0) < totalCost) throw new Error('Transfer bütçen bu anlaşmayı tamamlamak için yeterli değil.');
  if (Number(club.salary_budget || 0) < Number(offer.wage_offer || 0)) throw new Error('Maaş bütçen bu sözleşme için yeterli değil.');
  if (Number(offer.team_id || 0) !== Number(offer.from_team_id || 0) && offer.from_team_id) {
    await run("UPDATE transfer_interest SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [offer.id]);
    throw new Error('Oyuncu artık eski kulübünde değil.');
  }

  const state = await getCareerState(userId);
  await run('UPDATE clubs SET budget = budget - ? WHERE user_id = ?', [totalCost, userId]);
  if (offer.from_team_id) await run('UPDATE teams SET budget = budget + ? WHERE id = ?', [price, offer.from_team_id]);
  await run('DELETE FROM lineups WHERE player_id = ?', [offer.player_id]);
  await run(`
    UPDATE players
    SET team_id = ?, club_id = NULL, salary = ?, lineup_role = 'reserve', is_starting_eleven = 0,
        transfer_status = 'normal', happiness = 76, playing_time = 46
    WHERE id = ?
  `, [club.team_id, offer.wage_offer || offer.salary, offer.player_id]);
  await run('INSERT INTO transfers (player_id, from_club_id, to_club_id, price) VALUES (?, NULL, ?, ?)', [offer.player_id, club.id, price]);
  await run(`
    INSERT INTO transfer_history
      (player_id, from_team_id, to_team_id, category, price, wage, signing_bonus, loan_fee, buy_option, sell_on_percent, status, day)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)
  `, [
    offer.player_id,
    offer.from_team_id || null,
    club.team_id,
    offer.category || 'transfer',
    price,
    offer.wage_offer || offer.salary,
    offer.signing_bonus || 0,
    offer.loan_fee || 0,
    offer.buy_option || 0,
    offer.sell_on_percent || 0,
    state.current_day
  ]);
  await run("UPDATE transfer_interest SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?", [offer.id, userId]);
  await createInboxMessage(userId, {
    teamId: club.team_id,
    day: state.current_day,
    category: 'transfer',
    priority: 'important',
    uniqueKey: `outgoing_offer_completed_${offer.id}`,
    title: 'Transfer Tamamlandı',
    summary: `${offer.player_name} başarıyla takımınıza katıldı.`,
    body: `${offer.player_name}, ${offer.from_team_name || 'Serbest oyuncu'} tarafından ${money(price)} bedelle transfer edildi. Oyuncunun yeni maaşı ${money(offer.wage_offer || offer.salary)}.`
  });
  return { message: `${offer.player_name} transferi tamamlandı.`, redirect: '/transfers.html' };
}

async function handleMessageAction(userId, messageId, action) {
  const message = await get('SELECT * FROM inbox_messages WHERE id = ? AND user_id = ?', [messageId, userId]);
  if (!message) throw new Error('Mesaj bulunamadı.');
  const payload = parseJson(message.action_payload, {});
  const club = await clubModel.getByUserId(userId);
  const state = await getCareerState(userId);

  if (message.action_type === 'transfer_offer') {
    if (action === 'accept') {
      const player = await get('SELECT * FROM players WHERE id = ? AND team_id = ?', [payload.playerId, club.team_id]);
      const buyer = await get('SELECT * FROM teams WHERE id = ?', [payload.buyerTeamId]);
      if (!player || !buyer) throw new Error('Teklif artık geçerli değil.');
      const price = Number(payload.offerPrice || 0);
      await run('UPDATE clubs SET budget = budget + ? WHERE user_id = ?', [price, userId]);
      await run('DELETE FROM lineups WHERE player_id = ?', [player.id]);
      await run("UPDATE players SET team_id = ?, club_id = NULL, is_starting_eleven = 0, lineup_role = 'reserve', transfer_status = 'normal' WHERE id = ?", [buyer.id, player.id]);
      await run(`
        INSERT INTO transfer_history (player_id, from_team_id, to_team_id, category, price, wage, status, day)
        VALUES (?, ?, ?, 'outgoing_offer', ?, ?, 'completed', ?)
      `, [player.id, club.team_id, buyer.id, price, player.salary || 0, state.current_day]);
      await run('UPDATE inbox_messages SET status = ?, is_read = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?', ['accepted', messageId, userId]);
      return { message: `${player.name} için teklif kabul edildi.`, redirect: '/transfers.html' };
    }
    if (action === 'negotiate') {
      const nextPrice = Math.round(Number(payload.offerPrice || 0) * 1.12 / 50000) * 50000;
      const nextPayload = { ...payload, offerPrice: nextPrice, negotiated: true };
      await run(`
        UPDATE inbox_messages
        SET summary = ?, body = ?, action_payload = ?, is_read = 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `, [
        `Pazarlık istendi. Yeni talep: ${money(nextPrice)}.`,
        `${payload.buyerTeamName} ile pazarlığa gidildi. Kulüp yeni talep olarak ${money(nextPrice)} bekliyor.`,
        JSON.stringify(nextPayload),
        messageId,
        userId
      ]);
      return { message: `Pazarlık yapıldı: ${money(nextPrice)} istendi.` };
    }
    await run('UPDATE inbox_messages SET status = ?, is_read = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?', ['rejected', messageId, userId]);
    return { message: 'Transfer teklifi reddedildi.' };
  }

  if (message.action_type === 'player_talk') {
    await run(`UPDATE players
      SET morale = MIN(99, morale + 8),
          happiness = MIN(99, happiness + 10),
          transfer_status = CASE WHEN transfer_status = 'unhappy' THEN 'normal' ELSE transfer_status END
      WHERE id = ? AND team_id = ?
    `, [payload.playerId, club.team_id]);
    await run('UPDATE inbox_messages SET status = ?, is_read = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?', ['handled', messageId, userId]);
    return { message: `${payload.playerName || 'Oyuncu'} ile görüşme yapıldı.` };
  }

  if (message.action_type === 'scout_review') {
    await run('UPDATE inbox_messages SET is_read = 1, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?', ['reviewed', messageId, userId]);
    return { message: 'Oyuncu inceleme listesine yönlendiriliyor.', redirect: payload.redirect || '/transfers.html' };
  }

  if (message.action_type === 'outgoing_transfer_finalize' || message.action_type === 'outgoing_transfer_counter') {
    const result = await completeOutgoingTransferFromMessage(userId, payload.transferInterestId, action);
    await run('UPDATE inbox_messages SET status = ?, is_read = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?', [
      action === 'reject' ? 'rejected' : 'handled',
      messageId,
      userId
    ]);
    return result;
  }

  await markMessageRead(userId, messageId);
  return { message: 'Mesaj okundu.' };
}

module.exports = {
  createInboxMessage,
  ensureAutomaticInbox,
  listInboxMessages,
  unreadCount,
  markMessageRead,
  markAllMessagesRead,
  handleMessageAction
};
