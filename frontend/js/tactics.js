const FALLBACK_FORMATIONS = {
  '4-4-2': [['GK', 50, 88], ['LB', 18, 70], ['CB', 39, 72], ['CB', 61, 72], ['RB', 82, 70], ['LM', 18, 48], ['CM', 39, 50], ['CM', 61, 50], ['RM', 82, 48], ['ST', 42, 22], ['ST', 58, 22]],
  '4-2-3-1': [['GK', 50, 88], ['LB', 18, 70], ['CB', 39, 72], ['CB', 61, 72], ['RB', 82, 70], ['DM', 40, 58], ['DM', 60, 58], ['AM', 50, 40], ['LW', 24, 32], ['RW', 76, 32], ['ST', 50, 20]],
  '4-3-3': [['GK', 50, 88], ['LB', 18, 70], ['CB', 39, 72], ['CB', 61, 72], ['RB', 82, 70], ['CM', 32, 52], ['CM', 50, 55], ['CM', 68, 52], ['LW', 23, 25], ['ST', 50, 20], ['RW', 77, 25]],
  '3-5-2': [['GK', 50, 88], ['CB', 30, 73], ['CB', 50, 76], ['CB', 70, 73], ['LM', 18, 50], ['CM', 38, 52], ['CM', 50, 48], ['CM', 62, 52], ['RM', 82, 50], ['ST', 42, 20], ['ST', 58, 20]],
  '5-3-2': [['GK', 50, 88], ['LWB', 13, 70], ['CB', 32, 74], ['CB', 50, 77], ['CB', 68, 74], ['RWB', 87, 70], ['CM', 34, 50], ['CM', 50, 54], ['CM', 66, 50], ['ST', 42, 20], ['ST', 58, 20]],
  '4-1-2-1-2': [['GK', 50, 88], ['LB', 18, 70], ['CB', 39, 72], ['CB', 61, 72], ['RB', 82, 70], ['DM', 50, 60], ['CM', 38, 48], ['CM', 62, 48], ['AM', 50, 35], ['ST', 42, 20], ['ST', 58, 20]],
  '4-5-1': [['GK', 50, 88], ['LB', 18, 70], ['CB', 39, 72], ['CB', 61, 72], ['RB', 82, 70], ['LM', 18, 48], ['CM', 37, 52], ['CM', 50, 55], ['CM', 63, 52], ['RM', 82, 48], ['ST', 50, 20]]
};

let tacticOptions = null;
let tacticSession = null;
let tacticBoosters = [];
let tacticBoosterPlayers = [];

function optionList(target, rows) {
  target.innerHTML = rows.map((item) => `<option value="${item.id}">${item.label || item.id}</option>`).join('');
}

function sliderText(id, labelId) {
  const input = byId(id);
  const label = byId(labelId);
  if (input && label) label.textContent = input.value;
}

function syncSharedPitch() {
  const formation = byId('formation').value;
  window.setSharedLineupFormation?.(formation, { keepPlayers: true });
}

function renderMetrics() {
  const selected = tacticOptions?.formations?.find((item) => item.id === byId('formation').value);
  const width = Number(byId('width').value || selected?.width || 60);
  const pressing = Number(byId('pressing').value || 55);
  const line = Number(byId('defensive_line').value || 50);
  const aggression = Number(byId('aggression').value || 50);
  const tempo = byId('tempo_label').value;
  const tempoValue = tacticOptions?.tempos?.find((item) => item.id === tempo)?.value || 55;
  const control = Math.round((selected?.midfieldControl || 62) + (tempo === 'slow' ? 4 : tempo === 'very_fast' ? -3 : 0));
  const defense = Math.round((selected?.defenseDensity || 62) + (line < 40 ? 5 : line > 70 ? -3 : 0));
  const attack = Math.round((selected?.attackShape || 62) + (tempoValue - 55) * 0.12 + (width - 50) * 0.06);

  byId('tempo').value = tempoValue;
  byId('tacticMetrics').innerHTML = [
    ['HÃ¼cum', attack],
    ['Orta saha', control],
    ['Savunma', defense],
    ['Pres riski', Math.round(pressing * 0.55 + aggression * 0.25)]
  ].map(([label, value]) => `<article class="stat-card"><span class="muted">${label}</span><strong>${value}</strong></article>`).join('');

  const attackLabel = byId('attack_style').selectedOptions[0]?.textContent || 'Dengeli';
  const defenseLabel = byId('defense_style').selectedOptions[0]?.textContent || 'Alan SavunmasÄ±';
  byId('tacticHints').innerHTML = `
    <div class="event"><strong>${attackLabel}</strong><br>${attackHint(byId('attack_style').value)}</div>
    <div class="event"><strong>${defenseLabel}</strong><br>${defenseHint(byId('defense_style').value)}</div>
  `;
}

function attackHint(value) {
  const hints = {
    counter: 'HÄ±zlÄ± forvetlerle gÃ¼Ã§lÃ¼dÃ¼r. Rakip savunma Ã§izgisi Ã¶ndeyse ekstra tehlike Ã¼retir.',
    tiki_taka: 'YÃ¼ksek pas ve top sÃ¼rme deÄŸerleriyle topa sahip olmayÄ± artÄ±rÄ±r.',
    long_ball: 'Pivot forvet ve toplu stoperlerle savunma arkasÄ±na erken oynar.',
    wide: 'GeniÅŸlik yÃ¼kseldikÃ§e kanat ortalarÄ± ve korner baskÄ±sÄ± artar.',
    press_attack: 'Ã–nde top kazanÄ±r ama yÃ¼ksek kondisyon ister.',
    balanced: 'Riskleri dÃ¼ÅŸÃ¼k, maÃ§ iÃ§inde dengeli tepki veren plan.'
  };
  return hints[value] || hints.balanced;
}

function defenseHint(value) {
  const hints = {
    deep_block: 'Skoru korumaya iyidir, rakibe top bÄ±rakÄ±r.',
    zonal: 'Dengeli savunma yerleÅŸimi saÄŸlar.',
    man_marking: 'Rakibin pas ritmini bozar ama faul riski artar.',
    high_press: 'Rakibi Ã§Ä±karken boÄŸar, arkada boÅŸluk bÄ±rakabilir.',
    ultra_defense: 'Ã‡ok gÃ¼venli ama hÃ¼cum Ã¼retimini dÃ¼ÅŸÃ¼rÃ¼r.'
  };
  return hints[value] || hints.zonal;
}

function refreshPreview() {
  sliderText('pressing', 'pressingValue');
  sliderText('defensive_line', 'defensiveLineValue');
  sliderText('aggression', 'aggressionValue');
  sliderText('width', 'widthValue');
  syncSharedPitch();
  renderMetrics();
}

window.refreshTacticPreview = refreshPreview;

function loadTileSettings() {
  document.querySelectorAll('.tactic-setting-tile[data-setting]').forEach((tile) => {
    const options = String(tile.dataset.options || '').split(',').filter(Boolean);
    const saved = localStorage.getItem(`tacticore_${tile.dataset.setting}`) || options[0] || '';
    const value = options.includes(saved) ? saved : options[0];
    tile.querySelector('small').textContent = value;
    tile.classList.toggle('active', value !== options[0]);
  });
}

document.querySelectorAll('.tactic-setting-tile[data-setting]').forEach((tile) => {
  tile.addEventListener('click', () => {
    const options = String(tile.dataset.options || '').split(',').filter(Boolean);
    if (!options.length) return;
    const current = tile.querySelector('small')?.textContent || options[0];
    const next = options[(options.indexOf(current) + 1) % options.length] || options[0];
    localStorage.setItem(`tacticore_${tile.dataset.setting}`, next);
    tile.querySelector('small').textContent = next;
    tile.classList.toggle('active', next !== options[0]);
  });
});

function boosterLabel(key) {
  const labels = {
    condition_boost: 'Kondisyon guclendirici',
    morale_boost: 'Moral guclendirici',
    training_bonus: 'Antrenman bonusu',
    scout_pack: 'Transfer gozlem paketi',
    injury_heal: 'Sakatlik iyilestirme karti'
  };
  return labels[key] || key;
}

function renderBoosterInventory() {
  const select = byId('boosterSelect');
  const playerSelect = byId('boosterPlayer');
  if (!select || !playerSelect) return;
  select.innerHTML = tacticBoosters.length
    ? tacticBoosters.map((item) => `<option value="${item.item_key}">${boosterLabel(item.item_key)} (${item.quantity})</option>`).join('')
    : '<option value="">Boost yok</option>';
  playerSelect.innerHTML = tacticBoosterPlayers.map((player) => (
    `<option value="${player.id}">${player.name} - ${player.position} OVR ${player.overall}</option>`
  )).join('');
  byId('boosterInventory').innerHTML = tacticBoosters.length
    ? tacticBoosters.map((item) => `<span>${boosterLabel(item.item_key)} x${item.quantity}</span>`).join('')
    : '<span>Envanter bos</span>';
  byId('useBooster').disabled = !tacticBoosters.length || !tacticBoosterPlayers.length;
}

async function loadBoosterInventory() {
  if (!byId('boosterSelect')) return;
  const [marketData, players] = await Promise.all([
    api.request('/api/market/items'),
    api.request(`/api/teams/${tacticSession.club.team_id}/players`)
  ]);
  tacticBoosters = marketData.boosters || [];
  tacticBoosterPlayers = players || [];
  renderBoosterInventory();
}

async function loadTactics() {
  wireShell(document.body.dataset.shellPage || 'tactics');
  tacticSession = await requireAuth();
  tacticOptions = await api.request('/api/tactics/formations');
  optionList(byId('formation'), tacticOptions.formations.filter((item) => item.id !== 'custom'));
  optionList(byId('attack_style'), tacticOptions.attackStyles);
  optionList(byId('defense_style'), tacticOptions.defenseStyles);
  optionList(byId('tempo_label'), tacticOptions.tempos);

  const tactic = await api.request('/api/tactics');
  byId('formation').value = tactic.formation || '4-2-3-1';
  byId('mentality').value = tactic.mentality || 'balanced';
  byId('passing_style').value = tactic.passing_style || 'mixed';
  byId('attack_style').value = tactic.attack_style || 'balanced';
  byId('defense_style').value = tactic.defense_style || 'zonal';
  byId('tempo_label').value = tactic.tempo_label || 'normal';
  byId('pressing').value = tactic.pressing ?? 55;
  byId('tempo').value = tactic.tempo ?? 55;
  byId('defensive_line').value = tactic.defensive_line ?? 50;
  byId('aggression').value = tactic.aggression ?? 50;
  byId('width').value = tactic.width ?? 60;
  loadTileSettings();
  refreshPreview();
  await loadBoosterInventory();
}

['formation', 'attack_style', 'defense_style', 'tempo_label', 'pressing', 'defensive_line', 'aggression', 'width'].forEach((id) => {
  byId(id)?.addEventListener('input', refreshPreview);
  byId(id)?.addEventListener('change', refreshPreview);
});

byId('tacticForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const saved = await api.request('/api/tactics', {
      method: 'POST',
      body: JSON.stringify({
        formation: byId('formation').value,
        mentality: byId('mentality').value,
        passing_style: byId('passing_style').value,
        attack_style: byId('attack_style').value,
        defense_style: byId('defense_style').value,
        tempo_label: byId('tempo_label').value,
        tempo: byId('tempo').value,
        pressing: byId('pressing').value,
        defensive_line: byId('defensive_line').value,
        aggression: byId('aggression').value,
        width: byId('width').value
      })
    });
    setMessage('Taktik kaydedildi. İlk 11 oyuncuların korunuyor.');
    window.renderLineup?.();
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

byId('useBooster')?.addEventListener('click', async () => {
  const itemKey = byId('boosterSelect')?.value;
  const playerId = byId('boosterPlayer')?.value;
  if (!itemKey || !playerId) return;
  byId('boosterMessage').textContent = 'Boost uygulanÄ±yor...';
  try {
    const result = await api.request('/api/boosters/use', {
      method: 'POST',
      body: JSON.stringify({ itemKey, playerId })
    });
    byId('boosterMessage').textContent = result.message || 'Boost kullanildi.';
    await loadBoosterInventory();
    window.reloadLineup?.();
  } catch (error) {
    byId('boosterMessage').textContent = error.message;
  }
});

loadTactics().catch((error) => setMessage(error.message, 'error'));

