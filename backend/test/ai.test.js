import test from 'node:test';
import assert from 'node:assert/strict';
import { fallbackAnalysis } from '../src/ai.js';

test('fallback preserves draft as title and asks at least three targeted questions', () => {
  const result = fallbackAnalysis('  Хотим улучшить процесс доставки.  ');
  assert.equal(result.extractedFields.title, 'Хотим улучшить процесс доставки.');
  assert.equal(result.extractedFields.context, 'Хотим улучшить процесс доставки.');
  assert.equal(result.questions.length >= 3, true);
  assert.equal(result.fallbackUsed, true);
});
