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
            
            .loader-wrap { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; }
            .loader { border: 3px solid #333; border-top: 3px solid var(--accent); border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            
            #content { display: none; padding: 20px; max-width: 600px; margin: 0 auto; animation: fadeIn 0.5s ease; }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

            header { text-align: center; padding: 40px 20px; }
            .logo { max-width: 110px; height: 110px; object-fit: cover; border-radius: 22%; margin-bottom: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 2px solid #222; }
            
            .section-title { color: var(--accent); font-size: 1.4rem; margin: 35px 0 15px 0; border-left: 4px solid var(--accent); padding-left: 12px; letter-spacing: 1px; text-transform: uppercase; }
            
            .item-card { background: var(--card); padding: 12px; border-radius: 16px; margin-bottom: 15px; display: flex; align-items: center; border: 1px solid #252525; transition: transform 0.2s; }
            .item-card:active { transform: scale(0.98); }
            
            .item-img { width: 80px; height: 80px; border-radius: 12px; object-fit: cover; margin-right: 15px; background: #222; flex-shrink: 0; }
            
            .item-details { flex: 1; }
            .item-name { font-weight: 700; font-size: 1.1rem; display: block; margin-bottom: 2px; }
            .item-desc { color: #888; font-size: 0.85rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
            
            .item-price { color: #00ff00; font-weight: 800; font-size: 1.1rem; padding-left: 10px; white-space: nowrap; }
            
            .wa-btn { background: #25d366; color: white; text-decoration: none; padding: 18px; border-radius: 50px; display: flex; align-items: center; justify-content: center; margin: 40px 0; font-weight: bold; font-size: 1.1rem; box-shadow: 0 4px 15px rgba(37, 211, 102, 0.3); }
            .wa-btn span { margin-left: 10px; }
            
            footer { text-align: center; padding: 40px; color: #444; font-size: 0.75rem; letter-spacing: 1px; }
        </style>
    </head>
    <body>
        <div id="loader-box" class="loader-wrap">
            <div class="loader"></div>
            <p style="color: #666; margin-top: 20px; font-weight: bold;">SYNCING RETAIL OS...</p>
        </div>

        <div id="content">
            <header>
                <img id="store-logo" class="logo" src="" alt="Store Logo">
                <h1 id="store-name" style="margin:0; font-size: 2rem;"></h1>
                <p id="store-tagline" style="color: #888; margin: 8px 0; font-size: 1rem;"></p>
            </header>

            <div id="menu-container"></div>

            <a id="wa-link" href="#" class="wa-btn">
                <svg width="24" height="24" fill="white" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.438 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.301-.15-1.779-.879-2.053-.979-.275-.1-.475-.15-.675.15-.199.299-.775.979-.95 1.174-.175.195-.349.219-.65.069-.3-.15-1.269-.467-2.417-1.492-.893-.796-1.494-1.78-1.669-2.079-.175-.299-.019-.461.13-.61.135-.133.301-.349.451-.523.149-.174.199-.299.299-.498.1-.199.05-.374-.025-.524-.075-.15-.675-1.625-.925-2.224-.244-.584-.493-.505-.675-.514-.175-.008-.375-.01-.575-.01s-.525.075-.799.375c-.275.3-.1.749-.1 1.224 0 .475.175.925.425 1.275.25.35 1.05 1.603 2.544 2.249.356.154.633.245.85.314.357.113.682.097.939.059.286-.042.879-.359 1.003-.707.125-.349.125-.648.088-.708-.037-.06-.138-.099-.438-.249z"/></svg>
                <span>Order via WhatsApp</span>
            </a>
            
            <footer id="footer-area">
                <p>Powered by Retail OS</p>
            </footer>
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
                    document.getElementById('content').style.display = 'block';

                    // Set Identity
                    document.title = data.businessName + " | Storefront";
                    document.getElementById('store-name').innerText = data.businessName;
                    document.getElementById('store-tagline').innerText = data.tagline;
                    if(data.logo) document.getElementById('store-logo').src = data.logo;
                    document.getElementById('wa-link').href = "https://wa.me/" + data.wa;

                    // Render Menu
                    const container = document.getElementById('menu-container');
                    if(data.menu && data.menu.length > 0) {
                        data.menu.forEach(section => {
                            const secNode = document.createElement('div');
                            secNode.innerHTML = '<h2 class="section-title">' + section.title + '</h2>';
                            
                            section.items.forEach(item => {
                                const itemNode = document.createElement('div');
                                itemNode.className = 'item-card';
                                
                                // Support for images (checking common keys)
                                const imgUri = item.image || item.img || '';
                                const imgHtml = imgUri ? \`<img src="\${imgUri}" class="item-img" alt="\${item.name}">\` : '';

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
                    }
                    
                } catch (err) {
                    document.body.innerHTML = "<div class='loader-wrap'><h1>Connection Lost</h1><p>Try refreshing the page.</p></div>";
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
