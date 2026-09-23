export const categories = [
  ['context', 'Контекст и потребность', 20], ['data', 'Данные и материалы', 20],
  ['expectedResult', 'Ожидаемый результат', 15], ['successCriteria', 'Критерии успеха', 15],
  ['constraints', 'Ограничения', 10], ['users', 'Пользователи', 10], ['businessConnection', 'Связь с бизнесом', 10],
];
const missingRecommendations = {
  context: 'Заполните и подтвердите текущую ситуацию и потребность бизнеса (context и need).', data: 'Укажите и подтвердите доступные данные и материалы.',
  expectedResult: 'Опишите и подтвердите ожидаемый результат.', successCriteria: 'Добавьте и подтвердите измеримые критерии успеха.',
  constraints: 'Укажите и подтвердите важные ограничения.', users: 'Назовите и подтвердите пользователей решения.',
  businessConnection: 'Укажите и подтвердите контакт и формат консультаций/обратной связи.',
};
export function scoreTask(fields = {}, confirmedFields = []) {
  const confirmed = new Set(confirmedFields);
  const scoreBreakdown = categories.map(([key, label, max]) => {
    const requiredFields = key === 'businessConnection' ? ['contact', 'interactionFormat']
      : key === 'context' ? ['context', 'need'] : [key];
    const isConfirmed = requiredFields.every(field => confirmed.has(field));
    const isFilled = requiredFields.every(field => typeof fields[field] === 'string' && fields[field].trim());
    const earned = isConfirmed && isFilled ? max : 0;
    return { key, label, earned, max, confirmed: Boolean(isConfirmed), recommendation: earned ? null : missingRecommendations[key] };
  });
  const score = scoreBreakdown.reduce((sum, row) => sum + row.earned, 0);
  const level = score < 40 ? 'draft' : score < 70 ? 'working' : score < 90 ? 'ready' : 'priority';
  return { score, level, scoreBreakdown, missingFields: scoreBreakdown.filter(row => row.earned === 0).map(row => row.key) };
}
