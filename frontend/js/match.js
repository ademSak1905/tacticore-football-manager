let postStep = 0;
let lastRoundData = null;
let sfxContext = null;
let currentTeamId = null;
let postMatchResult = null;
let isPostMatchVisible = false;
let currentMatch = null;
let activeScreen = 'match';
let isRunningMatch = false;
const POST_MATCH_STEPS = ['score', 'stats', 'ratings', 'standings', 'scores', 'social'];

function getPostMatchSteps(data = postMatchResult) {
  if (data?.seasonComplete && !data?.featured?.match) return ['season'];
  return data?.seasonComplete ? [...POST_MATCH_STEPS, 'season'] : POST_MATCH_STEPS;
}

function ensureSfx() {
  if (!sfxContext) sfxContext = new (window.AudioContext || window.webkitAudioContext)();
  if (sfxContext.state === 'suspended') sfxContext.resume();
}

function tone(frequency, duration, type = 'sine', gainValue = 0.05, delay = 0) {
  if (!sfxContext) return;
  const now = sfxContext.currentTime + delay;
  const oscillator = sfxContext.createOscillator();
  const gain = sfxContext.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(gainValue, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.connect(gain);
  gain.connect(sfxContext.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function playSfx(type) {
  ensureSfx();
  if (type === 'goal') {
    [392, 523, 659, 784].forEach((note, index) => tone(note, 0.18, 'triangle', 0.07, index * 0.12));
  } else if (type === 'foul' || type === 'red_card') {
    tone(1200, 0.16, 'square', 0.05);
    tone(900, 0.14, 'square', 0.04, 0.18);
  } else if (['miss', 'woodwork', 'save'].includes(type)) {
    tone(260, 0.22, 'sawtooth', 0.035);
    tone(180, 0.28, 'sawtooth', 0.025, 0.18);
  } else if (type === 'full_time') {
    tone(1250, 0.22, 'square', 0.045);
    tone(1250, 0.22, 'square', 0.045, 0.32);
    tone(950, 0.45, 'square', 0.04, 0.68);
  }
}

function formatMatchDate(value) {
  if (!value) return '-';
  return new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function renderStats(match, homeName = 'Ev sahibi', awayName = 'Deplasman') {
  const stats = [
    ['Topa sahip olma', `${match.possession_home}%`, `${100 - match.possession_home}%`],
    ['Şut', match.shots_home, match.shots_away],
    ['İsabetli Şut', match.shots_on_home, match.shots_on_away],
    ['Pas yüzdesi', `%${match.pass_home}`, `%${match.pass_away}`],
    ['xG', match.xg_home, match.xg_away],
    ['Korner', match.corners_home, match.corners_away],
    ['Faul', match.fouls_home, match.fouls_away],
    ['Ofsayt', match.offsides_home, match.offsides_away],
    ['Kurtarış', match.saves_home, match.saves_away],
    ['Müdahale', match.tackles_home, match.tackles_away],
    ['Başarılı pres', match.successful_press_home || 0, match.successful_press_away || 0],
    ['Taktik puanı', match.tactic_score_home || 50, match.tactic_score_away || 50]
  ];
  return `
    <div class="stats-compare">
      <div class="stats-compare-head"><strong>${homeName}</strong><span>İstatistik</span><strong>${awayName}</strong></div>
      ${stats.map(([label, homeValue, awayValue]) => `
        <div class="stats-compare-row">
          <strong>${homeValue}</strong>
          <span>${label}</span>
          <strong>${awayValue}</strong>
        </div>
      `).join('')}
      <div class="stats-note"><strong>Maçın adamı:</strong> ${match.man_of_match || '-'}</div>
      <div class="stats-note"><strong>Taktik analizi:</strong> ${match.tactical_summary || '-'}</div>
    </div>
  `;
}

function teamIdentity(team) {
  if (team?.team_id) return Number(team.team_id);
  if (team?.source === 'local') return Number(team.id || 0);
  return 0;
}

function renderGoalScorers(events = []) {
  const goals = events
    .filter((event) => event.event_type === 'goal')
    .sort((a, b) => a.minute - b.minute);
  if (!goals.length) return '<div class="goal-list muted">Gol olmadı.</div>';
  return `
    <div class="goal-list">
      <strong>Goller:</strong>
      ${goals.map((goal) => `
        <div>${goal.minute}' ${goal.scorer_name || goal.playerName || 'Gol'}${goal.assist_name || goal.assistPlayerName ? ` <span class="muted">(Asist: ${goal.assist_name || goal.assistPlayerName})</span>` : ''}</div>
      `).join('')}
    </div>
  `;
}

function renderScoreSummary(data) {
  const featured = data.featured;
  if (!featured?.match) {
    return renderSeasonSummary(data);
  }
  const match = featured.match;
  const userTeamId = Number(data.userTeamId || currentTeamId);
  const homeId = teamIdentity(featured.home);
  const awayId = teamIdentity(featured.away);
  const resultText = match.home_score === match.away_score
    ? 'Maç berabere bitti.'
    : `${match.home_score > match.away_score ? featured.home.name : featured.away.name} kazandı.`;
  return `
    <div class="score-summary">
      <div class="scoreboard">
        <div class="score-team ${homeId === userTeamId ? 'my-team-frame' : ''}">
          <img class="team-logo" src="${featured.home.logo_url || '/assets/logos/placeholder.svg'}" alt="${featured.home.name}">
          <strong>${featured.home.name}</strong>
          ${homeId === userTeamId ? '<span class="my-team-badge">Senin takımın</span>' : ''}
        </div>
        <div class="score">${match.home_score} - ${match.away_score}</div>
        <div class="score-team ${awayId === userTeamId ? 'my-team-frame' : ''}">
          <img class="team-logo" src="${featured.away.logo_url || '/assets/logos/placeholder.svg'}" alt="${featured.away.name}">
          <strong>${featured.away.name}</strong>
          ${awayId === userTeamId ? '<span class="my-team-badge">Senin takımın</span>' : ''}
        </div>
      </div>
      ${renderGoalScorers(featured.events || [])}
      <p class="muted">${resultText} Haftanın ${data.results.length} maçı da oynandı.</p>
      <div class="grid stats">
        <article class="stat-card"><span class="muted">Maçın adamı</span><strong>${match.man_of_match || '-'}</strong></article>
        <article class="stat-card"><span class="muted">xG</span><strong>${match.xg_home} - ${match.xg_away}</strong></article>
        <article class="stat-card"><span class="muted">Şut</span><strong>${match.shots_home} - ${match.shots_away}</strong></article>
        <article class="stat-card"><span class="muted">Taktik</span><strong>${match.tactic_score_home || 50} - ${match.tactic_score_away || 50}</strong></article>
      </div>
      <div class="event">${match.tactical_summary || 'Taktik analizi maç sonunda oluşur.'}</div>
    </div>
  `;
}

function renderSeasonSummary(data) {
  const summary = data.seasonSummary || {};
  const stats = summary.userStats || {};
  return `
    <div class="season-finale">
      <div class="finale-glow"></div>
      <h1>Sezon Bitti</h1>
      <p class="muted">Süper Lig ${summary.totalWeeks || 34} haftalık maratonunu tamamladı.</p>
      <div class="grid stats">
        <article class="stat-card"><span class="muted">Şampiyon</span><strong>${summary.champion?.name || '-'}</strong></article>
        <article class="stat-card"><span class="muted">Senin sıran</span><strong>${summary.userRank ? `${summary.userRank}. sıra` : '-'}</strong></article>
        <article class="stat-card"><span class="muted">Puan</span><strong>${stats.points ?? '-'}</strong></article>
        <article class="stat-card"><span class="muted">Averaj</span><strong>${(stats.goals_for ?? 0) - (stats.goals_against ?? 0)}</strong></article>
      </div>
      <div class="achievement-list">
        ${(summary.achievements || []).map((item) => `<span>${item}</span>`).join('')}
      </div>
      <p class="event">Gelecek sezona geçince lig puanları sıfırlanır, kadron ve kulübün korunur.</p>
      <div class="actions">
        <button id="seasonDetailsFromMatch" class="btn secondary" type="button">Detayları Gör</button>
        <button id="returnDashboardFromSeason" class="btn secondary" type="button">Dashboard'a Dön</button>
        <button id="startNextSeason" class="btn green" type="button">Yeni Sezona Geç</button>
      </div>
    </div>
  `;
}

function renderMatchStatsStep(data) {
  return `
    ${renderScoreSummary(data)}
    <div style="margin-top:16px">${renderStats(data.featured.match, data.featured.home.name, data.featured.away.name)}</div>
  `;
}

function renderLeagueTable(data) {
  if (data.knockout && data.knockoutRound) return renderKnockoutRound(data);
  const userTeamId = Number(data.userTeamId || currentTeamId);
  const rows = [...(data.table || [])].sort((a, b) => {
    const pointsDiff = Number(b.points || 0) - Number(a.points || 0);
    if (pointsDiff) return pointsDiff;
    const goalDiffA = Number(a.goal_difference ?? ((a.goals_for || 0) - (a.goals_against || 0)));
    const goalDiffB = Number(b.goal_difference ?? ((b.goals_for || 0) - (b.goals_against || 0)));
    if (goalDiffB !== goalDiffA) return goalDiffB - goalDiffA;
    const goalsForDiff = Number(b.goals_for || 0) - Number(a.goals_for || 0);
    if (goalsForDiff) return goalsForDiff;
    return String(a.name || '').localeCompare(String(b.name || ''), 'tr');
  });
  const isEuropeanTable = data.european || ['champions_league', 'europa_league', 'conference_league'].includes(data.standingsCompetition || data.competitionType);
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>#</th><th>Takım</th><th>O</th><th>A</th><th>P</th></tr></thead>
        <tbody>${rows.map((team, index) => {
          const rowId = Number(team.team_id || team.id || 0);
          const isUserRow = Number(team.team_id || 0) === userTeamId || (!isEuropeanTable && !team.team_id && rowId === userTeamId);
          const played = team.played ?? ((team.wins || 0) + (team.draws || 0) + (team.losses || 0));
          const goalDifference = team.goal_difference ?? ((team.goals_for || 0) - (team.goals_against || 0));
          return `
          <tr class="${isUserRow ? 'my-team-row' : ''}">
            <td>${index + 1}</td>
            <td>${team.name}${isUserRow ? ' <span class="table-badge">Sen</span>' : ''}</td>
            <td>${played}</td>
            <td>${goalDifference}</td>
            <td><strong>${team.points}</strong></td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>
  `;
}

function renderKnockoutRound(data) {
  const rows = data.knockoutRound || [];
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Tur</th><th>Ayak</th><th>Ev</th><th>Skor</th><th>Deplasman</th><th>Toplam/Pen.</th></tr></thead>
        <tbody>${rows.map((match) => {
          const aggregate = match.aggregate_home !== null && match.aggregate_home !== undefined
            ? `${match.aggregate_home}-${match.aggregate_away}`
            : '-';
          const penalties = match.penalties_home !== null && match.penalties_home !== undefined
            ? ` Pen: ${match.penalties_home}-${match.penalties_away}`
            : '';
          return `
            <tr>
              <td>${match.round_name || '-'}</td>
              <td>${match.leg || 1}</td>
              <td>${match.home_name || '-'}</td>
              <td><strong>${match.played ? `${match.home_score}-${match.away_score}` : '-'}</strong></td>
              <td>${match.away_name || '-'}</td>
              <td>${aggregate}${penalties}</td>
            </tr>`;
        }).join('')}</tbody>
      </table>
    </div>
  `;
}

function standingsTitle(data) {
  if (data.standingsTitle) return data.standingsTitle;
  const type = data.standingsCompetition || data.competitionType || 'super_lig';
  if (type === 'champions_league') return 'Şampiyonlar Ligi puan durumu';
  if (type === 'europa_league') return 'Avrupa Ligi puan durumu';
  if (type === 'conference_league') return 'Konferans Ligi puan durumu';
  if (type === 'turkish_cup') return 'Türkiye Kupası tur bilgisi';
  return 'Süper Lig puan durumu';
}

function renderWeeklyScores(data) {
  const userTeamId = Number(data.userTeamId || currentTeamId);
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Ev</th><th>Skor</th><th>Deplasman</th></tr></thead>
        <tbody>${data.results.map((item) => {
          const isUserMatch = teamIdentity(item.home) === userTeamId || teamIdentity(item.away) === userTeamId;
          return `<tr class="${isUserMatch ? 'my-team-row' : ''}"><td>${item.home.name}</td><td><strong>${item.match.home_score}-${item.match.away_score}</strong></td><td>${item.away.name}</td></tr>`;
        }).join('')}</tbody>
      </table>
    </div>
  `;
}

function setupScoreboard(data) {
  byId('matchClock').textContent = "00'";
  byId('scoreboard').classList.remove('empty');
  byId('scoreboard').innerHTML = `
    <div><img class="team-logo" src="${data.home.logo_url || '/assets/logos/placeholder.svg'}" alt="${data.home.name}"><strong>${data.home.name}</strong></div>
    <div class="score-center">
      <div class="score" id="liveScore">0 - 0</div>
      <div id="goalTicker" class="goal-ticker"></div>
    </div>
    <div><img class="team-logo" src="${data.away.logo_url || '/assets/logos/placeholder.svg'}" alt="${data.away.name}"><strong>${data.away.name}</strong></div>
  `;
  byId('events').innerHTML = '';
  byId('matchStats').innerHTML = '<div class="empty">İstatistikler maç bitince açılacak.</div>';
}

function showGoalTicker(event) {
  const ticker = byId('goalTicker');
  if (!ticker) return;
  const scorer = event.scorer_name || 'Gol';
  const team = event.team_name ? ` - ${event.team_name}` : '';
  ticker.textContent = `${event.minute}' ${scorer}${team}`;
  ticker.classList.remove('pop');
  void ticker.offsetWidth;
  ticker.classList.add('pop');
}

function setMatchButtons(disabled, mode = 'idle') {
  const playButton = byId('playMatch');
  const skipButton = byId('skipMatch');
  if (playButton) {
    playButton.disabled = disabled;
    playButton.textContent = mode === 'play' ? 'Oynanıyor...' : 'Maç yap';
  }
  if (skipButton) {
    skipButton.disabled = disabled;
    skipButton.textContent = mode === 'skip' ? 'Atlanıyor...' : 'Atla';
  }
}

function resetPostMatchOverlay() {
  byId('postMatchOverlay').hidden = true;
  byId('postOverlayContent').innerHTML = '';
  lastRoundData = null;
  postStep = 0;
  postMatchResult = null;
  isPostMatchVisible = false;
  currentMatch = null;
  activeScreen = 'match';
}

async function playEvents(events, featured) {
  const match = featured.match;
  const speed = Number(byId('matchSpeed')?.value || 1900);
  const sortedEvents = [...events].sort((a, b) => a.minute - b.minute);
  let eventIndex = 0;

  for (let minute = 1; minute <= 90; minute += 1) {
    byId('matchClock').textContent = `${String(minute).padStart(2, '0')}'`;

    while (eventIndex < sortedEvents.length && sortedEvents[eventIndex].minute === minute) {
      const event = sortedEvents[eventIndex];
      if (event.event_type === 'goal') {
        byId('liveScore').textContent = `${event.home_score} - ${event.away_score}`;
        showGoalTicker(event);
      }
      byId('events').innerHTML += `<div class="event"><strong>${event.minute}'.</strong> ${event.event_text}</div>`;
      byId('events').scrollTop = byId('events').scrollHeight;
      playSfx(event.event_type);
      if (event.is_highlight) {
        const banner = byId('highlightBanner');
        banner.textContent = event.event_text;
        banner.hidden = false;
        await new Promise((resolve) => setTimeout(resolve, Math.max(2200, speed * 2.2)));
        banner.hidden = true;
      }
      eventIndex += 1;
    }

    if (minute === 45) {
      byId('events').innerHTML += `<div class="event"><strong>45'.</strong> İlk yarı bitti. Takımlar soyunma odasına gidiyor.</div>`;
      byId('events').scrollTop = byId('events').scrollHeight;
      await new Promise((resolve) => setTimeout(resolve, speed * 2));
    }

    await new Promise((resolve) => setTimeout(resolve, Math.max(120, speed / 4)));
  }

  while (eventIndex < sortedEvents.length) {
    const event = sortedEvents[eventIndex];
    if (event.event_type === 'goal') byId('liveScore').textContent = `${event.home_score} - ${event.away_score}`;
    byId('events').innerHTML += `<div class="event"><strong>${event.minute}'.</strong> ${event.event_text}</div>`;
    eventIndex += 1;
  }

  byId('liveScore').textContent = `${match.home_score} - ${match.away_score}`;
  byId('matchClock').textContent = "90'";
  byId('matchStats').innerHTML = renderStats(match, featured.home.name, featured.away.name);
  playSfx('full_time');
  const banner = byId('highlightBanner');
  banner.textContent = 'Maç bitti! Hakem son düdüğü çaldı.';
  banner.hidden = false;
  await new Promise((resolve) => setTimeout(resolve, 1800));
  banner.hidden = true;
}

function showSkippedMatch(data) {
  const featured = data.featured;
  setupScoreboard(featured);
  byId('matchClock').textContent = "90'";
  byId('liveScore').textContent = `${featured.match.home_score} - ${featured.match.away_score}`;
  const events = [...featured.events].sort((a, b) => a.minute - b.minute);
  const lastGoal = events.filter((event) => event.event_type === 'goal').pop();
  if (lastGoal) showGoalTicker(lastGoal);
  const eventRows = events.length
    ? events.map((event) => `<div class="event"><strong>${event.minute}'.</strong> ${event.event_text}</div>`).join('')
    : '<div class="event">Bu maçta kayda değer pozisyon olmadı.</div>';
  byId('events').innerHTML = `<div class="event"><strong>90'.</strong> Maç atlandı, haftanın tüm karşılaşmaları oynandı.</div>${eventRows}`;
  byId('events').scrollTop = byId('events').scrollHeight;
  byId('matchStats').innerHTML = renderStats(featured.match, featured.home.name, featured.away.name);
}

function ratingsTable(ratings) {
  return ratings.length ? `
    <table><thead><tr><th>Oyuncu</th><th>Mevki</th><th>Puan</th><th>Gol</th><th>Asist</th></tr></thead><tbody>
      ${ratings.map((row) => `<tr><td>${row.name}</td><td>${row.position}</td><td>${row.rating}</td><td>${row.goals}</td><td>${row.assists}</td></tr>`).join('')}
    </tbody></table>
  ` : '<div class="empty">Oyuncu puanı yok.</div>';
}

async function loadRecentMatches() {
  const matches = await api.request('/api/matches');
  byId('recentMatches').innerHTML = matches.length ? `
    <table><thead><tr><th>Tarih</th><th>Ev</th><th>Skor</th><th>Deplasman</th></tr></thead><tbody>
      ${matches.map((match) => `<tr><td>${formatMatchDate(match.display_date || match.match_date)}</td><td>${match.home_name}</td><td>${match.home_score}-${match.away_score}</td><td>${match.away_name}</td></tr>`).join('')}
    </tbody></table>
  ` : '<div class="empty">Henüz maç oynanmadı.</div>';
}

async function prepareRoundData(data) {
  lastRoundData = data;
  lastRoundData.social = await api.request('/api/social/feed');
}

function renderPostMatchScreen() {
  if (!isPostMatchVisible || !postMatchResult) return '';
  const data = postMatchResult;
  const steps = getPostMatchSteps(data);
  const step = steps[postStep] || 'score';
  const social = (data.social || []).slice(0, 4).map((post) => `
    <div class="event"><strong>${post.title || post.author}</strong><br>${post.body || post.content || post.summary}</div>
  `).join('');
  const screens = {
    score: `<h1>Maç Sonucu</h1>${renderScoreSummary(data)}`,
    stats: `<h1>İstatistikler</h1>${renderStats(data.featured.match, data.featured.home.name, data.featured.away.name)}`,
    ratings: `<h1>Oyuncu dereceleri</h1>${ratingsTable(data.featured.playerRatings || [])}`,
    standings: `<h1>${standingsTitle(data)}</h1>${renderLeagueTable(data)}`,
    scores: `<h1>Haftanın skorları</h1>${renderWeeklyScores(data)}`,
    social: `<h1>Gazete & sosyal medya</h1>${social || '<div class="empty">Yeni yorum yok.</div>'}`,
    season: renderSeasonSummary(data)
  };
  return `
    <div id="postMatchScreen" class="post-match-screen">
      <div class="post-match-card">
        ${screens[step] || ''}
      </div>
    </div>
  `;
}

function updatePostMatchOverlay() {
  const overlay = byId('postMatchOverlay');
  const content = byId('postOverlayContent');
  const button = byId('nextPostStep');
  if (!overlay || !content || !button) return;
  overlay.hidden = false;
  content.innerHTML = renderPostMatchScreen();
  content.scrollTop = 0;
  button.hidden = false;
  button.textContent = 'Tamam';
  byId('startNextSeason')?.addEventListener('click', async () => {
    try {
      await api.request('/api/game/next-season', { method: 'POST' });
      window.location.href = '/dashboard.html';
    } catch (error) {
      byId('postOverlayContent').innerHTML += `<div class="event">${error.message}</div>`;
    }
  });
  byId('returnDashboardFromSeason')?.addEventListener('click', () => {
    window.location.href = '/dashboard.html';
  });
  byId('seasonDetailsFromMatch')?.addEventListener('click', () => {
    content.querySelector('.season-finale')?.classList.toggle('expanded');
  });
  button.focus();
}

function onMatchFinished(matchResult) {
  postMatchResult = matchResult;
  isPostMatchVisible = true;
  currentMatch = matchResult.featured?.match || null;
  activeScreen = 'post_match';
  postStep = 0;
  updatePostMatchOverlay();
  console.log('POST MATCH STANDINGS CHECK', {
    playedCompetition: matchResult.competitionType || 'super_lig',
    shownStandingsCompetition: matchResult.standingsCompetition || matchResult.competitionType || 'super_lig'
  });
  console.log('POST MATCH CHECK', {
    postMatchResult,
    isPostMatchVisible,
    activeScreen
  });
}

async function confirmPostMatch() {
  const steps = getPostMatchSteps(postMatchResult);
  if (isPostMatchVisible && postMatchResult && postStep < steps.length - 1) {
    postStep += 1;
    updatePostMatchOverlay();
    console.log('POST MATCH CHECK', {
      postMatchResult,
      isPostMatchVisible,
      activeScreen,
      postStep
    });
    return;
  }
  postMatchResult = null;
  isPostMatchVisible = false;
  currentMatch = null;
  activeScreen = 'dashboard';
  console.log('POST MATCH CHECK', {
    postMatchResult,
    isPostMatchVisible,
    activeScreen
  });
  byId('postMatchOverlay').hidden = true;
  byId('postOverlayContent').innerHTML = '';
  window.location.href = '/dashboard.html';
}

async function loadMatchPage() {
  wireShell('match');
  const session = await requireAuth();
  currentTeamId = Number(session?.club?.team_id || 0);
  lastRoundData = null;
  postStep = 0;
  byId('postMatchOverlay').hidden = true;
  await loadRecentMatches();
}

byId('nextPostStep')?.addEventListener('click', confirmPostMatch);

byId('playMatch')?.addEventListener('pointerdown', () => window.stopTactiCoreMusic?.());
byId('skipMatch')?.addEventListener('pointerdown', () => window.stopTactiCoreMusic?.());

async function runMatchRound(skipLive = false) {
  if (isRunningMatch) return;
  isRunningMatch = true;
  setMatchButtons(true, skipLive ? 'skip' : 'play');
  byId('matchClock').textContent = '--';
  byId('scoreboard').classList.add('empty');
  byId('scoreboard').innerHTML = skipLive ? 'Maç sonucu hazırlanıyor...' : 'Maç hazırlanıyor...';
  byId('matchStats').innerHTML = '<div class="empty">Sunucu cevap verince maç başlayacak.</div>';
  byId('events').innerHTML = '<div class="event">İstek gönderildi. Render ücretsiz sunucu uyanıyorsa ilk maç biraz geç başlayabilir.</div>';
  const slowNotice = setTimeout(() => {
    byId('events').innerHTML += '<div class="event">Hala bekliyoruz... Bu genelde sunucunun uyanmasından kaynaklanır, işlem gelince otomatik devam edecek.</div>';
    byId('events').scrollTop = byId('events').scrollHeight;
  }, 8000);
  try {
    window.stopTactiCoreMusic?.();
    resetPostMatchOverlay();
    if (!skipLive) {
      ensureSfx();
      document.body.classList.add('match-focus');
    }
    const data = await api.request('/api/match/play', { method: 'POST' });
    data.skipped = skipLive;
    data.userTeamId = currentTeamId;
    if (data.seasonComplete && !data.featured) {
      await prepareRoundData(data);
      document.body.classList.remove('match-focus');
      onMatchFinished(data);
      return;
    }
    if (skipLive) {
      showSkippedMatch(data);
    } else {
      setupScoreboard(data.featured);
      await playEvents(data.featured.events, data.featured);
    }
    await prepareRoundData(data);
    await loadRecentMatches();
    document.body.classList.remove('match-focus');
    onMatchFinished(data);
  } catch (error) {
    byId('events').innerHTML = `<div class="event">${error.message}</div>`;
    document.body.classList.remove('match-focus');
  } finally {
    clearTimeout(slowNotice);
    isRunningMatch = false;
    setMatchButtons(false);
  }
}

byId('playMatch')?.addEventListener('click', () => runMatchRound(false));
byId('skipMatch')?.addEventListener('click', () => runMatchRound(true));

loadMatchPage().catch((error) => {
  byId('events').innerHTML = `<div class="event">${error.message}</div>`;
});


