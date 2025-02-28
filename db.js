require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,  // Utilisation de l'URL fournie par Railway
  ssl: {
    rejectUnauthorized: false // Important pour Railway
  }
});

module.exports = pool;
