import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreTask } from '../src/scoring.js';

test('only filled confirmed fields earn points', () => {
  const result=scoreTask({context:'Есть проблема',data:'',users:'Сотрудники'},['context','data','users']);
  assert.equal(result.score,30);
  assert.equal(result.level,'draft');
  assert.deepEqual(result.missingFields.includes('data'),true);
});
test('score levels follow contract thresholds', () => {
  const keys=['context','data','expectedResult','successCriteria','constraints','users','businessLink'];
  const fields=Object.fromEntries(keys.map(k=>[k,'Заполнено']));
  assert.equal(scoreTask(fields,keys).score,100);
  assert.equal(scoreTask(fields,keys).level,'priority');
  assert.equal(scoreTask(fields,keys.slice(0,3)).level,'working');
});
