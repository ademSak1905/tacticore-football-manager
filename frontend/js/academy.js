function academyTimeline(items) {
  if (!items?.length) return '<div class="empty">Henüz akademi raporu yok. Sezon ilerledikçe genç oyuncu raporları burada görünecek.</div>';
  return items.map((report) => `
    <article class="timeline-item">
      <strong>${report.player_name || 'Genç oyuncu'}</strong>
      <span>${report.position || '-'} - OVR ${report.overall || '-'} / POT ${report.potential || '-'}</span>
      <small>${report.summary || 'Altyapı ekibinden yeni rapor.'}</small>
    </article>
  `).join('');
}

async function loadAcademyPage() {
  wireShell('academy');
  await requireAuth();
  const data = await api.request('/api/manager/summary');
  const reports = data.careerSystems?.academyReports || [];
  byId('academyReports').innerHTML = academyTimeline(reports);
  const best = reports.reduce((top, item) => Number(item.potential || 0) > Number(top?.potential || 0) ? item : top, null);
  byId('academySummary').innerHTML = [
    ['Rapor sayısı', reports.length],
    ['En iyi potansiyel', best ? `${best.player_name || 'Oyuncu'} ${best.potential || '-'}` : '-'],
    ['Son rapor', reports[0]?.report_day ? `Gün ${reports[0].report_day}` : '-'],
    ['Durum', reports.length ? 'Takipte' : 'Bekleniyor']
  ].map(([label, value]) => `<article class="stat-card"><span class="muted">${label}</span><strong>${value}</strong></article>`).join('');
}

loadAcademyPage().catch((error) => setMessage(error.message, 'error'));
