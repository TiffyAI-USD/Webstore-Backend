const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const init = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stores (
          id SERIAL PRIMARY KEY,
          handle TEXT UNIQUE NOT NULL,
          config_data JSONB NOT NULL,
          is_active BOOLEAN DEFAULT TRUE,
          trial_expiry TIMESTAMP DEFAULT CURRENT_TIMESTAMP + INTERVAL '7 days',
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Database tables are ready!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error initializing database:", err);
    process.exit(1);
  }
};

init();
