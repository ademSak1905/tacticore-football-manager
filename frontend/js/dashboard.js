let activeDashboardTab = 'general';
let dashboardCache = null;
let isAdvancingWeek = false;
let dashboardDrawAutoShown = '';

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

function renderDashboardLoading(club = {}) {
  byId('dashboardStats').innerHTML = Array.from({ length: 8 }).map((_, index) => `
    <article class="card stat-card loading-card">
      <span class="muted">${index === 0 ? 'Bütçe' : 'Yükleniyor'}</span>
      <strong></strong>
    </article>
  `).join('');
  byId('dashboardPitch').innerHTML = '<div class="empty dashboard-loading-note">Kadro sahaya yerleşiyor...</div>';
  byId('nextMatchCard').innerHTML = '<article class="event">Dashboard hazırlanıyor...</article>';
  byId('gameState').textContent = 'Veriler yükleniyor, sunucu uyanıyorsa ilk giriş biraz sürebilir...';
  byId('clubSummary').innerHTML = `
    <div class="team-hero">
      <img class="team-logo large" src="${club.logo_url || '/assets/logos/placeholder.svg'}" alt="">
      <div>
        <h2>${club.name || 'Kulüp yükleniyor'}</h2>
        <p class="muted">Menü hazır, detaylar birazdan gelecek.</p>
      </div>
    </div>
  `;
  byId('dashboardLeagueTable').innerHTML = '<div class="empty">Lig tablosu yükleniyor...</div>';
  byId('dashboardEuropeContent').innerHTML = '<div class="empty">Avrupa verileri yükleniyor...</div>';
  byId('dashboardCalendarContent').innerHTML = '<div class="empty">Takvim yükleniyor...</div>';
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
      <span>Haftalık maaş ${money(data.weeklySalary)}</span><span>Maaş bütçesi ${money(data.club.salary_budget || 0)}</span>
      <span>Sakat ${data.injuredPlayers.length}</span>
    </div>
  `;
  updateGameState(state, nextOpponent);
  renderEuropeWeek(state, europe);
  byId('currencySelect').value = data.club.currency || localStorage.getItem('tacticoreCurrency') || 'EUR';
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
    byId('dashboardEuropeContent').innerHTML = '<div class="empty">Avrupa verileri yükleniyor...</div>';
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

function dashboardDrawStorageKey(draw) {
  const teamId = dashboardCache?.data?.club?.team_id || dashboardCache?.calendar?.club?.team_id || 'team';
  return `tacticore_draw_seen_${teamId}_${draw.id}_${draw.day}`;
}

function currentDashboardDraw() {
  const currentDay = Number(dashboardCache?.state?.current_day || 1);
  return (dashboardCache?.calendar?.calendarMatches || []).find((match) =>
    match.competitionType === 'europe_draw' &&
    match.drawRevealed &&
    currentDay >= Number(match.day || 0) &&
    currentDay <= Number(match.day || 0) + 2 &&
    (match.drawFixtures || []).some((fixture) => Number(fixture.matchDay || 0) >= currentDay)
  );
}

function showDashboardDrawAnimation(draw) {
  if (!draw?.drawFixtures?.length) return;
  const overlay = document.createElement('div');
  overlay.className = 'draw-animation-overlay';
  overlay.innerHTML = `
    <div class="draw-animation-panel">
      <div class="draw-animation-head">
        <span class="badge">${draw.competitionLabel}</span>
        <h1>Kura Gunu</h1>
        <p>${draw.drawFixtures.length} maclik fikstur sirayla aciklaniyor.</p>
      </div>
      <div class="draw-paper-grid">
        ${draw.drawFixtures.map((fixture) => `
          <article class="draw-paper" data-paper="${fixture.sequence}">
            <span>${fixture.sequence}. Mac</span>
            <strong>${fixture.opponentName}</strong>
            <small>${fixture.venue} - ${formatSeasonDate(fixture.matchDate, `Gun ${fixture.matchDay}`)}</small>
          </article>
        `).join('')}
      </div>
      <div class="actions">
        <button class="btn green" id="startDashboardDrawAnimation" type="button">Kurayi baslat</button>
        <button class="btn secondary" id="closeDashboardDrawAnimation" type="button" hidden>Tamam</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const papers = [...overlay.querySelectorAll('.draw-paper')];
  const startButton = overlay.querySelector('#startDashboardDrawAnimation');
  const closeButton = overlay.querySelector('#closeDashboardDrawAnimation');
  let index = 0;
  startButton.addEventListener('click', () => {
    startButton.disabled = true;
    startButton.textContent = 'Kura cekiliyor...';
    const timer = setInterval(() => {
      papers[index]?.classList.add('revealed');
      index += 1;
      if (index >= papers.length) {
        clearInterval(timer);
        startButton.hidden = true;
        closeButton.hidden = false;
        localStorage.setItem(dashboardDrawStorageKey(draw), '1');
      }
    }, 720);
  });
  closeButton.addEventListener('click', () => overlay.remove());
}

function showDueDashboardDraw() {
  const draw = currentDashboardDraw();
  if (!draw || localStorage.getItem(dashboardDrawStorageKey(draw)) || dashboardDrawAutoShown === draw.id) return;
  dashboardDrawAutoShown = draw.id;
  setTimeout(() => showDashboardDrawAnimation(draw), 350);
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

function renderDashboardPitch(lineup = []) {
  if (!lineup.length) {
    byId('dashboardPitch').innerHTML = '<div class="empty dashboard-loading-note">İlk 11 yükleniyor...</div>';
    return;
  }
  byId('dashboardPitch').innerHTML = lineup.map((row) => `
    <div class="dash-player" style="left:${row.x_position}%;top:${row.y_position}%">
      <span>${row.overall}</span><strong>${row.name.split(' ').slice(-1)[0]}</strong>
    </div>
  `).join('');
}

function updateGameState(state, nextOpponent) {
  const dueDraw = currentDashboardDraw();
  const seasonEnded = state.next_match_competition_type === 'season_end';
  const today = formatSeasonDate(state.current_date, `Gun ${state.current_day}`);
  const nextMatchDay = state.next_fixture_day || state.next_match_day;
  const nextMatchSource = state.next_match_competition_type !== 'super_lig'
    ? state.next_european_match?.match_date
    : state.next_match_date;
  const nextMatch = formatSeasonDate(nextMatchSource, `Gun ${nextMatchDay}`);
  const isMatchDay = state.matchAvailable;
  byId('gameState').textContent = dueDraw
    ? `${today}. Kura gunu geldi.`
    : seasonEnded ? `${today}. Sezon bitti, yeni sezona gecmelisin.`
    : `${today}. ${isMatchDay ? 'Mac gunu geldi.' : `Siradaki mac: ${nextMatch}.`}`;
  byId('nextMatchCard').innerHTML = `
    <article class="event">
      <strong>${seasonEnded ? 'Sezon tamamlandi' : dueDraw ? 'Kura gunu' : competitionLabel(state.next_match_competition_type)}</strong><br>
      ${seasonEnded ? 'Sezon ozeti hazir. Yeni sezona gecebilirsin.' : dueDraw ? (dueDraw.label || 'Rakipler aciklanacak') : (nextOpponent || 'Rakip hazirlaniyor.')}<br>
      <span class="muted">${dueDraw ? formatSeasonDate(dueDraw.date, `Gun ${dueDraw.day}`) : nextMatch}</span>
      ${seasonEnded ? '<br><button class="btn green" id="dashboardNextSeason" type="button">Yeni Sezona Gec</button>' : ''}
    </article>
  `;
  byId('goMatch').style.display = isMatchDay ? 'inline-flex' : 'none';
  byId('nextWeek').style.display = isMatchDay ? 'none' : 'inline-flex';
  byId('nextWeek').disabled = isMatchDay;
  byId('dashboardNextSeason')?.addEventListener('click', async () => {
    const result = await api.request('/api/game/next-season', { method: 'POST' });
    showXpToast(result.xpAward);
    window.location.reload();
  });
}

async function advance(days) {
  if (isAdvancingWeek) return;
  isAdvancingWeek = true;
  const nextWeekButton = byId('nextWeek');
  const originalText = nextWeekButton?.textContent || 'Haftayı İlerle';
  if (nextWeekButton) {
    nextWeekButton.disabled = true;
    nextWeekButton.textContent = 'Hafta ilerletiliyor...';
  }
  byId('gameState').textContent = 'Takvim ilerletiliyor, sunucu uyanıyorsa biraz sürebilir...';
  const slowNotice = setTimeout(() => {
    byId('gameState').textContent = 'Hala işleniyor... Render ücretsiz sunucu uyanırken ilk işlem yavaş gelebilir.';
  }, 8000);
  try {
    const state = await api.request('/api/game/advance', { method: 'POST', body: JSON.stringify({ days }) });
    dashboardCache.state = state;
    const calendar = await api.request('/api/calendar').catch(() => null);
    if (calendar) dashboardCache.calendar = calendar;
    renderDashboard();
    showDueDashboardDraw();
  } catch (error) {
    byId('gameState').textContent = error.message;
    byId('goMatch').style.display = 'inline-flex';
    byId('nextWeek').disabled = true;
  } finally {
    clearTimeout(slowNotice);
    isAdvancingWeek = false;
    if (nextWeekButton && !dashboardCache?.state?.matchAvailable) {
      nextWeekButton.disabled = false;
      nextWeekButton.textContent = originalText;
    }
  }
}

async function loadDashboard() {
  wireShell('dashboard');
  renderDashboardLoading();
  const session = await requireAuth();
  renderDashboardLoading(session?.club);

  const [data, state] = await Promise.all([
    api.request('/api/club'),
    api.request('/api/game/state')
  ]);
  dashboardCache = {
    data,
    state,
    europe: null,
    league: [],
    calendar: { next5Matches: [] },
    lineupData: { lineup: [] }
  };
  renderDashboard();
  showSeasonScreens();

  const detailResults = await Promise.allSettled([
    api.request(`/api/teams/${data.club.team_id}/lineup`),
    api.request('/api/europe/overview'),
    api.request('/api/league/table'),
    api.request('/api/calendar')
  ]);
  const [lineupResult, europeResult, leagueResult, calendarResult] = detailResults;
  if (lineupResult.status === 'fulfilled') dashboardCache.lineupData = lineupResult.value;
  if (europeResult.status === 'fulfilled') dashboardCache.europe = europeResult.value;
  if (leagueResult.status === 'fulfilled') dashboardCache.league = leagueResult.value;
  if (calendarResult.status === 'fulfilled') dashboardCache.calendar = calendarResult.value;
  renderDashboard();
  showDueDashboardDraw();
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

function modalRows(rows) {
  return rows.map(([label, value]) => `
    <div class="season-row"><span>${label}</span><strong>${value || '-'}</strong></div>
  `).join('');
}

function openSeasonModal(html, onClose) {
  document.querySelector('.season-modal')?.remove();
  const modal = document.createElement('section');
  modal.className = 'season-modal';
  modal.innerHTML = `
    <div class="season-modal-panel">
      ${html}
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('[data-season-close]')?.addEventListener('click', async () => {
    await onClose?.();
    modal.remove();
  });
}

async function showSeasonPlan() {
  const plan = await api.request('/api/game/season-plan').catch(() => null);
  if (!plan || plan.seen) return false;
  openSeasonModal(`
    <span class="badge">Yeni sezon</span>
    <h1>Yonetim Hedefleri</h1>
    <div class="season-rows">
      ${modalRows([
        ['Lig hedefi', plan.league?.label],
        ['Kupa hedefi', plan.cup?.label],
        ...(plan.championsLeague ? [['Sampiyonlar Ligi hedefi', plan.championsLeague.label]] : []),
        ['Transfer butcesi', money(plan.transferBudget)],
        ['Maas butcesi', money(plan.salaryBudget)]
      ])}
    </div>
    <button class="btn green" data-season-close type="button">Sezona basla</button>
  `, () => api.request('/api/game/season-plan/seen', { method: 'POST' }));
  return true;
}

async function showSeasonReview() {
  if (dashboardCache?.state?.next_match_competition_type !== 'season_end') return false;
  const review = await api.request('/api/game/season-review').catch(() => null);
  if (!review || review.seen) return false;
  const verdict = review.verdict || {};
  openSeasonModal(`
    <span class="badge">Sezon sonu</span>
    <h1>Sezon Ozeti</h1>
    <div class="season-rows">
      ${modalRows([
        ['Lig sirasi', `${review.league.rank}.`],
        ['Puan', review.league.points],
        ['Galibiyet / Beraberlik / Maglubiyet', `${review.league.wins} / ${review.league.draws} / ${review.league.losses}`],
        ['Atılan / yenilen gol', `${review.league.goals_for} / ${review.league.goals_against}`],
        ['En golcu', review.topScorer ? `${review.topScorer.name} (${review.topScorer.goals})` : '-'],
        ['En cok asist', review.topAssist ? `${review.topAssist.name} (${review.topAssist.assists})` : '-']
      ])}
    </div>
    <div class="season-evaluations">
      ${(review.evaluations || []).map((item) => `
        <article class="${item.success ? 'success' : 'fail'}">
          <span>${item.target}</span>
          <strong>${item.result}</strong>
          <em>${item.success ? 'Basarili' : 'Basarisiz'}</em>
        </article>
      `).join('')}
    </div>
    <article class="verdict-card">
      <span>Yonetim puani: ${verdict.score || 0}</span>
      <strong>${verdict.label || 'Ortalama sezon'}</strong>
      <p>${verdict.note || ''}</p>
    </article>
    <div class="actions">
      <button class="btn secondary" data-season-close type="button">Kapat</button>
      <button class="btn green" id="nextSeasonFromReview" type="button">Yeni sezona gec</button>
    </div>
  `, () => api.request('/api/game/season-review/seen', { method: 'POST' }));
  byId('nextSeasonFromReview')?.addEventListener('click', async () => {
    await api.request('/api/game/season-review/seen', { method: 'POST' });
    const result = await api.request('/api/game/next-season', { method: 'POST' });
    showXpToast(result.xpAward);
    window.location.reload();
  });
  return true;
}

async function showSeasonReviewDetailed() {
  if (dashboardCache?.state?.next_match_competition_type !== 'season_end') return false;
  const review = await api.request('/api/game/season-review').catch(() => null);
  if (!review || review.seen) return false;
  const verdict = review.verdict || {};
  const perf = review.playerPerformance || {};
  const transfers = review.transfers || {};
  openSeasonModal(`
    <span class="badge">Sezon sonu</span>
    <h1>Sezon Ozeti</h1>
    <div class="season-rows">
      ${modalRows([
        ['Sezon', review.season?.year],
        ['Takim', review.season?.teamName],
        ['Teknik direktor', review.season?.managerName],
        ['Lig', review.season?.leagueName],
        ['Lig sirasi', `${review.league.rank}.`],
        ['Puan', review.league.points],
        ['Galibiyet / Beraberlik / Maglubiyet', `${review.league.wins} / ${review.league.draws} / ${review.league.losses}`],
        ['Atilan / yenilen / averaj', `${review.league.goals_for} / ${review.league.goals_against} / ${review.league.goal_difference}`],
        ['Ic saha', `${review.league.home?.home_wins || 0}G ${review.league.home?.home_draws || 0}B ${review.league.home?.home_losses || 0}M`],
        ['Deplasman', `${review.league.away?.away_wins || 0}G ${review.league.away?.away_draws || 0}B ${review.league.away?.away_losses || 0}M`],
        ['En golcu', review.topScorer ? `${review.topScorer.name} (${review.topScorer.goals})` : '-'],
        ['En cok asist', review.topAssist ? `${review.topAssist.name} (${review.topAssist.assists})` : '-'],
        ['En yuksek mac puani', perf.bestRated ? `${perf.bestRated.name} (${perf.bestRated.rating})` : '-'],
        ['En cok forma', perf.mostAppearances ? `${perf.mostAppearances.name} (${perf.mostAppearances.appearances})` : '-'],
        ['En iyi genc', perf.bestYoung ? `${perf.bestYoung.name} (${perf.bestYoung.rating})` : '-'],
        ['En dusuk performans', perf.worstRated ? `${perf.worstRated.name} (${perf.worstRated.rating})` : '-'],
        ['Gelen oyuncular', transfers.incoming?.length ? transfers.incoming.map((item) => item.name).join(', ') : '-'],
        ['Giden oyuncular', transfers.outgoing?.length ? transfers.outgoing.map((item) => item.name).join(', ') : '-'],
        ['Transfer harcama / gelir', `${money(transfers.totalSpent || 0)} / ${money(transfers.totalIncome || 0)}`],
        ['En iyi transfer', transfers.bestTransfer?.name],
        ['En kotu transfer', transfers.worstTransfer?.name]
      ])}
    </div>
    <div class="season-evaluations">
      ${(review.evaluations || []).map((item) => `
        <article class="${item.success ? 'success' : 'fail'}">
          <span>${item.target}</span>
          <strong>${item.result}</strong>
          <em>${item.success ? 'Basarili' : 'Basarisiz'}</em>
        </article>
      `).join('')}
    </div>
    <article class="verdict-card">
      <span>Yonetim puani: ${verdict.score || 0}</span>
      <strong>${verdict.label || 'Ortalama sezon'}</strong>
      <p>${verdict.mediaComment || verdict.note || ''}</p>
      <small>Taraftar: ${verdict.fanSatisfaction || 50}/100 - Itibar: ${verdict.reputationChange || '0'} - Kovulma riski: ${verdict.sackRisk || 'Yok'}</small>
    </article>
    <div class="actions">
      <button class="btn green" id="nextSeasonFromReview" type="button">Yeni sezona gec</button>
    </div>
  `, () => api.request('/api/game/season-review/seen', { method: 'POST' }));
  byId('nextSeasonFromReview')?.addEventListener('click', async () => {
    await api.request('/api/game/season-review/seen', { method: 'POST' });
    await api.request('/api/game/next-season', { method: 'POST' });
    window.location.reload();
  });
  return true;
}

showSeasonReview = showSeasonReviewDetailed;

async function showSeasonScreens() {
  if (await showSeasonReview()) return;
  await showSeasonPlan();
}

loadDashboard().catch((error) => setMessage(error.message, 'error'));
