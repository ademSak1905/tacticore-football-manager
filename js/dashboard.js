let activeDashboardTab = 'general';
let dashboardCache = null;

function competitionLabel(type) {
  if (type === 'champions_league') return 'Şampiyonlar Ligi';
  if (type === 'europa_league') return 'Avrupa Ligi';
  if (type === 'conference_league') return 'Konferans Ligi';
  if (type === 'turkish_cup') return 'Türkiye Kupası';
  return 'Süper Lig';
}

function formatSeasonDate(value, fallback) {
  if (!value) return fallback;
  return new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function setDashboardTab(tab) {
  activeDashboardTab = tab;
  console.log('DASHBOARD TAB CHECK', { activeDashboardTab });
  renderDashboard();
}

function renderDashboard() {
  if (!dashboardCache) return;
  const panels = {
    general: byId('dashboardGeneralPanel'),
    league: byId('dashboardLeaguePanel'),
    europe: byId('dashboardEuropePanel'),
    calendar: byId('dashboardCalendarPanel')
  };
  Object.entries(panels).forEach(([name, panel]) => {
    if (panel) panel.hidden = name !== activeDashboardTab;
  });
  document.querySelectorAll('[data-dashboard-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.dashboardTab === activeDashboardTab);
  });

  if (activeDashboardTab === 'general') renderGeneralDashboard();
  if (activeDashboardTab === 'league') renderDashboardLeague();
  if (activeDashboardTab === 'europe') renderDashboardEurope();
  if (activeDashboardTab === 'calendar') renderDashboardCalendar();
}

function renderGeneralDashboard() {
  const { data, state, europe, lineupData } = dashboardCache;
  const isEuropeNext = state.next_match_competition_type !== 'super_lig' && state.next_european_match;
  const nextOpponent = isEuropeNext
    ? `${state.next_european_match.short_name}: ${state.next_european_match.home_name || state.next_european_match.home_european_name} - ${state.next_european_match.away_name || state.next_european_match.away_european_name}`
    : data.nextOpponent;
  const stats = [
    ['Bütçe', money(data.club.budget)],
    ['Lig sırası', `${data.rank}.`],
    ['Son maç', data.club.last_match || 'Yok'],
    ['Sıradaki rakip', nextOpponent],
    ['Takım overall', data.teamPower],
    ['Taraftar', Number(data.club.fans).toLocaleString('tr-TR')],
    ['Form durumu', data.club.form || '-'],
    ['En iyi oyuncu', data.bestPlayer?.name || '-']
  ];

  byId('dashboardStats').innerHTML = stats.map(([label, value]) => `
    <article class="card stat-card"><span class="muted">${label}</span><strong>${value}</strong></article>
  `).join('');

  byId('clubSummary').innerHTML = `
    <div class="team-hero">
      <img class="team-logo large" src="${data.club.logo_url || '/assets/logos/placeholder.svg'}" alt="${data.club.name}">
      <div>
        <h2>${data.club.name}</h2>
        <p class="muted">${data.club.city || ''} - ${data.club.stadium || ''}</p>
      </div>
    </div>
    <div class="mini-stats" style="margin-top:16px">
      <span>Hücum ${data.club.attack_overall}</span><span>Orta saha ${data.club.midfield_overall}</span>
      <span>Savunma ${data.club.defense_overall}</span><span>Kaleci ${data.club.goalkeeper_overall}</span>
      <span>Haftalık maaş ${money(data.weeklySalary)}</span><span>Sakat ${data.injuredPlayers.length}</span>
    </div>
  `;
  updateGameState(state, nextOpponent);
  renderEuropeWeek(state, europe);
  byId('currencySelect').value = data.club.currency || localStorage.getItem('tacticoreCurrency') || 'TRY';
  renderDashboardPitch(lineupData.lineup);
}

function renderDashboardLeague() {
  const { league, data } = dashboardCache;
  byId('dashboardLeagueTable').innerHTML = league.length ? `
    <table>
      <thead><tr><th>#</th><th>Takım</th><th>O</th><th>G</th><th>B</th><th>M</th><th>A</th><th>P</th></tr></thead>
      <tbody>${league.map((team, index) => `
        <tr class="${team.id === data.club.team_id ? 'my-team-row' : ''}">
          <td>${index + 1}</td>
          <td><img class="team-logo" src="${team.logo_url || '/assets/logos/placeholder.svg'}" alt=""> ${team.name}</td>
          <td>${team.played}</td><td>${team.wins}</td><td>${team.draws}</td><td>${team.losses}</td>
          <td>${team.goal_difference}</td><td><strong>${team.points}</strong></td>
        </tr>
      `).join('')}</tbody>
    </table>
  ` : '<div class="empty">Lig tablosu henüz yok.</div>';
}

function renderDashboardEurope() {
  const { europe } = dashboardCache;
  if (!europe) {
    byId('dashboardEuropeContent').innerHTML = '<div class="empty">Avrupa verisi alınamadı.</div>';
    return;
  }
  const next = europe.next;
  const entries = (europe.entries || []).filter((entry) => entry.team_id);
  byId('dashboardEuropeContent').innerHTML = `
    <div class="grid stats">
      <article class="stat-card"><span class="muted">Sezon</span><strong>${europe.season || '-'}</strong></article>
      <article class="stat-card"><span class="muted">Avrupa bileti</span><strong>${entries.length}</strong></article>
      <article class="stat-card"><span class="muted">Sıradaki Avrupa maçı</span><strong>${next ? formatSeasonDate(next.match_date, `Gün ${next.match_day}`) : '-'}</strong></article>
    </div>
    <div class="calendar-list" style="margin-top:16px">
      ${next ? `<article class="calendar-card europe-fixture"><strong>${next.short_name} - ${next.round_name}</strong><p>${next.home_name || next.home_european_name} vs ${next.away_name || next.away_european_name}</p></article>` : '<div class="empty">Yaklaşan Avrupa maçı yok.</div>'}
      ${entries.map((entry) => `<article class="event"><strong>${entry.team_name}</strong><br>${entry.short_name || entry.competition_code} - ${entry.entry_stage}</article>`).join('')}
    </div>
  `;
}

function renderDashboardCalendar() {
  const { calendar } = dashboardCache;
  const rows = calendar.next5Matches || [];
  byId('dashboardCalendarContent').innerHTML = rows.length ? rows.map((match) => `
    <article class="calendar-card ${match.competitionType !== 'super_lig' ? 'europe-fixture' : ''}">
      <div class="calendar-head">
        <div><strong>${competitionLabel(match.competitionType)}</strong><span class="muted">${formatSeasonDate(match.date, `Gün ${match.day}`)}</span></div>
        <span class="badge">${match.label}</span>
      </div>
    </article>
  `).join('') : '<div class="empty">Yaklaşan maç yok.</div>';
}

function renderEuropeWeek(state, europe) {
  const card = byId('europeWeekCard');
  if (!card) return;
  const match = state.next_european_match || europe?.next;
  const isEuropeanWeek = ['champions_league', 'europa_league', 'conference_league'].includes(state.next_match_competition_type);
  if (!match || !isEuropeanWeek) {
    card.hidden = true;
    document.body.classList.remove('europe-theme-champions', 'europe-theme-europa', 'europe-theme-conference');
    return;
  }
  const themeClass = `europe-theme-${match.theme || 'champions'}`;
  document.body.classList.remove('europe-theme-champions', 'europe-theme-europa', 'europe-theme-conference');
  if (state.current_day >= match.match_day - 1) document.body.classList.add(themeClass);
  const home = match.home_name || match.home_european_name || '-';
  const away = match.away_name || match.away_european_name || '-';
  card.hidden = false;
  card.className = `europe-week-card ${match.theme || 'champions'}`;
  card.innerHTML = `
    <div>
      <span class="badge">${match.short_name || 'UEFA'}</span>
      <h2>Avrupa Haftası</h2>
      <p>${home} vs ${away}</p>
      <small>${match.round_name || 'Lig Aşaması'} - ${formatSeasonDate(match.match_date, `Gün ${match.match_day}`)}</small>
    </div>
    <a class="btn green" href="/match.html">${state.current_day >= match.match_day ? 'Avrupa maçına geç' : 'Hazırlan'}</a>
  `;
}

function renderDashboardPitch(lineup) {
  byId('dashboardPitch').innerHTML = lineup.map((row) => `
    <div class="dash-player" style="left:${row.x_position}%;top:${row.y_position}%">
      <span>${row.overall}</span><strong>${row.name.split(' ').slice(-1)[0]}</strong>
    </div>
  `).join('');
}

function updateGameState(state, nextOpponent) {
  const today = formatSeasonDate(state.current_date, `Gün ${state.current_day}`);
  const nextMatchDay = state.next_fixture_day || state.next_match_day;
  const nextMatchSource = state.next_match_competition_type !== 'super_lig'
    ? state.next_european_match?.match_date
    : state.next_match_date;
  const nextMatch = formatSeasonDate(nextMatchSource, `Gün ${nextMatchDay}`);
  const isMatchDay = state.matchAvailable;
  byId('gameState').textContent = `${today}. ${isMatchDay ? 'Maç günü geldi.' : `Sıradaki maç: ${nextMatch}.`}`;
  byId('nextMatchCard').innerHTML = `
    <article class="event">
      <strong>${competitionLabel(state.next_match_competition_type)}</strong><br>
      ${nextOpponent || 'Rakip hazırlanıyor.'}<br>
      <span class="muted">${nextMatch}</span>
    </article>
  `;
  byId('goMatch').style.display = isMatchDay ? 'inline-flex' : 'none';
  byId('nextWeek').style.display = isMatchDay ? 'none' : 'inline-flex';
  byId('nextWeek').disabled = isMatchDay;
}

async function advance(days) {
  try {
    const state = await api.request('/api/game/advance', { method: 'POST', body: JSON.stringify({ days }) });
    dashboardCache.state = state;
    renderDashboard();
  } catch (error) {
    byId('gameState').textContent = error.message;
    byId('goMatch').style.display = 'inline-flex';
    byId('nextWeek').disabled = true;
  }
}

async function loadDashboard() {
  wireShell('dashboard');
  await requireAuth();
  const [data, state, europe, league, calendar] = await Promise.all([
    api.request('/api/club'),
    api.request('/api/game/state'),
    api.request('/api/europe/overview').catch(() => null),
    api.request('/api/league/table').catch(() => []),
    api.request('/api/calendar').catch(() => ({ next5Matches: [] }))
  ]);
  const lineupData = await api.request(`/api/teams/${data.club.team_id}/lineup`);
  dashboardCache = { data, state, europe, league, calendar, lineupData };
  renderDashboard();
}

document.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-dashboard-tab]');
  if (tab) setDashboardTab(tab.dataset.dashboardTab);
});

byId('nextWeek')?.addEventListener('click', () => advance(7));
byId('currencySelect')?.addEventListener('change', async () => {
  const currency = byId('currencySelect').value;
  localStorage.setItem('tacticoreCurrency', currency);
  await api.request('/api/game/currency', { method: 'POST', body: JSON.stringify({ currency }) });
  loadDashboard();
});

loadDashboard().catch((error) => setMessage(error.message, 'error'));
