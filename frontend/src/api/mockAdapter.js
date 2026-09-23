const wait = (value) => new Promise((resolve) => setTimeout(() => resolve(value), 350));

const questions = [
  { id: 'q1', field: 'users', text: 'Кто станет основным пользователем решения?' },
  { id: 'q2', field: 'data', text: 'Какие данные об очередях уже доступны?' },
  { id: 'q3', field: 'successCriteria', text: 'Как измерить успешное сокращение очередей?' },
];

const baseFields = {
  title: 'Сокращение очередей в корпоративной столовой',
  context: 'В корпоративной столовой в часы пик возникают очереди.',
  need: 'Сократить время ожидания сотрудников.',
  users: '', data: '', constraints: '', expectedResult: '', successCriteria: '', contact: '', interactionFormat: '',
};

const fieldMeta = [
  ['context', 'Контекст и потребность', 20], ['data', 'Данные и материалы', 20],
  ['expectedResult', 'Ожидаемый результат', 15], ['successCriteria', 'Критерии успеха', 15],
  ['constraints', 'Ограничения', 10], ['users', 'Пользователи', 10], ['need', 'Связь с бизнесом', 10],
];

export function calculateScore(fields) {
  const scoreBreakdown = fieldMeta.map(([key, label, max]) => ({ key, label, max, earned: fields[key]?.trim() ? max : 0, confirmed: false, recommendation: fields[key]?.trim() ? null : `Добавьте поле «${label}»` }));
  const score = scoreBreakdown.reduce((sum, item) => sum + item.earned, 0);
  return { score, level: score < 40 ? 'draft' : score < 70 ? 'working' : score < 90 ? 'ready' : 'priority', scoreBreakdown };
}

export const mockAdapter = {
  async analyze(draft) {
    return wait({ analysisId: 'analysis_demo', extractedFields: { ...baseFields, context: draft || baseFields.context }, missingFields: ['users', 'data', 'successCriteria'], questions, fallbackUsed: true });
  },
  async compose({ draft, answers, currentFields }) {
    const fields = { ...baseFields, ...currentFields, context: currentFields.context || draft };
    answers.forEach(({ field, answer }) => { fields[field] = answer; });
    return wait({ fields, ...calculateScore(fields), missingFields: fieldMeta.filter(([key]) => !fields[key]?.trim()).map(([key]) => key) });
  },
  async createTask({ fields, confirmedFields }) {
    return wait({ id: `task_${Date.now()}`, status: 'draft', fields, confirmedFields, ...calculateScore(fields), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  },
  async publish(task) { return wait({ ...task, status: 'published', updatedAt: new Date().toISOString() }); },
  async createProposal(payload) { return wait({ id: `proposal_${Date.now()}`, status: 'pending', ...payload }); },
  async setProposalStatus(proposal, status) { return wait({ ...proposal, status }); },
};
