const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// DATABASE CONNECTION
// Render will automatically provide the DATABASE_URL environment variable
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// API: PUBLISH/UPDATE STORE
app.post('/api/publish', async (req, res) => {
  const { handle, configData } = req.body;
  
  try {
    const query = `
      INSERT INTO stores (handle, config_data) 
      VALUES ($1, $2) 
      ON CONFLICT (handle) 
      DO UPDATE SET config_data = $2, updated_at = NOW();
    `;
    await pool.query(query, [handle, configData]);
    res.json({ success: true, message: "Store Published!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

// API: GET STORE DATA (For the live customer-facing sites)
app.get('/api/store/:handle', async (req, res) => {
  try {
    const result = await pool.query('SELECT config_data, is_active FROM stores WHERE handle = $1', [req.params.handle]);
    
    if (result.rows.length > 0) {
      const store = result.rows[0];
      if (!store.is_active) {
        return res.status(403).json({ error: "This store is currently inactive." });
      }
      res.json(store.config_data);
    } else {
      res.status(404).json({ error: "Store not found" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
