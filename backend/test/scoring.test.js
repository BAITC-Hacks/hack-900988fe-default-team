import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreTask } from '../src/scoring.js';

test('only filled confirmed fields earn points', () => {
  const result=scoreTask({context:'Есть проблема',need:'Улучшить процесс',data:'',users:'Сотрудники'},['context','need','data','users']);
  assert.equal(result.score,30);
  assert.equal(result.level,'draft');
  assert.deepEqual(result.missingFields.includes('data'),true);
});
test('score levels follow contract thresholds', () => {
  const keys=['context','data','expectedResult','successCriteria','constraints','users','contact','interactionFormat'];
  const fields=Object.fromEntries([...keys,'need'].map(k=>[k,'Заполнено']));
  const score = count => scoreTask(fields,[...keys.slice(0,count),'need']);
  assert.equal(score(keys.length).score,100);
  assert.equal(score(keys.length).level,'priority');
  assert.equal(score(2).score,40);
  assert.equal(score(2).level,'working');
  assert.equal(score(4).score,70);
  assert.equal(score(4).level,'ready');
  assert.equal(score(6).score,90);
  assert.equal(score(6).level,'priority');
});

test('context and need must both be filled and confirmed for twenty points', () => {
  const fields = { context: 'Есть очередь', need: 'Сократить ожидание' };
  for (const confirmations of [[], ['context'], ['need']]) {
    const row = scoreTask(fields, confirmations).scoreBreakdown[0];
    assert.equal(row.earned, 0);
    assert.equal(row.confirmed, false);
    assert.match(row.recommendation, /context и need/);
  }
  assert.equal(scoreTask(fields, ['context', 'need']).score, 20);
  for (const key of ['context', 'need']) {
    for (const value of ['', '   ', undefined]) {
      assert.equal(scoreTask({ ...fields, [key]: value }, ['context', 'need']).score, 0);
    }
  }
  const all = Object.fromEntries(['context','data','expectedResult','successCriteria','constraints','users','contact','interactionFormat'].map(key => [key, 'Заполнено']));
  assert.equal(scoreTask(all, Object.keys(all)).score, 80);
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
