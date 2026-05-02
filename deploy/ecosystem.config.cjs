module.exports = {
  apps: [
    {
      name: 'copje',
      script: 'node',
      args: 'node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port 3000',
      cwd: '/root/copje',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOSTNAME: '0.0.0.0',
      },
      watch: false,
      max_restarts: 20,
      min_uptime: '10s',
    },
  ],
};
