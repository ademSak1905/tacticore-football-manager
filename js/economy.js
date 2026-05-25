async function loadEconomy() {
  wireShell('economy');
  await requireAuth();
  const data = await api.request('/api/club/economy');
  const stats = [
    ['Kulüp bütçesi', money(data.club.budget)],
    ['Haftalık maaş', money(data.weeklySalary)],
    ['Tahmini bilet geliri', money(data.estimatedTicketIncome)],
    ['Sponsor geliri', money(data.sponsorIncome)]
  ];

  byId('economyStats').innerHTML = stats.map(([label, value]) => `<article class="card stat-card"><span class="muted">${label}</span><strong>${value}</strong></article>`).join('');
  byId('transferHistory').innerHTML = data.recentTransfers.length ? `
    <table><thead><tr><th>Tarih</th><th>Oyuncu</th><th>Bedel</th><th>Yön</th></tr></thead><tbody>
      ${data.recentTransfers.map((item) => {
        const direction = item.to_club_id === data.club.id ? 'Gelen' : 'Giden';
        return `<tr><td>${new Date(item.transfer_date).toLocaleString('tr-TR')}</td><td>${item.player_name}</td><td>${money(item.price)}</td><td>${direction}</td></tr>`;
      }).join('')}
    </tbody></table>
  ` : '<div class="empty">Transfer hareketi yok.</div>';
}

loadEconomy();


