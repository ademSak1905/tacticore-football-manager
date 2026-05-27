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
  ['manager', '/manager.html', 'Menajerim'],
  ['messages', '/messages.html', 'Mesajlar'],
  ['squad', '/squad.html', 'Kadro'],
  ['lineup', '/lineup.html', 'İlk 11 & Taktik'],
  ['calendar', '/calendar.html', 'Takvim'],
  ['social', '/social.html', 'Sosyal Medya'],
  ['league', '/league.html', 'Lig'],
  ['transfers', '/transfers.html', 'Transfer'],
  ['training', '/training.html', 'Antrenman'],
  ['economy', '/economy.html', 'Ekonomi']
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

async function requireAuth() {
  try {
    const session = await api.request('/api/me');
    const badge = byId('userBadge');
    if (badge && session.club) badge.textContent = session.club.name;
    localStorage.setItem('tacticoreCurrency', session.club?.currency || 'EUR');
    updateManagerWidget(session.manager);
    refreshMessageBadge();
    return session;
  } catch (error) {
    window.location.href = '/login.html';
    return null;
  }
}

function wireShell(activePage) {
  const sidebar = byId('sidebar');
  const button = byId('menuButton');
  const topbar = document.querySelector('.topbar');
  if (topbar && !byId('managerXpWidget')) {
    const logout = byId('logoutButton');
    const widget = document.createElement('a');
    widget.id = 'managerXpWidget';
    widget.className = 'manager-xp-widget';
    widget.href = '/manager.html';
    widget.innerHTML = '<span>Lv. 1 Menajer</span><strong>0 / 500 XP</strong><em>XP hazır</em>';
    topbar.insertBefore(widget, logout || null);
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

  if (button && sidebar) button.addEventListener('click', () => sidebar.classList.toggle('open'));

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


