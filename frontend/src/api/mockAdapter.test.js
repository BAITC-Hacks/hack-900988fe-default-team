import { describe, expect, it } from 'vitest';
import { calculateScore, mockAdapter } from './mockAdapter';

describe('mock adapter', () => {
  it('generates at least three clarification questions', async () => {
    const analysis = await mockAdapter.analyze('Короткое описание');
    expect(analysis.questions).toHaveLength(3);
    expect(analysis.missingFields).toContain('users');
  });

  it('calculates a deterministic score and level', () => {
    const result = calculateScore({ context: 'есть', need: 'есть', users: 'есть', data: 'есть' });
    expect(result.score).toBe(60);
    expect(result.level).toBe('working');
  });

  it('returns only published catalog tasks sorted by score', async () => {
    const tasks = await mockAdapter.listTasks();
    expect(tasks.length).toBeGreaterThanOrEqual(5);
    expect(tasks.every((task) => task.status === 'published')).toBe(true);
    expect(tasks[0].score).toBeGreaterThanOrEqual(tasks[1].score);
  });

  it('filters the catalog by theme and returns a task detail', async () => {
    const tasks = await mockAdapter.listTasks({ theme: 'Экология', level: 'priority' });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].fields.title).toBe('Снижение энергопотребления кампуса');
    await expect(mockAdapter.getTask(tasks[0].id)).resolves.toMatchObject({ id: tasks[0].id, status: 'published' });
  });
});
