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
        <img src="${transfer.toTeamLogo || '/assets/logos/placeholder.svg'}" alt="${transfer.toTeamName}">
      </div>
      <div class="transfer-signing-copy">
        <span class="badge green-badge">Transfer tamamlandı</span>
        <h1>${transfer.playerName}</h1>
        <p>${transfer.fromTeamName} takımından ${transfer.toTeamName} takımına imza attı.</p>
        <div class="signature-line"><span>${transfer.playerName}</span></div>
        <div class="season-rows">
          <div class="season-row"><span>Bonservis</span><strong>${money(transfer.price)}</strong></div>
          <div class="season-row"><span>Maaş</span><strong>${money(transfer.wage)}</strong></div>
          <div class="season-row"><span>Mevki / Overall</span><strong>${transfer.position} / ${transfer.overall}</strong></div>
        </div>
        <button class="btn green" id="closeTransferSigning" type="button">Kadroyu aç</button>
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
let marketMeta = { window: { isOpen: true, name: 'Transfer dönemi' }, categories: [] };
let pendingOffers = [];

function transferCard(player) {
  const market = transferMode === 'market';
  const price = market ? Number(player.asking_price ?? player.market_value) : Math.round(player.market_value * 0.82);
  const displayPrice = toCurrencyInput(price);
  const displaySalary = toCurrencyInput(player.salary);
  const action = market ? 'buy' : 'sell';
  const pending = player.pending_offer;
  const label = market
    ? pending ? 'Teklif Bekleniyor' : player.can_buy ? 'Teklif Yap' : 'Dönem Kapalı'
    : 'Sat';
  return `
    <article class="player-card transfer-card ${market ? `cat-${player.category}` : ''}">
      <div class="player-head">
        <div>
          <span class="badge">${market ? player.category_label : 'Kadrom'}</span>
          <strong>${player.name}</strong>
          <p class="muted">${player.age} yaş - ${player.position} ${player.team_name ? `- ${player.team_name}` : ''}</p>
        </div>
        <span class="rating">${player.overall}</span>
      </div>
      <div class="mini-stats">
        <span>Potansiyel ${player.potential || player.overall}</span><span>Moral ${player.morale}</span>
        <span>Mutluluk ${player.happiness || 70}</span><span>Süre ${player.playing_time || 50}</span>
        <span>Maaş ${money(player.salary)}</span><span>Bedel ${money(price)}</span>
      </div>
      ${market ? `<p class="muted">${pending ? `Teklif gönderildi. Cevap hafta ${pending.response_week || '-'} içinde Mesajlar'a düşecek.` : player.reason}</p>` : ''}
      ${market ? `
        <div class="offer-box">
          <label><span>Teklif (EUR)</span><input type="number" data-offer="${player.id}" value="${displayPrice}"></label>
          <label><span>Maaş (EUR)</span><input type="number" data-wage="${player.id}" value="${displaySalary}"></label>
          <label><span>İmza (EUR)</span><input type="number" data-bonus="${player.id}" value="0"></label>
          <label class="checkbox-line"><input type="checkbox" data-role="${player.id}"><span>İlk 11 sözü</span></label>
        </div>
      ` : ''}
      <button class="btn ${market ? 'green' : 'danger'}" data-action="${action}" data-id="${player.id}" ${pending || (market && !player.can_buy) ? 'disabled' : ''}>${label}</button>
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
        <h2>Transfer cevapları bekleniyor</h2>
      </div>
      <a class="btn secondary" href="/messages.html">Mesajları aç</a>
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
  select.innerHTML = '<option value="all">Tüm kategoriler</option>' + marketMeta.categories.map((item) => `<option value="${item.id}">${item.label}</option>`).join('');
}

function renderTransfers() {
  byId('budgetBadge').textContent = clubData ? money(clubData.club.budget) : 'Bütçe';
  byId('windowBadge').textContent = marketMeta.window?.name || 'Transfer dönemi';
  byId('windowBadge').className = `badge ${marketMeta.window?.isOpen ? 'green-badge' : 'closed-badge'}`;
  byId('marketTab').className = `btn ${transferMode === 'market' ? '' : 'secondary'}`;
  byId('sellTab').className = `btn ${transferMode === 'sell' ? '' : 'secondary'}`;
  const list = transferMode === 'market' ? marketPlayers : ownPlayers;
  byId('categoryFilter').style.display = transferMode === 'market' ? 'block' : 'none';
  byId('transferSearch').style.display = transferMode === 'market' ? 'block' : 'none';
  renderPendingOffers();
  byId('transferList').innerHTML = list.map(transferCard).join('') || '<div class="empty">Liste boş.</div>';
}

async function refreshTransfers() {
  clubData = await api.request('/api/club');
  const category = byId('categoryFilter')?.value || 'all';
  const q = byId('transferSearch')?.value || '';
  const market = await api.request(`/api/transfers/market?category=${encodeURIComponent(category)}&q=${encodeURIComponent(q)}`);
  marketMeta = { window: market.window, categories: market.categories };
  pendingOffers = market.pendingOffers || await api.request('/api/transfers/pending').catch(() => []);
  if (!byId('categoryFilter').dataset.ready) {
    renderCategoryOptions();
    byId('categoryFilter').dataset.ready = '1';
  }
  marketPlayers = market.players || market;
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
    await refreshTransfers();
    refreshMessageBadge?.();
  } catch (error) {
    setMessage(error.message, 'error');
    await refreshTransfers().catch(() => {});
  }
});

loadTransfers().catch((error) => setMessage(error.message, 'error'));
