let allPlayers = [];
let activePosition = 'ALL';

function roleLabel(role) {
  if (role === 'starter') return 'İlk 11';
  if (role === 'substitute') return 'Yedek';
  return 'Rezerv';
}

function formatMoney(value) {
  const amount = Number(value || 0);
  if (amount >= 1000000) return `€${(amount / 1000000).toFixed(amount >= 10000000 ? 0 : 1)}M`;
  if (amount >= 1000) return `€${Math.round(amount / 1000)}K`;
  return `€${amount}`;
}

function playerRow(player) {
  const form = player.form || player.stamina || 70;
  return `
    <article class="player-card player-row" data-player-row="${player.id}">
      <div class="player-main">
        <div class="player-name-cell">
          <strong>${player.name}</strong>
          <small>${roleLabel(player.lineup_role)} ${player.injured ? ' - Sakat' : ''}</small>
        </div>
        <span class="badge">${player.position}</span>
        <span>${player.age}</span>
        <strong class="rating small">${player.overall}</strong>
        <span>${form}</span>
        <span>${player.morale}</span>
        <strong>${formatMoney(player.market_value)}</strong>
      </div>
      <div class="player-detail">
        <div class="mini-stats">
          <span>Hız ${player.pace}</span><span>Şut ${player.shooting}</span>
          <span>Pas ${player.passing}</span><span>Top sürme ${player.dribbling || '-'}</span>
          <span>Savunma ${player.defending}</span><span>Fizik ${player.physical || '-'}</span>
          <span>Kondisyon ${player.stamina}</span><span>Moral ${player.morale}</span>
        </div>
        <div class="actions">
          <button class="btn green" data-role="starter" data-id="${player.id}">İlk 11</button>
          <button class="btn secondary" data-role="substitute" data-id="${player.id}">Yedek</button>
          <button class="btn secondary" data-role="reserve" data-id="${player.id}">Rezerv</button>
        </div>
      </div>
    </article>
  `;
}

function renderPlayers() {
  const list = activePosition === 'ALL' ? allPlayers : allPlayers.filter((player) => player.position === activePosition);
  byId('players').innerHTML = list.length ? `
    <div class="squad-list-head">
      <span>Oyuncu Adı</span><span>Mevki</span><span>Yaş</span><span>Overall</span><span>Form</span><span>Moral</span><span>Değer</span>
    </div>
    ${list.map(playerRow).join('')}
  ` : '<div class="empty">Bu filtrede oyuncu yok.</div>';
}

function renderFilters() {
  const positions = ['ALL', 'GK', 'DEF', 'MID', 'FWD'];
  byId('positionFilters').innerHTML = positions.map((position) => `
    <button class="btn ${activePosition === position ? '' : 'secondary'}" data-filter="${position}">${position}</button>
  `).join('');
}

async function loadSquad() {
  wireShell('squad');
  await requireAuth();
  allPlayers = await api.request('/api/players');
  renderFilters();
  renderPlayers();
}

document.addEventListener('click', async (event) => {
  const filter = event.target.closest('[data-filter]');
  const role = event.target.closest('[data-role]');
  if (filter) {
    activePosition = filter.dataset.filter;
    renderFilters();
    renderPlayers();
  }
  if (role) {
    const id = Number(role.dataset.id);
    allPlayers = allPlayers.map((player) => player.id === id ? { ...player, lineup_role: role.dataset.role } : player);
    renderPlayers();
  }
  const row = event.target.closest('[data-player-row]');
  if (row && !event.target.closest('button')) {
    row.classList.toggle('open');
  }
});

byId('saveLineup')?.addEventListener('click', async () => {
  const starters = allPlayers.filter((player) => player.lineup_role === 'starter').map((player) => player.id);
  const substitutes = allPlayers.filter((player) => player.lineup_role === 'substitute').map((player) => player.id);
  try {
    await api.request('/api/lineup', { method: 'POST', body: JSON.stringify({ starters, substitutes }) });
    setMessage('Kadro kaydedildi.');
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

byId('restoreSquad')?.addEventListener('click', async () => {
  try {
    const result = await api.request('/api/squad/restore-snapshot', { method: 'POST' });
    setMessage(result.message || 'Kadro onarıldı.');
    allPlayers = await api.request('/api/players');
    renderPlayers();
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

loadSquad().catch((error) => setMessage(error.message, 'error'));


