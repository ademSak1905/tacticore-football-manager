const { all, get, run } = require('../database');
const { createTransferStory } = require('./feedEngine');

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
  if (player.transfer_status === 'unhappy' || player.happiness < 48) return 'unhappy';
  if (player.contract_until <= 2026) return 'expiring';
  if (player.age <= 21 && player.potential >= 78) return player.market_value > 12000000 ? 'premium' : 'youth';
  if (player.market_value < Math.max(1200000, player.overall * 18000) || player.age >= 31) return 'bargain';
  if (day >= 150 && player.playing_time < 35) return 'listed';
  return player.overall >= 78 && player.potential >= 82 ? 'premium' : 'listed';
}

function askingPrice(player, category) {
  const base = Number(player.market_value || 0);
  const multipliers = {
    free: 0,
    loan: 0.18,
    expiring: 0.58,
    youth: 1.18,
    premium: 1.55,
    bargain: 0.72,
    unhappy: 0.82,
    swap: 0.9,
    listed: 1
  };
  return Math.max(0, Math.round(base * (multipliers[category] || 1)));
}

function listingReason(player, category, window) {
  const reasons = {
    free: 'Kulübü yok, transfer dönemi kapalı olsa bile alınabilir.',
    loan: 'Daha fazla süre bulması için kiralık çıkabilir.',
    expiring: 'Sözleşmesi yakında bitiyor, kulübü uygun teklife açık.',
    youth: 'Scout ekibi yüksek gelişim potansiyeli görüyor.',
    premium: 'Pahalı ama potansiyeli ligin üst seviyesinde.',
    bargain: 'Maaş/yaş dengesi nedeniyle fırsat paketi olabilir.',
    unhappy: 'Oyuncu süre ve rol konusunda mutsuz.',
    swap: 'Kulübü takas opsiyonunu masada tutuyor.',
    listed: 'Kulübü doğru bonservisle görüşmeye hazır.'
  };
  return window.isOpen ? reasons[category] : `${reasons[category]} Resmi imza için dönem beklenmeli.`;
}

async function dynamicMarket(userTeamId, filters = {}) {
  const state = await get('SELECT * FROM game_state WHERE id = 1');
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
  `, [userTeamId, q, q]);

  const enriched = rows.map((player) => {
    const category = categoryForPlayer(player, state.current_day);
    const price = askingPrice(player, category);
    const interest = clamp(Math.round((player.potential - 62) * 1.3 + (100 - player.happiness) * 0.22 + (player.overall - 65) * 0.8), 5, 96);
    const canBuy = window.isOpen || category === 'free';
    return {
      ...player,
      category,
      category_label: CATEGORY_LABELS[category],
      asking_price: price,
      loan_fee: category === 'loan' ? Math.round(player.market_value * 0.08) : 0,
      interest,
      window_open: window.isOpen,
      window_name: window.name,
      can_buy: canBuy ? 1 : 0,
      reason: listingReason(player, category, window)
    };
  });

  const dayMod = Number(state.current_day || 1) % 9;
  let filtered = enriched.filter((player) => {
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
    players: filtered.slice(0, 80)
  };
}

async function evaluateOffer({ player, buyerTeam, offerPrice, wageOffer, signingBonus, firstTeamPromise }) {
  const category = categoryForPlayer(player, 1);
  const expected = askingPrice(player, category);
  const salaryBoost = wageOffer / Math.max(1, player.salary);
  const prestige = Number(buyerTeam.overall || 70);
  const role = firstTeamPromise ? 12 : 0;
  const happinessNeed = Math.max(0, 70 - Number(player.happiness || 70)) * 0.22;
  const score = Math.round((offerPrice / Math.max(1, expected || 1)) * 52 + salaryBoost * 18 + prestige * 0.22 + role + happinessNeed + signingBonus / 500000);
  const accepted = category === 'free' ? score >= 48 : score >= 72;
  const counter = accepted ? 0 : Math.round(expected * 1.08 + player.salary * 3);
  return { accepted, score, counter, expected, category };
}

async function completeTransfer({ player, club, price, category, wageOffer = 0, signingBonus = 0, loanFee = 0, buyOption = 0, sellOnPercent = 0 }) {
  const fromTeamId = player.team_id || null;
  const totalCost = price + signingBonus + loanFee;
  await run('UPDATE clubs SET budget = budget - ? WHERE id = ?', [totalCost, club.id]);
  if (fromTeamId) await run('UPDATE teams SET budget = budget + ? WHERE id = ?', [price, fromTeamId]);
  await run(`
    UPDATE players
    SET team_id = ?, club_id = NULL, salary = ?, lineup_role = 'reserve', is_starting_eleven = 0,
        transfer_status = 'normal', happiness = 74, playing_time = ?
    WHERE id = ?
  `, [club.team_id, wageOffer || player.salary, category === 'loan' ? 55 : 45, player.id]);
  await run('INSERT INTO transfers (player_id, from_club_id, to_club_id, price) VALUES (?, NULL, ?, ?)', [player.id, club.id, price]);
  await run(`
    INSERT INTO transfer_history
      (player_id, from_team_id, to_team_id, category, price, wage, signing_bonus, loan_fee, buy_option, sell_on_percent, status, day)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', (SELECT current_day FROM game_state WHERE id = 1))
  `, [player.id, fromTeamId, club.team_id, category, price, wageOffer || player.salary, signingBonus, loanFee, buyOption, sellOnPercent]);
  await createTransferStory({ teamId: club.team_id, playerId: player.id, category, status: 'completed', price });
}

async function negotiateTransfer(club, body = {}) {
  const state = await get('SELECT * FROM game_state WHERE id = 1');
  const window = transferWindow(state.current_day);
  const playerId = Number(body.playerId);
  const player = await get('SELECT * FROM players WHERE id = ? AND (team_id IS NULL OR team_id != ?)', [playerId, club.team_id]);
  if (!player) return { status: 'error', message: 'Transfer listesindeki oyuncu bulunamadı.' };
  const category = categoryForPlayer(player, state.current_day);
  if (!window.isOpen && category !== 'free') {
    await createTransferStory({ teamId: club.team_id, playerId: player.id, category: 'transfer', status: 'rumor' });
    return { status: 'closed', message: 'Transfer dönemi kapalı. Bu oyuncu için sadece söylenti oluştu, resmi imza atılamaz.' };
  }

  const buyerTeam = await get('SELECT * FROM teams WHERE id = ?', [club.team_id]);
  const offerPrice = Math.max(0, Number(body.offerPrice ?? askingPrice(player, category)));
  const wageOffer = Math.max(0, Number(body.wageOffer ?? player.salary));
  const signingBonus = Math.max(0, Number(body.signingBonus ?? 0));
  const loanFee = category === 'loan' ? Math.max(0, Number(body.loanFee ?? Math.round(player.market_value * 0.08))) : 0;
  const buyOption = Math.max(0, Number(body.buyOption ?? 0));
  const sellOnPercent = clamp(body.sellOnPercent ?? 0, 0, 40);
  const firstTeamPromise = body.firstTeamPromise ? 1 : 0;
  const totalCost = offerPrice + signingBonus + loanFee;
  if (club.budget < totalCost) return { status: 'error', message: 'Bütçe bu transfer paketi için yeterli değil.' };

  const decision = await evaluateOffer({ player, buyerTeam, offerPrice, wageOffer, signingBonus, firstTeamPromise });
  await run(`
    INSERT INTO transfer_interest
      (player_id, from_team_id, interested_team_id, category, status, offer_price, wage_offer, signing_bonus, loan_fee,
       buy_option, sell_on_percent, first_team_promise, decision_score, day)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    player.id, player.team_id || null, club.team_id, category, decision.accepted ? 'accepted' : 'counter',
    offerPrice, wageOffer, signingBonus, loanFee, buyOption, sellOnPercent, firstTeamPromise, decision.score, state.current_day
  ]);

  if (!decision.accepted) {
    await createTransferStory({ teamId: club.team_id, playerId: player.id, category: 'transfer', status: 'counter', price: decision.counter });
    return {
      status: 'counter',
      message: `${player.name} tarafı paketi düşük buldu. Karşı teklif: ${decision.counter.toLocaleString('tr-TR')} TL.`,
      counter_offer: decision.counter,
      decision_score: decision.score
    };
  }

  await completeTransfer({
    player,
    club,
    price: offerPrice,
    category,
    wageOffer,
    signingBonus,
    loanFee,
    buyOption,
    sellOnPercent
  });
  return { status: 'accepted', message: `${player.name} kulübünüze katıldı.`, decision_score: decision.score };
}

async function simulateAiTransfers(excludeTeamId = null) {
  const state = await get('SELECT * FROM game_state WHERE id = 1');
  const window = transferWindow(state.current_day);
  if (!window.isOpen || state.current_day % 7 !== 0) return [];
  const teams = await all('SELECT * FROM teams ORDER BY overall DESC');
  const candidates = await all(`
    SELECT * FROM players
    WHERE team_id IS NOT NULL
    ORDER BY potential DESC, happiness ASC, market_value ASC
    LIMIT 50
  `);
  const completed = [];
  for (const team of teams.filter((item) => item.id !== Number(excludeTeamId)).slice(0, 4)) {
    const player = candidates.find((item) => item.team_id !== team.id && item.market_value < team.budget * 0.22);
    if (!player || Math.random() > 0.34) continue;
    const category = categoryForPlayer(player, state.current_day);
    const price = askingPrice(player, category);
    await run('UPDATE teams SET budget = budget - ? WHERE id = ?', [price, team.id]);
    if (player.team_id) await run('UPDATE teams SET budget = budget + ? WHERE id = ?', [price, player.team_id]);
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
  simulateAiTransfers,
  categoryForPlayer,
  askingPrice
};
