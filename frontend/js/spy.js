let spyData = null;
let spyCountdownTimer = null;

function secondsUntilReveal(row) {
  const revealAt = new Date(row?.reveal_at || row?.created_at || Date.now()).getTime();
  return Math.max(0, Math.ceil((revealAt - Date.now()) / 1000));
}

function formatCountdown(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function pendingSpyText(seconds) {
  if (seconds > 95) return 'Casus ekibi rakip tesisin çevresinde sızma noktası arıyor.';
  if (seconds > 55) return 'Kadro notları ve antrenman izleri sessizce toplanıyor.';
  if (seconds > 20) return 'Taktik dosyaları doğrulanıyor, rapor kilidi çözülüyor.';
  return 'Son bilgiler kontrol ediliyor. Rapor birazdan açılacak.';
}

function renderPendingReport(row) {
  const seconds = secondsUntilReveal(row);
  const progress = Math.max(4, Math.min(100, Math.round(((150 - seconds) / 150) * 100)));
  return `
    <article class="spy-pending">
      <span class="badge">Operasyon sürüyor</span>
      <h3>${row.report?.teamName || row.target_team_name || 'Rakip'}</h3>
      <strong class="spy-countdown">${formatCountdown(seconds)}</strong>
      <p>${pendingSpyText(seconds)}</p>
      <div class="spy-progress"><span style="width:${progress}%"></span></div>
      <small>Sayaç bitince rapor otomatik açılacak.</small>
    </article>
  `;
}

function renderReport(row) {
  if (!row) return '<div class="empty">Henüz rapor yok.</div>';
  if (row.status === 'pending' || row.isReady === false) return renderPendingReport(row);
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

function syncSpyCountdown(latest) {
  if (spyCountdownTimer) clearInterval(spyCountdownTimer);
  if (!latest || (latest.status !== 'pending' && latest.isReady !== false)) return;
  spyCountdownTimer = setInterval(async () => {
    if (secondsUntilReveal(latest) > 0) {
      byId('spyLatest').innerHTML = renderPendingReport(latest);
      return;
    }
    clearInterval(spyCountdownTimer);
    spyCountdownTimer = null;
    spyData = await api.request('/api/spy/teams');
    renderSpy();
  }, 1000);
}

function renderSpy() {
  byId('spyBalance').textContent = `${Number(spyData.balance || 0).toLocaleString('tr-TR')} TactiCoins`;
  byId('spyTeam').innerHTML = spyData.teams.map((team) => `<option value="${team.id}">${team.name} - OVR ${team.overall}</option>`).join('');
  byId('spyType').innerHTML = Object.entries(spyData.spyTypes).map(([key, item]) => (
    `<option value="${key}">${item.label} - ${item.cost} TC - %${Math.round(item.successRate * 100)}</option>`
  )).join('');
  const latest = spyData.recentReports?.[0];
  byId('spyForm').hidden = Boolean(latest);
  byId('spyLatest').innerHTML = renderReport(latest);
  syncSpyCountdown(latest);
  byId('spyReports').innerHTML = (spyData.recentReports || []).length
    ? spyData.recentReports.map((row) => `
      <article class="inbox-row ${row.status === 'pending' || row.isReady === false ? 'pending' : row.success ? '' : 'urgent'}">
        <strong>${row.report?.teamName || row.target_team_name || 'Rakip'}</strong>
        <span>${row.spy_type} casus - ${row.status === 'pending' || row.isReady === false ? 'Sızıyor' : row.success ? 'Başarılı' : 'Yakalandı'}</span>
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
    await api.request('/api/spy/send', {
      method: 'POST',
      body: JSON.stringify({ teamId: byId('spyTeam').value, spyType: byId('spyType').value })
    });
    setMessage('Operasyon başladı. Rapor 2-3 dakika içinde açılacak.');
    spyData = await api.request('/api/spy/teams');
    renderSpy();
    window.refreshCoinWidget?.();
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

loadSpy().catch((error) => setMessage(error.message, 'error'));
