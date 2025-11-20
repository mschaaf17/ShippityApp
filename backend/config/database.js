const { Pool } = require('pg');
require('dotenv').config();

const shouldUseSSL =
  process.env.DATABASE_SSL === 'true' ||
  (process.env.DATABASE_URL &&
    (process.env.DATABASE_URL.includes('supabase.co') ||
      process.env.DATABASE_URL.includes('render.com') ||
      process.env.DATABASE_URL.includes('neon.tech')));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: shouldUseSSL ? { rejectUnauthorized: false } : false,
});

// Test database connection
pool.on('connect', () => {
  console.log('✅ Database connected successfully');
});

pool.on('error', (err) => {
  console.error('❌ Database connection error:', err);
});

module.exports = pool;

