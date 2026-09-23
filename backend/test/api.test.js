import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as createHttpServer } from 'node:http';

const directory = mkdtempSync(join(tmpdir(), 'hackalem-api-'));
process.env.DATABASE_URL = `file:${join(directory, 'api.db')}`;
process.env.OPENAI_API_KEY = '';
process.env.LLM_BASE_URL = '';
const { createServer } = await import('../src/server.js');
const { closeStore } = await import('../src/store.js');
const requestLogs = [];
const server = createServer({ logger: { info: (line) => requestLogs.push(JSON.parse(line)) } });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}/api`;

async function request(path, method = 'GET', payload) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: payload === undefined ? {} : { 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  return { status: response.status, body: await response.json() };
}

before(() => assert.ok(address?.port));
after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  closeStore();
  rmSync(directory, { recursive: true, force: true });
});

test('analysis endpoint uses configured Chat Completions and composes unconfirmed fields', async t => {
  const saved = { ...process.env };
  let received;
  const provider = createHttpServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    received = { path: req.url, body: JSON.parse(raw) };
    const fields = Object.fromEntries(['title','context','need','users','data','constraints','expectedResult','successCriteria','contact','interactionFormat'].map(key => [key, key === 'context' ? 'Очередь в столовой' : '']));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ extractedFields: fields, questions: [] }) } }] }));
  });
  t.after(async () => {
    await new Promise(resolve => provider.close(resolve));
    for (const key of Object.keys(process.env)) if (key.startsWith('LLM_')) delete process.env[key];
    for (const [key, value] of Object.entries(saved)) if (key.startsWith('LLM_')) process.env[key] = value;
  });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  for (const key of Object.keys(process.env)) if (key.startsWith('LLM_')) delete process.env[key];
  Object.assign(process.env, { LLM_BASE_URL: `http://127.0.0.1:${provider.address().port}/v1`, LLM_MODEL: 'local-qwen' });
  const analysis = await request('/task-drafts/analyze', 'POST', { draft: 'Очередь в столовой' });
  assert.equal(analysis.status, 200);
  assert.equal(analysis.body.fallbackUsed, false);
  assert.equal(received.path, '/v1/chat/completions');
  assert.equal(received.body.model, 'local-qwen');
  const question = analysis.body.questions[0];
  const composed = await request('/task-drafts/compose', 'POST', {
    analysisId: analysis.body.analysisId, draft: 'Очередь в столовой', currentFields: {},
    answers: [{ questionId: question.id, field: question.field, answer: 'Сотрудники офиса' }],
  });
  assert.equal(composed.status, 200);
  assert.equal(composed.body.fields[question.field], 'Сотрудники офиса');
  assert.equal(composed.body.score, 0);
});

test('HTTP scenario allows low-score publication and manual team selection', async () => {
  const analysis = await request('/task-drafts/analyze', 'POST', { draft: 'Нужно улучшить очередь в столовой.', language: 'ru' });
  assert.equal(analysis.status, 200);
  assert.equal(analysis.body.fallbackUsed, true);
  assert.equal(analysis.body.questions.length >= 3, true);

  const task = await request('/tasks', 'POST', {
    fields: { title: 'Очередь в столовой', context: 'Есть очередь', need: 'Улучшить обслуживание' },
    confirmedFields: ['context'],
  });
  assert.equal(task.status, 201);
  assert.equal(task.body.score, 20);
  assert.equal(task.body.level, 'draft');

  const published = await request(`/tasks/${task.body.id}/publish`, 'POST', {});
  assert.equal(published.status, 200);
  assert.equal(published.body.status, 'published');

  const proposal = await request(`/tasks/${task.body.id}/proposals`, 'POST', {
    teamId: 'team_1', solutionIdea: 'Сделаем прототип', plan: 'Анализ и MVP', estimatedTime: '2 недели', prototypeUrl: 'https://example.com/demo',
  });
  assert.equal(proposal.status, 201);
  assert.equal(proposal.body.status, 'pending');

  const selected = await request(`/proposals/${proposal.body.id}/status`, 'PATCH', { status: 'selected' });
  assert.equal(selected.status, 200);
  assert.equal(selected.body.status, 'selected');
});

test('HTTP validation uses the contract error shape', async () => {
  const response = await request('/tasks', 'POST', { fields: {}, confirmedFields: ['unknownField'] });
  assert.equal(response.status, 400);
  assert.deepEqual(Object.keys(response.body.error).sort(), ['code', 'details', 'message']);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');

  const invalidCatalog = await request('/tasks?level=unknown');
  assert.equal(invalidCatalog.status, 400);
  assert.equal(invalidCatalog.body.error.code, 'VALIDATION_ERROR');

  const proposal = await request('/tasks/task_1/proposals', 'POST', {
    teamId: 'team_1', solutionIdea: 'Идея', plan: 'План', estimatedTime: '1 неделя', prototypeUrl: 'not-a-url',
  });
  assert.equal(proposal.status, 400);
  assert.equal(proposal.body.error.code, 'VALIDATION_ERROR');
});

test('catalog filters by theme and sorts by readiness score', async () => {
  const filtered = await request('/tasks?theme=finance');
  assert.equal(filtered.status, 200);
  assert.equal(filtered.body.length, 1);
  assert.equal(filtered.body[0].theme, 'finance');

  const catalog = await request('/tasks?sort=score_desc');
  assert.equal(catalog.status, 200);
  assert.equal(catalog.body.every((task, index, list) => index === 0 || list[index - 1].score >= task.score), true);
});

test('request log contains safe metadata without request bodies or query parameters', async () => {
  const response = await request('/tasks?theme=finance&token=not-logged');
  assert.equal(response.status, 200);
  const entry = requestLogs.at(-1);
  assert.equal(entry.event, 'http_request');
  assert.equal(entry.method, 'GET');
  assert.equal(entry.path, '/api/tasks');
  assert.equal(entry.status, 200);
  assert.equal(typeof entry.requestId, 'string');
  assert.equal(Number.isInteger(entry.durationMs), true);
  assert.equal(JSON.stringify(entry).includes('not-logged'), false);
});
