import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLoginCardCipher, studentPassword } from '../dist/login-cards.js';

const secret = 'test-only-printable-password-key-32-characters';
test('student passwords are six readable uppercase characters with no lookalikes', () => {
  for (let i = 0; i < 100; i++) assert.match(studentPassword(), /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
});
test('login cards encrypt at rest, use random nonces, and remain readable after recreating the cipher', () => {
  const cipher = createLoginCardCipher(secret);
  const first = cipher.seal('student-1', 'ABC234');
  const second = cipher.seal('student-1', 'ABC234');
  assert.notEqual(first, second);
  assert.ok(!first.includes('ABC234'));
  assert.equal(createLoginCardCipher(secret).open('student-1', first), 'ABC234');
});
test('swapped student identity, altered ciphertext, and incorrect secrets cannot decrypt credentials', () => {
  const cipher = createLoginCardCipher(secret);
  const encrypted = cipher.seal('student-1', 'ABC234');
  assert.throws(() => cipher.open('student-2', encrypted));
  assert.throws(() => createLoginCardCipher(secret + 'different').open('student-1', encrypted));
  const parts = encrypted.split('.');
  const data = Buffer.from(parts[3], 'base64url');
  data[0] ^= 1;
  parts[3] = data.toString('base64url');
  assert.throws(() => cipher.open('student-1', parts.join('.')));
  assert.throws(() => cipher.open('student-1', 'invalid'));
  assert.throws(() => createLoginCardCipher('too-short'));
});
