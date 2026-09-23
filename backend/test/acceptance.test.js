import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { taskFieldNames } from '../src/task-schema.js';
import { demoTasks } from '../src/demo-tasks.js';

async function launch(filename) {
  const source = `
    import { createServer } from ${JSON.stringify(new URL('../src/server.js', import.meta.url).href)};
    import { closeStore } from ${JSON.stringify(new URL('../src/store.js', import.meta.url).href)};
    const server = createServer({ logRequests: false });
    server.listen(0, '127.0.0.1', () => process.send(server.address().port));
    process.on('message', message => {
      if (message === 'stop') server.close(() => { closeStore(); process.exit(0); });
    });`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', source], {
    env: { ...process.env, DATABASE_URL: `file:${filename}`, LLM_BASE_URL: '', OPENAI_API_KEY: '' },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  let diagnostic = '';
  child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-4000); });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Server startup timeout')); }, 10000);
    child.once('message', value => { clearTimeout(timer); resolve(value); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${diagnostic}`)); });
  });
  return {
    base: `http://127.0.0.1:${port}/api`,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { child.kill(); reject(new Error('Server shutdown timeout')); }, 10000);
        child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Server exited ${code}`)); });
        child.send('stop');
      });
    },
  };
}

test('MVP acceptance: draft to decisions, catalog levels, validation and restart persistence', { timeout: 30000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'hackalem-acceptance-'));
  const filename = join(directory, 'acceptance.db');
  let server;
  t.after(async () => {
    await server?.stop();
    for (const name of readdirSync(directory)) {
      assert.ok(['acceptance.db', 'acceptance.db-shm', 'acceptance.db-wal'].includes(name));
      unlinkSync(join(directory, name));
    }
    rmdirSync(directory);
  });
  server = await launch(filename);
  async function request(path, method = 'GET', payload, status = 200) {
    const response = await fetch(server.base + path, {
      method, signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    const body = await response.json();
    assert.equal(response.status, status, JSON.stringify(body));
    assert.ok(response.headers.get('x-request-id'));
    if (status >= 400) assert.deepEqual(Object.keys(body.error).sort(), ['code', 'details', 'message']);
    return body;
  }

  const smoke = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/smoke.js', import.meta.url))], {
    env: { ...process.env, SMOKE_BASE_URL: server.base }, encoding: 'utf8', timeout: 15000,
  });
  assert.equal(smoke.status, 0, smoke.stderr);
  const catalog = await request('/tasks');
  assert.equal(catalog.length, 5);
  assert.deepEqual(catalog.map(task => task.score), [100, 90, 80, 50, 30]);
  assert.equal(new Set(catalog.map(task => task.fields.title)).size, 5);
  for (const level of ['draft', 'working', 'ready', 'priority']) {
    const filtered = await request(`/tasks?level=${level}`);
    assert.ok(filtered.length && filtered.every(task => task.level === level));
  }
  for (const task of catalog) {
    assert.deepEqual(Object.keys(task.fields).sort(), [...taskFieldNames].sort());
    assert.equal(task.scoreBreakdown.length, 7);
    const proposals = await request(`/tasks/${task.id}/proposals`);
    assert.ok(proposals.length >= 1);
    assert.ok(proposals.every(proposal => proposal.status === 'pending' && proposal.solutionIdea && proposal.plan && proposal.estimatedTime && proposal.prototypeUrl));
  }
  const teams = await request('/teams');
  assert.equal(teams.length, 5);
  assert.ok(teams.every(team => team.interests.length && team.skills.length && team.technologies.length));

  const draft = 'Хотим сократить очереди в корпоративной столовой с помощью AI.';
  const analysis = await request('/task-drafts/analyze', 'POST', { draft, language: 'ru' });
  assert.equal(analysis.fallbackUsed, true);
  assert.ok(analysis.questions.length >= 3);
  const answerValues = { users: 'Сотрудники офиса', data: 'Синтетические чеки за месяц', successCriteria: 'Сократить ожидание на 20 процентов' };
  const composed = await request('/task-drafts/compose', 'POST', {
    analysisId: analysis.analysisId, draft,
    answers: analysis.questions.map(question => ({ questionId: question.id, field: question.field, answer: answerValues[question.field] || 'Уточнение пользователя' })),
  });
  assert.equal(composed.score, 0);
  assert.equal(composed.fields.users, answerValues.users);
  const created = await request('/tasks', 'POST', { theme: 'operations', fields: composed.fields, confirmedFields: [] }, 201);
  const path = `/tasks/${created.id}`;
  assert.ok(!(await request('/tasks')).some(task => task.id === created.id));
  assert.equal((await request(path + '/publish', 'POST', {}, 409)).error.code, 'UNCONFIRMED_TASK');
  const proposalInput = { teamId: teams[0].id, solutionIdea: 'Панель нагрузки', plan: 'Анализ чеков и проверка прогноза', estimatedTime: 'Две недели', prototypeUrl: 'https://example.com/canteen' };
  assert.equal((await request(path + '/proposals', 'POST', proposalInput, 409)).error.code, 'TASK_NOT_PUBLISHED');

  let saved = await request(path, 'PATCH', { fields: {}, confirmedFields: ['users'] });
  assert.equal(saved.score, 10);
  await request(path + '/publish', 'POST', {});
  assert.ok((await request('/tasks?level=draft&theme=operations')).some(task => task.id === created.id));
  const first = await request(path + '/proposals', 'POST', proposalInput, 201);
  assert.equal(first.status, 'pending');
  const second = await request(path + '/proposals', 'POST', { ...proposalInput, teamId: teams[1].id }, 201);
  await request(path + '/proposals', 'POST', { ...proposalInput, teamId: 'unknown' }, 400);
  await request(path + '/proposals', 'POST', { ...proposalInput, prototypeUrl: 'javascript:alert(1)' }, 400);
  for (const proposal of [first, second]) await request(`/proposals/${proposal.id}/status`, 'PATCH', { status: 'selected' });
  assert.ok((await request(path + '/proposals')).every(proposal => proposal.status === 'selected'));
  await request(`/proposals/${second.id}/status`, 'PATCH', { status: 'rejected' });
  await request(`/proposals/${second.id}/status`, 'PATCH', { status: 'pending' });
  await request(`/proposals/${second.id}/status`, 'PATCH', { status: 'automatic' }, 400);

  const fullFields = { ...demoTasks[4].fields, title: 'Контрольная карточка для проверки сохранения' };
  saved = await request(path, 'PATCH', { theme: 'sustainability', fields: fullFields, confirmedFields: taskFieldNames });
  assert.equal(saved.score, 100);
  const edited = await request(path, 'PATCH', { fields: { interactionFormat: 'Созвон по пятницам, обратная связь за два рабочих дня' }, confirmedFields: taskFieldNames.filter(field => field !== 'interactionFormat') });
  assert.equal(edited.score, 90);
  assert.ok(edited.scoreBreakdown.find(row => row.key === 'businessConnection').recommendation);
  saved = await request(path, 'PATCH', { fields: {}, confirmedFields: taskFieldNames });
  assert.equal(saved.score, 100);
  assert.equal((await request(path + '/publish', 'POST', {})).id, created.id);
  const beforeRestart = await request(path);
  const proposalsBeforeRestart = await request(path + '/proposals');
  await server.stop();
  server = await launch(filename);
  assert.deepEqual(await request(path), beforeRestart);
  assert.deepEqual(await request(path + '/proposals'), proposalsBeforeRestart);
  const afterRestart = await request('/tasks?theme=sustainability&sort=score_desc');
  assert.ok(afterRestart.some(task => task.id === created.id && task.score === 100));
});
