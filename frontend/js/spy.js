let spyData = null;

function renderReport(row) {
  if (!row) return '<div class="empty">Henüz rapor yok.</div>';
  const report = row.report || row.report_json || {};
  if (!row.success || report.caught) {
    return `<article class="event urgent"><strong>${report.teamName || row.target_team_name || 'Rakip'}</strong><p>Casus yakalandı. Bilgi gelmedi.</p></article>`;
  }
  return `
    <article class="spy-detail">
      <h3>${report.teamName}</h3>
      <div class="mini-stats">
        <span>Diziliş ${report.formation}</span>
        <span>Overall ${report.overall}</span>
        <span>Moral ${report.morale}</span>
        <span>Kondisyon ${report.stamina}</span>
      </div>
      <h4>Muhtemel ilk 11</h4>
      <div class="spy-lineup">${(report.lineup || []).map((p) => `<span><strong>${p.overall}</strong> ${p.name} <em>${p.position}</em></span>`).join('')}</div>
      <h4>Güçlü oyuncular</h4>
      <p>${(report.strongPlayers || []).map((p) => `${p.name} (${p.overall})`).join(', ') || '-'}</p>
      <h4>Zayıf bölgeler</h4>
      <p>${(report.weakAreas || []).join(', ') || '-'}</p>
      <h4>Taktik tahmini</h4>
      <p>${report.tacticGuess || '-'}</p>
      <h4>Sakatlar</h4>
      <p>${(report.injuredPlayers || []).map((p) => p.name).join(', ') || 'Yok'}</p>
    </article>
  `;
}

function renderSpy() {
  byId('spyBalance').textContent = `${Number(spyData.balance || 0).toLocaleString('tr-TR')} TactiCoins`;
  byId('spyTeam').innerHTML = spyData.teams.map((team) => `<option value="${team.id}">${team.name} - OVR ${team.overall}</option>`).join('');
  byId('spyType').innerHTML = Object.entries(spyData.spyTypes).map(([key, item]) => (
    `<option value="${key}">${item.label} - ${item.cost} TC - %${Math.round(item.successRate * 100)}</option>`
  )).join('');
  const latest = spyData.recentReports?.[0];
  byId('spyLatest').innerHTML = renderReport(latest);
  byId('spyReports').innerHTML = (spyData.recentReports || []).length
    ? spyData.recentReports.map((row) => `
      <article class="inbox-row ${row.success ? '' : 'urgent'}">
        <strong>${row.report?.teamName || row.target_team_name || 'Rakip'}</strong>
        <span>${row.spy_type} casus - ${row.success ? 'Başarılı' : 'Yakalandı'}</span>
      </article>
    `).join('')
    : '<div class="empty">Rapor geçmişi boş.</div>';
}

async function loadSpy() {
  wireShell('spy');
  await requireAuth();
  spyData = await api.request('/api/spy/teams');
  renderSpy();
}

byId('spyForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('Casus yola çıktı...');
  try {
    const result = await api.request('/api/spy/send', {
      method: 'POST',
      body: JSON.stringify({ teamId: byId('spyTeam').value, spyType: byId('spyType').value })
    });
    setMessage(result.report.success ? 'Casus raporu geldi.' : 'Casus yakalandı, coin harcandı.');
    spyData = await api.request('/api/spy/teams');
    renderSpy();
    window.refreshCoinWidget?.();
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

loadSpy().catch((error) => setMessage(error.message, 'error'));
