function percent(value, max) {
  return Math.max(0, Math.min(100, Math.round((Number(value || 0) / Math.max(1, Number(max || 1))) * 100)));
}

function renderAchievement(item) {
  return `
    <article class="achievement-card unlocked">
      <strong>${item.title}</strong>
      <span>${item.description || 'Başarım açıldı.'}</span>
    </article>
  `;
}

async function loadManagerPage() {
  wireShell('manager');
  const session = await requireAuth();
  const data = await api.request('/api/manager/summary');
  const profile = data.profile || {};
  const stats = data.stats || {};
  const club = data.club || session.club || {};
  const progress = percent(profile.currentXp, profile.nextXp);

  byId('managerHero').innerHTML = `
    <div class="manager-avatar">${String(profile.managerName || data.user?.username || 'M').slice(0, 2).toUpperCase()}</div>
    <div class="manager-hero-copy">
      <span class="badge">Lv. ${profile.level} Menajer</span>
      <h2>${profile.managerName || data.user?.username || 'Menajer'}</h2>
      <p class="muted">${club.name || 'Kulüp'} teknik direktörü</p>
      <div class="xp-progress">
        <span style="width:${progress}%"></span>
      </div>
      <small>${profile.currentXp} / ${profile.nextXp} XP - Toplam ${profile.totalXp} XP</small>
    </div>
  `;

  const rows = [
    ['Kariyer sezonu', profile.seasons || 1],
    ['Toplam maç', stats.played || 0],
    ['Galibiyet', stats.wins || 0],
    ['Beraberlik', stats.draws || 0],
    ['Mağlubiyet', stats.losses || 0],
    ['Galibiyet yüzdesi', `%${stats.winRate || 0}`],
    ['Kazanılan kupalar', stats.trophies || 0],
    ['Son XP', profile.lastXpGain ? `+${profile.lastXpGain}` : '-']
  ];
  byId('managerStats').innerHTML = rows.map(([label, value]) => `
    <article class="stat-card"><span class="muted">${label}</span><strong>${value}</strong></article>
  `).join('');

  const achievements = data.achievements || [];
  const locked = [
    ['İlk Kupa', 'Bir kupa kazandığında açılır.'],
    ['10 Maç Yenilmezlik', 'Uzun seri yakaladığında açılır.'],
    ['5 Maç Üst Üste Galibiyet', 'Form yakaladığında açılır.'],
    ['Genç Oyuncu Parlatma', 'Genç oyuncu gelişiminde açılır.']
  ];
  byId('achievementList').innerHTML = `
    ${achievements.length ? achievements.map(renderAchievement).join('') : '<div class="empty">Henüz başarım açılmadı.</div>'}
    ${locked.map(([title, desc]) => `<article class="achievement-card locked"><strong>${title}</strong><span>${desc}</span></article>`).join('')}
  `;

  const history = data.history || [];
  byId('careerHistory').innerHTML = history.length ? history.map((item) => `
    <article class="timeline-item">
      <strong>${item.title}</strong>
      <span>${item.description}</span>
    </article>
  `).join('') : '<div class="empty">Kariyer geçmişi maçlardan sonra oluşacak.</div>';
}

loadManagerPage().catch((error) => setMessage(error.message, 'error'));
