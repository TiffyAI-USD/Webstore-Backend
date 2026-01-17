const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const createTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS stores (
        id SERIAL PRIMARY KEY,
        handle TEXT UNIQUE NOT NULL,
        config_data JSONB NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        trial_expiry TIMESTAMP DEFAULT CURRENT_TIMESTAMP + INTERVAL '7 days',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(query);
    console.log("SUCCESS: Table created or already exists!");
    process.exit(0);
  } catch (err) {
    console.error("ERROR creating table:", err);
    process.exit(1);
  }
};

createTable();
