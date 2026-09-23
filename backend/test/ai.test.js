import test from 'node:test';
import assert from 'node:assert/strict';
// Isolate legacy-provider tests from the developer's LLM configuration.
delete process.env.LLM_BASE_URL;
import { analyzeDraft, fallbackAnalysis, sanitizeExtractedFields } from '../src/ai.js';

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

for (const missingCount of [0, 1, 2]) {
  test(`a detailed draft with ${missingCount} missing fields still receives three clarifications`, async (t) => {
    const fields = Object.fromEntries(fieldKeys.map(key => [key, draftText]));
    for (const key of ['users', 'data'].slice(0, missingCount)) fields[key] = '';
    mockProvider(t, async () => ({ ok: true, json: async () => restResponse({ extractedFields: fields, questions: [] }) }));
    const result = await analyzeDraft(draftText);
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
