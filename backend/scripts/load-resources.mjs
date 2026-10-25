import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
const ticks = Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).trim());
async function usage(pids) {
  let cpuSeconds = 0, rssMb = 0;
  for (const pid of pids) {
    try {
      const [stat, status] = await Promise.all([readFile(`/proc/${pid}/stat`, 'utf8'), readFile(`/proc/${pid}/status`, 'utf8')]);
      const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
      cpuSeconds += (Number(fields[11]) + Number(fields[12])) / ticks;
      rssMb += Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] || 0) / 1024;
    } catch { /* Short-lived processes can exit between samples. */ }
  }
  return { cpuSeconds, rssMb };
}
export async function sampleResources(pool, workers, generatorPid) {
  const rows = (await pool.query(`SELECT pid,state,wait_event_type FROM pg_stat_activity WHERE datname=current_database() AND application_name='tka-app'`)).rows;
  const [app, generator, postgresBackends] = await Promise.all([usage(workers), usage(generatorPid ? [generatorPid] : []), usage(rows.map(row => row.pid))]);
  const memory = await readFile('/proc/meminfo', 'utf8');
  const availableMemoryMb = Number(/MemAvailable:\s+(\d+)/.exec(memory)?.[1] || os.freemem() / 1024) / 1024;
  return { at: Date.now(), app, generator, postgresBackends, connections: rows.length, activeConnections: rows.filter(row => row.state === 'active').length,
    waitingLocks: rows.filter(row => row.wait_event_type === 'Lock').length, availableMemoryMb };
}
export function summarizeResources(samples) {
  const max = key => Math.max(0, ...samples.map(key));
  const groups = {};
  for (const name of ['app', 'generator', 'postgresBackends']) {
    let cpu = 0, seconds = 0, peakCpu = 0;
    for (let i = 1; i < samples.length; i++) {
      const elapsed = (samples[i].at - samples[i - 1].at) / 1000;
      const consumed = Math.max(0, samples[i][name].cpuSeconds - samples[i - 1][name].cpuSeconds);
      if (elapsed > 0) { cpu += consumed; seconds += elapsed; peakCpu = Math.max(peakCpu, consumed / elapsed * 100); }
    }
    groups[name] = { peakRssMb: max(sample => sample[name].rssMb), averageCpuPercent: seconds ? cpu / seconds * 100 : null, peakCpuPercent: peakCpu };
  }
  return { samples: samples.length, ...groups, peakConnections: max(s => s.connections), peakActiveConnections: max(s => s.activeConnections), peakLockWaiters: max(s => s.waitingLocks), minimumAvailableMemoryMb: samples.length ? Math.min(...samples.map(s => s.availableMemoryMb)) : null,
    note: 'CPU 100% equals one logical core. PostgreSQL RSS is the sum of app connection backends and can double-count shared pages; excludes postmaster/background processes. Generator/app/DB share the host.' };
}
