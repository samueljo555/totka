module.exports = {
  apps: [
    {
      name: "tka-app-server",
      script: "node",
      args: "--require ts-node/register index.ts",
      cwd: "./backend",
      instances: "max",
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
      }
    }
  ]
};
