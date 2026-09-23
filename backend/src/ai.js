import { llmConfig, requestStructuredAnalysis } from './llm.js';
const fieldNames = ['title','context','need','users','data','constraints','expectedResult','successCriteria','contact','interactionFormat'];
const labels = { users: 'Кто является основным пользователем решения?', data: 'Какие данные или материалы уже доступны?', successCriteria: 'Как будет измеряться успешный результат?', expectedResult: 'Какой результат вы ожидаете получить?', constraints: 'Какие ограничения важно учесть?', context: 'Что происходит сейчас и какую потребность нужно решить?', need: 'Какую проблему необходимо решить?', contact: 'Кто будет контактным лицом?', interactionFormat: 'Какой формат взаимодействия с командой вам подходит?' };
const emptyFields = () => Object.fromEntries(fieldNames.map(key => [key, '']));
function buildQuestions(extractedFields, candidates = []) {
  const missingFields = Object.keys(labels).filter(key => !extractedFields[key].trim());
  const questions = [];
  const usedFields = new Set();
  const usedTexts = new Set();
  const add = (field, text) => {
    const normalizedText = text.trim();
    if (!normalizedText || usedFields.has(field) || usedTexts.has(normalizedText)) return;
    usedFields.add(field);
    usedTexts.add(normalizedText);
    questions.push({ id: `q${questions.length + 1}`, field, text: normalizedText });
  };
  for (const question of candidates) {
    if (question && missingFields.includes(question.field) && typeof question.text === 'string') add(question.field, question.text);
  }
  for (const field of missingFields) {
    if (questions.length >= 3) break;
    add(field, labels[field]);
  }
  // A complete draft still needs human clarification, without inventing missing facts.
  for (const field of Object.keys(labels)) {
    if (questions.length >= 3) break;
    if (!missingFields.includes(field)) add(field, `Уточните или подтвердите сведения: ${labels[field]}`);
  }
  return { missingFields, questions };
}
function parseAnalysis(text) {
  const parsed = JSON.parse(text);
  if (!parsed || !parsed.extractedFields || Array.isArray(parsed.extractedFields)
      || !fieldNames.every(key => typeof parsed.extractedFields[key] === 'string')
      || !Array.isArray(parsed.questions)) throw new Error('Invalid analysis');
  return parsed;
}
const normalize = (value) => value.toLocaleLowerCase().replace(/[\p{P}\p{S}\s]+/gu, ' ').trim();
const fieldEvidence = {
  context: (text) => !/(нужно|требует|необходим|данн|чек|ожидаем|результат|прототип|успех|огранич|нельзя|связь с бизнесом)/.test(text),
  need: (text) => /(нужно|требует|необходим|цель|проблем)/.test(text) && !/(данн|чек|ожидаем|результат|прототип|связь с бизнесом)/.test(text),
  users: (text) => /(пользовател|сотрудник|клиент|посетител|студент)/.test(text),
  data: (text) => /(данн|csv|чек|таблиц|отч[её]т|метрик)/.test(text) && !/(ожидаем|результат|прототип)/.test(text),
  constraints: (text) => /(огранич|нельзя|только|без |бюджет|срок)/.test(text),
  expectedResult: (text) => /(ожидаем|результат|прототип|mvp|решени)/.test(text) && !/(данн|чек)/.test(text),
  successCriteria: (text) => /(успех|критер|измер|процент|сократ)/.test(text),
  contact: (text) => /(контакт|менеджер|ответствен|телефон|почт|@)/.test(text),
  interactionFormat: (text) => /(взаимодейств|встреч|демонстрац|созвон|формат)/.test(text),
};
export function sourceSupported(value, draft) {
  const candidate = normalize(value);
  return candidate.length >= 3 && normalize(draft).includes(candidate);
}
export function sanitizeExtractedFields(rawFields, draft) {
  return Object.fromEntries(fieldNames.map((key) => {
    const value = typeof rawFields?.[key] === 'string' ? rawFields[key].trim() : '';
    const evidence = fieldEvidence[key];
    return [key, sourceSupported(value, draft) && (!evidence || evidence(normalize(value))) ? value : ''];
  }));
}
export function fallbackAnalysis(draft) {
  const text = draft.trim();
  const fields = emptyFields();
  fields.title = text;
  fields.context = text;
  fields.need = text;
  return { extractedFields: fields, ...buildQuestions(fields), fallbackUsed: true };
}
const analysisSchema = { type: 'object', additionalProperties: false, properties: {
        extractedFields: { type: 'object', additionalProperties: false, properties: Object.fromEntries(fieldNames.map(k => [k, { type: 'string' }])), required: fieldNames },
        questions: { type: 'array', minItems: 3, items: { type: 'object', additionalProperties: false, properties: { field: { type: 'string', enum: ['users','data','successCriteria','expectedResult','constraints','context','need','contact','interactionFormat'] }, text: { type: 'string' } }, required: ['field','text'] } },
      }, required: ['extractedFields','questions'] };
export async function analyzeDraft(draft, language = 'ru') {
  try {
    const config = llmConfig();
    if (!config) return fallbackAnalysis(draft);
    const messages = [
      { role: 'system', content: `Extract only facts explicitly stated in the user's draft. Copy field values as exact excerpts from the draft; never paraphrase, infer, or invent facts. Map each excerpt to its matching field: context is the current situation; need is the problem or goal; data is available data/materials; expectedResult is the requested deliverable; successCriteria is how success is measured; constraints are restrictions; users are people who use the solution; contact is a named communication contact; interactionFormat is the collaboration cadence. Never put an excerpt in a different field. Return empty strings for missing facts. Write questions in ${language === 'ru' ? 'Russian' : language}. Ask at least three useful questions for missing fields. Return only JSON matching the supplied schema.` },
      { role: 'user', content: draft },
    ];
    const parsed = parseAnalysis(await requestStructuredAnalysis(config, messages, analysisSchema));
    const extractedFields = sanitizeExtractedFields(parsed.extractedFields, draft);
    return { extractedFields, ...buildQuestions(extractedFields, parsed.questions), fallbackUsed: false };
  } catch { return fallbackAnalysis(draft); }
}
