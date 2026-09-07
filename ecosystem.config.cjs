module.exports = {
  apps: [
    {
      name: "tka-app-server",
      script: "dist/index.js",
      cwd: "./backend",
      instances: "max",
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
      }
    }
  ]
};
