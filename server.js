const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const app = express();

// 1. LIMIT FIX: Crucial for high-res images/Base64 strings
app.use(cors());
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 2. DATABASE CONNECTION
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 3. AUTO-INITIALIZER: Ensures table existence on every deploy
const initDb = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS stores (
      id SERIAL PRIMARY KEY,
      handle TEXT UNIQUE NOT NULL,
      config_data JSONB NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(createTableQuery);
    console.log("✅ Database Table 'stores' is verified/created.");
  } catch (err) {
    console.error("❌ Error initializing database:", err);
  }
};
initDb();

/* ================== THE VIEWER (The "Mask" Engine) ================== */
app.get('/view/:handle', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Loading Storefront...</title>
        <style>
            body { background: #0f0f0f; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; font-family: sans-serif; }
            .loader { border: 3px solid #333; border-top: 3px solid #00d4ff; border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite; margin-bottom: 20px; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            #content { display: none; width: 100%; max-width: 600px; padding: 20px; text-align: center; }
            img.logo { max-width: 120px; border-radius: 15px; margin-bottom: 15px; }
        </style>
    </head>
    <body>
        <div id="loader-box">
            <div class="loader"></div>
            <p style="color: #888;">SYNCING STOREFRONT...</p>
        </div>
        <div id="content">
            <img id="store-logo" class="logo" src="" alt="">
            <h1 id="store-name"></h1>
            <p id="store-tagline" style="color: #aaa;"></p>
            <hr style="border: 0.5px solid #333; margin: 20px 0;">
            <div id="store-data-display"></div>
        </div>
        <script>
            const handle = window.location.pathname.split('/').pop();
            async function loadStore() {
                try {
                    const response = await fetch('/api/store/' + handle);
                    const data = await response.json();
                    if (data.error) {
                        document.body.innerHTML = "<h1>Store Not Found</h1>";
                        return;
                    }
                    document.getElementById('loader-box').style.display = 'none';
                    document.getElementById('content').style.display = 'block';
                    document.title = data.businessName;
                    document.getElementById('store-name').innerText = data.businessName;
                    document.getElementById('store-tagline').innerText = data.tagline;
                    if(data.logo) document.getElementById('store-logo').src = data.logo;
                } catch (err) {
                    document.body.innerHTML = "<h1>Connection Error</h1>";
                }
            }
            loadStore();
        </script>
    </body>
    </html>
  `);
});

/* ================== API: PUBLISH/UPDATE STORE ================== */
app.post('/api/publish', async (req, res) => {
  const { handle, configData } = req.body;
  try {
    const checkStore = await pool.query('SELECT created_at FROM stores WHERE handle = $1', [handle]);
    let trialDaysLeft = 7;
    
    if (checkStore.rows.length > 0) {
      const store = checkStore.rows[0];
      const createdDate = new Date(store.created_at);
      const diffDays = Math.ceil((new Date() - createdDate) / (1000 * 60 * 60 * 24));
      trialDaysLeft = 7 - diffDays;
      if (!configData.isActivated && trialDaysLeft <= 0) {
        return res.json({ status: 'expired', success: false, message: "Trial Expired" });
      }
    }

    const query = `
      INSERT INTO stores (handle, config_data) 
      VALUES ($1, $2) 
      ON CONFLICT (handle) 
      DO UPDATE SET config_data = $2, updated_at = NOW();
    `;
    await pool.query(query, [handle, configData]);
    res.json({ success: true, message: "Store Published!", trialDaysLeft: configData.isActivated ? 'Unlimited' : trialDaysLeft });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

/* ================== API: GET STORE DATA ================== */
app.get('/api/store/:handle', async (req, res) => {
  try {
    const result = await pool.query('SELECT config_data, created_at FROM stores WHERE handle = $1', [req.params.handle]);
    if (result.rows.length > 0) {
      const store = result.rows[0];
      const data = store.config_data;
      const createdDate = new Date(store.created_at);
      const diffDays = Math.ceil((new Date() - createdDate) / (1000 * 60 * 60 * 24));
      if (!data.isActivated && diffDays > 7) {
        return res.status(403).json({ error: "Store offline: Trial expired." });
      }
      res.json(data);
    } else {
      res.status(404).json({ error: "Store not found" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================== API: ADMIN DASHBOARD ================== */
app.get('/api/admin/all-stores', async (req, res) => {
  try {
    const result = await pool.query("SELECT handle, created_at, is_active, config_data->>'businessName' as name FROM stores ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Admin access error" });
  }
});

/* ================== API: MARKETPLACE ================== */
app.get('/api/marketplace', async (req, res) => {
  try {
    const result = await pool.query("SELECT handle, config_data->>'businessName' as name, config_data->>'logo' as logo, config_data->>'tagline' as tagline FROM stores WHERE is_active = true ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
