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
});
