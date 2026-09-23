export const taskFieldNames = Object.freeze([
  'title', 'context', 'need', 'users', 'data', 'constraints',
  'expectedResult', 'successCriteria', 'contact', 'interactionFormat',
]);
export const taskThemes = Object.freeze(['operations', 'hr', 'finance', 'education', 'sustainability']);
export const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const isFilled = value => typeof value === 'string' && value.trim().length > 0;
