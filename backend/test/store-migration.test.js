import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readdirSync, unlinkSync, rmdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { taskThemes } from '../src/task-schema.js';

test('existing SQLite gets team profiles without losing tasks, proposals or later profile edits', t => {
  const directory = mkdtempSync(join(tmpdir(), 'hackalem-migration-'));
  const filename = join(directory, 'old.db');
  t.after(() => {
    for (const name of readdirSync(directory)) {
      assert.ok(['old.db', 'old.db-shm', 'old.db-wal'].includes(name));
      unlinkSync(join(directory, name));
    }
    rmdirSync(directory);
  });
  const db = new DatabaseSync(filename);
  db.exec(`
    CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT NOT NULL, university TEXT NOT NULL);
    INSERT INTO teams VALUES ('team_1', 'Existing name', 'Existing university');
    CREATE TABLE tasks (id TEXT PRIMARY KEY, status TEXT, fields_json TEXT, confirmed_fields_json TEXT, theme TEXT, created_at TEXT, updated_at TEXT);
    INSERT INTO tasks VALUES ('saved_task', 'published', '{"users":"Employees"}', '["users"]', 'finance', '2026-09-23T00:00:00Z', '2026-09-23T00:00:00Z');
    CREATE TABLE proposals (id TEXT PRIMARY KEY, task_id TEXT, team_id TEXT, solution_idea TEXT, plan TEXT, estimated_time TEXT, prototype_url TEXT, status TEXT, created_at TEXT);
    INSERT INTO proposals VALUES ('saved_proposal', 'saved_task', 'team_1', 'Idea', 'Plan', 'Week', 'https://example.com', 'selected', '2026-09-23T00:00:00Z');
  `);
  db.close();
  const storeUrl = new URL('../src/store.js', import.meta.url).href;
  const run = extra => {
    const source = `import { initializeStore, teams, tasks, proposals, persist, closeStore } from ${JSON.stringify(storeUrl)};
      initializeStore(); ${extra}
      console.log(JSON.stringify({ team: teams.get('team_1'), task: tasks.get('saved_task'), proposal: proposals.get('saved_proposal'), count: tasks.size }));
      closeStore();`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], { env: { ...process.env, DATABASE_URL: 'file:' + filename }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  const migrated = run('');
  assert.equal(migrated.team.name, 'Existing name');
  assert.ok(migrated.team.interests.length && migrated.team.skills.length && migrated.team.technologies.length);
  assert.equal(migrated.task.score, 10);
  assert.equal(migrated.proposal.status, 'selected');
  assert.equal(migrated.count, 1);
  run("teams.get('team_1').skills = ['Updated skill']; tasks.get('saved_task').theme = 'hr'; persist();");
  const restarted = run('');
  assert.deepEqual(restarted.team.skills, ['Updated skill']);
  assert.equal(restarted.task.theme, 'hr');
  assert.equal(restarted.proposal.teamId, 'team_1');
});

test('demo drafts include five industries and distinct completeness levels', () => {
  const drafts = JSON.parse(readFileSync(new URL('../fixtures/drafts.json', import.meta.url), 'utf8'));
  assert.equal(drafts.length, 5);
  assert.equal(new Set(drafts.map(draft => draft.id)).size, 5);
  assert.equal(new Set(drafts.map(draft => draft.completeness)).size, 5);
  assert.ok(drafts.every(draft => taskThemes.includes(draft.theme) && draft.industry && draft.draft.trim()));
});
