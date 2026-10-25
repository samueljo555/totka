// Isolated benchmark process: same compiled entrypoint and pool settings as PM2.
import cluster from 'node:cluster';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const count = Number(process.env.APP_WORKERS || 2);
if (!Number.isInteger(count) || count < 1 || count > 32 || !process.env.LOAD_TEST_RUN_ID) throw new Error('Benchmark-only server requires an explicit run ID and 1..32 workers.');
cluster.setupPrimary({ exec: path.join(root, 'dist/index.js') });
let stopping = false, port;
const ready = new Set(), listening = new Set();
function announce() {
  if (ready.size === count && listening.size === count) process.send?.({ event: 'ready', port, pids: Object.values(cluster.workers).map(worker => worker.process.pid) });
}
for (let index = 0; index < count; index++) {
  const worker = cluster.fork();
  worker.on('message', message => { if (message === 'ready') { ready.add(worker.id); announce(); } });
  worker.on('listening', address => { port = address.port; listening.add(worker.id); announce(); });
}
cluster.on('exit', (_worker, code) => {
  if (!stopping) { process.send?.({ event: 'worker-failed', code }); stop(1); }
  if (Object.keys(cluster.workers).length === 0) process.exit(stopping === 'failed' ? 1 : 0);
});
function stop(code = 0) {
  if (stopping) return;
  stopping = code ? 'failed' : 'normal';
  for (const worker of Object.values(cluster.workers)) worker.process.kill('SIGTERM');
  setTimeout(() => process.exit(1), 22000).unref();
}
process.on('SIGTERM', () => stop());
process.on('SIGINT', () => stop());
