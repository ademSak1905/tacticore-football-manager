let currentTeam = null;
let allPlayers = [];
let selectedIds = [];
let formations = [];
let selectedBenchId = null;
let selectedSlotIndex = null;
let lastLineupTouchAt = 0;

function statAverage(players, field) {
  if (!players.length) return 0;
  return Math.round(players.reduce((sum, player) => sum + Number(player[field] || 0), 0) / players.length);
}

function positionGroup(slot) {
  if (slot === 'GK') return 'GK';
  if (['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(slot)) return 'DEF';
  if (['DM', 'CM', 'AM', 'LM', 'RM'].includes(slot)) return 'MID';
  return 'FWD';
}

function renderPower() {
  const starters = selectedIds.map((id) => allPlayers.find((player) => player.id === Number(id))).filter(Boolean);
  byId('lineupPower').innerHTML = `
    <span>Genel ${statAverage(starters, 'overall')}</span>
    <span>Hücum ${statAverage(starters.filter((p) => p.position === 'FWD'), 'overall')}</span>
    <span>Orta saha ${statAverage(starters.filter((p) => p.position === 'MID'), 'overall')}</span>
    <span>Savunma ${statAverage(starters.filter((p) => p.position === 'DEF'), 'overall')}</span>
    <span>Kaleci ${statAverage(starters.filter((p) => p.position === 'GK'), 'overall')}</span>
    <span>Kondisyon ${statAverage(starters, 'stamina')}</span>
  `;
}

function setLineupMessage(text, type = 'info') {
  const target = byId('lineupMessage') || byId('message');
  if (target) {
    target.textContent = text;
    target.style.color = type === 'error' ? '#f87171' : '#facc15';
  }
}

function isCoarsePointer() {
  return window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;
}

function consumeLineupEvent(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
}

function guardTouchEvent(event) {
  if (event?.pointerType === 'touch' || event?.pointerType === 'pen') {
    lastLineupTouchAt = Date.now();
    consumeLineupEvent(event);
    return true;
  }
  return false;
}

function handleSlotPress(index, event = null) {
  consumeLineupEvent(event);
  if (selectedBenchId) {
    selectedIds[index] = selectedBenchId;
    selectedBenchId = null;
    selectedSlotIndex = null;
    renderLineup();
    setLineupMessage('Oyuncu pozisyona yerlestirildi. Kaydetmeyi unutma.');
    return;
  }
  if (selectedSlotIndex === null) {
    selectedSlotIndex = index;
    renderLineup();
    setLineupMessage('Kart secildi. Yer degistirmek icin baska bir saha kartina dokun.');
    return;
  }
  if (selectedSlotIndex === index) {
    selectedSlotIndex = null;
    renderLineup();
    setLineupMessage('Secim kaldirildi.');
    return;
  }
  [selectedIds[selectedSlotIndex], selectedIds[index]] = [selectedIds[index], selectedIds[selectedSlotIndex]];
  selectedSlotIndex = null;
  selectedBenchId = null;
  renderLineup();
  setLineupMessage('Iki oyuncunun yeri degistirildi. Kaydetmeyi unutma.');
}

function handleBenchPress(playerId, event = null) {
  consumeLineupEvent(event);
  selectedBenchId = Number(playerId);
  selectedSlotIndex = null;
  renderLineup();
  setLineupMessage('Simdi sahadaki bir pozisyona dokun.');
}

function renderLineup() {
  const selectedFormation = formations.find((item) => item.name === byId('formationSelect').value) || formations[0];
  const pitch = byId('lineupPitch');
  if (!selectedFormation || !pitch) return;
  if (!pitch.dataset.touchWired) {
    pitch.dataset.touchWired = '1';
    pitch.addEventListener('pointerdown', (event) => event.stopPropagation());
    pitch.addEventListener('touchstart', (event) => event.stopPropagation(), { passive: true });
  }
  pitch.innerHTML = '';
  selectedFormation.slots.forEach((slot, index) => {
    const player = allPlayers.find((item) => item.id === Number(selectedIds[index]));
    const mismatch = player && player.position !== positionGroup(slot[0]);
    const card = document.createElement('div');
    card.className = `lineup-player ${mismatch ? 'mismatch' : ''} ${selectedSlotIndex === index ? 'selected' : ''}`;
    card.draggable = !isCoarsePointer();
    card.dataset.index = index;
    card.style.left = `${slot[1]}%`;
    card.style.top = `${slot[2]}%`;
    card.innerHTML = `<span class="card-overall">${player ? player.overall - (mismatch ? 8 : 0) : '-'}</span><strong>${player?.name || 'Boş'}</strong><small>${slot[0]}</small>`;
    card.addEventListener('dragstart', (event) => {
      if (isCoarsePointer()) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.setData('text/plain', index);
    });
    card.addEventListener('dragover', (event) => event.preventDefault());
    card.addEventListener('drop', (event) => {
      event.preventDefault();
      const value = event.dataTransfer.getData('text/plain');
      if (value.startsWith('bench:')) return;
      const from = Number(value);
      const to = Number(card.dataset.index);
      if (!Number.isFinite(from) || from === to) return;
      [selectedIds[from], selectedIds[to]] = [selectedIds[to], selectedIds[from]];
      selectedSlotIndex = null;
      renderLineup();
    });
    card.addEventListener('pointerup', (event) => {
      if (guardTouchEvent(event)) handleSlotPress(index, event);
    });
    card.addEventListener('click', (event) => {
      if (Date.now() - lastLineupTouchAt < 450) return;
      handleSlotPress(index, event);
    });
    pitch.appendChild(card);
  });

  const benchPlayers = allPlayers.filter((player) => !selectedIds.map(Number).includes(player.id));
  byId('bench').innerHTML = benchPlayers.length ? benchPlayers.map((player) => `
    <button class="bench-player ${selectedBenchId === player.id ? 'selected' : ''}" draggable="${isCoarsePointer() ? 'false' : 'true'}" data-player="${player.id}" type="button">
      <span>${player.overall}</span><strong>${player.name}</strong><small>${player.position}</small>
    </button>
  `).join('') : '<div class="empty">Yedek kulübesinde oyuncu yok.</div>';
  byId('bench')?.addEventListener('pointerdown', (event) => event.stopPropagation(), { once: true });
  document.querySelectorAll('.bench-player').forEach((button) => {
    button.addEventListener('dragstart', (event) => {
      if (isCoarsePointer()) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.setData('text/plain', `bench:${button.dataset.player}`);
    });
    button.addEventListener('pointerup', (event) => {
      if (guardTouchEvent(event)) handleBenchPress(button.dataset.player, event);
    });
    button.addEventListener('click', (event) => {
      if (Date.now() - lastLineupTouchAt < 450) return;
      handleBenchPress(button.dataset.player, event);
    });
  });
  document.querySelectorAll('.lineup-player').forEach((slot) => {
    slot.addEventListener('drop', (event) => {
      event.preventDefault();
      const value = event.dataTransfer.getData('text/plain');
      const index = Number(slot.dataset.index);
      if (value.startsWith('bench:')) {
        const playerId = Number(value.replace('bench:', ''));
        const currentId = Number(selectedIds[index]);
        const benchIndex = selectedIds.findIndex((id) => Number(id) === playerId);
        if (benchIndex >= 0) selectedIds[benchIndex] = currentId;
        selectedIds[index] = playerId;
        selectedBenchId = null;
        selectedSlotIndex = null;
        renderLineup();
      }
    });
  });
  renderPower();
}

function setSharedLineupFormation(formation) {
  const lineupFormation = byId('formationSelect');
  if (!lineupFormation || !formations.some((item) => item.name === formation)) return;
  lineupFormation.value = formation;
  renderLineup();
}

function syncTacticFormationFromLineup() {
  const tacticFormation = byId('formation');
  const lineupFormation = byId('formationSelect');
  if (tacticFormation && lineupFormation && tacticFormation.value !== lineupFormation.value) {
    tacticFormation.value = lineupFormation.value;
    window.refreshTacticPreview?.();
  }
}

function normalizePlayer(player) {
  return {
    ...player,
    id: Number(player.id),
    overall: Number(player.overall || 0),
    stamina: Number(player.stamina || 0),
    morale: Number(player.morale || 0)
  };
}

function buildStarterIds(players, lineupRows) {
  const knownIds = new Set(players.map((player) => player.id));
  const lineupIds = lineupRows
    .map((row) => Number(row.player_id))
    .filter((id, index, ids) => knownIds.has(id) && ids.indexOf(id) === index);

  if (lineupIds.length >= 11) return lineupIds.slice(0, 11);

  const preferred = [
    ...players.filter((player) => player.is_starting_eleven || player.lineup_role === 'starter'),
    ...players.filter((player) => player.lineup_role === 'substitute'),
    ...players
  ];
  const merged = [...lineupIds];
  preferred.forEach((player) => {
    if (merged.length < 11 && !merged.includes(player.id)) merged.push(player.id);
  });
  return merged.slice(0, 11);
}

async function loadLineup() {
  wireShell(document.body.dataset.shellPage || 'lineup');
  const session = await requireAuth();
  currentTeam = session.club;
  const [formationData, players, lineupData] = await Promise.all([
    api.request('/api/formations'),
    api.request(`/api/teams/${currentTeam.team_id}/players`),
    api.request(`/api/teams/${currentTeam.team_id}/lineup`)
  ]);
  formations = formationData;
  allPlayers = players.map(normalizePlayer);
  byId('formationSelect').innerHTML = formations.map((item) => `<option value="${item.name}">${item.name}</option>`).join('');
  byId('formationSelect').value = lineupData.team.default_formation;
  selectedIds = buildStarterIds(allPlayers, lineupData.lineup || []);
  renderLineup();
}

byId('formationSelect')?.addEventListener('change', () => {
  renderLineup();
  syncTacticFormationFromLineup();
});
byId('saveLineup')?.addEventListener('click', async () => {
  try {
    const result = await api.request(`/api/teams/${currentTeam.team_id}/lineup`, {
      method: 'POST',
      body: JSON.stringify({ formation: byId('formationSelect').value, playerIds: selectedIds })
    });
    setLineupMessage([result.message, ...(result.warnings || [])].join(' '));
    syncTacticFormationFromLineup();
  } catch (error) {
    setLineupMessage(error.message, 'error');
  }
});

window.reloadLineup = loadLineup;
window.renderLineup = renderLineup;
window.setSharedLineupFormation = setSharedLineupFormation;
loadLineup().catch((error) => setLineupMessage(error.message, 'error'));


