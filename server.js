const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 1. DATABASE INIT (Ensures all tables exist for tomorrow)
const initDb = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS stores (
      id SERIAL PRIMARY KEY,
      handle TEXT UNIQUE NOT NULL,
      config_data JSONB NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sales (
      id SERIAL PRIMARY KEY,
      store_handle TEXT,
      order_data JSONB,
      total_amount NUMERIC,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(query);
    console.log("✅ Database Synced: Stores & Sales tables ready.");
  } catch (err) { console.error("❌ DB Init Error:", err); }
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
        <title>Retail OS Storefront</title>
        <style>
            :root { --accent: #00d4ff; --bg: #0f0f0f; --card: #1a1a1a; --text: #ffffff; }
            body { background: var(--bg); color: var(--text); margin: 0; font-family: -apple-system, sans-serif; line-height: 1.4; padding-bottom: 120px; }
            
            /* FULL SCREEN BACKGROUND BANNER */
            .banner-container { 
                width: 100%; 
                height: 60vh; /* Large Hero Height */
                background: #000; 
                position: relative; 
                overflow: hidden;
            }
            #store-banner { 
                width: 100.2%; /* "A millimeter bigger" than the container to prevent edge gaps */
                height: 100%; 
                object-fit: cover; 
                object-position: center;
                display: block;
                margin-left: -0.1%; /* Centers the slightly wider image */
            }
            .banner-overlay { 
                position: absolute; 
                bottom: 0; 
                width: 100%; 
                height: 50%; 
                background: linear-gradient(to top, var(--bg), transparent); 
            }
            
            /* CONDITIONAL LOGO LOGIC */
            header { text-align: center; margin-top: -60px; position: relative; z-index: 10; padding: 0 20px; }
            .logo { width: 120px; height: 120px; object-fit: cover; border-radius: 25px; border: 4px solid var(--bg); box-shadow: 0 10px 30px rgba(0,0,0,0.8); background: var(--card); display: none; margin: 0 auto; }
            
            /* ANALYTICS BADGE */
            .sales-count { background: rgba(0, 212, 255, 0.1); border: 1px solid var(--accent); color: var(--accent); padding: 5px 15px; border-radius: 50px; font-size: 0.8rem; font-weight: bold; margin-top: 10px; display: inline-block; }

            #content { display: none; max-width: 600px; margin: 0 auto; }
            .section-title { color: var(--accent); font-size: 1.4rem; margin: 40px 20px 15px 20px; font-weight: 800; text-transform: uppercase; }
            
            /* PRODUCT CARDS - Sized slightly smaller than the banner */
            .item-card { background: var(--card); margin: 0 20px 25px 20px; border-radius: 24px; overflow: hidden; border: 1px solid #252525; }
            .item-img { width: 100%; height: auto; max-height: 350px; object-fit: cover; display: block; }
            
            .item-body { padding: 20px; }
            .item-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
            .item-name { font-weight: 800; font-size: 1.2rem; flex: 1; }
            .item-price { color: #00ff00; font-weight: 900; font-size: 1.2rem; margin-left: 10px; }
            .item-desc { color: #aaa; font-size: 0.95rem; margin-bottom: 20px; white-space: pre-wrap; }

            .order-bar { position: fixed; bottom: 0; left: 0; width: 100%; background: #111; border-top: 1px solid #333; padding: 20px; box-sizing: border-box; z-index: 1000; display: flex; justify-content: space-between; align-items: center; }
            .wa-btn { background: #25d366; color: white; text-decoration: none; padding: 12px 25px; border-radius: 50px; font-weight: 800; border: none; }
            
            .loader-wrap { display: flex; justify-content: center; align-items: center; height: 100vh; }
            .loader { border: 4px solid #333; border-top: 4px solid var(--accent); border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
    </head>
    <body>
        <div id="loader-box" class="loader-wrap"><div class="loader"></div></div>

        <div id="full-store" style="display:none;">
            <div class="banner-container">
                <img id="store-banner" src="" alt="">
                <div class="banner-overlay"></div>
            </div>

            <div id="content">
                <header>
                    <img id="store-logo" class="logo" src="" alt="">
                    <h1 id="store-name" style="margin:10px 0 5px 0; font-size: 2rem; font-weight: 900;"></h1>
                    <p id="store-tagline" style="color: #888; margin: 0;"></p>
                    <div id="analytics-box"></div> </header>
                <div id="menu-container"></div>
            </div>

            <div class="order-bar">
                <div style="display:flex; flex-direction:column;">
                    <span style="color:#888; font-size:0.7rem;">TOTAL ESTIMATE</span>
                    <span id="float-total" style="font-weight:900; font-size:1.3rem; color:#00ff00;">--</span>
                </div>
                <button onclick="sendOrder()" class="wa-btn">SEND ORDER</button>
            </div>
        </div>

        <script>
            const handle = window.location.pathname.split('/').pop();
            let cart = {};
            let storeData = null;

            async function bootStore() {
                try {
                    const response = await fetch('/api/store/' + handle);
                    storeData = await response.json();
                    
                    // Fetch Sales Analytics
                    const salesRes = await fetch('/api/sales/' + handle);
                    const salesData = await salesRes.json();
                    
                    document.getElementById('loader-box').style.display = 'none';
                    document.getElementById('full-store').style.display = 'block';
                    document.getElementById('content').style.display = 'block';

                    document.getElementById('store-name').innerText = storeData.businessName;
                    document.getElementById('store-tagline').innerText = storeData.tagline;
                    
                    // Analytics Sync
                    if (salesData.length > 0) {
                        document.getElementById('analytics-box').innerHTML = \`
                            <div class="sales-count">🔥 \${salesData.length} Orders Pushed via Link</div>
                        \`;
                    }

                    // LOGO HIDE/SHOW LOGIC
                    const logoEl = document.getElementById('store-logo');
                    if(storeData.logo && storeData.logo.trim() !== "") {
                        logoEl.src = storeData.logo;
                        logoEl.style.display = "block";
                    } else {
                        logoEl.style.display = "none";
                    }

                    if(storeData.banner) document.getElementById('store-banner').src = storeData.banner;

                    renderMenu();
                } catch (err) { console.error(err); }
            }

            // ... (keep rest of renderMenu and sendOrder logic from last night) ...
        </script>
    </body>
    </html>
  `);
});

/* ================== API: SALES DATA (For Tomorrow) ================== */
app.get('/api/sales/:handle', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT order_data, total_amount, created_at FROM sales WHERE store_handle = $1 ORDER BY created_at DESC', 
      [req.params.handle]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/log-sale', async (req, res) => {
  try {
    const { handle, cart, total } = req.body;
    await pool.query('INSERT INTO sales (store_handle, order_data, total_amount) VALUES ($1, $2, $3)', [handle, cart, total]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ================== API: CORE STORE OPS ================== */
app.post('/api/publish', async (req, res) => {
  try {
    const { handle, configData } = req.body;
    await pool.query("INSERT INTO stores (handle, config_data) VALUES ($1, $2) ON CONFLICT (handle) DO UPDATE SET config_data = $2", [handle, configData]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.get('/api/store/:handle', async (req, res) => {
  try {
    const result = await pool.query('SELECT config_data FROM stores WHERE handle = $1', [req.params.handle]);
    if (result.rows.length > 0) res.json(result.rows[0].config_data);
    else res.status(404).json({ error: "Store not found" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/all-stores', async (req, res) => {
  try {
    const result = await pool.query("SELECT handle, config_data->>'businessName' as name FROM stores");
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: "Admin error" }); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('🚀 Retail OS Live'));
