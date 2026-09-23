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
  const keys=['context','data','expectedResult','successCriteria','constraints','users','contact','interactionFormat'];
  const fields=Object.fromEntries(keys.map(k=>[k,'Заполнено']));
  assert.equal(scoreTask(fields,keys).score,100);
  assert.equal(scoreTask(fields,keys).level,'priority');
  assert.equal(scoreTask(fields,keys.slice(0,2)).score,40);
  assert.equal(scoreTask(fields,keys.slice(0,2)).level,'working');
  assert.equal(scoreTask(fields,keys.slice(0,4)).score,70);
  assert.equal(scoreTask(fields,keys.slice(0,4)).level,'ready');
  assert.equal(scoreTask(fields,keys.slice(0,6)).score,90);
  assert.equal(scoreTask(fields,keys.slice(0,6)).level,'priority');
});

test('business connection requires both filled and confirmed contact fields', () => {
  const fields = { contact: 'Операционный менеджер Алия', interactionFormat: 'Еженедельный созвон и комментарии к демо' };
  const connection = (confirmedFields) => scoreTask(fields, confirmedFields).scoreBreakdown.find((row) => row.key === 'businessConnection');
  assert.equal(connection([]).earned, 0);
  assert.equal(connection(['contact']).earned, 0);
  assert.equal(connection(['interactionFormat']).earned, 0);
  assert.equal(connection(['contact', 'interactionFormat']).earned, 10);
  assert.equal(connection(['contact', 'interactionFormat']).recommendation, null);
});
