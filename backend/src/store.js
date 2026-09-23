import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { scoreTask } from './scoring.js';

export const tasks = new Map();
export const teams = new Map();
export const proposals = new Map();
export const analyses = new Map();

const now = () => new Date().toISOString();
const databaseUrl = process.env.DATABASE_URL || 'file:./dev.db';
if (!databaseUrl.startsWith('file:')) throw new Error('DATABASE_URL должен иметь формат file:./dev.db.');
const databasePath = resolve(process.cwd(), databaseUrl.slice('file:'.length));

function readLegacyJson() {
  if (!existsSync(databasePath)) return null;
  try {
    const text = readFileSync(databasePath, 'utf8').trim();
    return text.startsWith('{') ? JSON.parse(text) : null;
  } catch { return null; }
}

const legacyData = readLegacyJson();
if (legacyData) renameSync(databasePath, `${databasePath}.json.bak`);
const db = new DatabaseSync(databasePath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY, status TEXT NOT NULL, fields_json TEXT NOT NULL,
    confirmed_fields_json TEXT NOT NULL, theme TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS teams (id TEXT PRIMARY KEY, name TEXT NOT NULL, university TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS proposals (
    id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), team_id TEXT NOT NULL REFERENCES teams(id),
    solution_idea TEXT NOT NULL, plan TEXT NOT NULL, estimated_time TEXT NOT NULL, prototype_url TEXT NOT NULL,
    status TEXT NOT NULL, created_at TEXT NOT NULL
  );
`);

const sampleFields = (n) => ({ title: `Демонстрационная бизнес-задача ${n}`, context: `Синтетическая задача ${n}: требуется улучшить бизнес-процесс.`, need: 'Снизить трудозатраты сотрудников.', users: 'Сотрудники компании', data: n % 2 ? 'Доступны обезличенные CSV-отчёты' : '', expectedResult: 'Рабочий прототип решения', successCriteria: n < 4 ? '' : 'Сократить время операции на 20%', constraints: 'Без обработки персональных данных', contact: 'Операционный менеджер', interactionFormat: 'Еженедельный созвон и комментарии к демо в течение двух рабочих дней' });
const sampleThemes = ['operations', 'hr', 'finance', 'education', 'sustainability'];

function addTask(record) {
  const fields = record.fields || {};
  const confirmedFields = Array.isArray(record.confirmedFields) ? record.confirmedFields : [];
  tasks.set(record.id, { ...record, fields, confirmedFields, ...scoreTask(fields, confirmedFields) });
}

function seed() {
  for (let i = 1; i <= 5; i += 1) teams.set(`team_${i}`, { id: `team_${i}`, name: `Демо-команда ${i}`, university: `Университет ${i}` });
  for (let i = 1; i <= 5; i += 1) {
    const id = `task_${i}`, fields = sampleFields(i), confirmedFields = Object.keys(fields).filter((key) => fields[key]), createdAt = now();
    addTask({ id, status: 'published', fields, confirmedFields, theme: sampleThemes[i - 1], createdAt, updatedAt: createdAt });
    proposals.set(`proposal_${i}`, { id: `proposal_${i}`, taskId: id, teamId: `team_${i}`, solutionIdea: 'Синтетическая идея решения', plan: 'Исследование, прототипирование и проверка', estimatedTime: '2 недели', prototypeUrl: 'https://example.com', status: 'pending', createdAt });
  }
}

function restore() {
  for (const row of db.prepare('SELECT * FROM tasks').all()) addTask({ id: row.id, status: row.status, fields: JSON.parse(row.fields_json), confirmedFields: JSON.parse(row.confirmed_fields_json), theme: row.theme || undefined, createdAt: row.created_at, updatedAt: row.updated_at });
  for (const row of db.prepare('SELECT * FROM teams').all()) teams.set(row.id, { id: row.id, name: row.name, university: row.university });
  for (const row of db.prepare('SELECT * FROM proposals').all()) proposals.set(row.id, { id: row.id, taskId: row.task_id, teamId: row.team_id, solutionIdea: row.solution_idea, plan: row.plan, estimatedTime: row.estimated_time, prototypeUrl: row.prototype_url, status: row.status, createdAt: row.created_at });
}

export function persist() {
  const insertTask = db.prepare('INSERT INTO tasks (id, status, fields_json, confirmed_fields_json, theme, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insertTeam = db.prepare('INSERT INTO teams (id, name, university) VALUES (?, ?, ?)');
  const insertProposal = db.prepare('INSERT INTO proposals (id, task_id, team_id, solution_idea, plan, estimated_time, prototype_url, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM proposals; DELETE FROM tasks; DELETE FROM teams;');
    for (const task of tasks.values()) insertTask.run(task.id, task.status, JSON.stringify(task.fields), JSON.stringify(task.confirmedFields), task.theme || null, task.createdAt, task.updatedAt);
    for (const team of teams.values()) insertTeam.run(team.id, team.name, team.university);
    for (const proposal of proposals.values()) insertProposal.run(proposal.id, proposal.taskId, proposal.teamId, proposal.solutionIdea, proposal.plan, proposal.estimatedTime, proposal.prototypeUrl, proposal.status, proposal.createdAt);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function initializeStore() {
  restore();
  if (legacyData?.tasks?.length && legacyData?.teams?.length) {
    tasks.clear(); teams.clear(); proposals.clear();
    for (const task of legacyData.tasks) addTask(task);
    for (const team of legacyData.teams) if (team?.id) teams.set(team.id, team);
    for (const proposal of legacyData.proposals || []) if (proposal?.id && tasks.has(proposal.taskId) && teams.has(proposal.teamId)) proposals.set(proposal.id, proposal);
    persist();
  } else if (!tasks.size) { seed(); persist(); }
}

export function closeStore() {
  db.close();
}

export const makeId = (prefix) => `${prefix}_${randomUUID()}`;
export const timestamp = now;
