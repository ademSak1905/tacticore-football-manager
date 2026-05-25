async function loadLeague() {
  wireShell('league');
  const session = await requireAuth();
  const table = await api.request('/api/league/table');
  byId('leagueTable').innerHTML = `
    <table>
      <thead><tr><th>#</th><th>Takım</th><th>O</th><th>G</th><th>B</th><th>M</th><th>A</th><th>P</th></tr></thead>
      <tbody>
        ${table.map((club, index) => `
          <tr style="${session?.club?.team_id === club.id ? 'background:rgba(34,197,94,.09)' : ''}">
            <td>${index + 1}</td><td><img class="team-logo" src="${club.logo_url}" alt=""> <a href="/team-detail.html?id=${club.id}">${club.name}</a></td><td>${club.played}</td><td>${club.wins}</td><td>${club.draws}</td><td>${club.losses}</td><td>${club.goal_difference}</td><td><strong>${club.points}</strong></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

loadLeague();

