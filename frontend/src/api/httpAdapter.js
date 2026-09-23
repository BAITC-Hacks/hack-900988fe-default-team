function withApiPrefix(baseUrl) {
  return baseUrl.replace(/\/$/, '').replace(/\/api$/, '') + '/api';
}

function createHttpError(response, payload) {
  const error = new Error(payload?.error?.message || `HTTP ${response.status}`);
  error.code = payload?.error?.code;
  error.status = response.status;
  return error;
}

export function createHttpAdapter(baseUrl) {
  const apiUrl = withApiPrefix(baseUrl);

  async function request(path, options = {}) {
    const response = await fetch(`${apiUrl}${path}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw createHttpError(response, payload);
    return payload;
  }

  return {
    analyze(draft) {
      return request('/task-drafts/analyze', { method: 'POST', body: JSON.stringify({ draft, language: 'ru' }) });
    },
    compose({ analysisId, draft, answers, currentFields }) {
      return request('/task-drafts/compose', { method: 'POST', body: JSON.stringify({ analysisId, draft, answers, currentFields }) });
    },
    createTask({ fields, confirmedFields, theme }) {
      return request('/tasks', { method: 'POST', body: JSON.stringify({ fields, confirmedFields, theme }) });
    },
    updateTask(taskId, { fields, confirmedFields, theme }) {
      return request(`/tasks/${encodeURIComponent(taskId)}`, { method: 'PATCH', body: JSON.stringify({ fields, confirmedFields, theme }) });
    },
    publish(task) {
      if (!task?.id) throw new Error('Сначала сохраните карточку как черновик.');
      return request(`/tasks/${encodeURIComponent(task.id)}/publish`, { method: 'POST' });
    },
    listTasks({ theme = '', level = '', sort = 'score_desc' } = {}) {
      const query = new URLSearchParams({ sort });
      if (theme) query.set('theme', theme);
      if (level) query.set('level', level);
      return request(`/tasks?${query}`);
    },
    getTask(taskId) {
      return request(`/tasks/${encodeURIComponent(taskId)}`);
    },
    listTeams() {
      return request('/teams');
    },
    createProposal({ taskId, ...payload }) {
      return request(`/tasks/${encodeURIComponent(taskId)}/proposals`, { method: 'POST', body: JSON.stringify(payload) });
    },
    getProposals(taskId) {
      return request(`/tasks/${encodeURIComponent(taskId)}/proposals`);
    },
    setProposalStatus(proposal, status) {
      return request(`/proposals/${encodeURIComponent(proposal.id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    },
  };
}
