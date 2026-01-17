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
        <title>Retail OS Storefront</title>
        <style>
            :root { --accent: #00d4ff; --bg: #0f0f0f; --card: #1a1a1a; --text: #ffffff; }
            body { background: var(--bg); color: var(--text); margin: 0; font-family: -apple-system, sans-serif; line-height: 1.6; }
            
            /* Banner & Header */
            .banner-container { width: 100%; height: 180px; background: #222; overflow: hidden; position: relative; }
            #store-banner { width: 100%; height: 100%; object-fit: cover; opacity: 0.6; }
            
            header { text-align: center; margin-top: -55px; position: relative; z-index: 10; padding-bottom: 10px; }
            .logo { width: 110px; height: 110px; object-fit: cover; border-radius: 22%; border: 4px solid var(--bg); box-shadow: 0 10px 25px rgba(0,0,0,0.5); background: var(--card); }
            
            /* Content Area */
            #content { display: none; padding: 0 20px 20px 20px; max-width: 600px; margin: 0 auto; animation: fadeIn 0.5s ease; }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

            .section-title { color: var(--accent); font-size: 1.2rem; margin: 35px 0 15px 0; border-left: 4px solid var(--accent); padding-left: 12px; text-transform: uppercase; letter-spacing: 1px; }
            
            .item-card { background: var(--card); padding: 12px; border-radius: 16px; margin-bottom: 15px; display: flex; align-items: center; border: 1px solid #252525; }
            .item-img { width: 70px; height: 70px; border-radius: 10px; object-fit: cover; margin-right: 15px; background: #222; flex-shrink: 0; }
            
            .item-details { flex: 1; }
            .item-name { font-weight: 700; font-size: 1rem; display: block; }
            .item-desc { color: #888; font-size: 0.8rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
            .item-price { color: #00ff00; font-weight: 800; font-size: 1rem; padding-left: 10px; }
            
            .wa-btn { background: #25d366; color: white; text-decoration: none; padding: 18px; border-radius: 50px; display: flex; align-items: center; justify-content: center; margin: 40px 0; font-weight: bold; }
            .loader-wrap { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; }
            .loader { border: 3px solid #333; border-top: 3px solid var(--accent); border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
    </head>
    <body>
        <div id="loader-box" class="loader-wrap">
            <div class="loader"></div>
            <p style="color: #666; margin-top: 20px;">SYNCING STOREFRONT...</p>
        </div>

        <div id="full-store" style="display:none;">
            <div class="banner-container">
                <img id="store-banner" src="" alt="">
            </div>

            <div id="content">
                <header>
                    <img id="store-logo" class="logo" src="" alt="">
                    <h1 id="store-name" style="margin:10px 0 0 0; font-size: 1.8rem;"></h1>
                    <p id="store-tagline" style="color: #888; margin: 5px 0;"></p>
                </header>

                <div id="menu-container"></div>

                <a id="wa-link" href="#" class="wa-btn">💬 Order via WhatsApp</a>
                <footer style="text-align:center; padding: 20px; color: #444; font-size: 0.7rem;">Powered by Retail OS</footer>
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
                            const imgHtml = imgUri ? \`<img src="\${imgUri}" class="item-img">\` : '';

                            itemNode.innerHTML = \`
                                \${imgHtml}
                                <div class="item-details">
                                    <span class="item-name">\${item.name}</span>
                                    <span class="item-desc">\${item.desc || ''}</span>
                                </div>
                                <span class="item-price">\${data.curr} \${item.price}</span>
                            \`;
                            secNode.appendChild(itemNode);
                        });
                        container.appendChild(secNode);
                    });
                } catch (err) {
                    document.body.innerHTML = "<h1>Error Connecting</h1>";
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
