export const categories = [
  ['context', 'Контекст и потребность', 20], ['data', 'Данные и материалы', 20],
  ['expectedResult', 'Ожидаемый результат', 15], ['successCriteria', 'Критерии успеха', 15],
  ['constraints', 'Ограничения', 10], ['users', 'Пользователи', 10], ['businessConnection', 'Связь с бизнесом', 10],
];
const missingRecommendations = {
  context: 'Опишите текущую ситуацию и потребность.', data: 'Укажите доступные данные и материалы.',
  expectedResult: 'Опишите ожидаемый результат.', successCriteria: 'Добавьте измеримые критерии успеха.',
  constraints: 'Укажите важные ограничения.', users: 'Назовите пользователей решения.',
  businessConnection: 'Укажите контакт и формат консультаций/обратной связи.',
};
export function scoreTask(fields = {}, confirmedFields = []) {
  const confirmed = new Set(confirmedFields);
  const scoreBreakdown = categories.map(([key, label, max]) => {
    const businessConnection = key === 'businessConnection';
    const isConfirmed = businessConnection
      ? confirmed.has('contact') && confirmed.has('interactionFormat')
      : confirmed.has(key);
    const isFilled = businessConnection
      ? typeof fields.contact === 'string' && fields.contact.trim() && typeof fields.interactionFormat === 'string' && fields.interactionFormat.trim()
      : typeof fields[key] === 'string' && fields[key].trim();
    const earned = isConfirmed && isFilled ? max : 0;
    return { key, label, earned, max, confirmed: Boolean(isConfirmed), recommendation: earned ? null : missingRecommendations[key] };
  });
  const score = scoreBreakdown.reduce((sum, row) => sum + row.earned, 0);
  const level = score < 40 ? 'draft' : score < 70 ? 'working' : score < 90 ? 'ready' : 'priority';
  return { score, level, scoreBreakdown, missingFields: scoreBreakdown.filter(row => row.earned === 0).map(row => row.key) };
}
