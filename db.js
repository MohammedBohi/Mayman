require('dotenv').config();
const { Pool } = require('pg');

// Détecter si on pointe vers une base locale (pgAdmin)
const dbUrl = process.env.DATABASE_URL || '';
const isLocal = /localhost|127\.0\.0\.1/.test(dbUrl);

const pool = new Pool({
  connectionString: dbUrl,
  // En local (pgAdmin), pas de SSL; en prod (Railway), SSL requis
  ssl: isLocal ? false : { rejectUnauthorized: false }
});

module.exports = pool;
