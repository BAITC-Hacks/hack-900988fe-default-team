import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('start and dev load optional env files with process environment taking precedence', t => {
  const directory = mkdtempSync(join(tmpdir(), 'hackalem-env-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  for (const name of ['start', 'dev']) assert.ok(pkg.scripts[name].includes('--env-file-if-exists=.env'));
  const args = ['--env-file-if-exists=.env', '-e', 'console.log(process.env.LLM_MODEL || "disabled")'];
  const env = { ...process.env };
  delete env.LLM_MODEL;
  const run = () => spawnSync(process.execPath, args, { cwd: directory, env, encoding: 'utf8' });
  let result = run();
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), 'disabled');
  writeFileSync(join(directory, '.env'), 'LLM_MODEL=fixture-model\n');
  result = run();
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), 'fixture-model');
  env.LLM_MODEL = 'process-model';
  result = run();
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), 'process-model');
});
