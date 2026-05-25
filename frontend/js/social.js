let activeFeedFilter = 'all';

function feedCard(post) {
  const isNews = post.feed_kind === 'news' || post.type === 'newspaper';
  const category = post.category || 'social';
  return `
    <article class="card media-card ${isNews ? 'newspaper' : ''}">
      <div class="media-head">
        <span class="badge">${isNews ? 'Gazete' : 'Sosyal'}</span>
        <span class="badge soft-badge">${category}</span>
      </div>
      <h2>${post.title || post.author}</h2>
      <p>${post.body || post.content || post.summary}</p>
      <p class="muted">Gün ${post.day}</p>
    </article>
  `;
}

async function loadSocial(filter = activeFeedFilter) {
  wireShell('social');
  await requireAuth();
  activeFeedFilter = filter;
  document.querySelectorAll('[data-feed-filter]').forEach((button) => {
    button.className = `btn ${button.dataset.feedFilter === filter ? '' : 'secondary'}`;
  });
  const posts = await api.request(`/api/social/feed?filter=${encodeURIComponent(filter)}`);
  byId('socialFeed').innerHTML = posts.map(feedCard).join('') || '<div class="empty">Henüz medya içeriği yok.</div>';
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-feed-filter]');
  if (!button) return;
  loadSocial(button.dataset.feedFilter).catch(() => {});
});

loadSocial().catch((error) => {
  byId('socialFeed').innerHTML = `<div class="empty">${error.message}</div>`;
});
