let adminData = null;
let loadedPlayers = [];

function adminMessage(text, type = 'info') {
  const target = byId('adminMessage');
  if (!target) return;
  target.textContent = text;
  target.style.color = type === 'error' ? '#f87171' : '#facc15';
}

function adminRequest(path, options = {}) {
  const requestOptions = { ...options };
  if (requestOptions.body && typeof requestOptions.body !== 'string') {
    requestOptions.body = JSON.stringify(requestOptions.body);
  }
  return api.request(path, requestOptions);
}

function formatAdminMoney(value) {
  return `${Number(value || 0).toLocaleString('tr-TR')} EUR`;
}

function currentTeam() {
  const id = Number(byId('teamId').value || 0);
  return adminData?.teams.find((team) => Number(team.id) === id) || null;
}

function currentPlayer() {
  const id = Number(byId('playerId').value || 0);
  return loadedPlayers.find((player) => Number(player.id) === id) || null;
}

function showAdminTab(tab) {
  document.querySelectorAll('[data-admin-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.adminTab === tab);
  });
  document.querySelectorAll('[data-admin-section]').forEach((section) => {
    section.classList.toggle('active', section.dataset.adminSection === tab);
  });
}

function renderSummary() {
  const stats = adminData.stats || {};
  byId('adminSummary').innerHTML = `
    <article class="stat-card"><span class="muted">Kullanıcı</span><strong>${stats.user_count || adminData.users.length}</strong></article>
    <article class="stat-card"><span class="muted">Takım</span><strong>${adminData.teams.length}</strong></article>
    <article class="stat-card"><span class="muted">Oyuncu</span><strong>${stats.player_count || 0}</strong></article>
    <article class="stat-card"><span class="muted">Pasif hesap</span><strong>${stats.passive_users || 0}</strong></article>
  `;
  byId('systemStats').innerHTML = `
    <article class="stat-card"><span class="muted">Açık transfer</span><strong>${stats.open_transfer_count || 0}</strong></article>
    <article class="stat-card"><span class="muted">Okunmamış mesaj</span><strong>${stats.unread_messages || 0}</strong></article>
    <article class="stat-card"><span class="muted">Maç kaydı</span><strong>${adminData.matches || 0}</strong></article>
  `;
}

function teamRows() {
  return adminData.teams.map((team) => `
    <tr>
      <td><strong>${team.name}</strong><br><span class="muted">${team.city || '-'}</span></td>
      <td>${team.overall}</td>
      <td>${formatAdminMoney(team.budget)}</td>
      <td>${Number(team.fans || 0).toLocaleString('tr-TR')}</td>
      <td>${team.points || 0}</td>
      <td class="admin-actions"><button class="btn secondary" data-edit-team="${team.id}" type="button">Düzenle</button></td>
    </tr>
  `).join('');
}

function renderTeams() {
  byId('teamTable').innerHTML = `
    <table>
      <thead><tr><th>Takım</th><th>OVR</th><th>Bütçe</th><th>Taraftar</th><th>Puan</th><th>İşlem</th></tr></thead>
      <tbody>${teamRows()}</tbody>
    </table>
  `;
}

function fillTeamForm(team = null) {
  const selected = team || adminData.teams[0] || {};
  byId('teamId').value = selected.id || '';
  byId('teamName').value = selected.name || '';
  byId('teamShortName').value = selected.short_name || '';
  byId('teamLogo').value = selected.logo_url || '';
  byId('teamCity').value = selected.city || '';
  byId('teamStadium').value = selected.stadium || '';
  byId('teamBudget').value = selected.budget || 0;
  byId('teamFans').value = selected.fans || 0;
  byId('teamPoints').value = selected.points || 0;
  byId('teamOverall').value = selected.overall || 60;
  byId('teamAttack').value = selected.attack_overall || selected.overall || 60;
  byId('teamMidfield').value = selected.midfield_overall || selected.overall || 60;
  byId('teamDefense').value = selected.defense_overall || selected.overall || 60;
  byId('teamGoalkeeper').value = selected.goalkeeper_overall || selected.overall || 60;
  byId('teamFormation').value = selected.default_formation || '4-2-3-1';
  byId('deleteTeamButton').disabled = !selected.id;
}

function teamPayload() {
  return {
    name: byId('teamName').value.trim(),
    short_name: byId('teamShortName').value.trim(),
    logo_url: byId('teamLogo').value.trim(),
    city: byId('teamCity').value.trim(),
    stadium: byId('teamStadium').value.trim(),
    budget: byId('teamBudget').value,
    fans: byId('teamFans').value,
    points: byId('teamPoints').value,
    overall: byId('teamOverall').value,
    attack_overall: byId('teamAttack').value,
    midfield_overall: byId('teamMidfield').value,
    defense_overall: byId('teamDefense').value,
    goalkeeper_overall: byId('teamGoalkeeper').value,
    default_formation: byId('teamFormation').value
  };
}

function resetPlayerForm() {
  byId('playerId').value = '';
  byId('playerTeam').value = adminData.teams[0]?.id || '';
  byId('playerName').value = '';
  byId('playerAge').value = 22;
  byId('playerPosition').value = 'MID';
  byId('playerOverall').value = 65;
  byId('playerPotential').value = 72;
  byId('playerSalary').value = 0;
  byId('playerMarket').value = 0;
  byId('playerStamina').value = 75;
  byId('playerMorale').value = 70;
  byId('playerImage').value = '';
  byId('playerInjuryType').value = '';
  byId('playerInjuryReturn').value = 0;
  byId('playerInjured').checked = false;
  byId('playerStarter').checked = false;
  byId('deletePlayerButton').disabled = true;
}

function fillPlayerForm(player) {
  if (!player) return resetPlayerForm();
  byId('playerId').value = player.id || '';
  byId('playerTeam').value = player.team_id || '';
  byId('playerName').value = player.name || '';
  byId('playerAge').value = player.age || 22;
  byId('playerPosition').value = player.position || 'MID';
  byId('playerOverall').value = player.overall || 65;
  byId('playerPotential').value = player.potential || player.overall || 65;
  byId('playerSalary').value = player.salary || 0;
  byId('playerMarket').value = player.market_value || 0;
  byId('playerStamina').value = player.stamina || 75;
  byId('playerMorale').value = player.morale || 70;
  byId('playerImage').value = player.image_url || '';
  byId('playerInjuryType').value = player.injury_type || '';
  byId('playerInjuryReturn').value = player.injury_return_day || 0;
  byId('playerInjured').checked = Boolean(player.injured);
  byId('playerStarter').checked = Boolean(player.is_starting_eleven);
  byId('deletePlayerButton').disabled = false;
}

function playerPayload() {
  const overall = Number(byId('playerOverall').value || 65);
  return {
    team_id: byId('playerTeam').value,
    name: byId('playerName').value.trim(),
    age: byId('playerAge').value,
    position: byId('playerPosition').value,
    overall,
    potential: byId('playerPotential').value,
    salary: byId('playerSalary').value,
    market_value: byId('playerMarket').value,
    stamina: byId('playerStamina').value,
    morale: byId('playerMorale').value,
    image_url: byId('playerImage').value.trim(),
    injured: byId('playerInjured').checked,
    injury_type: byId('playerInjuryType').value.trim(),
    injury_return_day: byId('playerInjuryReturn').value,
    is_starting_eleven: byId('playerStarter').checked,
    pace: overall,
    shooting: overall,
    passing: overall,
    dribbling: overall,
    defending: overall,
    physical: overall
  };
}

function renderPlayers() {
  byId('playerTable').innerHTML = loadedPlayers.length ? `
    <table>
      <thead><tr><th>Oyuncu</th><th>Takım</th><th>Mevki</th><th>OVR</th><th>Değer</th><th>İşlem</th></tr></thead>
      <tbody>
        ${loadedPlayers.map((player) => `
          <tr>
            <td><strong>${player.name}</strong><br><span class="muted">${player.age} yaş</span></td>
            <td>${player.team_name || player.club_name || '-'}</td>
            <td>${player.position}</td>
            <td>${player.overall}</td>
            <td>${formatAdminMoney(player.market_value)}</td>
            <td class="admin-actions"><button class="btn secondary" data-edit-player="${player.id}" type="button">Düzenle</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : '<div class="empty">Oyuncu listesi boş. Filtre seçip oyuncuları getir.</div>';
}

function renderUsers() {
  byId('passwordUserSelect').innerHTML = adminData.users.map((user) => `<option value="${user.id}">${user.username} - ${user.email}</option>`).join('');
  byId('userManagement').innerHTML = `
    <table>
      <thead><tr><th>Kullanıcı</th><th>E-posta</th><th>Takım</th><th>Durum</th><th>İşlem</th></tr></thead>
      <tbody>
        ${adminData.users.map((user) => `
          <tr data-user-row="${user.id}">
            <td><input data-user-field="username" value="${user.username || ''}"></td>
            <td><input data-user-field="email" value="${user.email || ''}"></td>
            <td>${user.team_name || user.club_name || '-'}</td>
            <td>${Number(user.is_active) === 1 ? 'Aktif' : 'Pasif'}</td>
            <td class="admin-actions">
              <button class="btn secondary" data-user-action="save" data-user-id="${user.id}" type="button">Kaydet</button>
              <button class="btn secondary" data-user-action="toggle" data-user-id="${user.id}" type="button">${Number(user.is_active) === 1 ? 'Pasifleştir' : 'Aktifleştir'}</button>
              <button class="btn danger" data-user-action="delete" data-user-id="${user.id}" type="button">Sil</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderAdmin() {
  if (!adminData) return;
  byId('adminPanel').hidden = false;
  renderSummary();
  renderTeams();
  fillTeamForm(currentTeam() || adminData.teams[0]);
  const teamOptions = adminData.teams.map((team) => `<option value="${team.id}">${team.name}</option>`).join('');
  byId('playerTeamFilter').innerHTML = '<option value="">Tüm takımlar</option>' + teamOptions;
  byId('playerTeam').innerHTML = teamOptions;
  renderPlayers();
  renderUsers();
}

async function loadOverview() {
  adminData = await adminRequest('/api/admin/overview');
  renderAdmin();
}

async function loadPlayers() {
  const teamId = byId('playerTeamFilter').value;
  const query = byId('playerSearch').value.trim();
  loadedPlayers = await adminRequest(`/api/admin/players?teamId=${encodeURIComponent(teamId)}&q=${encodeURIComponent(query)}`);
  renderPlayers();
  if (loadedPlayers[0]) fillPlayerForm(loadedPlayers[0]);
  else resetPlayerForm();
  adminMessage(`${loadedPlayers.length} oyuncu getirildi.`);
}

async function bootAdmin() {
  try {
    await api.request('/api/admin/me');
    await loadOverview();
    adminMessage('Admin oturumu açık.');
  } catch {
    byId('adminPanel').hidden = true;
  }
}

document.querySelectorAll('[data-admin-tab]').forEach((button) => {
  button.addEventListener('click', () => showAdminTab(button.dataset.adminTab));
});

byId('adminForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api.request('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({
        username: byId('adminUsername').value.trim(),
        password: byId('adminPassword').value
      })
    });
    await loadOverview();
    adminMessage('Panel açıldı.');
  } catch (error) {
    adminMessage(error.message, 'error');
  }
});

byId('newTeamButton')?.addEventListener('click', () => {
  fillTeamForm({
    id: '',
    name: '',
    short_name: '',
    default_formation: '4-2-3-1',
    overall: 60,
    attack_overall: 60,
    midfield_overall: 60,
    defense_overall: 60,
    goalkeeper_overall: 60
  });
});

byId('teamForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const id = byId('teamId').value;
    adminData = await adminRequest(id ? `/api/admin/teams/${id}` : '/api/admin/teams', {
      method: id ? 'PATCH' : 'POST',
      body: teamPayload()
    });
    renderAdmin();
    adminMessage('Takım verisi kaydedildi.');
  } catch (error) {
    adminMessage(error.message, 'error');
  }
});

byId('deleteTeamButton')?.addEventListener('click', async () => {
  const team = currentTeam();
  if (!team || !window.confirm(`${team.name} silinsin mi?`)) return;
  try {
    adminData = await adminRequest(`/api/admin/teams/${team.id}`, { method: 'DELETE' });
    renderAdmin();
    adminMessage('Takım silindi.');
  } catch (error) {
    adminMessage(error.message, 'error');
  }
});

byId('loadPlayers')?.addEventListener('click', () => {
  loadPlayers().catch((error) => adminMessage(error.message, 'error'));
});

byId('newPlayerButton')?.addEventListener('click', resetPlayerForm);

byId('playerForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const id = byId('playerId').value;
    const result = await adminRequest(id ? `/api/admin/players/${id}` : '/api/admin/players', {
      method: id ? 'PATCH' : 'POST',
      body: playerPayload()
    });
    if (result.overview) adminData = result.overview;
    await loadOverview();
    await loadPlayers();
    adminMessage('Oyuncu verisi kaydedildi.');
  } catch (error) {
    adminMessage(error.message, 'error');
  }
});

byId('deletePlayerButton')?.addEventListener('click', async () => {
  const player = currentPlayer();
  if (!player || !window.confirm(`${player.name} silinsin mi?`)) return;
  try {
    await adminRequest(`/api/admin/players/${player.id}`, { method: 'DELETE' });
    await loadOverview();
    await loadPlayers();
    adminMessage('Oyuncu silindi.');
  } catch (error) {
    adminMessage(error.message, 'error');
  }
});

document.addEventListener('click', async (event) => {
  const teamButton = event.target.closest('[data-edit-team]');
  if (teamButton) {
    const team = adminData.teams.find((item) => Number(item.id) === Number(teamButton.dataset.editTeam));
    fillTeamForm(team);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  const playerButton = event.target.closest('[data-edit-player]');
  if (playerButton) {
    const player = loadedPlayers.find((item) => Number(item.id) === Number(playerButton.dataset.editPlayer));
    fillPlayerForm(player);
    return;
  }

  const userButton = event.target.closest('[data-user-action]');
  if (!userButton) return;
  const userId = userButton.dataset.userId;
  const action = userButton.dataset.userAction;
  const row = document.querySelector(`[data-user-row="${userId}"]`);
  try {
    if (action === 'save') {
      adminData = await adminRequest(`/api/admin/users/${userId}`, {
        method: 'POST',
        body: {
          username: row.querySelector('[data-user-field="username"]').value,
          email: row.querySelector('[data-user-field="email"]').value,
          is_active: adminData.users.find((user) => Number(user.id) === Number(userId))?.is_active
        }
      });
    } else if (action === 'toggle') {
      adminData = await adminRequest(`/api/admin/users/${userId}/toggle-active`, { method: 'POST', body: {} });
    } else if (action === 'delete') {
      if (!window.confirm('Bu kullanıcı ve kariyerleri silinsin mi?')) return;
      adminData = await adminRequest(`/api/admin/users/${userId}`, { method: 'DELETE' });
    }
    renderAdmin();
    adminMessage('Kullanıcı işlemi tamamlandı.');
  } catch (error) {
    adminMessage(error.message, 'error');
  }
});

byId('passwordForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const userId = byId('passwordUserSelect').value;
    const result = await adminRequest(`/api/admin/users/${userId}/password`, {
      method: 'POST',
      body: { password: byId('newPassword').value.trim() }
    });
    byId('newPassword').value = '';
    adminMessage(result.message);
  } catch (error) {
    adminMessage(error.message, 'error');
  }
});

bootAdmin();
