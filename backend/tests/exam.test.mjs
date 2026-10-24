import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAnswer, validQuestion, gradeAnswer, deadlineFor } from '../dist/exam.js';

const simple = { type: 'Pilihan Ganda Sederhana', options: [{ text: 'A' }, { text: 'B' }], correctAnswer: [0] };
const multiple = { type: 'Pilihan Ganda Kompleks', options: [{}, {}, {}], correctAnswer: [0, 2] };
const category = { type: 'Pilihan Ganda Kompleks Kategori', options: [{}, {}, {}], correctAnswer: [0, 1, 0] };

test('validates single answers without accepting coercion, objects, or out of range indexes', () => {
  assert.equal(normalizeAnswer(simple, 0), 0);
  assert.equal(normalizeAnswer(simple, null), null);
  for (const value of [undefined, '0', {}, { selected: 'A' }, [], -1, 2, 0.5, true]) {
    assert.throws(() => normalizeAnswer(simple, value), { code: 'INVALID_ANSWER' });
  }
});
test('multiple choice requires unique valid indexes and grades independently of order', () => {
  assert.deepEqual(normalizeAnswer(multiple, [2, 0]), [0, 2]);
  assert.deepEqual(normalizeAnswer(multiple, []), []);
  for (const value of [[0, 0], [0, 3], ['0'], [null], {}, 0]) assert.throws(() => normalizeAnswer(multiple, value));
  assert.equal(gradeAnswer(multiple, [2, 0]), true);
  assert.equal(gradeAnswer(multiple, [0, 0]), false);
  assert.equal(gradeAnswer(multiple, []), false);
});
test('category supports partial answers including JSON null gaps and never grades missing slots as correct', () => {
  assert.deepEqual(normalizeAnswer(category, [null, 1]), [null, 1, null]);
  assert.deepEqual(normalizeAnswer(category, []), [null, null, null]);
  assert.equal(gradeAnswer(category, [0, 1, 0]), true);
  assert.equal(gradeAnswer(category, [null, 1, 0]), false);
  for (const value of [[2], [false], ['1'], [0, 1, 0, 1]]) assert.throws(() => normalizeAnswer(category, value));
});
test('invalid or empty answer keys and unknown question types cannot produce a valid exam', () => {
  assert.equal(validQuestion(simple), true);
  assert.equal(validQuestion(multiple), true);
  assert.equal(validQuestion(category), true);
  for (const question of [
    { ...simple, correctAnswer: [] }, { ...simple, correctAnswer: [2] },
    { ...simple, correctAnswer: [null] }, { ...multiple, correctAnswer: [] },
    { ...multiple, correctAnswer: [0, 0] }, { ...category, correctAnswer: [null, 1, 0] },
    { ...simple, options: [] }, { ...simple, type: 'unknown' },
  ]) {
    assert.equal(validQuestion(question), false);
    assert.equal(gradeAnswer(question, []), false);
  }
});
test('deadline is derived from persisted startTime and positive duration, never client timestamps', () => {
  const session = { startTime: new Date('2026-10-24T00:00:00Z'), package: { durationMinutes: 90 } };
  assert.equal(deadlineFor(session).toISOString(), '2026-10-24T01:30:00.000Z');
  for (const durationMinutes of [0, -1, 0.5, NaN]) assert.throws(() => deadlineFor({ ...session, package: { durationMinutes } }));
});
