let calendarData = null;
let activeCalendarFilter = 'all';

function formatSeasonDate(value, fallback = '-') {
  if (!value) return fallback;
  return new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function competitionLabel(type, fallback = '') {
  if (type === 'europe_draw') return 'Kura günü';
  if (type === 'super_lig') return 'Süper Lig';
  if (type === 'turkish_cup') return 'Türkiye Kupası';
  if (type === 'champions_league') return 'Şampiyonlar Ligi';
  if (type === 'europa_league') return 'Avrupa Ligi';
  if (type === 'conference_league') return 'Konferans Ligi';
  return fallback || type || '-';
}

function isEuropeType(type) {
  return ['champions_league', 'europa_league', 'conference_league', 'europe_draw'].includes(type);
}

function filteredCalendarMatches() {
  const rows = calendarData?.calendarMatches || [];
  if (activeCalendarFilter === 'all') return rows;
  if (activeCalendarFilter === 'europe') return rows.filter((match) => isEuropeType(match.competitionType));
  return rows.filter((match) => match.competitionType === activeCalendarFilter);
}

function renderCalendarMatches() {
  const rows = filteredCalendarMatches();
  document.querySelectorAll('[data-calendar-filter]').forEach((button) => {
    button.classList.toggle('active', button.dataset.calendarFilter === activeCalendarFilter);
  });
  byId('calendarMatches').innerHTML = rows.length ? rows.map((match) => `
    <article class="calendar-card ${match.isUserMatch ? 'live-week' : ''} ${isEuropeType(match.competitionType) ? 'europe-fixture' : ''} ${match.competitionType === 'europe_draw' ? 'draw-day-card' : ''}">
      <div class="calendar-head">
        <div>
          <strong>${competitionLabel(match.competitionType, match.competitionLabel)}</strong>
          <span class="muted">${formatSeasonDate(match.date, `Gün ${match.day}`)}</span>
        </div>
        <span class="badge">${match.label || competitionLabel(match.competitionType)}</span>
      </div>
      <div class="fixture-row ${match.isUserMatch ? 'user-fixture' : ''}">
        <span>${match.home_name || '-'}</span>
        <strong>${match.competitionType === 'europe_draw' ? 'KURA' : match.played ? `${match.home_score} - ${match.away_score}` : 'vs'}</strong>
        <span>${match.away_name || '-'}</span>
      </div>
    </article>
  `).join('') : '<div class="empty">Bu filtrede maç yok.</div>';
}

async function loadCalendar() {
  wireShell('calendar');
  await requireAuth();
  const data = await api.request('/api/calendar');
  calendarData = data;
  const nextFixtureDay = data.state.next_fixture_day || data.state.next_match_day;
  const nextFixtureDate = data.state.next_fixture_date || data.state.next_match_date;
  byId('calendarMatchButton').style.display = 'inline-flex';
  byId('calendarState').innerHTML = [
    ['Bugün', formatSeasonDate(data.state.current_date, `Gün ${data.state.current_day}`)],
    ['Sıradaki maç', formatSeasonDate(nextFixtureDate, `Gün ${nextFixtureDay}`)],
    ['Hafta', data.state.week],
    ['Durum', data.state.current_day >= nextFixtureDay ? 'Maç günü geldi, dashboarddan maça geçebilirsin' : 'Hazırlık zamanı']
  ].map(([label, value]) => `<article class="stat-card"><span class="muted">${label}</span><strong>${value}</strong></article>`).join('');

  renderCalendarMatches();

  byId('pastCalendar').innerHTML = data.pastMatches.length ? data.pastMatches.map((match) => `
    <article class="calendar-card">
      <div class="fixture-row user-fixture">
        <span>${match.home_name}</span>
        <strong>${match.home_score} - ${match.away_score}</strong>
        <span>${match.away_name}</span>
      </div>
      <p class="muted">${formatSeasonDate(match.display_date || match.match_date)}</p>
    </article>
  `).join('') : '<div class="empty">Henüz oynanmış maç yok.</div>';
}

document.addEventListener('click', (event) => {
  const filter = event.target.closest('[data-calendar-filter]');
  if (!filter) return;
  activeCalendarFilter = filter.dataset.calendarFilter;
  renderCalendarMatches();
});

loadCalendar().catch((error) => {
  byId('calendarMatches').innerHTML = `<div class="empty">${error.message}</div>`;
});
