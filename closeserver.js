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
        <title>Storefront</title>
        <style>
            :root { --accent: #00d4ff; --bg: #0f0f0f; --card: #1a1a1a; --text: #ffffff; }
            body { background: var(--bg); color: var(--text); margin: 0; font-family: -apple-system, sans-serif; line-height: 1.4; }
            
            /* LARGE BANNER - Optimized for Mobile View */
            .banner-container { width: 100%; height: 260px; background: #111; overflow: hidden; position: relative; }
            #store-banner { width: 100%; height: 100%; object-fit: cover; }
            .banner-overlay { position: absolute; top:0; left:0; width:100%; height:100%; background: linear-gradient(to bottom, transparent, var(--bg)); }
            
            header { text-align: center; margin-top: -80px; position: relative; z-index: 10; padding: 0 20px 20px 20px; }
            .logo { width: 120px; height: 120px; object-fit: cover; border-radius: 25px; border: 5px solid var(--bg); box-shadow: 0 10px 30px rgba(0,0,0,0.8); background: var(--card); }
            
            #content { display: none; max-width: 600px; margin: 0 auto; animation: fadeIn 0.6s ease; }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

            .section-title { color: var(--accent); font-size: 1.5rem; margin: 40px 20px 20px 20px; font-weight: 800; letter-spacing: -0.5px; }
            
            /* PRODUCT CARDS - Larger Images & Full Text */
            .item-card { background: var(--card); margin: 0 15px 20px 15px; border-radius: 24px; overflow: hidden; border: 1px solid #252525; display: flex; flex-direction: column; }
            .item-img-box { width: 100%; position: relative; }
            .item-img { width: 100%; height: auto; max-height: 400px; object-fit: cover; display: block; }
            
            .item-body { padding: 20px; }
            .item-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
            .item-name { font-weight: 800; font-size: 1.3rem; flex: 1; padding-right: 10px; }
            .item-price { color: #00ff00; font-weight: 900; font-size: 1.3rem; }
            
            .item-desc { color: #bbb; font-size: 1rem; margin-bottom: 15px; white-space: pre-wrap; } /* Full description allowed */
            
            /* 5-STAR RATING SYSTEM */
            .stars { color: #ffcc00; font-size: 0.9rem; margin-bottom: 5px; letter-spacing: 2px; }
            
            .wa-btn { background: #25d366; color: white; text-decoration: none; padding: 20px; border-radius: 18px; display: flex; align-items: center; justify-content: center; margin: 40px 20px; font-weight: 800; font-size: 1.2rem; box-shadow: 0 10px 20px rgba(37, 211, 102, 0.2); }
            
            .loader-wrap { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; }
            .loader { border: 4px solid #333; border-top: 4px solid var(--accent); border-radius: 50%; width: 60px; height: 60px; animation: spin 1s linear infinite; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
    </head>
    <body>
        <div id="loader-box" class="loader-wrap">
            <div class="loader"></div>
            <p style="color: #888; margin-top: 25px; font-weight: bold; letter-spacing: 2px;">RETAIL OS SYNCING...</p>
        </div>

        <div id="full-store" style="display:none;">
            <div class="banner-container">
                <img id="store-banner" src="" alt="">
                <div class="banner-overlay"></div>
            </div>

            <div id="content">
                <header>
                    <img id="store-logo" class="logo" src="" alt="">
                    <h1 id="store-name" style="margin:15px 0 5px 0; font-size: 2.2rem; font-weight: 900;"></h1>
                    <p id="store-tagline" style="color: #aaa; margin: 0; font-size: 1.1rem;"></p>
                </header>

                <div id="menu-container"></div>

                <a id="wa-link" href="#" class="wa-btn">💬 ORDER VIA WHATSAPP</a>
                <footer style="text-align:center; padding: 40px; color: #444; font-size: 0.8rem; font-weight: bold;">POWERED BY RETAIL OS v1.0</footer>
            </div>
        </div>

        <script>
            const handle = window.location.pathname.split('/').pop();
            
            async function bootStore() {
                try {
                    const response = await fetch('/api/store/' + handle);
                    const data = await response.json();
                    
                    if (data.error) {
                        document.body.innerHTML = "<div class='loader-wrap'><h1 style='color:var(--accent)'>NOTICE</h1><p>"+data.error+"</p></div>";
                        return;
                    }

                    document.getElementById('loader-box').style.display = 'none';
                    document.getElementById('full-store').style.display = 'block';
                    document.getElementById('content').style.display = 'block';

                    document.title = data.businessName;
                    document.getElementById('store-name').innerText = data.businessName;
                    document.getElementById('store-tagline').innerText = data.tagline;
                    
                    if(data.logo) document.getElementById('store-logo').src = data.logo;
                    if(data.banner) document.getElementById('store-banner').src = data.banner;
                    document.getElementById('wa-link').href = "https://wa.me/" + data.wa;

                    const container = document.getElementById('menu-container');
                    data.menu.forEach(section => {
                        const secNode = document.createElement('div');
                        secNode.innerHTML = '<h2 class="section-title">' + section.title + '</h2>';
                        
                        section.items.forEach(item => {
                            const itemNode = document.createElement('div');
                            itemNode.className = 'item-card';
                            const imgUri = item.image || item.img || '';
                            const imgHtml = imgUri ? \`<div class="item-img-box"><img src="\${imgUri}" class="item-img"></div>\` : '';

                            itemNode.innerHTML = \`
                                \${imgHtml}
                                <div class="item-body">
                                    <div class="stars">★★★★★</div>
                                    <div class="item-header">
                                        <span class="item-name">\${item.name}</span>
                                        <span class="item-price">\${data.curr} \${item.price}</span>
                                    </div>
                                    <div class="item-desc">\${item.desc || ''}</div>
                                </div>
                            \`;
                            secNode.appendChild(itemNode);
                        });
                        container.appendChild(secNode);
                    });
                } catch (err) {
                    document.body.innerHTML = "<h1>Connection Error</h1>";
                }
            }
            bootStore();
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

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
