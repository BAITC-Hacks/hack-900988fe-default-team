export const categories = [
  ['context', 'Контекст и потребность', 20], ['data', 'Данные и материалы', 20],
  ['expectedResult', 'Ожидаемый результат', 15], ['successCriteria', 'Критерии успеха', 15],
  ['constraints', 'Ограничения', 10], ['users', 'Пользователи', 10], ['businessLink', 'Связь с бизнесом', 10],
];
const missingRecommendations = {
  context: 'Опишите текущую ситуацию и потребность.', data: 'Укажите доступные данные и материалы.',
  expectedResult: 'Опишите ожидаемый результат.', successCriteria: 'Добавьте измеримые критерии успеха.',
  constraints: 'Укажите важные ограничения.', users: 'Назовите пользователей решения.', businessLink: 'Объясните связь задачи с бизнесом.',
};
export function scoreTask(fields = {}, confirmedFields = []) {
  const confirmed = new Set(confirmedFields);
  const scoreBreakdown = categories.map(([key, label, max]) => {
    const earned = confirmed.has(key) && typeof fields[key] === 'string' && fields[key].trim() ? max : 0;
    return { key, label, earned, max, confirmed: confirmed.has(key), recommendation: earned ? null : missingRecommendations[key] };
  });
  const score = scoreBreakdown.reduce((sum, row) => sum + row.earned, 0);
  const level = score < 40 ? 'draft' : score < 70 ? 'working' : score < 90 ? 'ready' : 'priority';
  return { score, level, scoreBreakdown, missingFields: scoreBreakdown.filter(row => row.earned === 0).map(row => row.key) };
}
