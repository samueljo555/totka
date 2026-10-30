import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumePlan } from '../../load-tests/live-schedule.js';

test('each randomized resume is after question 5–25 with an independent bounded jitter', () => {
  const draws = [0, 0.7, 1 - Number.EPSILON, 0.2];
  assert.deepEqual(resumePlan(30, 'random', () => draws.shift()), { index: 4, jitter: 0.7 });
  assert.deepEqual(resumePlan(30, 'random', () => draws.shift()), { index: 24, jitter: 0.2 });
});
test('10,000 independently sampled students spread over the allowed questions', () => {
  let seed = 123456789;
  const random = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const counts = new Map();
  for (let i = 0; i < 10000; i++) {
    const plan = resumePlan(30, 'random', random);
    assert.ok(plan.index >= 4 && plan.index <= 24); assert.ok(plan.jitter >= 0 && plan.jitter < 1);
    counts.set(plan.index, (counts.get(plan.index) || 0) + 1);
  }
  assert.equal(counts.size, 21);
  assert.ok(Math.max(...counts.values()) < 1000, 'No single question should concentrate the whole cohort');
});
test('old synchronized behavior is explicit and invalid settings fail', () => {
  assert.deepEqual(resumePlan(30, 'synchronized', () => { throw new Error('Must not sample'); }), { index: 14, jitter: 0 });
  for (const count of [0, 1, 1.5, NaN]) assert.throws(() => resumePlan(count));
  assert.throws(() => resumePlan(30, 'invalid'));
  assert.throws(() => resumePlan(30, 'random', () => 1));
});
