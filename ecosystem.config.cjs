module.exports = {
  apps: [
    {
      name: "tka-app-server",
      script: "npm",
      args: "run start",
      cwd: "./backend",
      env: {
        NODE_ENV: "production",
      }
    }
  ]
};
