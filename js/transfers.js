let transferSfxContext = null;

function ensureTransferSfx() {
  if (!transferSfxContext) transferSfxContext = new (window.AudioContext || window.webkitAudioContext)();
  if (transferSfxContext.state === 'suspended') transferSfxContext.resume();
}

function playApplause() {
  ensureTransferSfx();
  const ctx = transferSfxContext;
  for (let i = 0; i < 24; i += 1) {
    const start = ctx.currentTime + i * 0.045;
    const noise = ctx.createBufferSource();
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.055), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let j = 0; j < data.length; j += 1) data[j] = Math.random() * 2 - 1;
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    filter.type = 'bandpass';
    filter.frequency.value = 900 + Math.random() * 1100;
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.linearRampToValueAtTime(0.07, start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.055);
    noise.buffer = buffer;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(start);
    noise.stop(start + 0.06);
  }
}

function showTransferSigning(transfer) {
  if (!transfer) return Promise.resolve();
  playApplause();
  const overlay = document.createElement('div');
  overlay.className = 'transfer-signing-overlay';
  overlay.innerHTML = `
    <div class="transfer-signing-card">
      <div class="transfer-signing-logo">
        <img src="${transfer.toTeamLogo || '/assets/logos/placeholder.svg'}" alt="${transfer.toTeamName || 'Takim'}">
      </div>
      <div class="transfer-signing-copy">
        <span class="badge green-badge">Transfer tamamlandi</span>
        <h1>${transfer.playerName}</h1>
        <p>${transfer.fromTeamName || 'Eski kulup'} takimindan ${transfer.toTeamName || 'kulubune'} imza atti.</p>
        <div class="signature-line"><span>${transfer.playerName}</span></div>
        <div class="season-rows">
          <div class="season-row"><span>Bonservis</span><strong>${money(transfer.price)}</strong></div>
          <div class="season-row"><span>Maas</span><strong>${money(transfer.wage)}</strong></div>
          <div class="season-row"><span>Mevki / Overall</span><strong>${transfer.position} / ${transfer.overall}</strong></div>
        </div>
        <button class="btn green" id="closeTransferSigning" type="button">Kadroyu ac</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  return new Promise((resolve) => {
    overlay.querySelector('#closeTransferSigning').addEventListener('click', () => {
      overlay.remove();
      resolve();
    });
  });
}

let transferMode = 'market';
let marketPlayers = [];
let ownPlayers = [];
let clubData = null;
let marketMeta = { window: { isOpen: true, name: 'Transfer donemi' }, categories: [] };
let pendingOffers = [];

function playerLogo(player = {}) {
  return player.logo_url || player.team_logo || player.club_logo || '/assets/logos/placeholder.svg';
}

function playerPrice(player, market) {
  return market ? Number(player.asking_price ?? player.market_value) : Math.round(Number(player.market_value || 0) * 0.82);
}

function positionMatches(player, position) {
  if (!position || position === 'all') return true;
  return String(player.position || '').toUpperCase() === position;
}

function transferCard(player) {
  const market = transferMode === 'market';
  const price = playerPrice(player, market);
  const displayPrice = toCurrencyInput(price);
  const displaySalary = toCurrencyInput(player.salary);
  const action = market ? 'buy' : 'sell';
  const pending = player.pending_offer;
  const label = market
    ? pending ? 'Teklif Bekleniyor' : player.can_buy ? 'Teklif Yap' : 'Donem Kapali'
    : 'Sat';
  const disabled = pending || (market && !player.can_buy);
  const potential = Number(player.potential || player.overall || 0);
  const status = market
    ? Number(player.overall || 0) >= 84 ? 'Ligin ust seviyesi'
      : potential >= 82 ? 'Yuksek potansiyelli'
      : 'Pazar firsati'
    : 'Kadromdaki oyuncu';
  const badge = market ? (player.category_label || status) : 'Oyuncularim';
  const reason = market ? (player.reason || status) : 'Bu oyuncu icin satis teklifi olusturabilirsin.';

  return `
    <article class="player-card transfer-card transfer-wide-card ${market ? `cat-${player.category || 'market'}` : 'own-player'}">
      <section class="transfer-player-hero">
        <div class="transfer-silhouette" aria-hidden="true"></div>
        <img class="transfer-club-logo" src="${playerLogo(player)}" alt="">
        <div class="transfer-player-copy">
          <span class="badge green-badge">${badge}</span>
          <h2>${player.name}</h2>
          <p class="muted">${player.age || '-'} yas - ${player.position || '-'} - ${player.team_name || clubData?.club?.name || 'Serbest'}</p>
          <p>${reason}</p>
        </div>
        <div class="transfer-rating"><strong>${player.overall || '-'}</strong><span>GENEL</span></div>
        <div class="transfer-attributes">
          <div><span>Potansiyel</span><strong>${potential || '-'}</strong></div>
          <div><span>Mutluluk</span><strong>${player.happiness || 70}</strong></div>
          <div><span>Moral</span><strong>${player.morale || 70}</strong></div>
          <div><span>Maas</span><strong>${money(player.salary)}</strong></div>
          <div><span>Sure</span><strong>${player.playing_time || 50}</strong></div>
          <div><span>Bedel</span><strong>${money(price)}</strong></div>
        </div>
      </section>
      <section class="transfer-offer-panel">
        ${market ? `
          <div class="transfer-offer-form">
            <label><span>Teklif (EUR)</span><input type="number" data-offer="${player.id}" value="${displayPrice}"></label>
            <label><span>Maas (EUR)</span><input type="number" data-wage="${player.id}" value="${displaySalary}"></label>
            <label><span>Imza Parasi (EUR)</span><input type="number" data-bonus="${player.id}" value="0"></label>
            <label class="checkbox-line"><input type="checkbox" data-role="${player.id}"><span>Ilk 11 sozunu ver</span></label>
          </div>
          <aside class="market-info-card">
            <h3>Piyasa Bilgisi</h3>
            <div class="season-row"><span>Piyasa Degeri</span><strong>${money(player.market_value || price)}</strong></div>
            <div class="season-row"><span>Sozlesme Bitisi</span><strong>${player.contract_until || '2027'}</strong></div>
            <div class="season-row"><span>Forma Numarasi</span><strong>${player.shirt_number || '-'}</strong></div>
            <div class="season-row"><span>Oyuncu Durumu</span><strong>${status}</strong></div>
          </aside>
        ` : `
          <aside class="market-info-card wide">
            <h3>Satis Bilgisi</h3>
            <div class="season-row"><span>Tahmini Deger</span><strong>${money(price)}</strong></div>
            <div class="season-row"><span>Maas</span><strong>${money(player.salary)}</strong></div>
            <div class="season-row"><span>Potansiyel</span><strong>${potential || '-'}</strong></div>
          </aside>
        `}
        <button class="btn ${market ? 'green' : 'danger'} transfer-main-action" data-action="${action}" data-id="${player.id}" ${disabled ? 'disabled' : ''}>${label}</button>
        ${pending ? '<p class="muted transfer-pending-note">Teklif gonderildi. Cevap Mesajlar bolumune dusecek.</p>' : ''}
      </section>
    </article>
  `;
}

function renderPendingOffers() {
  const target = byId('pendingOffers');
  if (!target) return;
  if (!pendingOffers.length) {
    target.hidden = true;
    return;
  }
  target.hidden = false;
  target.innerHTML = `
    <div class="inbox-dashboard-head">
      <div>
        <span class="badge">Bekleyen Teklifler</span>
        <h2>Transfer cevaplari bekleniyor</h2>
      </div>
      <a class="btn secondary" href="/messages.html">Mesajlari ac</a>
    </div>
    <div class="season-rows">
      ${pendingOffers.map((offer) => `
        <div class="season-row">
          <span>${offer.player_name} - ${offer.from_team_name || 'Serbest'}</span>
          <strong>${money(offer.offer_price)} / Hafta ${offer.response_week || '-'}</strong>
        </div>
      `).join('')}
    </div>
  `;
}

function renderCategoryOptions() {
  const select = byId('categoryFilter');
  if (!select) return;
  select.innerHTML = '<option value="all">Tum Kategoriler</option>' + (marketMeta.categories || [])
    .map((item) => `<option value="${item.id}">${item.label}</option>`)
    .join('');
}

function renderTransfers() {
  if (!clubData) return;
  const budgetBadge = byId('budgetBadge');
  const windowBadge = byId('windowBadge');
  if (budgetBadge) budgetBadge.textContent = money(clubData.club.budget);
  if (windowBadge) {
    windowBadge.textContent = marketMeta.window?.name || 'Transfer donemi';
    windowBadge.className = `badge ${marketMeta.window?.isOpen ? 'green-badge' : 'closed-badge'}`;
  }
  byId('marketTab').className = `btn ${transferMode === 'market' ? '' : 'secondary'}`;
  byId('sellTab').className = `btn ${transferMode === 'sell' ? '' : 'secondary'}`;

  const categoryFilter = byId('categoryFilter');
  const positionFilter = byId('positionFilter');
  const search = byId('transferSearch');
  if (categoryFilter) categoryFilter.style.display = transferMode === 'market' ? 'block' : 'none';
  if (search) search.style.display = transferMode === 'market' ? 'block' : 'none';
  if (positionFilter) positionFilter.style.display = 'block';

  const position = positionFilter?.value || 'all';
  const list = (transferMode === 'market' ? marketPlayers : ownPlayers).filter((player) => positionMatches(player, position));
  renderPendingOffers();
  byId('transferList').innerHTML = list.map(transferCard).join('') || '<div class="empty">Liste bos.</div>';
}

async function refreshTransfers() {
  clubData = await api.request('/api/club');
  const category = byId('categoryFilter')?.value || 'all';
  const q = byId('transferSearch')?.value || '';
  const market = await api.request(`/api/transfers/market?category=${encodeURIComponent(category)}&q=${encodeURIComponent(q)}`);
  marketMeta = { window: market.window, categories: market.categories || [] };
  pendingOffers = market.pendingOffers || await api.request('/api/transfers/pending').catch(() => []);
  if (!byId('categoryFilter')?.dataset.ready) {
    renderCategoryOptions();
    if (byId('categoryFilter')) byId('categoryFilter').dataset.ready = '1';
  }
  marketPlayers = market.players || market || [];
  ownPlayers = await api.request('/api/players');
  renderTransfers();
}

async function loadTransfers() {
  wireShell('transfers');
  await requireAuth();
  await refreshTransfers();
}

byId('marketTab')?.addEventListener('click', () => {
  transferMode = 'market';
  renderTransfers();
});

byId('sellTab')?.addEventListener('click', () => {
  transferMode = 'sell';
  renderTransfers();
});

byId('categoryFilter')?.addEventListener('change', refreshTransfers);
byId('positionFilter')?.addEventListener('change', renderTransfers);
byId('transferSearch')?.addEventListener('input', () => {
  clearTimeout(window.transferSearchTimer);
  window.transferSearchTimer = setTimeout(refreshTransfers, 250);
});

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  try {
    const endpoint = action === 'buy' ? '/api/transfers/buy' : '/api/transfers/sell';
    const id = Number(button.dataset.id);
    const result = await api.request(endpoint, {
      method: 'POST',
      body: JSON.stringify({
        playerId: id,
        offerPrice: fromCurrencyInput(document.querySelector(`[data-offer="${id}"]`)?.value || 0),
        wageOffer: fromCurrencyInput(document.querySelector(`[data-wage="${id}"]`)?.value || 0),
        signingBonus: fromCurrencyInput(document.querySelector(`[data-bonus="${id}"]`)?.value || 0),
        firstTeamPromise: Boolean(document.querySelector(`[data-role="${id}"]`)?.checked)
      })
    });
    setMessage(result.message, result.status === 'counter' ? 'info' : 'info');
    if (result.transfer) await showTransferSigning(result.transfer);
    await refreshTransfers();
    refreshMessageBadge?.();
  } catch (error) {
    setMessage(error.message, 'error');
    await refreshTransfers().catch(() => {});
  }
});

loadTransfers().catch((error) => setMessage(error.message, 'error'));
