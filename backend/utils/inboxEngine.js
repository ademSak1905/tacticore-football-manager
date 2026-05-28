const clubModel = require('../models/clubModel');
const { all, get, run, getCareerState } = require('../database');
const { seasonDate } = require('./seasonCalendar');
const { parseSeasonPlan } = require('./seasonPlanning');
const { money: transferMoney } = require('./transferEngine');

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

async function createTransferMessages(userId, club, state) {
  const window = transferWindow(state.current_day);
  if (!window.isOpen) return;
  const activeOffer = await get(`
    SELECT COUNT(*) AS count
    FROM inbox_messages
    WHERE user_id = ? AND action_type = 'transfer_offer' AND status = 'open'
  `, [userId]);
  if (Number(activeOffer?.count || 0) < 2) {
    const player = await get(`
      SELECT *
      FROM players
      WHERE team_id = ? AND market_value > 0
      ORDER BY ((id + ?) % 7) ASC, market_value DESC
      LIMIT 1
    `, [club.team_id, Number(state.current_day || 1)]);
    const buyer = await get('SELECT id, name, budget, overall FROM teams WHERE id != ? ORDER BY ((id + ?) % 11) ASC, overall DESC LIMIT 1', [club.team_id, Number(state.current_day || 1)]);
    if (player && buyer) {
      const offerPrice = Math.round(Number(player.market_value || 0) * (0.82 + (Number(buyer.overall || 70) % 12) / 100) / 50000) * 50000;
      await createInboxMessage(userId, {
        teamId: club.team_id,
        day: state.current_day,
        category: 'transfer',
        priority: 'important',
        uniqueKey: `transfer_offer_${Math.floor(Number(state.current_day || 1) / 14)}_${player.id}_${buyer.id}`,
        title: `${buyer.name}, ${player.name} için teklif yaptı`,
        summary: `Teklif: ${money(offerPrice)}. Kabul edebilir, reddedebilir veya pazarlık yapabilirsin.`,
        body: `${buyer.name}, ${player.name} için resmi transfer teklifi gönderdi. Oyuncunun piyasa değeri ${money(player.market_value)}. Kulüp ilk teklif olarak ${money(offerPrice)} öneriyor.`,
        actionType: 'transfer_offer',
        payload: { playerId: player.id, playerName: player.name, buyerTeamId: buyer.id, buyerTeamName: buyer.name, offerPrice }
      });
    }
  }

  const marketPlayer = await get(`
    SELECT p.*, t.name AS team_name
    FROM players p
    LEFT JOIN teams t ON t.id = p.team_id
    WHERE (p.team_id IS NULL OR p.team_id != ?) AND p.overall >= 67
    ORDER BY ((p.id + ?) % 13) ASC, p.market_value ASC, p.potential DESC
    LIMIT 1
  `, [club.team_id, Number(state.current_day || 1)]);
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
