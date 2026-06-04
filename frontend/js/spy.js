let spyData = null;

function pendingSpyText(daysLeft) {
  if (daysLeft >= 3) return 'Casus ekibi rakip tesise sizma plani hazirliyor.';
  if (daysLeft === 2) return 'Kadro notlari ve antrenman izleri toplanıyor.';
  return 'Taktik dosyalari dogrulaniyor. Rapor yakinda acilacak.';
}

function renderPendingReport(row) {
  const daysLeft = Number(row.days_left || 1);
  const totalDays = row.spy_type === 'elite' ? 1 : row.spy_type === 'advanced' ? 2 : 3;
  const progress = Math.max(8, Math.min(90, Math.round(((totalDays - daysLeft) / totalDays) * 100)));
  return `
    <article class="spy-pending">
      <span class="badge">Operasyon suruyor</span>
      <h3>${row.report?.teamName || row.target_team_name || 'Rakip'}</h3>
      <strong class="spy-countdown">${daysLeft} oyun gunu kaldi</strong>
      <p>${pendingSpyText(daysLeft)}</p>
      <div class="spy-progress"><span style="width:${progress}%"></span></div>
      <small>Takvim ilerledikce rapor hazirlanacak ve mesajlara dusecek.</small>
    </article>
  `;
}

function renderReport(row) {
  if (!row) return '<div class="empty">Henüz rapor yok.</div>';
  if (row.status === 'pending' || row.isReady === false) return renderPendingReport(row);
  const report = row.report || row.report_json || {};
  if (!row.success || report.caught) {
    return `<article class="event urgent"><strong>${report.teamName || row.target_team_name || 'Rakip'}</strong><p>Casus yakalandi. Bilgi gelmedi.</p></article>`;
  }
  return `
    <article class="spy-detail">
      <h3>${report.teamName}</h3>
      <div class="mini-stats">
        <span>Dizilis ${report.formation}</span>
        <span>Overall ${report.overall}</span>
        <span>Moral ${report.morale}</span>
        <span>Kondisyon ${report.stamina}</span>
      </div>
      <h4>Muhtemel ilk 11</h4>
      <div class="spy-lineup">${(report.lineup || []).map((p) => `<span><strong>${p.overall}</strong> ${p.name} <em>${p.position}</em></span>`).join('')}</div>
      <h4>Guclu oyuncular</h4>
      <p>${(report.strongPlayers || []).map((p) => `${p.name} (${p.overall})`).join(', ') || '-'}</p>
      <h4>Zayif bolgeler</h4>
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
    `<option value="${key}">${item.label} - ${item.cost} TC - %${Math.round(item.successRate * 100)} - ${item.delayDays || 2} gun</option>`
  )).join('');
  const latest = spyData.recentReports?.[0];
  byId('spyForm').hidden = Boolean(latest);
  byId('spyLatest').innerHTML = renderReport(latest);
  byId('spyReports').innerHTML = (spyData.recentReports || []).length
    ? spyData.recentReports.map((row) => `
      <article class="inbox-row ${row.status === 'pending' || row.isReady === false ? 'pending' : row.success ? '' : 'urgent'}">
        <strong>${row.report?.teamName || row.target_team_name || 'Rakip'}</strong>
        <span>${row.spy_type} casus - ${row.status === 'pending' || row.isReady === false ? `${row.days_left || 1} gun kaldi` : row.success ? 'Basarili' : 'Yakalandi'}</span>
      </article>
    `).join('')
    : '<div class="empty">Rapor gecmisi bos.</div>';
}

async function loadSpy() {
  wireShell('spy');
  await requireAuth();
  spyData = await api.request('/api/spy/teams');
  renderSpy();
}

byId('spyForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('Casus yola cikti...');
  try {
    await api.request('/api/spy/send', {
      method: 'POST',
      body: JSON.stringify({ teamId: byId('spyTeam').value, spyType: byId('spyType').value })
    });
    setMessage('Operasyon basladi. Rapor oyun takvimi ilerledikce hazirlanacak.');
    spyData = await api.request('/api/spy/teams');
    renderSpy();
    window.refreshCoinWidget?.();
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

loadSpy().catch((error) => setMessage(error.message, 'error'));
