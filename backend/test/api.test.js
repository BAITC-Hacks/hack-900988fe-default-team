import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = mkdtempSync(join(tmpdir(), 'hackalem-api-'));
process.env.DATABASE_URL = `file:${join(directory, 'api.db')}`;
process.env.OPENAI_API_KEY = '';
const { createServer } = await import('../src/server.js');
const { closeStore } = await import('../src/store.js');
const server = createServer();
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
