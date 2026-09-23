import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as createHttpServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';

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
    confirmedFields: ['context', 'need'],
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

  const removedField = await request('/tasks', 'POST', { fields: { contact: 'Менеджер', interactionFormat: 'Созвон' }, confirmedFields: ['businessLink'] });
  assert.equal(removedField.status, 400);
  assert.equal(removedField.body.error.code, 'VALIDATION_ERROR');

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

test('publication requires a nonempty confirmed field, without a minimum score', async () => {
  for (const [fields, confirmedFields, expectedStatus, score] of [
    [{ context: 'Есть очередь' }, [], 409, 0],
    [{ context: '   ' }, ['context'], 409, 0],
    [{}, ['users'], 409, 0],
    [{ users: 'Сотрудники' }, ['users'], 200, 10],
    [{ context: 'Есть очередь' }, ['context'], 200, 0],
    [{ context: 'Есть очередь', need: 'Сократить ожидание' }, ['context', 'need'], 200, 20],
    [{ title: 'Название' }, ['title'], 200, 0],
  ]) {
    const created = await request('/tasks', 'POST', { fields, confirmedFields });
    assert.equal(created.status, 201);
    assert.equal(created.body.score, score);
    const published = await request(`/tasks/${created.body.id}/publish`, 'POST', {});
    assert.equal(published.status, expectedStatus);
    if (expectedStatus === 409) {
      assert.equal(published.body.error.code, 'UNCONFIRMED_TASK');
      assert.equal((await request(`/tasks/${created.body.id}`)).body.status, 'draft');
    } else assert.equal(published.body.status, 'published');
  }
});

test('PATCH replaces confirmations and accepts explicit reconfirmation of changed values', async () => {
  const created = await request('/tasks', 'POST', { fields: { context: 'Старый контекст', need: 'Сократить ожидание', users: 'Сотрудники' }, confirmedFields: ['context', 'need', 'users'] });
  const path = `/tasks/${created.body.id}`;
  assert.equal(created.body.score, 30);
  const edited = await request(path, 'PATCH', { fields: { context: 'Новый контекст' }, confirmedFields: ['users'] });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.score, 10);
  assert.deepEqual(edited.body.confirmedFields, ['users']);
  const reconfirmed = await request(path, 'PATCH', { fields: { context: 'Ещё один контекст' }, confirmedFields: ['context', 'need', 'users'] });
  assert.equal(reconfirmed.body.score, 30);
  const changedNeed = await request(path, 'PATCH', { fields: { need: 'Новая потребность' }, confirmedFields: ['context', 'users'] });
  assert.equal(changedNeed.body.score, 10);
  assert.match(changedNeed.body.scoreBreakdown[0].recommendation, /context и need/);
  const cleared = await request(path, 'PATCH', { fields: {}, confirmedFields: [] });
  assert.equal(cleared.body.score, 0);
  assert.equal((await request(path, 'PATCH', { fields: { context: 'Без списка' } })).status, 400);
  assert.equal((await request(path)).body.fields.context, 'Ещё один контекст');
});

test('validation rejects nonobject bodies, unknown fields and mismatched compose answers', async () => {
  for (const payload of [null, [], 'text', 42, true]) {
    const response = await request('/tasks', 'POST', payload);
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  }
  const malformed = await fetch(`${baseUrl}/tasks`, { method: 'POST', body: '{', headers: { 'Content-Type': 'application/json' } });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, 'INVALID_JSON');
  const oversized = await request('/tasks', 'POST', { fields: { title: 'x'.repeat(1024 * 1024) } });
  assert.equal(oversized.status, 413);
  assert.equal(oversized.body.error.code, 'PAYLOAD_TOO_LARGE');
  assert.equal((await request('/tasks', 'POST', { fields: { businessLink: 'legacy' }, confirmedFields: [] })).status, 400);
  const analysis = await request('/task-drafts/analyze', 'POST', { draft: 'Нужно сократить очередь.' });
  const question = analysis.body.questions[0];
  const compose = payload => request('/task-drafts/compose', 'POST', { analysisId: analysis.body.analysisId, ...payload });
  for (const payload of [
    { answers: null }, { currentFields: [] }, { currentFields: { users: null } },
    { answers: [{ questionId: 'unknown', field: question.field, answer: 'Ответ' }] },
    { answers: [{ questionId: question.id, field: 'title', answer: 'Ответ' }] },
    { answers: Array(2).fill({ questionId: question.id, field: question.field, answer: 'Ответ' }) },
  ]) {
    const response = await compose(payload);
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  }
  const composed = await compose({ currentFields: { users: 'Сотрудники' }, confirmedFields: ['users'] });
  assert.equal(composed.status, 200);
  assert.equal(composed.body.score, 0);
});

test('new tasks support theme creation, replacement, preservation and catalog filtering', async () => {
  const created = await request('/tasks', 'POST', { theme: 'finance', fields: { users: 'Аналитики' }, confirmedFields: ['users'] });
  assert.equal(created.status, 201);
  const path = `/tasks/${created.body.id}`;
  assert.equal(created.body.theme, 'finance');
  await request(path + '/publish', 'POST', {});
  assert.ok((await request('/tasks?theme=finance')).body.some(task => task.id === created.body.id));
  assert.equal((await request(path, 'PATCH', { theme: 'hr', fields: {}, confirmedFields: ['users'] })).body.theme, 'hr');
  assert.equal((await request(path, 'PATCH', { fields: {}, confirmedFields: ['users'] })).body.theme, 'hr');
  assert.equal((await request(path)).body.theme, 'hr');
  assert.ok(!(await request('/tasks?theme=finance')).body.some(task => task.id === created.body.id));
  for (const theme of ['unknown', null, 1, []]) {
    assert.equal((await request('/tasks', 'POST', { theme, fields: {} })).status, 400);
    assert.equal((await request(path, 'PATCH', { theme, fields: {}, confirmedFields: [] })).status, 400);
  }
  assert.equal((await request('/tasks?theme=unknown')).status, 400);
  assert.equal((await request('/tasks', 'POST', { fields: {} })).body.theme, null);
});

test('teams API provides full profiles and multiple teams can be selected manually', async () => {
  const list = await request('/teams');
  assert.equal(list.status, 200);
  assert.ok(list.body.length >= 5);
  for (const team of list.body) {
    for (const key of ['id', 'name', 'university']) assert.ok(team[key]);
    for (const key of ['interests', 'skills', 'technologies']) assert.ok(Array.isArray(team[key]) && team[key].length && team[key].every(value => typeof value === 'string'));
  }
  const ids = [];
  for (const team of list.body.slice(0, 2)) {
    const proposal = await request('/tasks/task_1/proposals', 'POST', { teamId: team.id, solutionIdea: 'Прототип', plan: 'Анализ и демо', estimatedTime: 'Неделя', prototypeUrl: 'https://example.com/demo' });
    assert.equal(proposal.status, 201);
    assert.equal(proposal.body.status, 'pending');
    ids.push(proposal.body.id);
    assert.equal((await request(`/proposals/${proposal.body.id}/status`, 'PATCH', { status: 'selected' })).status, 200);
  }
  const proposals = (await request('/tasks/task_1/proposals')).body;
  assert.ok(ids.every(id => proposals.find(proposal => proposal.id === id).status === 'selected'));
  const spec = (await request('/openapi.json')).body;
  assert.ok(spec.paths['/teams'].get);
  assert.ok(spec.paths['/tasks/{taskId}/publish'].post.responses['409']);
  assert.deepEqual(spec.paths['/tasks'].post.requestBody.content['application/json'].schema.properties.theme.enum, ['operations', 'hr', 'finance', 'education', 'sustainability']);
});

test('a failed SQLite write restores the previous in-memory state and hides internal errors', async t => {
  const created = await request('/tasks', 'POST', { fields: { users: 'Сотрудники' }, confirmedFields: ['users'] });
  const path = `/tasks/${created.body.id}`;
  const database = new DatabaseSync(join(directory, 'api.db'));
  database.exec(`CREATE TRIGGER reject_test_write BEFORE INSERT ON tasks
    WHEN NEW.fields_json LIKE '%rollback-marker%'
    BEGIN SELECT RAISE(ABORT, 'private database detail'); END;`);
  t.after(() => { database.exec('DROP TRIGGER IF EXISTS reject_test_write'); database.close(); });
  const failed = await request(path, 'PATCH', { fields: { users: 'rollback-marker' }, confirmedFields: [] });
  assert.equal(failed.status, 500);
  assert.equal(failed.body.error.code, 'INTERNAL_ERROR');
  assert.ok(!JSON.stringify(failed.body).includes('private database detail'));
  assert.deepEqual((await request(path)).body, created.body);
  database.exec('DROP TRIGGER reject_test_write');
  const retried = await request(path, 'PATCH', { fields: { users: 'Новые сотрудники' }, confirmedFields: ['users'] });
  assert.equal(retried.status, 200);
  assert.equal(retried.body.score, 10);
});
