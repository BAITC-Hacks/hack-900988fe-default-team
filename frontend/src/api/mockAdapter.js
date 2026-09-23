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
  ['constraints', 'Ограничения', 10], ['users', 'Пользователи', 10], ['businessConnection', 'Связь с бизнесом', 10],
];

const catalogSeeds = [
  {
    id: 'task_canteen', status: 'published', theme: 'operations',
    fields: { ...baseFields, users: 'Сотрудники офиса', data: 'История проходов и продажи по часам', expectedResult: 'Прогноз нагрузки и рекомендации по расписанию', successCriteria: 'Сократить среднее ожидание на 25%', constraints: 'Без камер и персональных данных', contact: 'innovation@example.com', interactionFormat: 'Еженедельные созвоны' },
  },
  {
    id: 'task_energy', status: 'published', theme: 'sustainability',
    fields: { title: 'Снижение энергопотребления кампуса', context: 'Корпуса потребляют больше энергии в вечерние часы.', need: 'Найти сценарии экономии без ухудшения комфорта.', users: 'Администрация кампуса', data: 'Почасовые показания счётчиков', expectedResult: 'Дашборд и набор рекомендаций', successCriteria: 'Снизить расход на 10%', constraints: 'Только обезличенные данные', contact: '', interactionFormat: '' },
  },
  {
    id: 'task_service', status: 'published', theme: 'hr',
    fields: { title: 'Навигатор обращений клиентов', context: 'Повторяющиеся обращения долго распределяются между отделами.', need: 'Ускорить первичную обработку обращений.', users: 'Операторы поддержки', data: 'Архив обезличенных обращений', expectedResult: 'Прототип классификатора тем', successCriteria: 'Точность маршрутизации 80%', constraints: '', contact: '', interactionFormat: '' },
  },
  {
    id: 'task_logistics', status: 'published', theme: 'finance',
    fields: { title: 'Планирование доставки для малого бизнеса', context: 'Курьеры строят маршруты вручную.', need: 'Сократить лишний пробег.', users: 'Диспетчеры и курьеры', data: '', expectedResult: 'Прототип оптимизатора маршрута', successCriteria: '', constraints: 'Работа в пределах одного города', contact: '', interactionFormat: '' },
  },
  {
    id: 'task_education', status: 'published', theme: 'education',
    fields: { title: 'Понятный путь первокурсника', context: 'Новым студентам сложно найти нужные сервисы.', need: 'Собрать частые вопросы в одном интерфейсе.', users: 'Первокурсники', data: '', expectedResult: '', successCriteria: '', constraints: '', contact: '', interactionFormat: '' },
  },
].map((task, index) => ({
  ...task,
  confirmedFields: Object.keys(task.fields).filter((key) => task.fields[key]),
  ...calculateScore(task.fields, Object.keys(task.fields).filter((key) => task.fields[key])),
  createdAt: `2026-09-${18 + index}T09:00:00.000Z`,
  updatedAt: `2026-09-${18 + index}T09:00:00.000Z`,
}));

let tasks = [...catalogSeeds];
let proposals = [];
const teams = [
  { id: 'team_1', name: 'Data Nomads', university: 'КазНУ', interests: ['AI', 'логистика'], skills: ['аналитика', 'UX'], technologies: ['Python', 'React'] },
  { id: 'team_2', name: 'Green Byte', university: 'Satbayev University', interests: ['экология', 'IoT'], skills: ['данные', 'прототипирование'], technologies: ['Python', 'Figma'] },
  { id: 'team_3', name: 'People First', university: 'KBTU', interests: ['HR', 'сервис'], skills: ['исследования', 'frontend'], technologies: ['TypeScript', 'React'] },
  { id: 'team_4', name: 'FinFlow', university: 'Maqsut Narikbayev University', interests: ['финансы', 'автоматизация'], skills: ['backend', 'аналитика'], technologies: ['Node.js', 'PostgreSQL'] },
  { id: 'team_5', name: 'Edu Makers', university: 'AITU', interests: ['образование', 'AI'], skills: ['UX', 'ML'], technologies: ['Python', 'React'] },
];

export function calculateScore(fields, confirmedFields = []) {
  const confirmed = new Set(confirmedFields);
  const scoreBreakdown = fieldMeta.map(([key, label, max]) => {
    const businessConnection = key === 'businessConnection';
    const contextAndNeed = key === 'context';
    const requiredFields = businessConnection ? ['contact', 'interactionFormat'] : contextAndNeed ? ['context', 'need'] : [key];
    const isConfirmed = requiredFields.every((field) => confirmed.has(field));
    const earned = isConfirmed && requiredFields.every((field) => fields[field]?.trim()) ? max : 0;
    return { key, label, max, earned, confirmed: isConfirmed, recommendation: earned ? null : businessConnection ? 'Укажите и подтвердите контакт и формат консультаций/обратной связи' : contextAndNeed ? 'Заполните и подтвердите контекст и потребность бизнеса' : `Добавьте и подтвердите поле «${label}»` };
  });
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
    return wait({ fields, confirmedFields: [], ...calculateScore(fields), missingFields: fieldMeta.filter(([key]) => key === 'businessConnection' ? !fields.contact?.trim() || !fields.interactionFormat?.trim() : !fields[key]?.trim()).map(([key]) => key) });
  },
  async createTask({ fields, confirmedFields, theme = null }) {
    const task = { id: `task_${Date.now()}`, status: 'draft', theme, fields, confirmedFields, ...calculateScore(fields, confirmedFields), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    tasks = [task, ...tasks];
    return wait(task);
  },
  async updateTask(taskId, { fields, confirmedFields, theme }) {
    const existing = tasks.find((item) => item.id === taskId);
    if (!existing) throw new Error('TASK_NOT_FOUND');
    const task = { ...existing, fields: { ...existing.fields, ...fields }, confirmedFields, theme: theme ?? existing.theme, ...calculateScore({ ...existing.fields, ...fields }, confirmedFields), updatedAt: new Date().toISOString() };
    tasks = tasks.map((item) => item.id === taskId ? task : item);
    return wait(task);
  },
  async publish(task) {
    const published = { ...task, status: 'published', updatedAt: new Date().toISOString() };
    tasks = tasks.map((item) => item.id === published.id ? published : item);
    return wait(published);
  },
  async listTasks({ theme = '', level = '', sort = 'score_desc' } = {}) {
    let result = tasks.filter((task) => task.status === 'published');
    if (theme) result = result.filter((task) => task.theme === theme);
    if (level) result = result.filter((task) => task.level === level);
    if (sort === 'score_asc') result.sort((a, b) => a.score - b.score);
    else result.sort((a, b) => b.score - a.score);
    return wait(result.map((task) => ({ ...task, fields: { ...task.fields } })));
  },
  async getTask(taskId) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) throw new Error('TASK_NOT_FOUND');
    return wait({ ...task, fields: { ...task.fields } });
  },
  async listTeams() { return wait(teams.map((team) => ({ ...team, interests: [...team.interests], skills: [...team.skills], technologies: [...team.technologies] }))); },
  async createProposal({ taskId, ...payload }) {
    const proposal = { id: `proposal_${Date.now()}`, taskId, status: 'pending', ...payload };
    proposals = [proposal, ...proposals];
    return wait(proposal);
  },
  async getProposals(taskId) { return wait(proposals.filter((proposal) => proposal.taskId === taskId)); },
  async setProposalStatus(proposal, status) {
    const updated = { ...proposal, status };
    proposals = proposals.map((item) => item.id === updated.id ? updated : item);
    return wait(updated);
  },
};
