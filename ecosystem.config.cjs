const workers = Number(process.env.WEB_CONCURRENCY || 2);
if (!Number.isInteger(workers) || workers < 1 || workers > 256) throw new Error('WEB_CONCURRENCY harus 1–256.');
module.exports = {
  apps: [
    {
      name: "tka-app-server",
      script: "dist/index.js",
      cwd: require("node:path").join(__dirname, "backend"),
      wait_ready: true,
      listen_timeout: 20000,
      instances: workers,
      exec_mode: "cluster",
      kill_timeout: 20000,
      env: {
        NODE_ENV: "production",
        APP_WORKERS: process.env.APP_WORKERS || String(workers),
      }
    }
  ]
};
