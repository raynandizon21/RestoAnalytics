/**
 * PM2 ecosystem for RestoAnalytics (Express + Vite SPA).
 *
 * Build first:  npm run build
 * Start:        pm2 start ecosystem.config.cjs
 * Restart:      pm2 restart resto-analytics
 */
module.exports = {
  apps: [
    {
      name: 'resto-analytics',
      script: 'dist/server.cjs',
      cwd: '/var/www/resto-system/RestoAnalytics',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 2998,
      },
      out_file: './logs/out.log',
      error_file: './logs/err.log',
    },
  ],
};
