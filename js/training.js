const trainingNames = {
  attack: 'Hücum antrenmanı',
  defense: 'Savunma antrenmani',
  pressing: 'Pres çalışması',
  passing: 'Pas oyunu',
  fitness: 'Kondisyon antrenmani',
  morale: 'Takım morali',
  set_piece: 'Duran top',
  shooting: 'Şut çalışması'
};

async function loadHistory() {
  const history = await api.request('/api/training/history');
  byId('trainingHistory').innerHTML = history.length ? `
    <table><thead><tr><th>Tarih</th><th>Tur</th></tr></thead><tbody>
      ${history.map((item) => `<tr><td>${new Date(item.created_at).toLocaleString('tr-TR')}</td><td>${trainingNames[item.type] || item.type}</td></tr>`).join('')}
    </tbody></table>
  ` : '<div class="empty">Antrenman gecmisi yok.</div>';
}

async function loadTraining() {
  wireShell('training');
  const session = await requireAuth();
  const players = await api.request(`/api/teams/${session.club.team_id}/players`);
  byId('playerSelect').innerHTML = players.map((player) => `<option value="${player.id}" ${player.injured ? 'disabled' : ''}>${player.name} - ${player.position} ${player.overall}${player.injured ? ' (sakat)' : ''}</option>`).join('');
  await Promise.all([loadHistory(), loadResults()]);
}

async function loadResults() {
  const results = await api.request('/api/training/results');
  byId('trainingResults').innerHTML = results.length ? results.map((item) => `<div class="event">${item.result_text}</div>`).join('') : '<div class="empty">Henüz sonuç yok.</div>';
}

byId('runTeamTraining')?.addEventListener('click', async () => {
  try {
    const result = await api.request('/api/training/team', {
      method: 'POST',
      body: JSON.stringify({ type: byId('teamTrainingType').value, intensity: byId('teamIntensity').value })
    });
    setMessage(`Antrenman bitti. ${result.results.join(' | ')}`);
    byId('runTeamTraining').disabled = true;
    byId('runPlayerTraining').disabled = true;
    setTimeout(() => setMessage('Bugünkü çalışma kaydedildi.'), 2400);
    await Promise.all([loadHistory(), loadResults()]);
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

byId('runPlayerTraining')?.addEventListener('click', async () => {
  try {
    const result = await api.request('/api/training/player', {
      method: 'POST',
      body: JSON.stringify({ playerId: byId('playerSelect').value, type: byId('playerTrainingType').value, intensity: byId('playerIntensity').value })
    });
    setMessage(`Antrenman bitti. ${result.results.join(' | ')}`);
    byId('runTeamTraining').disabled = true;
    byId('runPlayerTraining').disabled = true;
    setTimeout(() => setMessage('Bugünkü çalışma kaydedildi.'), 2400);
    await Promise.all([loadHistory(), loadResults()]);
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

loadTraining().catch((error) => setMessage(error.message, 'error'));


