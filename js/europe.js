function formatDate(value, fallback = '-') {
  if (!value) return fallback;
  return new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function teamName(match, side) {
  return match?.[`${side}_name`] || match?.[`${side}_european_name`] || '-';
}

function renderHero(data) {
  const next = data.next;
  const hero = byId('europeHero');
  if (!next) {
    hero.className = 'europe-week-card champions';
    hero.innerHTML = '<div><span class="badge">UEFA</span><h2>Avrupa sistemi hazır</h2><p>Sezon biletleri lig sıralamasına göre oluşturuldu.</p></div>';
    return;
  }
  hero.className = `europe-week-card ${next.theme || 'champions'}`;
  hero.innerHTML = `
    <div>
      <span class="badge">${next.short_name}</span>
      <h2>${next.theme === 'europa' ? 'Avrupa Sahnesi' : next.theme === 'conference' ? 'Konferans Gecesi' : 'Şampiyonlar Ligi Gecesi'}</h2>
      <p>${teamName(next, 'home')} vs ${teamName(next, 'away')}</p>
      <small>${next.round_name} - ${formatDate(next.match_date, `Gün ${next.match_day}`)}</small>
    </div>
    <a class="btn green" href="/dashboard.html">${data.matchAvailable ? 'Dashboarddan maça geç' : 'Takvime bak'}</a>
  `;
}

function renderOverview(data) {
  renderHero(data);
  byId('europeStats').innerHTML = [
    ['Sezon', data.season],
    ['Organizasyon', data.competitions.length],
    ['Avrupa bileti', data.entries.filter((item) => item.team_id).length],
    ['Sıradaki maç', data.next ? formatDate(data.next.match_date, `Gün ${data.next.match_day}`) : '-']
  ].map(([label, value]) => `<article class="stat-card"><span class="muted">${label}</span><strong>${value}</strong></article>`).join('');

  byId('qualificationRules').innerHTML = data.rules.map((rule) => `
    <div class="event"><strong>${rule.rank}. sıra</strong><br>${rule.competition} - ${rule.label}</div>
  `).join('');

  const drawItems = [];
  for (const draw of data.draws) {
    try {
      const rows = JSON.parse(draw.draw_data || '[]').slice(0, 8);
      for (const item of rows) drawItems.push({ ...item, competition: draw.competition_code });
    } catch {}
  }
  byId('drawCards').innerHTML = drawItems.length ? drawItems.slice(0, 12).map((item) => `
    <article class="draw-card"><span>${item.competition}</span><strong>Takım #${item.team_id}</strong><small>Rakip havuzu #${item.opponent_european_team_id} - Gün ${item.day}</small></article>
  `).join('') : '<div class="empty">Kura verisi oluşuyor.</div>';
}

async function renderStandings(code = 'UCL') {
  const rows = await api.request(`/api/europe/standings/${code}`);
  byId('europeTable').innerHTML = rows.length ? `
    <table><thead><tr><th>#</th><th>Takım</th><th>O</th><th>AV</th><th>P</th><th>Durum</th></tr></thead><tbody>
      ${rows.map((row, index) => {
        const status = index < 8 ? 'Direkt üst tur' : index < 24 ? 'Play-off' : 'Elendi';
        return `<tr><td>${index + 1}</td><td>${row.name}</td><td>${row.played}</td><td>${row.goal_difference}</td><td><strong>${row.points}</strong></td><td>${status}</td></tr>`;
      }).join('')}
    </tbody></table>
  ` : '<div class="empty">Puan durumu henüz oluşmadı.</div>';
}

async function renderMatches() {
  const rows = await api.request('/api/europe/matches');
  byId('europeMatches').innerHTML = rows.length ? `
    <table><thead><tr><th>Tarih</th><th>Turnuva</th><th>Ev</th><th>Skor</th><th>Deplasman</th></tr></thead><tbody>
      ${rows.map((row) => `<tr><td>${formatDate(row.match_date)}</td><td>${row.short_name}</td><td>${row.home_name}</td><td><strong>${row.played ? `${row.home_score}-${row.away_score}` : 'vs'}</strong></td><td>${row.away_name}</td></tr>`).join('')}
    </tbody></table>
  ` : '<div class="empty">Avrupa maçı yok.</div>';
}

async function loadEurope() {
  wireShell('europe');
  await requireAuth();
  const data = await api.request('/api/europe/overview');
  renderOverview(data);
  await renderStandings('UCL');
  await renderMatches();
}

byId('setupEurope')?.addEventListener('click', async () => {
  try {
    const data = await api.request('/api/europe/setup', { method: 'POST' });
    renderOverview(data);
    await renderStandings('UCL');
    await renderMatches();
    setMessage('Avrupa sistemi hazırlandı.');
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-comp]');
  if (button) await renderStandings(button.dataset.comp);
});

loadEurope().catch((error) => setMessage(error.message, 'error'));
