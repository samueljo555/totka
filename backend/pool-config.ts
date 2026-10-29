import type { PoolConfig } from 'pg';
export function poolConfig(env: NodeJS.ProcessEnv = process.env): PoolConfig {
  const integer = (name: string, fallback: number, max: number) => {
    const value = env[name];
    if (value === undefined || value === '') return fallback;
    if (!/^[1-9]\d*$/.test(value) || Number(value) > max) throw new Error(`${name} harus bilangan bulat positif maksimal ${max}.`);
    return Number(value);
  };
  const workers = integer('APP_WORKERS', 1, 256);
  const budget = integer('DB_CONNECTION_BUDGET', 40, 10000);
  if (budget < workers) throw new Error('DB_CONNECTION_BUDGET harus mencukupi seluruh APP_WORKERS.');
  const serverTimeouts = env.DB_SERVER_TIMEOUTS ?? 'true';
  if (!['true', 'false'].includes(serverTimeouts)) throw new Error('DB_SERVER_TIMEOUTS harus true atau false.');
  const statementTimeout = integer('DB_STATEMENT_TIMEOUT_MS', 15000, 120000);
  return {
    ...(env.DATABASE_URL ? { connectionString: env.DATABASE_URL } : {}),
    max: Math.min(integer('DB_POOL_MAX', 5, 1000), Math.floor(budget / workers)),
    connectionTimeoutMillis: integer('DB_CONNECTION_TIMEOUT_MS', 5000, 60000),
    idleTimeoutMillis: 30000,
    // Some transaction poolers reject these PostgreSQL startup parameters.
    // In that case configure server-side limits on the database role instead.
    ...(serverTimeouts === 'true' ? {
      statement_timeout: statementTimeout,
      idle_in_transaction_session_timeout: 20000,
    } : {}),
    query_timeout: integer('DB_QUERY_TIMEOUT_MS', 16000, 130000),
    application_name: 'tka-app',
  };
}
