import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { llmConfig } from '../src/llm.js';
import { analyzeDraft } from '../src/ai.js';

let saved;
beforeEach(() => {
  saved = { ...process.env };
  for (const key of Object.keys(process.env)) if (key.startsWith('LLM_') || key.startsWith('OPENAI_')) delete process.env[key];
});
afterEach(() => {
  for (const key of Object.keys(process.env)) if (key.startsWith('LLM_') || key.startsWith('OPENAI_')) delete process.env[key];
  for (const [key, value] of Object.entries(saved)) if (key.startsWith('LLM_') || key.startsWith('OPENAI_')) process.env[key] = value;
});
const draft = 'Очередь в столовой';
const fields = Object.fromEntries(['title','context','need','users','data','constraints','expectedResult','successCriteria','contact','interactionFormat'].map(key => [key, key === 'context' ? draft : '']));
const config = { LLM_BASE_URL: 'https://openrouter.ai/api/v1/', LLM_MODEL: 'qwen/qwen3-coder-next', LLM_API_KEY: 'test-key' };
const completion = () => ({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ extractedFields: { ...fields, expectedResult: 'Выдуманное улучшение на 50%' }, questions: [] }) } }] });

test('Chat Completions sends configured model, headers, schema and timeout', async t => {
  Object.assign(process.env, config, { LLM_MODEL_ANALYSIS: 'analysis-model', LLM_EXTRA_HEADERS: '{"HTTP-Referer":"https://example.com","X-Title":"Test"}', LLM_TEMPERATURE: '0', LLM_TIMEOUT_S: '3' });
  const timeout = t.mock.method(AbortSignal, 'timeout', () => new AbortController().signal);
  let sent;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    sent = { url, options, body: JSON.parse(options.body) };
    return { ok: true, json: async () => completion() };
  });
  const result = await analyzeDraft(draft);
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.extractedFields.context, draft);
  assert.equal(result.extractedFields.expectedResult, '');
  assert.equal(result.questions.length, 3);
  assert.equal(sent.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(sent.body.model, 'analysis-model');
  assert.equal(sent.body.temperature, 0);
  assert.equal(sent.body.stream, false);
  assert.equal(sent.body.messages[1].content, draft);
  assert.equal(sent.body.response_format.type, 'json_schema');
  assert.equal(sent.body.response_format.json_schema.strict, true);
  assert.equal(sent.options.headers.get('authorization'), 'Bearer test-key');
  assert.equal(sent.options.headers.get('x-title'), 'Test');
  assert.equal(sent.options.headers.get('http-referer'), 'https://example.com');
  assert.equal(timeout.mock.calls[0].arguments[0], 3000);
});

test('local endpoint works without a key and keeps the base path', () => {
  const result = llmConfig({ LLM_BASE_URL: 'http://localhost:8000/v1', LLM_API_PATH: '/custom/chat/completions', LLM_MODEL: 'local-qwen' });
  assert.equal(result.url, 'http://localhost:8000/v1/custom/chat/completions');
  assert.equal(result.model, 'local-qwen');
  assert.equal(result.headers.has('authorization'), false);
  assert.equal(result.timeoutMs, 60000);
});

test('explicitly empty base disables all calls even with a legacy key', async t => {
  Object.assign(process.env, { LLM_BASE_URL: '', OPENAI_API_KEY: 'legacy-test' });
  const network = t.mock.method(globalThis, 'fetch', () => { throw new Error('Must not call'); });
  assert.equal((await analyzeDraft(draft)).fallbackUsed, true);
  assert.equal(network.mock.callCount(), 0);
});

for (const invalid of [
  { LLM_BASE_URL: '[https://openrouter.ai/api/v1](https://openrouter.ai/api/v1)' },
  { LLM_API_PATH: 'https://other.example/chat/completions' },
  { LLM_TIMEOUT_S: 'NaN' }, { LLM_TIMEOUT_S: '-1' }, { LLM_TEMPERATURE: '3' },
  { LLM_EXTRA_HEADERS: '{' }, { LLM_EXTRA_HEADERS: '[]' },
  { LLM_EXTRA_HEADERS: '{"Authorization":"override"}' }, { LLM_MODEL: '' },
]) {
  test(`invalid configuration falls back before network: ${Object.keys(invalid)[0]} ${Object.values(invalid)[0]}`, async t => {
    Object.assign(process.env, config, invalid);
    const network = t.mock.method(globalThis, 'fetch', () => { throw new Error('Must not call'); });
    assert.equal((await analyzeDraft(draft)).fallbackUsed, true);
    assert.equal(network.mock.callCount(), 0);
  });
}

for (const failure of ['http', 'timeout', 'length', 'refusal', 'invalid-json', 'invalid-fields']) {
  test(`chat ${failure} returns fallback`, async t => {
    Object.assign(process.env, config);
    t.mock.method(globalThis, 'fetch', async () => {
      if (failure === 'timeout') throw new DOMException('Timeout', 'TimeoutError');
      const payload = completion();
      const choice = payload.choices[0];
      if (failure === 'length') choice.finish_reason = 'length';
      if (failure === 'refusal') choice.message.refusal = 'Refused';
      if (failure === 'invalid-json') choice.message.content = '{';
      if (failure === 'invalid-fields') choice.message.content = '{}';
      return { ok: failure !== 'http', json: async () => payload };
    });
    const result = await analyzeDraft(draft);
    assert.equal(result.fallbackUsed, true);
    assert.equal(result.questions.length, 3);
  });
}
