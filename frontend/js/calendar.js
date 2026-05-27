let calendarData = null;
let activeCalendarFilter = 'all';
let drawAutoShown = false;

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
  const rows = (calendarData?.calendarMatches || []).filter((match) => !isSeenDraw(match));
  if (activeCalendarFilter === 'all') return rows;
  if (activeCalendarFilter === 'europe') return rows.filter((match) => isEuropeType(match.competitionType));
  return rows.filter((match) => match.competitionType === activeCalendarFilter);
}

function drawStorageKey(draw) {
  return `tacticore_draw_seen_${calendarData?.club?.team_id || 'team'}_${draw.id}_${draw.day}`;
}

function isSeenDraw(match) {
  return match?.competitionType === 'europe_draw' && localStorage.getItem(drawStorageKey(match));
}

function drawById(id) {
  return (calendarData?.calendarMatches || []).find((match) => match.id === id && match.competitionType === 'europe_draw');
}

function showDrawAnimation(draw) {
  if (!draw?.drawFixtures?.length) return;
  const overlay = document.createElement('div');
  overlay.className = 'draw-animation-overlay';
  overlay.innerHTML = `
    <div class="draw-animation-panel">
      <div class="draw-animation-head">
        <span class="badge">${draw.competitionLabel}</span>
        <h1>Kura Günü</h1>
        <p>${draw.drawFixtures.length} maçlık fikstür sırayla açıklanıyor.</p>
      </div>
      <div class="draw-paper-grid">
        ${draw.drawFixtures.map((fixture) => `
          <article class="draw-paper" data-paper="${fixture.sequence}">
            <span>${fixture.sequence}. Maç</span>
            <strong>${fixture.opponentName}</strong>
            <small>${fixture.venue} - ${formatSeasonDate(fixture.matchDate, `Gün ${fixture.matchDay}`)}</small>
          </article>
        `).join('')}
      </div>
      <div class="actions">
        <button class="btn green" id="startDrawAnimation" type="button">Kurayı başlat</button>
        <button class="btn secondary" id="closeDrawAnimation" type="button" hidden>Tamam</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const papers = [...overlay.querySelectorAll('.draw-paper')];
  const startButton = overlay.querySelector('#startDrawAnimation');
  const closeButton = overlay.querySelector('#closeDrawAnimation');
  let index = 0;
  startButton.addEventListener('click', () => {
    startButton.disabled = true;
    startButton.textContent = 'Kura çekiliyor...';
    const timer = setInterval(() => {
      papers[index]?.classList.add('revealed');
      index += 1;
      if (index >= papers.length) {
        clearInterval(timer);
        startButton.hidden = true;
        closeButton.hidden = false;
        localStorage.setItem(drawStorageKey(draw), '1');
      }
    }, 720);
  });
  closeButton.addEventListener('click', () => {
    overlay.remove();
    renderCalendarMatches();
  });
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
      ${match.competitionType === 'europe_draw' && match.drawRevealed ? `<button class="btn green" data-draw-id="${match.id}" type="button">Kurayı izle</button>` : ''}
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
  if (!drawAutoShown) {
    drawAutoShown = true;
    const currentDay = Number(data.state.current_day || 1);
    const dueDraw = (data.calendarMatches || []).find((match) =>
      match.competitionType === 'europe_draw' &&
      match.drawRevealed &&
      currentDay >= Number(match.day || 0) &&
      !localStorage.getItem(drawStorageKey(match))
    );
    if (dueDraw) setTimeout(() => showDrawAnimation(dueDraw), 450);
  }

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

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-draw-id]');
  if (!button) return;
  const draw = drawById(button.dataset.drawId);
  if (draw) showDrawAnimation(draw);
});

loadCalendar().catch((error) => {
  byId('calendarMatches').innerHTML = `<div class="empty">${error.message}</div>`;
});
