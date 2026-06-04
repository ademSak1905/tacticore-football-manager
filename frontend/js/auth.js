const api = {
  async request(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'İşlem tamamlanamadı.');
    return data;
  }
};

const API_BASE_URL = window.location.hostname.includes('netlify.app')
  ? 'https://tacticore-backend.onrender.com'
  : '';

function money(value) {
  const currency = localStorage.getItem('tacticoreCurrency') || 'EUR';
  const rates = { TRY: 1, USD: 32, EUR: 35 };
  const symbols = { TRY: 'TL', USD: '$', EUR: 'EUR' };
  const converted = Number(value || 0) / rates[currency];
  return `${converted.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ${symbols[currency]}`;
}

function currencyRate() {
  const currency = localStorage.getItem('tacticoreCurrency') || 'EUR';
  return { TRY: 1, USD: 32, EUR: 35 }[currency] || 35;
}

function toCurrencyInput(value) {
  return Math.round(Number(value || 0) / currencyRate());
}

function fromCurrencyInput(value) {
  return Math.round(Number(value || 0) * currencyRate());
}

function byId(id) {
  return document.getElementById(id);
}

function setMessage(text, type = 'info') {
  const target = byId('message');
  if (target) {
    target.textContent = text;
    target.style.color = type === 'error' ? '#f87171' : '#facc15';
  }
}

const SHELL_NAV_ITEMS = [
  ['dashboard', '/dashboard.html', 'Dashboard'],
  ['squad', '/squad.html', 'Takım'],
  ['calendar', '/calendar.html', 'Maçlar'],
  ['transfers', '/transfers.html', 'Transferler'],
  ['training', '/training.html', 'Tesisler'],
  ['lineup', '/lineup.html', 'İlk 11 & Taktik'],
  ['league', '/league.html', 'Ligler'],
  ['manager', '/manager.html', 'Menajer'],
  ['daily-tasks', '/daily-tasks.html', 'Görevler'],
  ['spy', '/spy.html', 'Casus'],
  ['messages', '/messages.html', 'Mesajlar'],
  ['market', '/market.html', 'Market'],
  ['economy', '/economy.html', 'Ekonomi'],
  ['social', '/social.html', 'Sosyal Medya']
];

function managerXpText(manager) {
  if (!manager) return 'Lv. 1 Menajer';
  return `Lv. ${manager.level} Menajer`;
}

function updateManagerWidget(manager) {
  const widget = byId('managerXpWidget');
  if (!widget || !manager) return;
  widget.innerHTML = `
    <span>${managerXpText(manager)}</span>
    <strong>${manager.currentXp} / ${manager.nextXp} XP</strong>
    <em>${manager.lastXpGain ? `+${manager.lastXpGain} XP` : 'XP hazır'}</em>
  `;
}

function updateCoinWidget(balance) {
  const widget = byId('coinWidget');
  if (!widget) return;
  widget.innerHTML = `<span class="shell-coin-icon"></span><strong>${Number(balance || 0).toLocaleString('tr-TR')}</strong><span class="shell-plus">+</span>`;
}

function updateBudgetWidget(club) {
  const widget = byId('budgetWidget');
  if (!widget || !club) return;
  widget.innerHTML = `<span class="shell-money-icon"></span><strong>${money(club.budget || 0)}</strong>`;
}

function updateDateWidget(state) {
  const widget = byId('dateWidget');
  if (!widget || !state) return;
  const date = state.current_date ? new Date(`${String(state.current_date).slice(0, 10)}T12:00:00`) : null;
  const dateText = date ? date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : `Gün ${state.current_day || 1}`;
  const dayText = date ? date.toLocaleDateString('tr-TR', { weekday: 'long' }) : '';
  widget.innerHTML = `<span class="shell-calendar-icon"></span><strong>${dateText}</strong><small>${dayText}</small>`;
}

function showXpToast(award) {
  if (!award || !award.gained) return;
  document.querySelector('.xp-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'xp-toast';
  toast.innerHTML = `
    <strong>+${award.gained} XP kazandın</strong>
    <span>${award.reason || 'Menajer gelişimi'}</span>
    ${award.levelUp ? `<em>Seviye atladın: Lv. ${award.profile?.level || ''}</em>` : ''}
  `;
  document.body.appendChild(toast);
  updateManagerWidget(award.profile);
  setTimeout(() => toast.classList.add('show'), 40);
  setTimeout(() => toast.remove(), 4200);
}

function showMessageToast(count) {
  if (!count || window.location.pathname.endsWith('/messages.html')) return;
  document.querySelector('.message-toast')?.remove();
  const toast = document.createElement('a');
  toast.className = 'message-toast';
  toast.href = '/messages.html';
  toast.innerHTML = `<strong>Yeni mesaj</strong><span>${count} okunmamış bildirimin var.</span>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 40);
  setTimeout(() => toast.remove(), 4200);
}

function managerLeaderboardRows(rows) {
  if (!rows?.length) return '<div class="empty">Henuz siralamaya giren menajer yok.</div>';
  return rows.map((row, index) => `
    <article class="leaderboard-row ${index < 3 ? 'podium' : ''}">
      <span class="leaderboard-rank">${index + 1}</span>
      <div>
        <strong>${row.username || 'Menajer'}</strong>
        <small>${row.teamName || 'Takim secilmedi'}</small>
      </div>
      <div class="leaderboard-xp">
        <strong>Lv. ${row.level}</strong>
        <span>${row.totalXp} XP</span>
        <small>%${row.winRate} kazanma</small>
      </div>
    </article>
  `).join('');
}

function closeShellLeaderboard() {
  const shell = byId('shellLeaderboard');
  if (!shell) return;
  shell.classList.remove('open');
  shell.querySelector('[data-leaderboard-toggle]')?.setAttribute('aria-expanded', 'false');
}

async function loadShellLeaderboard() {
  const list = byId('shellLeaderboardList');
  if (!list || list.dataset.loaded === '1') return;
  list.innerHTML = '<div class="empty">Siralamalar yukleniyor...</div>';
  try {
    const rows = await api.request('/api/manager/leaderboard');
    list.innerHTML = managerLeaderboardRows(rows);
    list.dataset.loaded = '1';
  } catch (error) {
    list.innerHTML = `<div class="empty">Siralama yuklenemedi: ${error.message}</div>`;
  }
}

function wireShellLeaderboard(topbar, logout) {
  if (!topbar || byId('shellLeaderboard')) return;
  const shell = document.createElement('div');
  shell.id = 'shellLeaderboard';
  shell.className = 'shell-leaderboard';
  shell.innerHTML = `
    <button class="btn secondary leaderboard-toggle" data-leaderboard-toggle type="button" aria-expanded="false">
      Siralama
    </button>
    <section class="shell-leaderboard-panel" aria-label="Menajer Siralamasi">
      <div class="leaderboard-head">
        <span class="message-category gold">Canli</span>
        <h2>Menajer Siralamasi</h2>
      </div>
      <div id="shellLeaderboardList" class="leaderboard-list">
        <div class="empty">Acmak icin tikla.</div>
      </div>
    </section>
  `;
  topbar.insertBefore(shell, logout || null);

  shell.querySelector('[data-leaderboard-toggle]')?.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const isOpen = shell.classList.toggle('open');
    event.currentTarget.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) await loadShellLeaderboard();
  });

  shell.querySelector('.shell-leaderboard-panel')?.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  document.addEventListener('click', closeShellLeaderboard);
}

async function refreshMessageBadge() {
  try {
    const { count } = await api.request('/api/messages/unread-count');
    document.querySelectorAll('[data-message-badge]').forEach((badge) => {
      badge.hidden = !count;
      badge.textContent = count > 9 ? '9+' : String(count);
    });
    document.querySelectorAll('[data-page="messages"]').forEach((link) => {
      link.classList.toggle('has-unread', Boolean(count));
    });
    const previousRaw = localStorage.getItem('tacticoreUnreadMessages');
    const previous = previousRaw === null ? null : Number(previousRaw || 0);
    if (previous !== null && count > previous) showMessageToast(count);
    localStorage.setItem('tacticoreUnreadMessages', String(count || 0));
  } catch {}
}

async function refreshCoinWidget() {
  try {
    const data = await api.request('/api/coins');
    updateCoinWidget(data.balance);
  } catch {}
}

window.refreshCoinWidget = refreshCoinWidget;

async function requireAuth() {
  try {
    const session = await api.request('/api/me');
    const badge = byId('userBadge');
    if (badge && session.club) badge.textContent = session.club.name;
    localStorage.setItem('tacticoreCurrency', session.club?.currency || 'EUR');
    updateBudgetWidget(session.club);
    updateManagerWidget(session.manager);
    refreshMessageBadge();
    refreshCoinWidget();
    api.request('/api/game/state').then(updateDateWidget).catch(() => {});
    return session;
  } catch (error) {
    window.location.href = '/login.html';
    return null;
  }
}

let lastMenuTouchAt = 0;

function wireShell(activePage) {
  const sidebar = byId('sidebar');
  const button = byId('menuButton');
  const topbar = document.querySelector('.topbar');
  if (topbar && !byId('managerXpWidget')) {
    const logout = byId('logoutButton');
    const budget = document.createElement('a');
    budget.id = 'budgetWidget';
    budget.className = 'budget-widget';
    budget.href = '/economy.html';
    budget.innerHTML = '<span class="shell-money-icon"></span><strong>0 EUR</strong>';
    topbar.insertBefore(budget, logout || null);
    const coin = document.createElement('a');
    coin.id = 'coinWidget';
    coin.className = 'coin-widget';
    coin.href = '/market.html';
    coin.innerHTML = '<span class="shell-coin-icon"></span><strong>0</strong><span class="shell-plus">+</span>';
    topbar.insertBefore(coin, logout || null);
    const date = document.createElement('a');
    date.id = 'dateWidget';
    date.className = 'date-widget';
    date.href = '/calendar.html';
    date.innerHTML = '<span class="shell-calendar-icon"></span><strong>Takvim</strong><small>Hazırlanıyor</small>';
    topbar.insertBefore(date, logout || null);
    const continueButton = document.createElement('a');
    continueButton.id = 'continueWidget';
    continueButton.className = 'continue-widget btn green';
    continueButton.href = '/dashboard.html';
    continueButton.textContent = 'DEVAM ET';
    topbar.insertBefore(continueButton, logout || null);
    const widget = document.createElement('a');
    widget.id = 'managerXpWidget';
    widget.className = 'manager-xp-widget';
    widget.href = '/manager.html';
    widget.innerHTML = '<span>Lv. 1 Menajer</span><strong>0 / 500 XP</strong><em>XP hazır</em>';
    topbar.insertBefore(widget, logout || null);
    wireShellLeaderboard(topbar, logout);
  } else if (topbar) {
    if (!byId('coinWidget')) {
      const logout = byId('logoutButton');
      const budget = document.createElement('a');
      budget.id = 'budgetWidget';
      budget.className = 'budget-widget';
      budget.href = '/economy.html';
      budget.innerHTML = '<span class="shell-money-icon"></span><strong>0 EUR</strong>';
      topbar.insertBefore(budget, logout || null);
      const coin = document.createElement('a');
      coin.id = 'coinWidget';
      coin.className = 'coin-widget';
      coin.href = '/market.html';
      coin.innerHTML = '<span class="shell-coin-icon"></span><strong>0</strong><span class="shell-plus">+</span>';
      topbar.insertBefore(coin, byId('managerXpWidget') || logout || null);
      const date = document.createElement('a');
      date.id = 'dateWidget';
      date.className = 'date-widget';
      date.href = '/calendar.html';
      date.innerHTML = '<span class="shell-calendar-icon"></span><strong>Takvim</strong><small>Hazırlanıyor</small>';
      topbar.insertBefore(date, logout || null);
      const continueButton = document.createElement('a');
      continueButton.id = 'continueWidget';
      continueButton.className = 'continue-widget btn green';
      continueButton.href = '/dashboard.html';
      continueButton.textContent = 'DEVAM ET';
      topbar.insertBefore(continueButton, logout || null);
    }
    wireShellLeaderboard(topbar, byId('logoutButton'));
  }
  const nav = sidebar?.querySelector('.nav');
  if (nav) {
    nav.innerHTML = SHELL_NAV_ITEMS.map(([page, href, label]) => `
      <a data-page="${page}" href="${href}" class="${page === activePage ? 'active' : ''}">
        <span class="nav-label">${label}</span>
        ${page === 'messages' ? '<span class="nav-badge" data-message-badge hidden></span>' : ''}
      </a>
    `).join('');
  }

  if (button && sidebar && !button.dataset.shellMenuWired) {
    const toggleSidebar = (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      sidebar.classList.toggle('open');
      button.setAttribute('aria-expanded', String(sidebar.classList.contains('open')));
    };
    button.dataset.shellMenuWired = '1';
    button.setAttribute('aria-controls', 'sidebar');
    button.setAttribute('aria-expanded', String(sidebar.classList.contains('open')));
    button.addEventListener('pointerup', (event) => {
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
      lastMenuTouchAt = Date.now();
      toggleSidebar(event);
    });
    button.addEventListener('click', (event) => {
      if (Date.now() - lastMenuTouchAt < 450) return;
      toggleSidebar(event);
    });
  }

  document.querySelectorAll('[data-page]').forEach((link) => {
    if (link.dataset.page === activePage) link.classList.add('active');
  });

  const logout = byId('logoutButton');
  if (logout) {
    logout.addEventListener('click', async () => {
      await api.request('/api/logout', { method: 'POST' });
      window.location.href = '/login.html';
    });
  }
}

function stopTactiCoreMusic() {
  localStorage.removeItem('tacticoreMusicEnabled');
  localStorage.setItem('tacticoreMusicTime', '0');
  const disabledOwner = `music-disabled-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem('tacticoreMusicOwner', disabledOwner);
  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel('tacticore-music');
    channel.postMessage({ type: 'claim', owner: disabledOwner });
    channel.close();
  }
}

function startMusicTicker() {
  stopTactiCoreMusic();
}

function wireAuthForms() {
  const loginForm = byId('loginForm');
  const registerForm = byId('registerForm');

  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      setMessage('Giriş yapılıyor...');
      try {
        await api.request('/api/login', {
          method: 'POST',
          body: JSON.stringify({
            login: byId('login').value,
            password: byId('password').value
          })
        });
        window.location.href = '/index.html';
      } catch (error) {
        setMessage(error.message, 'error');
      }
    });
  }

  if (registerForm) {
    const select = byId('teamId');
    const submitButton = registerForm.querySelector('button[type="submit"]');
    let careerMode = false;

    api.request('/api/me').then((session) => {
      careerMode = true;
      document.querySelector('.auth-panel h1').textContent = 'Yeni kariyer başlat.';
      document.querySelector('.auth-panel > .muted').textContent = `${session.club?.name || 'Kulübün'} için yeni takımını seç.`;
      ['username', 'email', 'password'].forEach((id) => {
        const input = byId(id);
        if (!input) return;
        input.required = false;
        input.closest('.field').hidden = true;
      });
      if (submitButton) submitButton.textContent = 'Takımı Seç ve Başla';
      const loginLink = registerForm.nextElementSibling;
      if (loginLink) loginLink.hidden = true;
    }).catch(() => {});

    if (select) {
      select.disabled = true;
      select.innerHTML = '<option value="">Takımlar yükleniyor...</option>';
    }
    if (submitButton) submitButton.disabled = true;

    api.request('/api/register/options').then((teams) => {
      if (!select) return;
      select.innerHTML = teams.map((team) => `<option value="${team.id}">${team.name} - ${team.city}</option>`).join('');
      select.disabled = false;
      if (submitButton) submitButton.disabled = false;
      const clubName = byId('clubName');
      if (clubName && teams[0]) clubName.value = teams[0].name;
      select.addEventListener('change', () => {
        const selected = teams.find((team) => String(team.id) === select.value);
        if (clubName && selected && !clubName.dataset.touched) clubName.value = selected.name;
      });
      if (clubName) clubName.addEventListener('input', () => { clubName.dataset.touched = '1'; });
    }).catch(() => {
      setMessage('Takım listesi yüklenemedi. Sayfayı yenileyip tekrar deneyin.', 'error');
    });

    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!byId('teamId').value) {
        setMessage('Lütfen önce takım seçin.', 'error');
        return;
      }
      setMessage('Kulübünüz kuruluyor...');
      try {
        const body = {
          clubName: byId('clubName').value,
          teamId: byId('teamId').value
        };
        if (!careerMode) {
          body.username = byId('username').value;
          body.email = byId('email').value;
          body.password = byId('password').value;
        }
        const result = await api.request(careerMode ? '/api/career/new' : '/api/register', {
          method: 'POST',
          body: JSON.stringify(body)
        });
        localStorage.setItem('tacticorePendingIntro', JSON.stringify({
          clubName: result.clubName || byId('clubName').value,
          teamId: result.teamId || byId('teamId').value,
          createdAt: Date.now()
        }));
        window.location.href = '/career-intro.html';
      } catch (error) {
        setMessage(error.message, 'error');
      }
    });
  }
}

wireAuthForms();
startMusicTicker();


