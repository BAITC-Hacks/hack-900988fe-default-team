import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDraft, fallbackAnalysis, sanitizeExtractedFields } from '../src/ai.js';

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
      json: async () => ({ output_text: JSON.stringify({
        extractedFields: { title: 'Очередь в столовой', context: 'Очередь в столовой', need: '', users: '', data: '', constraints: '', expectedResult: 'Сократить ожидание на 20%', successCriteria: '', contact: '', interactionFormat: '' },
        questions: [{ field: 'users', text: 'Кто будет пользоваться решением?' }, { field: 'data', text: 'Какие данные доступны?' }, { field: 'successCriteria', text: 'Как измерить результат?' }],
      }) }),
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
