import test from 'node:test';
import assert from 'node:assert/strict';
import { timelinePosition } from '../src/components/timeline.ts';
import { adaptTrace, flatten, pretty } from '../src/data/adapter.ts';
import { rawTraces } from '../src/data/mock.ts';

test('time offsets preserve overlap and clamp outside ranges', () => {
  assert.deepEqual(timelinePosition(1000, 250, 500), { left: 25, width: 50 });
  assert.deepEqual(timelinePosition(1000, -100, 300), { left: 0, width: 20 });
  assert.deepEqual(timelinePosition(1000, 900, 500), { left: 90, width: 10 });
  for (const values of [[0, 0, 0], [NaN, 1, 2], [100, Infinity, 1], [-1, 0, 1]]) {
    assert.deepEqual(timelinePosition(...values as [number, number, number]), { left: 0, width: 0 });
  }
});
test('adapter preserves IDs, hierarchy, inputs and single-step vs trace totals', () => {
  const trace = adaptTrace(rawTraces[0]);
  const spans = flatten(trace.root);
  assert.equal(spans.length, 4);
  assert.equal(trace.tokens, 1280);
  assert.equal(trace.root?.tokens, 0);
  assert.equal(spans.find(s => s.kind === 'LLM')?.tokens, 1280);
  assert.equal(spans[2].input, '{"city":"杭州"}');
  assert.equal(trace.start, '2026-11-02T02:30:00.000Z');
});
test('missing metrics differ from zero; malformed attributes remain readable', () => {
  assert.equal(adaptTrace(rawTraces[1]).cost, null);
  assert.equal(adaptTrace(rawTraces[2]).cost, 0);
  assert.equal(pretty('not json'), 'not json');
  assert.equal(pretty(''), '未记录');
  assert.equal(pretty('{"x":1}'), '{\n  "x": 1\n}');
  assert.equal(adaptTrace({ ...rawTraces[0], tree: null }).root, null);
});
