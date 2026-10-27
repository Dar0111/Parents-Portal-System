// Parent's Portal System — the PM2 process definition for the Hostinger VPS.
//
// NOTHING HERE IS A SECRET and nothing here is configuration the application
// reads: every setting the API needs — the Supabase credentials, JWT_SECRET,
// PORT, CORS_ORIGIN, the mail and SMS transports — lives in server/.env,
// which is git-ignored and reaches the VPS by scp (deploy/README.md step 6).
// Do not add one of those keys to this file.
//
//   pm2 start deploy/pm2/ecosystem.config.js
//   pm2 save
module.exports = {
  apps: [
    {
      name: 'parents-portal-api',
      script: 'server.js',

      // server.js line 1 is `require('dotenv').config()`, which resolves
      // server/.env RELATIVE TO THE WORKING DIRECTORY. Started anywhere else
      // the API comes up with no database settings and no JWT secret.
      cwd: '/home/portal/Parents_Portal/server',

      // ONE PROCESS, FORK MODE — never cluster. Socket.io rooms live in the
      // process that owns the connection (socket.js joins `user:<id>`), so a
      // second worker would silently fail to deliver live updates to half the
      // users. Messages would still persist and appear on refresh, which is
      // exactly the kind of bug that takes a day to find.
      instances: 1,
      exec_mode: 'fork',

      autorestart: true,
      max_memory_restart: '500M',
      time: true,

      env: {
        // THE PROCESS TIME ZONE, and it cannot live in server/.env: Node
        // reads TZ from the environment at startup, before dotenv has run.
        // utils/dateFormat.js todayLocalDateString() reads the process's own
        // zone, and it gates same-day attendance and excuse letters, the
        // dashboard's current term, the one-year-ahead event check and backup
        // file names. On a UTC host, from midnight to 8 AM Manila a teacher's
        // attendance for today is refused as "in the future".
        // `timedatectl set-timezone Asia/Manila` sets the host as well
        // (README step 2); this line means the API is right even if the host
        // is ever rebuilt without it.
        TZ: 'Asia/Manila',
      },
    },
  ],
};
