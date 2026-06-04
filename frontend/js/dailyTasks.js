let taskData = null;

function rewardText(task) {
  return task.reward_type === 'xp' ? `+${task.reward_amount} XP` : `+${task.reward_amount} TactiCoins`;
}

function renderTasks() {
  byId('dailyTaskList').innerHTML = (taskData.tasks || []).map((task) => {
    const progress = Math.min(Number(task.progress || 0), Number(task.target || 1));
    const done = progress >= Number(task.target || 1);
    return `
      <article class="transfer-card task-card ${done ? 'done' : ''}">
        <span class="message-category">${task.category}</span>
        <h2>${task.title}</h2>
        <p>${task.description}</p>
        <div class="task-progress"><span style="width:${Math.round((progress / Number(task.target || 1)) * 100)}%"></span></div>
        <strong>${progress}/${task.target} - ${rewardText(task)}</strong>
        <button class="btn ${done && !task.claimed ? 'green' : 'secondary'}" data-claim="${task.task_key}" ${done && !task.claimed ? '' : 'disabled'} type="button">
          ${task.claimed ? 'Alındı' : done ? 'Ödülü Al' : 'Devam ediyor'}
        </button>
      </article>
    `;
  }).join('');
}

async function loadTasks() {
  wireShell('daily-tasks');
  await requireAuth();
  taskData = await api.request('/api/daily-tasks');
  renderTasks();
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-claim]');
  if (!button) return;
  try {
    taskData = await api.request('/api/daily-tasks/claim', {
      method: 'POST',
      body: JSON.stringify({ taskKey: button.dataset.claim })
    });
    setMessage('Ödül alındı.');
    renderTasks();
    window.refreshCoinWidget?.();
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

loadTasks().catch((error) => setMessage(error.message, 'error'));
