const fieldNames = ['title','context','need','users','data','constraints','expectedResult','successCriteria','contact','interactionFormat'];
const labels = { users: 'Кто является основным пользователем решения?', data: 'Какие данные или материалы уже доступны?', successCriteria: 'Как будет измеряться успешный результат?', expectedResult: 'Какой результат вы ожидаете получить?', constraints: 'Какие ограничения важно учесть?', context: 'Что происходит сейчас и какую потребность нужно решить?', need: 'Какую проблему необходимо решить?', contact: 'Кто будет контактным лицом?', interactionFormat: 'Какой формат взаимодействия с командой вам подходит?' };
const emptyFields = () => Object.fromEntries(fieldNames.map(key => [key, '']));
export function fallbackAnalysis(draft) {
  const text = draft.trim();
  const fields = emptyFields();
  fields.title = text;
  fields.context = text;
  fields.need = text;
  const missingFields = ['users','data','successCriteria'];
  return { extractedFields: fields, missingFields, questions: missingFields.map((field, i) => ({ id: `q${i+1}`, field, text: labels[field] })), fallbackUsed: true };
}
export async function analyzeDraft(draft, language = 'ru') {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallbackAnalysis(draft);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', input: [
        { role: 'system', content: `Extract only facts explicitly stated in the user's draft. Never infer or invent facts. Return empty strings for missing facts. Write in ${language === 'ru' ? 'Russian' : language}. Ask at least three useful questions for missing fields.` },
        { role: 'user', content: draft },
      ], text: { format: { type: 'json_schema', name: 'task_analysis', strict: true, schema: { type: 'object', additionalProperties: false, properties: {
        extractedFields: { type: 'object', additionalProperties: false, properties: Object.fromEntries(fieldNames.map(k => [k, { type: 'string' }])), required: fieldNames },
        questions: { type: 'array', minItems: 3, items: { type: 'object', additionalProperties: false, properties: { field: { type: 'string', enum: ['users','data','successCriteria','expectedResult','constraints','context','need','contact','interactionFormat'] }, text: { type: 'string' } }, required: ['field','text'] } },
      }, required: ['extractedFields','questions'] } } } }),
    });
    if (!response.ok) throw new Error('OpenAI request failed');
    const payload = await response.json();
    const parsed = JSON.parse(payload.output_text);
    const extractedFields = Object.fromEntries(fieldNames.map(key => [key, typeof parsed.extractedFields?.[key] === 'string' ? parsed.extractedFields[key] : '']));
    const missingFields = Object.keys(labels).filter(key => !extractedFields[key]?.trim());
    const questions = (parsed.questions || []).filter(q => missingFields.includes(q.field)).slice(0, Math.max(3, missingFields.length)).map((q,i) => ({ id:`q${i+1}`, field:q.field, text:q.text }));
    for (const field of missingFields) if (questions.length < 3) questions.push({ id:`q${questions.length+1}`, field, text:labels[field] });
    return { extractedFields, missingFields, questions, fallbackUsed: false };
  } catch { return fallbackAnalysis(draft); }
}
