const { all, get, run, getCareerState } = require('../database');
const { createTransferStory } = require('./feedEngine');
const {
  calculateBaseMarketValue,
  minimumWageForPlayer,
  normalizeInternalMoney,
  roundInternalEuro,
  seededRatio
} = require('./financeEngine');

const CATEGORY_LABELS = {
  listed: 'Satılık oyuncular',
  loan: 'Kiralık oyuncular',
  expiring: 'Sözleşmesi biten oyuncular',
  youth: 'Genç yetenekler',
  free: 'Serbest oyuncular',
  swap: 'Takas önerileri',
  unhappy: 'Kulübüyle sorun yaşayan oyuncular',
  premium: 'Yüksek potansiyelli pahalı oyuncular',
  bargain: 'Ucuz fırsat transferleri'
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function money(value) {
  return `${Math.round(Number(value || 0) / 35).toLocaleString('tr-TR')} EUR`;
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

function categoryForPlayer(player, day) {
  if (!player.team_id && !player.club_id) return 'free';
  if (player.loan_available) return 'loan';
  if (player.transfer_status === 'unhappy' || Number(player.happiness || 70) < 48) return 'unhappy';
  if (Number(player.contract_until || 2027) <= 2026) return 'expiring';
  if (Number(player.age || 25) <= 21 && Number(player.potential || player.overall || 70) >= 78) {
    return calculateBaseMarketValue(player) > 12000000 * 35 ? 'premium' : 'youth';
  }
  if (Number(player.age || 25) >= 31) return 'bargain';
  if (day >= 150 && Number(player.playing_time || 50) < 35) return 'listed';
  return Number(player.overall || 70) >= 78 && Number(player.potential || 70) >= 82 ? 'premium' : 'listed';
}

function saleDifficulty(player = {}, fromTeam = {}, buyerTeam = {}) {
  const sellerOverall = Number(fromTeam?.overall || player.team_prestige || 70);
  const buyerOverall = Number(buyerTeam?.overall || 70);
  const isStarter = player.lineup_role === 'starter' || player.is_starting_eleven;
  let difficulty = 1;
  if (sellerOverall >= 82) difficulty += 0.55;
  else if (sellerOverall >= 78) difficulty += 0.32;
  else if (sellerOverall >= 74) difficulty += 0.12;
  if (isStarter) difficulty += 0.25;
  if (Number(player.overall || 70) >= 83) difficulty += 0.35;
  if (Number(player.potential || player.overall || 70) - Number(player.overall || 70) >= 5) difficulty += 0.18;
  if (player.transfer_status === 'unhappy') difficulty -= 0.28;
  if (Number(player.playing_time || 50) < 35) difficulty -= 0.18;
  if (player.contract_until <= 2026) difficulty -= 0.3;
  if (sellerOverall >= 78 && buyerOverall >= 78 && Number(player.team_id || 0) !== Number(buyerTeam?.id || 0)) difficulty += 0.28;
  return clamp(difficulty, 0.55, 2.9);
}

function askingPrice(player, category = null, buyerTeam = null, fromTeam = null) {
  const selectedCategory = category || categoryForPlayer(player, 1);
  const base = calculateBaseMarketValue(player);
  const age = Number(player.age || 25);
  const overall = Number(player.overall || 70);
  const potential = Number(player.potential || overall);
  let multiplier = 1;

  if (selectedCategory === 'free') multiplier = 0;
  else if (selectedCategory === 'loan') multiplier = 0.08;
  else if (selectedCategory === 'expiring') multiplier = 0.45 + seededRatio(player.id + 3) * 0.35;
  else if (age <= 23 && potential >= 80) multiplier = 1.25 + seededRatio(player.id + 5) * 0.6;
  else if (overall >= 83) multiplier = 1.35 + seededRatio(player.id + 7) * 0.65;
  else if (age >= 32) multiplier = 0.55 + seededRatio(player.id + 11) * 0.4;
  else if (selectedCategory === 'unhappy') multiplier = 0.65 + seededRatio(player.id + 13) * 0.25;
  else if (selectedCategory === 'bargain') multiplier = 0.68 + seededRatio(player.id + 17) * 0.3;
  else multiplier = 0.92 + seededRatio(player.id + 19) * 0.38;

  const difficulty = saleDifficulty(player, fromTeam, buyerTeam);
  if (selectedCategory === 'listed' && difficulty > 1.35) multiplier = Math.max(multiplier, 1.55);
  if (difficulty > 1.8 && !['expiring', 'unhappy', 'bargain', 'loan'].includes(selectedCategory)) {
    multiplier = Math.max(multiplier, 1.75 + seededRatio(player.id + 23) * 0.55);
  }
  return roundInternalEuro(base * multiplier, selectedCategory === 'free' ? 1 : 50000);
}

function listingReason(player, category, window) {
  const reasons = {
    free: 'Kulübü yok, imza parası ve maaş şartları belirleyici olur.',
    loan: 'Daha fazla süre bulması için kiralık çıkabilir.',
    expiring: 'Sözleşmesi yakında bitiyor, kulübü makul teklife açık.',
    youth: 'Scout ekibi yüksek gelişim potansiyeli görüyor.',
    premium: 'Pahalı ama potansiyeli ligin üst seviyesinde.',
    bargain: 'Yaş/sözleşme dengesi nedeniyle fırsat olabilir.',
    unhappy: 'Oyuncu süre ve rol konusunda mutsuz.',
    swap: 'Kulübü takas opsiyonunu masada tutuyor.',
    listed: 'Kulübü doğru bonservisle görüşmeye hazır.'
  };
  return window.isOpen ? reasons[category] : `${reasons[category]} Resmi teklif için dönem beklenmeli.`;
}

async function pendingOffersForUser(userId) {
  const rows = await all(`
    SELECT ti.*, p.name AS player_name, p.position, p.overall, p.salary,
      ft.name AS from_team_name, it.name AS interested_team_name
    FROM transfer_interest ti
    JOIN players p ON p.id = ti.player_id
    LEFT JOIN teams ft ON ft.id = ti.from_team_id
    LEFT JOIN teams it ON it.id = ti.interested_team_id
    WHERE ti.user_id = ? AND ti.status IN ('pending', 'counter', 'club_accepted')
    ORDER BY ti.response_day ASC, ti.id DESC
  `, [userId]);
  return rows.map((offer) => ({
    ...offer,
    offeredFee: offer.offer_price,
    wageOffer: offer.wage_offer,
    responseWeek: offer.response_week,
    responseDay: offer.response_day
  }));
}

async function dynamicMarket(clubOrTeamId, filters = {}) {
  const club = typeof clubOrTeamId === 'object' ? clubOrTeamId : { team_id: Number(clubOrTeamId || 0), user_id: null };
  const state = club.user_id ? await getCareerState(club.user_id) : await get('SELECT * FROM game_state WHERE id = 1');
  const window = transferWindow(state.current_day);
  const q = `%${String(filters.q || '').trim().toLowerCase()}%`;
  const rows = await all(`
    SELECT p.*, t.name AS team_name, t.overall AS team_prestige, t.budget AS team_budget
    FROM players p
    LEFT JOIN teams t ON t.id = p.team_id
    WHERE (p.team_id IS NULL OR p.team_id != ?)
      AND (p.club_id IS NULL)
      AND (? = '%%' OR LOWER(p.name) LIKE ?)
    ORDER BY p.potential DESC, p.overall DESC, p.market_value ASC
    LIMIT 220
  `, [club.team_id, q, q]);
  const buyerTeam = await get('SELECT * FROM teams WHERE id = ?', [club.team_id]);
  const pending = club.user_id ? await pendingOffersForUser(club.user_id) : [];
  const pendingByPlayer = new Map(pending.map((offer) => [Number(offer.player_id), offer]));

  const enriched = rows.map((player) => {
    const category = categoryForPlayer(player, state.current_day);
    const price = askingPrice(player, category, buyerTeam, { overall: player.team_prestige });
    const interest = clamp(Math.round((Number(player.potential || 70) - 62) * 1.3 + (100 - Number(player.happiness || 70)) * 0.22 + (Number(player.overall || 65) - 65) * 0.8), 5, 96);
    const canBuy = window.isOpen || category === 'free';
    const pendingOffer = pendingByPlayer.get(Number(player.id)) || null;
    return {
      ...player,
      base_market_value: player.base_market_value || calculateBaseMarketValue(player),
      category,
      category_label: CATEGORY_LABELS[category],
      asking_price: price,
      loan_fee: category === 'loan' ? roundInternalEuro(calculateBaseMarketValue(player) * 0.08, 50000) : 0,
      interest,
      window_open: window.isOpen,
      window_name: window.name,
      can_buy: canBuy && !pendingOffer ? 1 : 0,
      pending_offer: pendingOffer,
      reason: listingReason(player, category, window)
    };
  });

  const dayMod = Number(state.current_day || 1) % 9;
  let filtered = enriched.filter((player) => {
    if (player.pending_offer) return true;
    if (!window.isOpen && player.category !== 'free') return true;
    if (['free', 'unhappy', 'expiring', 'loan'].includes(player.category)) return true;
    if (player.age <= 21 && player.potential >= 78) return true;
    if ((player.id + dayMod) % 5 === 0) return true;
    return player.transfer_status !== 'normal' || player.playing_time < 42;
  });

  if (filters.category && filters.category !== 'all') filtered = filtered.filter((player) => player.category === filters.category);
  return {
    window,
    categories: Object.entries(CATEGORY_LABELS).map(([id, label]) => ({ id, label })),
    pendingOffers: pending,
    players: filtered.slice(0, 80)
  };
}

async function createTransferInboxMessage(userId, data) {
  const existing = await get('SELECT id FROM inbox_messages WHERE user_id = ? AND unique_key = ?', [userId, data.uniqueKey]);
  if (existing) return existing;
  const result = await run(`
    INSERT INTO inbox_messages
      (user_id, team_id, day, category, title, summary, body, priority, action_type, action_payload, unique_key)
    VALUES (?, ?, ?, 'transfer', ?, ?, ?, ?, ?, ?, ?)
  `, [
    userId,
    data.teamId || null,
    data.day || 1,
    data.title,
    data.summary,
    data.body || data.summary,
    data.priority || 'normal',
    data.actionType || null,
    JSON.stringify(data.payload || {}),
    data.uniqueKey
  ]);
  return get('SELECT * FROM inbox_messages WHERE id = ?', [result.id]);
}

async function negotiateTransfer(club, body = {}) {
  const userId = club.user_id;
  const state = await getCareerState(userId);
  const window = transferWindow(state.current_day);
  const playerId = Number(body.playerId);
  const player = await get('SELECT * FROM players WHERE id = ? AND (team_id IS NULL OR team_id != ?)', [playerId, club.team_id]);
  if (!player) return { status: 'error', message: 'Transfer listesindeki oyuncu bulunamadı.' };
  const category = categoryForPlayer(player, state.current_day);
  if (!window.isOpen && category !== 'free') {
    await createTransferStory({ teamId: club.team_id, playerId: player.id, category: 'transfer', status: 'rumor' });
    return { status: 'closed', message: 'Transfer dönemi kapalı. Resmi teklif gönderilemez.' };
  }

  const existing = await get(`
    SELECT * FROM transfer_interest
    WHERE user_id = ? AND player_id = ? AND status IN ('pending', 'counter', 'club_accepted')
    ORDER BY id DESC LIMIT 1
  `, [userId, player.id]);
  if (existing) return { status: 'pending', message: 'Bu oyuncu için zaten bekleyen bir teklif var.' };

  const buyerTeam = await get('SELECT * FROM teams WHERE id = ?', [club.team_id]);
  const fromTeam = player.team_id ? await get('SELECT * FROM teams WHERE id = ?', [player.team_id]) : null;
  const asking = askingPrice(player, category, buyerTeam, fromTeam);
  const offerPrice = Math.max(0, Number(body.offerPrice ?? asking));
  const wageOffer = Math.max(0, Number(body.wageOffer ?? player.salary));
  const signingBonus = Math.max(0, Number(body.signingBonus ?? 0));
  const loanFee = category === 'loan' ? Math.max(0, Number(body.loanFee ?? roundInternalEuro(calculateBaseMarketValue(player) * 0.04, 50000))) : 0;
  const buyOption = Math.max(0, Number(body.buyOption ?? 0));
  const sellOnPercent = clamp(body.sellOnPercent ?? 0, 0, 40);
  const firstTeamPromise = body.firstTeamPromise ? 1 : 0;
  const totalCost = offerPrice + signingBonus + loanFee;
  if (club.budget < totalCost) return { status: 'error', message: 'Transfer bütçen bu teklif için yeterli değil.' };
  if (Number(club.salary_budget || 0) < wageOffer) return { status: 'error', message: 'Maaş bütçen bu sözleşme teklifi için yeterli değil.' };

  const responseWeek = Number(state.week || 1) + 1;
  const responseDay = Number(state.current_day || 1) + 6;
  await run(`
    INSERT INTO transfer_interest
      (user_id, player_id, from_team_id, interested_team_id, category, status, offer_price, wage_offer, signing_bonus, loan_fee,
       buy_option, sell_on_percent, first_team_promise, decision_score, asking_price, response_week, response_day, day)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
  `, [
    userId,
    player.id,
    player.team_id || null,
    club.team_id,
    category,
    offerPrice,
    wageOffer,
    signingBonus,
    loanFee,
    buyOption,
    sellOnPercent,
    firstTeamPromise,
    asking,
    responseWeek,
    responseDay,
    state.current_day
  ]);

  await createTransferStory({ teamId: club.team_id, playerId: player.id, category: 'transfer', status: 'rumor', price: offerPrice });
  return {
    status: 'pending',
    message: `${player.name} için teklif gönderildi. Cevap gelecek hafta Mesajlar bölümüne düşecek.`,
    responseWeek,
    responseDay
  };
}

function deterministicChance(seed) {
  return seededRatio(seed + 101);
}

async function processPendingTransferOffers(userId) {
  const club = await get('SELECT * FROM clubs WHERE user_id = ?', [userId]);
  if (!club?.team_id) return [];
  const state = await getCareerState(userId);
  const dueOffers = await all(`
    SELECT ti.*, p.name AS player_name, p.salary, p.market_value, p.base_market_value, p.age, p.overall, p.potential,
      p.position, p.contract_until, p.happiness, p.morale, p.playing_time, p.transfer_status, p.team_id, p.lineup_role, p.is_starting_eleven,
      ft.name AS from_team_name, ft.overall AS from_team_overall,
      bt.name AS buyer_team_name, bt.overall AS buyer_team_overall
    FROM transfer_interest ti
    JOIN players p ON p.id = ti.player_id
    LEFT JOIN teams ft ON ft.id = ti.from_team_id
    LEFT JOIN teams bt ON bt.id = ti.interested_team_id
    WHERE ti.user_id = ? AND ti.status = 'pending' AND (ti.response_day <= ? OR ti.response_week <= ?)
    ORDER BY ti.response_day ASC, ti.id ASC
  `, [userId, state.current_day, state.week]);
  const buyerTeam = await get('SELECT * FROM teams WHERE id = ?', [club.team_id]);
  const responses = [];

  for (const offer of dueOffers) {
    if (Number(offer.team_id || 0) !== Number(offer.from_team_id || 0) && offer.from_team_id) {
      await run("UPDATE transfer_interest SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [offer.id]);
      await createTransferInboxMessage(userId, {
        teamId: club.team_id,
        day: state.current_day,
        title: 'Transfer Teklifi Geçersiz',
        summary: `${offer.player_name} artık farklı bir takımda olduğu için teklif kapandı.`,
        priority: 'normal',
        uniqueKey: `outgoing_offer_expired_${offer.id}`
      });
      continue;
    }
    const fromTeam = { id: offer.from_team_id, name: offer.from_team_name, overall: offer.from_team_overall };
    const currentAsking = askingPrice(offer, offer.category, buyerTeam, fromTeam);
    const requiredFee = Math.max(Number(offer.asking_price || 0), currentAsking);
    const ratio = Number(offer.offer_price || 0) / Math.max(1, requiredFee);
    const wageRequired = minimumWageForPlayer(offer, buyerTeam);
    const wageOk = Number(offer.wage_offer || 0) >= wageRequired * 0.92;
    const chance = deterministicChance(offer.id + offer.player_id);
    let status = 'rejected';
    if (ratio >= 1.15) status = 'club_accepted';
    else if (ratio >= 0.95 && chance > 0.28) status = 'club_accepted';
    else if (ratio >= 0.72) status = 'counter';

    if (status === 'club_accepted' && !wageOk) {
      await run("UPDATE transfer_interest SET status = 'player_rejected', decision_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [Math.round(ratio * 100), offer.id]);
      const message = await createTransferInboxMessage(userId, {
        teamId: club.team_id,
        day: state.current_day,
        title: 'Oyuncu Teklifi Reddetti',
        summary: `${offer.player_name} maaş teklifinizi yeterli bulmadı.`,
        body: `${offer.player_name}, önerilen ${money(offer.wage_offer)} maaşı yeterli bulmadı. Beklentisi yaklaşık ${money(wageRequired)} seviyesinde.`,
        priority: 'important',
        uniqueKey: `outgoing_offer_player_rejected_${offer.id}`
      });
      responses.push(message);
      continue;
    }

    if (status === 'club_accepted') {
      await run("UPDATE transfer_interest SET status = 'club_accepted', decision_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [Math.round(ratio * 100), offer.id]);
      const message = await createTransferInboxMessage(userId, {
        teamId: club.team_id,
        day: state.current_day,
        title: 'Teklif Kabul Edildi',
        summary: `${offer.from_team_name || 'Kulüp'} teklifinizi kabul etti. Oyuncuyla sözleşme görüşmesine geçebilirsiniz.`,
        body: `${offer.from_team_name || 'Kulüp'}, ${offer.player_name} için yaptığınız ${money(offer.offer_price)} teklifini kabul etti. Maaş teklifiniz ${money(offer.wage_offer)}. Transferi tamamlamak için bu mesajdaki aksiyonu kullanabilirsiniz.`,
        priority: 'important',
        actionType: 'outgoing_transfer_finalize',
        payload: { transferInterestId: offer.id },
        uniqueKey: `outgoing_offer_accepted_${offer.id}`
      });
      responses.push(message);
      continue;
    }

    if (status === 'counter') {
      const counter = roundInternalEuro(requiredFee * (0.95 + deterministicChance(offer.id + 303) * 0.3), 50000);
      await run("UPDATE transfer_interest SET status = 'counter', counter_offer = ?, decision_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [counter, Math.round(ratio * 100), offer.id]);
      const message = await createTransferInboxMessage(userId, {
        teamId: club.team_id,
        day: state.current_day,
        title: 'Karşı Teklif',
        summary: `${offer.from_team_name || 'Kulüp'} oyuncu için ${money(counter)} talep ediyor.`,
        body: `${offer.from_team_name || 'Kulüp'}, ${offer.player_name} için yaptığınız ${money(offer.offer_price)} teklifini düşük buldu ve ${money(counter)} talep etti.`,
        priority: 'important',
        actionType: 'outgoing_transfer_counter',
        payload: { transferInterestId: offer.id, counterOffer: counter },
        uniqueKey: `outgoing_offer_counter_${offer.id}`
      });
      responses.push(message);
      continue;
    }

    await run("UPDATE transfer_interest SET status = 'rejected', decision_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [Math.round(ratio * 100), offer.id]);
    const message = await createTransferInboxMessage(userId, {
      teamId: club.team_id,
      day: state.current_day,
      title: 'Transfer Teklifi Reddedildi',
      summary: `${offer.from_team_name || 'Kulüp'}, ${offer.player_name} için yaptığınız ${money(offer.offer_price)} teklifini yetersiz buldu.`,
      body: `${offer.from_team_name || 'Kulüp'}, ${offer.player_name} için yaptığınız ${money(offer.offer_price)} teklifini yetersiz buldu. Kulübün beklediği seviye yaklaşık ${money(requiredFee)}.`,
      priority: 'normal',
      uniqueKey: `outgoing_offer_rejected_${offer.id}`
    });
    responses.push(message);
  }
  return responses;
}

async function simulateAiTransfers(excludeTeamId = null) {
  const state = await get('SELECT * FROM game_state WHERE id = 1');
  const window = transferWindow(state.current_day);
  if (!window.isOpen || state.current_day % 7 !== 0) return [];
  const day = Number(state.current_day || 1);
  const teams = await all('SELECT * FROM teams ORDER BY ((id + ?) % 23) ASC, overall DESC', [day]);
  const candidates = await all(`
    SELECT * FROM players
    WHERE team_id IS NOT NULL AND market_value > 0
    ORDER BY
      CASE WHEN overall >= 85 THEN 5 WHEN overall >= 80 THEN 3 ELSE 0 END ASC,
      CASE WHEN is_starting_eleven = 1 OR lineup_role = 'starter' THEN 2 ELSE 0 END ASC,
      salary ASC,
      (potential - overall) DESC,
      playing_time ASC
    LIMIT 120
  `);
  const completed = [];
  for (const team of teams.filter((item) => item.id !== Number(excludeTeamId)).slice(0, 10)) {
    const weeklyDone = await get('SELECT id FROM transfer_history WHERE to_team_id = ? AND day >= ? LIMIT 1', [team.id, Math.max(1, day - 6)]);
    if (weeklyDone) continue;
    let selected = null;
    let selectedPrice = 0;
    let selectedCategory = 'transfer';
    for (const item of candidates) {
      if (Number(item.team_id) === Number(team.id) || Number(item.team_id) === Number(excludeTeamId)) continue;
      const overall = Number(item.overall || 65);
      const teamOverall = Number(team.overall || 70);
      const chance = seededRatio(Number(item.id) * 29 + Number(team.id) * 13 + day);
      if (overall >= 85 && teamOverall < 80) continue;
      if (overall >= 80 && chance > (teamOverall >= 80 ? 0.18 : 0.04)) continue;
      const recentPlayerMove = await get('SELECT id FROM transfer_history WHERE player_id = ? AND day >= ? LIMIT 1', [item.id, Math.max(1, day - 35)]);
      if (recentPlayerMove) continue;
      const category = categoryForPlayer(item, day);
      const baseValue = calculateBaseMarketValue(item);
      let ratio = 0.78 + seededRatio(Number(item.id) + Number(team.id) + day) * 0.28;
      if (overall >= 80) ratio += 0.12;
      if (Number(item.potential || overall) - overall >= 6 && overall < 82) ratio += 0.08;
      const price = roundInternalEuro(baseValue * ratio, 50000);
      const budgetCap = Number(team.budget || 0) * (teamOverall >= 80 ? 0.28 : 0.18);
      if (price <= 0 || price > budgetCap) continue;
      selected = item;
      selectedPrice = price;
      selectedCategory = category;
      break;
    }
    const player = selected;
    const price = selectedPrice;
    const category = selectedCategory;
    if (!player) continue;
    await run('UPDATE teams SET budget = budget - ? WHERE id = ?', [price, team.id]);
    if (player.team_id) await run('UPDATE teams SET budget = budget + ? WHERE id = ?', [price, player.team_id]);
    await run('DELETE FROM lineups WHERE player_id = ?', [player.id]);
    await run("UPDATE players SET team_id = ?, transfer_status = 'normal', happiness = 72, playing_time = 44 WHERE id = ?", [team.id, player.id]);
    await run(`
      INSERT INTO transfer_history (player_id, from_team_id, to_team_id, category, price, wage, status, day)
      VALUES (?, ?, ?, ?, ?, ?, 'completed', ?)
    `, [player.id, player.team_id, team.id, category, price, player.salary, state.current_day]);
    await createTransferStory({ teamId: team.id, playerId: player.id, category, status: 'completed', price });
    completed.push({ team, player, price });
  }
  return completed;
}

module.exports = {
  CATEGORY_LABELS,
  transferWindow,
  dynamicMarket,
  negotiateTransfer,
  processPendingTransferOffers,
  pendingOffersForUser,
  simulateAiTransfers,
  categoryForPlayer,
  askingPrice,
  money
};
