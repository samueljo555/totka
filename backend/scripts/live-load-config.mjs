import assert from 'node:assert/strict';

export function liveTarget(value) {
  assert.ok(typeof value === 'string' && value && !/\s/.test(value), 'Target tidak valid.');
  const url = new URL(value);
  assert.ok(['http:', 'https:'].includes(url.protocol), 'Target harus HTTP atau HTTPS.');
  assert.ok(!url.username && !url.password && !url.search && !url.hash && url.pathname === '/',
    'LIVE_TARGET_URL harus berupa origin tanpa kredensial, path, query, atau fragment.');
  return url.origin;
}

export function balancedDummyStudents(fixture, credentials) {
  assert.equal(fixture.verified, true, 'Fixture belum diverifikasi.');
  assert.match(fixture.prefix, /^\d{5}$/, 'Prefix fixture tidak valid.');
  assert.equal(fixture.schools.length, 100);
  assert.equal(new Set(fixture.schools.map(s => s.npsn)).size, 100);
  assert.ok(fixture.schools.every(s => typeof s.npsn === 'string' && s.npsn.startsWith(fixture.prefix) &&
    typeof s.name === 'string' && s.name.includes('DUMMY')), 'Sekolah harus berasal dari fixture dummy.');
  assert.equal(credentials.length, 10000);
  for (const key of ['id', 'username']) {
    assert.ok(credentials.every(c => typeof c[key] === 'string' && c[key]), `Identitas ${key} tidak valid.`);
    assert.equal(new Set(credentials.map(c => c[key])).size, 10000, `Identitas ${key} ganda.`);
  }
  const schools = new Map(fixture.schools.map(s => [s.npsn, []]));
  for (const student of credentials) {
    assert.ok(/^\d{10}$/.test(student.username) && student.username.startsWith(fixture.prefix) && typeof student.password === 'string' &&
      student.password && schools.has(student.schoolNpsn), 'Hanya akun fixture dummy yang boleh digunakan.');
    schools.get(student.schoolNpsn).push(student);
  }
  const groups = [...schools.values()].map(group => group.sort((a, b) => a.username.localeCompare(b.username)));
  assert.ok(groups.every(group => group.length === 100), 'Setiap sekolah harus memiliki tepat 100 siswa.');
  return Array.from({ length: 10000 }, (_, i) => groups[i % 100][Math.floor(i / 100)]);
}
