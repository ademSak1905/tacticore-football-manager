async function loadTeamDetail() {
  wireShell('team-detail');
  await requireAuth();
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id') || 1;
  const [team, players] = await Promise.all([
    api.request(`/api/teams/${id}`),
    api.request(`/api/teams/${id}/players`)
  ]);
  byId('teamDetail').innerHTML = `
    <div class="team-hero">
      <img class="team-logo large" src="${team.logo_url}" alt="${team.name}">
      <div><h1>${team.name}</h1><p class="muted">${team.city} - ${team.stadium}</p></div>
      <strong class="rating">${team.overall}</strong>
    </div>
    <div class="mini-stats" style="margin-top:16px">
      <span>Hücum ${team.attack_overall}</span><span>Orta saha ${team.midfield_overall}</span>
      <span>Savunma ${team.defense_overall}</span><span>Kaleci ${team.goalkeeper_overall}</span>
      <span>Formasyon ${team.default_formation}</span><span>Taraftar ${Number(team.fans).toLocaleString('tr-TR')}</span>
    </div>
  `;
  byId('teamPlayers').innerHTML = players.map((player) => `
    <article class="player-card"><div class="player-head"><strong>${player.name}</strong><span class="rating">${player.overall}</span></div><span class="badge">${player.position}</span><p class="muted">${player.nationality || ''}</p></article>
  `).join('');
}

loadTeamDetail();

