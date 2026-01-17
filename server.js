const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const app = express();

// 1. FIXED: Increase limits to handle those large Base64 image strings
app.use(cors());
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// DATABASE CONNECTION
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* ================== API: PUBLISH/UPDATE STORE ================== */
app.post('/api/publish', async (req, res) => {
  const { handle, configData } = req.body;
  
  try {
    // 2. TRIAL LOGIC: Check if store exists to get the creation date
    const checkStore = await pool.query('SELECT created_at, is_active FROM stores WHERE handle = $1', [handle]);
    
    let trialDaysLeft = 7;
    
    if (checkStore.rows.length > 0) {
      const store = checkStore.rows[0];
      const createdDate = new Date(store.created_at);
      const now = new Date();
      const diffTime = Math.abs(now - createdDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      trialDaysLeft = 7 - diffDays;

      // 3. EXPIRY GUARD: If not activated and trial is over, block the sync
      if (!configData.isActivated && trialDaysLeft <= 0) {
        return res.json({ status: 'expired', success: false, message: "7-Day Trial Expired" });
      }
    }

    // 4. SAVE TO DB: Update or Insert
    const query = `
      INSERT INTO stores (handle, config_data) 
      VALUES ($1, $2) 
      ON CONFLICT (handle) 
      DO UPDATE SET config_data = $2, updated_at = NOW();
    `;
    await pool.query(query, [handle, configData]);
    
    res.json({ 
      success: true, 
      message: "Store Published!", 
      trialDaysLeft: configData.isActivated ? 'Unlimited' : trialDaysLeft 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Database error" });
  }
});

/* ================== API: GET STORE DATA ================== */
app.get('/api/store/:handle', async (req, res) => {
  try {
    const result = await pool.query('SELECT config_data, created_at FROM stores WHERE handle = $1', [req.params.handle]);
    
    if (result.rows.length > 0) {
      const store = result.rows[0];
      const data = store.config_data;

      // 5. LIVE VIEW GUARD: Check trial status even for visitors
      const createdDate = new Date(store.created_at);
      const diffDays = Math.ceil((new Date() - createdDate) / (1000 * 60 * 60 * 24));
      
      if (!data.isActivated && diffDays > 7) {
        return res.status(403).json({ error: "Trial Expired. Contact owner to activate." });
      }

      res.json(data);
    } else {
      res.status(404).json({ error: "Store not found" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
