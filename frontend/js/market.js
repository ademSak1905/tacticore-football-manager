let marketData = null;
let squadPlayers = [];

function itemButton(item) {
  if (item.item_type === 'coin_pack') return `Demo Coin Al (+${item.coin_amount})`;
  return `${item.price} TC ile Al`;
}

function renderMarket() {
  byId('marketBalance').textContent = `${Number(marketData.balance || 0).toLocaleString('tr-TR')} TactiCoins`;
  byId('marketItems').innerHTML = marketData.items.map((item) => `
    <article class="transfer-card market-item">
      <span class="message-category ${item.item_type === 'coin_pack' ? 'gold' : ''}">${item.item_type === 'coin_pack' ? 'Demo Coin' : 'Güçlendirici'}</span>
      <h2>${item.name}</h2>
      <p>${item.description}</p>
      <button class="btn ${item.item_type === 'coin_pack' ? 'secondary' : 'green'}" data-buy="${item.item_key}" type="button">${itemButton(item)}</button>
    </article>
  `).join('');

  byId('boosterSelect').innerHTML = (marketData.inventory || []).length
    ? marketData.inventory.map((item) => `<option value="${item.item_key}">${item.item_key} (${item.quantity})</option>`).join('')
    : '<option value="">Envanter boş</option>';
  byId('boosterPlayer').innerHTML = squadPlayers.map((player) => `<option value="${player.id}">${player.name} - ${player.position} - ${player.overall}</option>`).join('');
}

async function loadMarket() {
  wireShell('market');
  const session = await requireAuth();
  const [market, players] = await Promise.all([
    api.request('/api/market/items'),
    api.request(`/api/teams/${session.club.team_id}/players`)
  ]);
  marketData = market;
  squadPlayers = players;
  renderMarket();
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-buy]');
  if (!button) return;
  try {
    const result = await api.request('/api/market/buy', {
      method: 'POST',
      body: JSON.stringify({ itemKey: button.dataset.buy })
    });
    setMessage(result.message);
    marketData = await api.request('/api/market/items');
    renderMarket();
    window.refreshCoinWidget?.();
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

byId('useBooster')?.addEventListener('click', async () => {
  if (!byId('boosterSelect').value) return setMessage('Önce güçlendirici almalısın.', 'error');
  try {
    const result = await api.request('/api/boosters/use', {
      method: 'POST',
      body: JSON.stringify({ itemKey: byId('boosterSelect').value, playerId: byId('boosterPlayer').value })
    });
    setMessage(result.message);
    marketData = await api.request('/api/market/items');
    renderMarket();
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

loadMarket().catch((error) => setMessage(error.message, 'error'));
