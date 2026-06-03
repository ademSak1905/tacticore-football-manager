async function loadManagerLeaderboard() {
  const target = byId('managerLeaderboard');
  if (!target) return;
  try {
    const rows = await api.request('/api/manager/leaderboard');
    if (!rows.length) {
      target.innerHTML = '<div class="empty">Henuz siralamaya giren menajer yok.</div>';
      return;
    }
    target.innerHTML = rows.map((row, index) => `
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
  } catch (error) {
    target.innerHTML = `<div class="empty">Siralama yuklenemedi: ${error.message}</div>`;
  }
}

loadManagerLeaderboard();
