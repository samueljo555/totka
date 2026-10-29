import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { Client } from 'pg';
import { poolConfig } from '../dist/pool-config.js';

test('pooler compatibility rejects invalid switches and preserves client limits', () => {
  const config = poolConfig({ DB_SERVER_TIMEOUTS: 'false', APP_WORKERS: '8' });
  assert.equal(config.max, 5);
  assert.equal(config.query_timeout, 16000);
  assert.equal(config.connectionTimeoutMillis, 5000);
  for (const value of ['0', 'yes', 'FALSE', '']) {
    assert.throws(() => poolConfig({ DB_SERVER_TIMEOUTS: value }), /DB_SERVER_TIMEOUTS/);
  }
  assert.throws(() => poolConfig({ DB_SERVER_TIMEOUTS: 'false', DB_STATEMENT_TIMEOUT_MS: '-1' }));
});

test('real pg handshake connects to a restrictive pooler without timeout startup parameters', async t => {
  const packets = [];
  const sockets = new Set();
  // Protocol-level peer: reject the same startup fields as the reported pooler.
  const server = net.createServer(socket => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
    let pending = Buffer.alloc(0), started = false;
    socket.on('data', chunk => {
      if (started) { socket.end(); return; }
      pending = Buffer.concat([pending, chunk]);
      if (pending.length < 4 || pending.length < pending.readInt32BE(0)) return;
      started = true;
      const fields = pending.subarray(8, pending.readInt32BE(0) - 1).toString().split('\0');
      const params = {};
      for (let i = 0; i + 1 < fields.length; i += 2) params[fields[i]] = fields[i + 1];
      packets.push(params);
      const unsupported = ['statement_timeout', 'idle_in_transaction_session_timeout'].find(key => key in params);
      if (unsupported) {
        const body = Buffer.from(`SFATAL\0C08P01\0Munsupported startup parameter: ${unsupported}\0\0`);
        const header = Buffer.alloc(5);
        header[0] = 69;
        header.writeInt32BE(body.length + 4, 1);
        socket.end(Buffer.concat([header, body]));
      } else {
        // AuthenticationOk followed by ReadyForQuery (idle).
        socket.write(Buffer.from([82, 0, 0, 0, 8, 0, 0, 0, 0, 90, 0, 0, 0, 5, 73]));
      }
    });
  });
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const databaseUrl = `postgresql://fixture:fixture@127.0.0.1:${server.address().port}/fixture?schema=public&pgbouncer=true`;
  for (const compatible of [false, true]) {
    const client = new Client({
      ...poolConfig({ DATABASE_URL: databaseUrl, ...(compatible ? { DB_SERVER_TIMEOUTS: 'false' } : {}) }),
      ssl: false,
    });
    try {
      if (compatible) await client.connect();
      else await assert.rejects(client.connect(), { code: '08P01' });
    } finally { await client.end(); }
  }
  assert.equal(packets[0].statement_timeout, '15000');
  assert.equal(packets[0].idle_in_transaction_session_timeout, '20000');
  assert.equal('statement_timeout' in packets[1], false);
  assert.equal('idle_in_transaction_session_timeout' in packets[1], false);
  assert.equal(packets[1].application_name, 'tka-app');
});
