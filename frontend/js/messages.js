let inboxData = { categories: [], messages: [], unreadCount: 0 };
let activeCategory = 'all';
let selectedMessageId = null;

const CATEGORY_META = {
  management: { label: 'Yönetim', tone: 'gold' },
  transfer: { label: 'Transfer', tone: 'blue' },
  player: { label: 'Oyuncu', tone: 'green' },
  health: { label: 'Sakatlık', tone: 'red' },
  discipline: { label: 'Ceza', tone: 'red' },
  scout: { label: 'Scout', tone: 'blue' }
};

function messageDate(message) {
  if (message.created_at) {
    return new Date(message.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  return `Gün ${message.day || 1}`;
}

function categoryLabel(category) {
  return CATEGORY_META[category]?.label || category || 'Mesaj';
}

function categoryTone(category) {
  return CATEGORY_META[category]?.tone || 'blue';
}

function actionButtons(message) {
  if (message.status && message.status !== 'open') return '';
  if (message.action_type === 'transfer_offer') {
    return `
      <button class="btn green" data-action="accept">Teklifi Kabul Et</button>
      <button class="btn secondary" data-action="negotiate">Pazarlık Yap</button>
      <button class="btn danger" data-action="reject">Reddet</button>
    `;
  }
  if (message.action_type === 'outgoing_transfer_finalize') {
    return `
      <button class="btn green" data-action="accept">Sözleşmeyi Tamamla</button>
      <button class="btn danger" data-action="reject">Vazgeç</button>
    `;
  }
  if (message.action_type === 'outgoing_transfer_counter') {
    return `
      <button class="btn green" data-action="accept">Karşı Teklifi Kabul Et</button>
      <button class="btn danger" data-action="reject">Reddet</button>
    `;
  }
  if (message.action_type === 'player_talk') {
    return '<button class="btn green" data-action="talk">Oyuncuyla Konuş</button>';
  }
  if (message.action_type === 'scout_review') {
    return '<button class="btn green" data-action="review">İncele</button>';
  }
  return '<button class="btn secondary" data-action="read">Okundu Yap</button>';
}

function renderSummary() {
  const messages = inboxData.messages || [];
  const important = messages.filter((item) => ['important', 'urgent'].includes(item.priority) && !item.is_read).length;
  byId('messageSummary').innerHTML = [
    ['Okunmamış', inboxData.unreadCount],
    ['Önemli', important],
    ['Transfer', messages.filter((item) => item.category === 'transfer').length],
    ['Scout', messages.filter((item) => item.category === 'scout').length]
  ].map(([label, value]) => `<article class="stat-card"><span class="muted">${label}</span><strong>${value}</strong></article>`).join('');
  byId('unreadText').textContent = inboxData.unreadCount ? `${inboxData.unreadCount} okunmamış` : 'Temiz';
}

function renderFilters() {
  byId('messageFilters').innerHTML = inboxData.categories.map((category) => `
    <button class="btn ${category.id === activeCategory ? '' : 'secondary'}" data-category="${category.id}" type="button">${category.label}</button>
  `).join('');
}

function renderList() {
  const messages = inboxData.messages || [];
  byId('messageList').innerHTML = messages.length ? messages.map((message) => `
    <article class="message-row ${message.is_read ? 'read' : 'unread'} ${message.priority === 'urgent' ? 'urgent' : ''} ${Number(message.id) === Number(selectedMessageId) ? 'active' : ''}" data-message-id="${message.id}">
      <div class="message-row-top">
        <span class="message-category ${categoryTone(message.category)}">${categoryLabel(message.category)}</span>
        <small>${messageDate(message)}</small>
      </div>
      <strong>${message.title}</strong>
      <p>${message.summary}</p>
      ${!message.is_read ? '<i class="unread-dot"></i>' : ''}
    </article>
  `).join('') : '<div class="empty">Bu kategoride mesaj yok.</div>';
}

function renderDetail() {
  const selected = inboxData.messages.find((message) => Number(message.id) === Number(selectedMessageId)) || inboxData.messages[0];
  if (!selected) {
    byId('messageDetail').innerHTML = '<div class="empty">Mesaj seç.</div>';
    return;
  }
  selectedMessageId = selected.id;
  const payload = selected.action_payload || {};
  const details = [];
  if (payload.playerName) details.push(['Oyuncu', payload.playerName]);
  if (payload.buyerTeamName) details.push(['Teklif yapan kulüp', payload.buyerTeamName]);
  if (payload.offerPrice) details.push(['Teklif', money(payload.offerPrice)]);
  if (payload.counterOffer) details.push(['Karşı teklif', money(payload.counterOffer)]);
  byId('messageDetail').innerHTML = `
    <div class="message-detail-head">
      <span class="message-category ${categoryTone(selected.category)}">${categoryLabel(selected.category)}</span>
      <span class="badge ${selected.priority === 'urgent' ? 'danger-badge' : ''}">${selected.priority === 'urgent' ? 'Acil' : selected.priority === 'important' ? 'Önemli' : 'Normal'}</span>
    </div>
    <h2>${selected.title}</h2>
    <p class="muted">${messageDate(selected)}</p>
    <div class="message-body">${String(selected.body || selected.summary).split('\n').map((line) => `<p>${line}</p>`).join('')}</div>
    ${details.length ? `<div class="season-rows message-info">${details.map(([label, value]) => `<div class="season-row"><span>${label}</span><strong>${value}</strong></div>`).join('')}</div>` : ''}
    <div class="actions message-actions">${actionButtons(selected)}</div>
  `;
}

function renderInbox() {
  renderSummary();
  renderFilters();
  renderList();
  renderDetail();
}

async function loadInbox(category = activeCategory) {
  activeCategory = category;
  inboxData = await api.request(`/api/messages?category=${encodeURIComponent(activeCategory)}`);
  if (!selectedMessageId || !inboxData.messages.some((item) => Number(item.id) === Number(selectedMessageId))) {
    selectedMessageId = inboxData.messages[0]?.id || null;
  }
  renderInbox();
  refreshMessageBadge?.();
}

async function selectMessage(id) {
  selectedMessageId = Number(id);
  const selected = inboxData.messages.find((message) => Number(message.id) === selectedMessageId);
  if (selected && !selected.is_read) {
    await api.request(`/api/messages/${selected.id}/read`, { method: 'PATCH' });
    selected.is_read = true;
    inboxData.unreadCount = Math.max(0, Number(inboxData.unreadCount || 0) - 1);
  }
  renderInbox();
  refreshMessageBadge?.();
}

async function runAction(action) {
  const selected = inboxData.messages.find((message) => Number(message.id) === Number(selectedMessageId));
  if (!selected) return;
  const normalized = action === 'talk' ? 'talk' : action === 'review' ? 'review' : action;
  const result = await api.request(`/api/messages/${selected.id}/action`, {
    method: 'POST',
    body: JSON.stringify({ action: normalized })
  });
  setMessage(result.message || 'İşlem tamamlandı.');
  await loadInbox(activeCategory);
  if (result.redirect) setTimeout(() => { window.location.href = result.redirect; }, 700);
}

async function markAllRead() {
  await api.request('/api/messages/read-all', { method: 'PATCH' });
  await loadInbox(activeCategory);
}

document.addEventListener('click', async (event) => {
  const categoryButton = event.target.closest('[data-category]');
  if (categoryButton) {
    selectedMessageId = null;
    await loadInbox(categoryButton.dataset.category);
    return;
  }
  const row = event.target.closest('[data-message-id]');
  if (row) {
    await selectMessage(row.dataset.messageId);
    return;
  }
  const actionButton = event.target.closest('[data-action]');
  if (actionButton) await runAction(actionButton.dataset.action);
});

byId('markAllRead')?.addEventListener('click', markAllRead);

async function bootMessages() {
  wireShell('messages');
  await requireAuth();
  await loadInbox();
}

bootMessages().catch((error) => setMessage(error.message, 'error'));
