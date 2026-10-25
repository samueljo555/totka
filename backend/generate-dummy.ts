// The previous generator deleted/replaced users in DATABASE_URL. Load fixtures
// now belong to a random, disposable database owned by the benchmark harness.
console.error('Generator lama dinonaktifkan. Gunakan LOAD_TEST_DATABASE_URL pada cluster pengujian terpisah dan npm run test:load dari backend. Lihat docs/LOAD_TESTING.md.');
process.exitCode = 1;
