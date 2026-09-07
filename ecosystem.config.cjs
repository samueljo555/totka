module.exports = {
  apps: [
    {
      name: "tka-app-server",
      script: "index.ts",
      cwd: "./backend",
      node_args: "-r ts-node/register",
      instances: "max",
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
      }
    }
  ]
};
