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

function selectedOptionData(selectId, list) {
  const id = Number(byId(selectId).value);
  return list.find((item) => Number(item.id) === id);
}

function renderAdmin() {
  if (!adminData) return;
  byId('adminPanel').hidden = false;
  const stats = adminData.stats || {};
  byId('adminSummary').innerHTML = `
    <article class="stat-card"><span class="muted">Kullanıcı</span><strong>${stats.user_count || adminData.users.length}</strong></article>
    <article class="stat-card"><span class="muted">Pasif hesap</span><strong>${stats.passive_users || 0}</strong></article>
    <article class="stat-card"><span class="muted">Takım</span><strong>${adminData.teams.length}</strong></article>
    <article class="stat-card"><span class="muted">Oyuncu</span><strong>${stats.player_count || 0}</strong></article>
  `;

  if (byId('currentDay')) byId('currentDay').value = adminData.state.current_day;
  if (byId('nextMatchDay')) byId('nextMatchDay').value = adminData.state.next_match_day;
  if (byId('week')) byId('week').value = adminData.state.week;
  if (byId('socialDay')) byId('socialDay').value = adminData.state.current_day;

  byId('clubSelect').innerHTML = adminData.clubs.map((club) => `<option value="${club.id}">${club.name} ${club.username ? `(${club.username})` : '(bot)'}</option>`).join('');
  byId('passwordUserSelect').innerHTML = adminData.users.map((user) => `<option value="${user.id}">${user.username} - ${user.email}</option>`).join('');
  byId('teamSelect').innerHTML = adminData.teams.map((team) => `<option value="${team.id}">${team.name}</option>`).join('');
  byId('playerTeamSelect').innerHTML = '<option value="">Tüm takımlar</option>' + adminData.teams.map((team) => `<option value="${team.id}">${team.name}</option>`).join('');

  fillClubForm();
  fillTeamForm();
  renderUsers();
  renderRecentMatches();
  renderPosts();
}

function fillClubForm() {
  const club = selectedOptionData('clubSelect', adminData.clubs);
  if (!club) return;
  byId('clubName').value = club.name || '';
  byId('clubBudget').value = club.budget || 0;
  byId('clubFans').value = club.fans || 0;
  byId('clubStadium').value = club.stadium_capacity || 0;
  byId('clubCurrency').value = club.currency || 'TRY';
}

function fillTeamForm() {
  const team = selectedOptionData('teamSelect', adminData.teams);
  if (!team) return;
  byId('teamOverall').value = team.overall;
  byId('teamAttack').value = team.attack_overall;
  byId('teamMidfield').value = team.midfield_overall;
  byId('teamDefense').value = team.defense_overall;
  byId('teamGoalkeeper').value = team.goalkeeper_overall;
  byId('teamBudget').value = team.budget;
  byId('teamFans').value = team.fans;
  byId('teamFormation').value = team.default_formation;
}

function fillPlayerForm() {
  const player = selectedOptionData('playerSelect', loadedPlayers);
  if (!player) return;
  byId('playerOverall').value = player.overall;
  byId('playerPace').value = player.pace;
  byId('playerShooting').value = player.shooting;
  byId('playerPassing').value = player.passing;
  byId('playerDribbling').value = player.dribbling;
  byId('playerDefending').value = player.defending;
  byId('playerPhysical').value = player.physical;
  byId('playerStamina').value = player.stamina;
  byId('playerMorale').value = player.morale;
  byId('playerSalary').value = player.salary;
  byId('playerMarket').value = player.market_value;
  byId('playerInjured').checked = Boolean(player.injured);
}

function renderRecentMatches() {
  byId('recentMatches').innerHTML = adminData.recentMatches.length ? `
    <table><thead><tr><th>Ev</th><th>Skor</th><th>Deplasman</th><th>Tarih</th></tr></thead><tbody>
      ${adminData.recentMatches.map((match) => `<tr><td>${match.home_name || '-'}</td><td>${match.home_score}-${match.away_score}</td><td>${match.away_name || '-'}</td><td>${new Date(match.match_date).toLocaleString('tr-TR')}</td></tr>`).join('')}
    </tbody></table>
  ` : '<div class="empty">Henüz maç yok.</div>';
}

function renderPosts() {
  byId('latestPosts').innerHTML = adminData.posts.map((post) => `
    <div class="event ${post.type === 'newspaper' ? 'newspaper' : ''}">
      <strong>${post.author}</strong><br>${post.content}<br><span class="muted">Gün ${post.day}</span>
    </div>
  `).join('');
}

function renderUsers() {
  const target = byId('userManagement');
  if (!target) return;
  target.innerHTML = `
    <table>
      <thead><tr><th>Kullanici</th><th>E-posta</th><th>Takim</th><th>Durum</th><th>Islem</th></tr></thead>
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

function renderTransferControl() {
  const target = byId('transferControl');
  if (!target) return;
  const offers = adminData.pendingTransfers || [];
  const history = adminData.transferHistory || [];
  target.innerHTML = `
    <h3>Bekleyen / son teklifler</h3>
    <table>
      <thead><tr><th>Oyuncu</th><th>Kimden</th><th>Kime</th><th>Durum</th><th>Teklif</th></tr></thead>
      <tbody>
        ${offers.map((offer) => `<tr><td>${offer.player_name}</td><td>${offer.from_team_name || '-'}</td><td>${offer.interested_team_name || '-'}</td><td>${offer.status}</td><td>${money(offer.offer_price)}</td></tr>`).join('') || '<tr><td colspan="5">Bekleyen teklif yok.</td></tr>'}
      </tbody>
    </table>
    <h3>Son transferler</h3>
    <table>
      <thead><tr><th>Oyuncu</th><th>Eski</th><th>Yeni</th><th>Bedel</th></tr></thead>
      <tbody>
        ${history.map((item) => `<tr><td>${item.player_name}</td><td>${item.from_team_name || '-'}</td><td>${item.to_team_name || '-'}</td><td>${money(item.price)}</td></tr>`).join('') || '<tr><td colspan="4">Transfer kaydı yok.</td></tr>'}
      </tbody>
    </table>
  `;
}

async function loadOverview() {
  adminData = await adminRequest('/api/admin/overview');
  renderAdmin();
}

async function bootAdmin() {
  try {
    await api.request('/api/admin/me');
    await loadOverview();
    adminMessage('Admin oturumu acik.');
  } catch {
    byId('adminPanel').hidden = true;
  }
}

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
    adminMessage('Panel acildi.');
  } catch (error) {
    adminMessage(error.message, 'error');
  }
});

byId('clubSelect')?.addEventListener('change', fillClubForm);
byId('teamSelect')?.addEventListener('change', fillTeamForm);
byId('playerSelect')?.addEventListener('change', fillPlayerForm);

byId('gameStateForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    adminData = await adminRequest('/api/admin/game-state', {
      method: 'POST',
      body: {
        current_day: byId('currentDay').value,
        next_match_day: byId('nextMatchDay').value,
        week: byId('week').value
      }
    });
    renderAdmin();
    adminMessage('Oyun tarihi güncellendi.');
  } catch (error) {
    adminMessage(error.message, 'error');
  }
});

byId('clubForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    adminData = await adminRequest(`/api/admin/clubs/${byId('clubSelect').value}`, {
      method: 'POST',
      body: {
        name: byId('clubName').value,
        budget: byId('clubBudget').value,
        fans: byId('clubFans').value,
        stadium_capacity: byId('clubStadium').value,
        currency: byId('clubCurrency').value
      }
    });
    renderAdmin();
    adminMessage('Kulüp güncellendi.');
  } catch (error) {
    adminMessage(error.message, 'error');
  }
});

byId('passwordForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const password = byId('newPassword').value.trim();
    const selectedUser = selectedOptionData('passwordUserSelect', adminData.users);
    const result = await adminRequest(`/api/admin/users/${byId('passwordUserSelect').value}/password`, {
      method: 'POST',
      body: { password }
    });
    byId('newPassword').value = '';
    adminMessage(`${result.message} Yeni şifreyle ${selectedUser?.email || selectedUser?.username || 'hesabın'} üzerinden giriş yap.`);
  } catch (error) {
    adminMessage(error.message, 'error');
  }
});

byId('teamForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    adminData = await adminRequest(`/api/admin/teams/${byId('teamSelect').value}`, {
      method: 'POST',
      body: {
        overall: byId('teamOverall').value,
        attack_overall: byId('teamAttack').value,
        midfield_overall: byId('teamMidfield').value,
        defense_overall: byId('teamDefense').value,
        goalkeeper_overall: byId('teamGoalkeeper').value,
        budget: byId('teamBudget').value,
        fans: byId('teamFans').value,
        default_formation: byId('teamFormation').value
      }
    });
    renderAdmin();
    adminMessage('Takım güçleri güncellendi.');
  } catch (error) {
    adminMessage(error.message, 'error');
  }
});

byId('loadPlayers')?.addEventListener('click', async () => {
  try {
    const teamId = byId('playerTeamSelect').value;
    const query = byId('playerSearch').value.trim();
    loadedPlayers = await adminRequest(`/api/admin/players?teamId=${encodeURIComponent(teamId)}&q=${encodeURIComponent(query)}`);
    byId('playerSelect').innerHTML = loadedPlayers.map((player) => `<option value="${player.id}">${player.name} - ${player.position} - ${player.overall}</option>`).join('');
    fillPlayerForm();
    adminMessage(`${loadedPlayers.length} oyuncu getirildi.`);
  } catch (error) {
    adminMessage(error.message, 'error');
  }
});

byId('playerForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await adminRequest(`/api/admin/players/${byId('playerSelect').value}`, {
      method: 'POST',
      body: {
        overall: byId('playerOverall').value,
        pace: byId('playerPace').value,
        shooting: byId('playerShooting').value,
        passing: byId('playerPassing').value,
        dribbling: byId('playerDribbling').value,
        defending: byId('playerDefending').value,
        physical: byId('playerPhysical').value,
        stamina: byId('playerStamina').value,
        morale: byId('playerMorale').value,
        salary: byId('playerSalary').value,
        market_value: byId('playerMarket').value,
        injured: byId('playerInjured').checked
      }
    });
    byId('loadPlayers').click();
    adminMessage('Oyuncu güncellendi.');
  } catch (error) {
    adminMessage(error.message, 'error');
  }
});

byId('socialForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    adminData = await adminRequest('/api/admin/social', {
      method: 'POST',
      body: {
        type: byId('socialType').value,
        day: byId('socialDay').value,
        author: byId('socialAuthor').value,
        content: byId('socialContent').value
      }
    });
    byId('socialContent').value = '';
    renderAdmin();
    adminMessage('Paylaşım eklendi.');
  } catch (error) {
    adminMessage(error.message, 'error');
  }
});

byId('resetLeague')?.addEventListener('click', async () => {
  if (!window.confirm('Ligi sıfırlamak istediğine emin misin? Maçlar ve puan durumu temizlenecek.')) return;
  try {
    adminData = await adminRequest('/api/admin/league/reset', { method: 'POST', body: {} });
    renderAdmin();
    adminMessage('Lig sıfırlandı.');
  } catch (error) {
    adminMessage(error.message, 'error');
  }
});

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-user-action]');
  if (!button) return;
  const userId = button.dataset.userId;
  const action = button.dataset.userAction;
  const row = document.querySelector(`[data-user-row="${userId}"]`);
  try {
    if (action === 'save') {
      adminData = await adminRequest(`/api/admin/users/${userId}`, {
        method: 'POST',
        body: JSON.stringify({
          username: row.querySelector('[data-user-field="username"]').value,
          email: row.querySelector('[data-user-field="email"]').value,
          is_active: adminData.users.find((user) => Number(user.id) === Number(userId))?.is_active
        })
      });
    } else if (action === 'toggle') {
      adminData = await adminRequest(`/api/admin/users/${userId}/toggle-active`, { method: 'POST', body: JSON.stringify({}) });
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

bootAdmin();

