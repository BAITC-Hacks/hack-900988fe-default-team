import { llmConfig, requestStructuredAnalysis } from './llm.js';
const fieldNames = ['title','context','need','users','data','constraints','expectedResult','successCriteria','contact','interactionFormat'];
const labels = { users: 'Кто является основным пользователем решения?', data: 'Какие данные или материалы уже доступны?', successCriteria: 'Как будет измеряться успешный результат?', expectedResult: 'Какой результат вы ожидаете получить?', constraints: 'Какие ограничения важно учесть?', context: 'Что происходит сейчас и какую потребность нужно решить?', need: 'Какую проблему необходимо решить?', contact: 'Кто будет контактным лицом и как с ним связаться?', interactionFormat: 'Как будут проходить консультации и в какие сроки бизнес даст обратную связь по промежуточному результату?' };
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
    // Preserve AI's choice of gaps, but use neutral wording: a model question can
    // otherwise smuggle invented numbers, systems or agreements into its premise.
    if (question && missingFields.includes(question.field) && typeof question.text === 'string' && question.text.trim()) add(question.field, labels[question.field]);
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
// Keep punctuation: removing it can change emails, signs and decimal values.
const normalize = (value) => value.toLocaleLowerCase().replace(/\s+/gu, ' ').trim();
// Reject explicit category mismatches, without requiring a keyword in every fact.
// Unlabelled excerpts still rely on the model's mapping and human confirmation.
const fieldMarkers = [
  ['expectedResult', /^(?:ожидаем\S* результат|результат\s*[:—-]|(?:веб[- ]?)?прототип|mvp\b)/u],
  ['successCriteria', /^(?:успех|критери\S* успех|успешност)/u],
  ['constraints', /^(?:ограничени|нельзя|бюджет\s*[:—-])/u],
  ['data', /^(?:доступны\s+(?:обезличенные\s+)?(?:данные|csv|таблицы|отч[её]ты)|данные(?=\s|$|[:—-])|материалы\s*[:—-])/u],
  ['need', /^(?:нужно|хотим|необходимо|требуется|цель\s*[:—-]|потребность\s*[:—-])/u],
  ['contact', /^(?:контакт|ответственн|телефон\s*[:—-]|почта\s*[:—-])/u],
  ['interactionFormat', /^(?:формат\s*[:—-]|формат взаимодействия|формат консультаций)/u],
  ['users', /^(?:пользователи\s*[:—-])/u],
  ['context', /^(?:контекст\s*[:—-])/u],
];
export function sourceSupported(value, draft) {
  const candidate = normalize(value);
  if (!candidate) return false;
  const source = normalize(draft);
  for (let start = source.indexOf(candidate); start !== -1; start = source.indexOf(candidate, start + 1)) {
    const end = start + candidate.length;
    const word = /[\p{L}\p{N}_]/u;
    if (word.test(candidate[0]) && start > 0 && word.test(source[start - 1])) continue;
    if (word.test(candidate.at(-1)) && end < source.length && word.test(source[end])) continue;
    // A quote must not turn "не используем SAP" into "используем SAP".
    const prefix = source.slice(0, start).split(/[.!?;:]/u).at(-1);
    if (/(?:^|\s)(?:не|нет|без|нельзя|not|no|without)(?:\s|$)/u.test(prefix)) continue;
    return true;
  }
  return false;
}
export function sanitizeExtractedFields(rawFields, draft) {
  return Object.fromEntries(fieldNames.map((key) => {
    const value = typeof rawFields?.[key] === 'string' ? rawFields[key].trim() : '';
    const markedField = fieldMarkers.find(([, pattern]) => pattern.test(normalize(value)))?.[0];
    return [key, sourceSupported(value, draft) && (key === 'title' || !markedField || markedField === key) ? value : ''];
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
