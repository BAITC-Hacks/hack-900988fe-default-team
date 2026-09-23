import test from 'node:test';
import assert from 'node:assert/strict';
// Isolate legacy-provider tests from the developer's LLM configuration.
delete process.env.LLM_BASE_URL;
import { analyzeDraft, fallbackAnalysis, sanitizeExtractedFields, sourceSupported } from '../src/ai.js';

const draftText = 'Очередь в столовой';
const fieldKeys = ['title', 'context', 'need', 'users', 'data', 'constraints', 'expectedResult', 'successCriteria', 'contact', 'interactionFormat'];
const analysisFields = () => Object.fromEntries(fieldKeys.map(key => [key, key === 'context' ? draftText : '']));
const restResponse = (analysis) => ({ status: 'completed', output: [
  { type: 'reasoning', summary: [] },
  { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(analysis) }] },
] });

function mockProvider(t, handler) {
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';
  t.mock.method(globalThis, 'fetch', handler);
  t.after(() => {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  });
}

test('fallback preserves draft as title and asks at least three targeted questions', () => {
  const result = fallbackAnalysis('  Хотим улучшить процесс доставки.  ');
  assert.equal(result.extractedFields.title, 'Хотим улучшить процесс доставки.');
  assert.equal(result.extractedFields.context, 'Хотим улучшить процесс доставки.');
  assert.equal(result.questions.length >= 3, true);
  assert.equal(result.fallbackUsed, true);
});

test('AI-extracted field must be explicitly supported by the draft', () => {
  const draft = 'В столовой в часы пик образуются очереди. Доступны данные кассовых чеков.';
  const fields = sanitizeExtractedFields({ context: 'В столовой в часы пик образуются очереди', data: 'Данные кассовых чеков', expectedResult: 'Сократить ожидание на 20%' }, draft);
  assert.equal(fields.context, 'В столовой в часы пик образуются очереди');
  assert.equal(fields.data, 'Данные кассовых чеков');
  assert.equal(fields.expectedResult, '');
});

test('misclassified source excerpts are cleared instead of entering a wrong field', () => {
  const draft = 'Нужно сократить среднее время ожидания. Доступны данные кассовых чеков. Ожидаемый результат — веб-прототип.';
  const fields = sanitizeExtractedFields({
    context: 'Нужно сократить среднее время ожидания', need: 'Доступны данные кассовых чеков',
    data: 'Ожидаемый результат — веб-прототип', expectedResult: 'Ожидаемый результат — веб-прототип',
  }, draft);
  assert.equal(fields.context, '');
  assert.equal(fields.need, '');
  assert.equal(fields.data, '');
  assert.equal(fields.expectedResult, 'Ожидаемый результат — веб-прототип');
});

test('valid source excerpts survive without mandatory keywords', () => {
  const fields = {
    need: 'Хотим сократить очереди', expectedResult: 'Прототип анализа данных',
    contact: 'demo@example.com', users: 'Кассиры', data: 'Обезличенные чеки за месяц',
    context: 'Сотрудники вручную сверяют данные', constraints: 'Две недели',
    interactionFormat: 'Комментарии к промежуточному демо в течение двух рабочих дней',
    successCriteria: 'Среднее ожидание менее пяти минут',
  };
  const result = sanitizeExtractedFields(fields, Object.values(fields).join('. '));
  for (const [key, value] of Object.entries(fields)) assert.equal(result[key], value, key);
});

test('grounding preserves punctuation in amounts and contacts', () => {
  const fields = sanitizeExtractedFields({ contact: 'demo+other@example.com', constraints: 'Бюджет 1,000' }, 'demo-other@example.com. Бюджет 1.000');
  assert.equal(fields.contact, '');
  assert.equal(fields.constraints, '');
});

test('source matching does not extract part of a number or drop preceding negation', () => {
  assert.equal(sourceSupported('20', 'Бюджет 120'), false);
  assert.equal(sourceSupported('используем SAP', 'Мы не используем SAP'), false);
  assert.equal(sourceSupported('Нужен прототип', 'Не нужен прототип'), false);
  assert.equal(sourceSupported('не используем SAP', 'Мы не используем SAP'), true);
  assert.equal(sourceSupported('QA', 'Пользователи: QA'), true);
  assert.equal(sourceSupported('Прототип анализа данных', 'Без персональных данных. Прототип анализа данных'), true);
});

test('valid detailed AI output retains facts and still asks three questions', async t => {
  const fields = { ...analysisFields(), need: 'Хотим сократить очереди', expectedResult: 'Прототип анализа данных', contact: 'demo@example.com' };
  mockProvider(t, async () => ({ ok: true, json: async () => restResponse({ extractedFields: fields, questions: [] }) }));
  const result = await analyzeDraft(Object.values(fields).filter(Boolean).join('. '));
  assert.equal(result.fallbackUsed, false);
  assert.deepEqual(result.extractedFields, fields);
  assert.equal(result.questions.length, 3);
  assert.ok(result.questions.every(question => !['need', 'expectedResult', 'contact'].includes(question.field)));
});

test('Structured Output response is verified against the draft', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  let requestBody;
  process.env.OPENAI_API_KEY = 'test-key';
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => restResponse({
        extractedFields: { title: 'Очередь в столовой', context: 'Очередь в столовой', need: '', users: '', data: '', constraints: '', expectedResult: 'Сократить ожидание на 20%', successCriteria: '', contact: '', interactionFormat: '' },
        questions: [{ field: 'users', text: 'Кто будет пользоваться решением?' }, { field: 'data', text: 'Какие данные доступны?' }, { field: 'successCriteria', text: 'Как измерить результат?' }],
      }),
    };
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  });

  const result = await analyzeDraft('Очередь в столовой', 'ru');
  assert.equal(requestBody.text.format.type, 'json_schema');
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.extractedFields.context, 'Очередь в столовой');
  assert.equal(result.extractedFields.expectedResult, '');
  assert.equal(result.questions.length, 3);
});

test('questions are nonempty and unique after repairing malformed model questions', async (t) => {
  mockProvider(t, async () => ({ ok: true, json: async () => restResponse({
    extractedFields: analysisFields(),
    questions: [null, { field: 'users', text: 'Кто пользователь?' }, { field: 'users', text: 'Повтор?' },
      { field: 'data', text: '   ' }, { field: 'data', text: 12 }, { field: 'unknown', text: 'Что?' }],
  }) }));
  const result = await analyzeDraft(draftText);
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.questions.length, 3);
  assert.equal(new Set(result.questions.map(q => q.field)).size, 3);
  assert.deepEqual(result.questions.map(q => q.id), ['q1', 'q2', 'q3']);
  assert.ok(result.questions.every(q => q.text.trim() && result.missingFields.includes(q.field)));
});

test('model questions cannot add invented premises', async t => {
  mockProvider(t, async () => ({ ok: true, json: async () => restResponse({
    extractedFields: analysisFields(), questions: [
      { field: 'users', text: 'Как ваши 500 сотрудников используют SAP?' },
      { field: 'data', text: 'Когда предоставите обещанный доступ к банковским счетам?' },
      { field: 'successCriteria', text: 'Как подтвердите уже согласованную экономию 40 процентов?' },
    ],
  }) }));
  const result = await analyzeDraft(draftText);
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.questions.length, 3);
  assert.ok(!JSON.stringify(result.questions).match(/500|SAP|банковск|40|согласован/));
  assert.deepEqual(result.questions.map(question => question.field), ['users', 'data', 'successCriteria']);
});

for (const missingCount of [0, 1, 2]) {
  test(`a detailed draft with ${missingCount} missing fields still receives three clarifications`, async (t) => {
    const fields = {
      title: 'Очередь в столовой', context: 'В столовой образуется очередь', need: 'Нужно сократить ожидание',
      users: 'Сотрудники офиса', data: 'Доступны данные чеков', constraints: 'Нельзя использовать персональные данные',
      expectedResult: 'Ожидаемый результат — прототип', successCriteria: 'Успех измеряется сокращением на 20 процентов',
      contact: 'Контакт: менеджер Алия', interactionFormat: 'Формат: еженедельные демонстрации',
    };
    for (const key of ['users', 'data'].slice(0, missingCount)) fields[key] = '';
    const detailedDraft = Object.values(fields).filter(Boolean).join('. ');
    mockProvider(t, async () => ({ ok: true, json: async () => restResponse({ extractedFields: fields, questions: [] }) }));
    const result = await analyzeDraft(detailedDraft);
    assert.equal(result.fallbackUsed, false);
    assert.equal(result.questions.length, 3);
    assert.equal(new Set(result.questions.map(q => q.field)).size, 3);
    assert.equal(result.missingFields.length, missingCount);
    assert.deepEqual(result.extractedFields, fields);
  });
}

const failures = {
  'HTTP failure': async () => ({ ok: false }),
  'network timeout': async () => { throw new DOMException('Timed out', 'TimeoutError'); },
  'incomplete response': async () => ({ ok: true, json: async () => ({ ...restResponse({ extractedFields: analysisFields(), questions: [] }), status: 'incomplete' }) }),
  'refusal': async () => ({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'Cannot comply' }] }] }) }),
  'invalid JSON': async () => ({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '{' }] }] }) }),
  'invalid schema': async () => ({ ok: true, json: async () => restResponse({ extractedFields: {}, questions: [] }) }),
};
for (const [name, handler] of Object.entries(failures)) {
  test(`${name} returns usable fallback without invented values`, async (t) => {
    mockProvider(t, handler);
    const result = await analyzeDraft(draftText);
    assert.equal(result.fallbackUsed, true);
    assert.equal(result.questions.length, 3);
    assert.equal(result.extractedFields.title, draftText);
    assert.equal(result.extractedFields.expectedResult, '');
    assert.ok(result.missingFields.includes('expectedResult'));
  });
}
