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

// 1. DATABASE INIT: Added 'sales' table for your new idea
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
            body { background: var(--bg); color: var(--text); margin: 0; font-family: -apple-system, sans-serif; line-height: 1.4; padding-bottom: 100px; }
            
            /* BANNER FIX: Position TOP & Responsive Height */
            .banner-container { width: 100%; height: 40vh; background: #111; overflow: hidden; position: relative; }
            #store-banner { width: 100%; height: 100%; object-fit: cover; object-position: top; }
            .banner-overlay { position: absolute; top:0; left:0; width:100%; height:100%; background: linear-gradient(to bottom, transparent, var(--bg)); }
            
            header { text-align: center; margin-top: -60px; position: relative; z-index: 10; padding: 0 20px; }
            .logo { width: 110px; height: 110px; object-fit: cover; border-radius: 22px; border: 4px solid var(--bg); box-shadow: 0 10px 30px rgba(0,0,0,0.8); }
            
            #content { display: none; max-width: 600px; margin: 0 auto; animation: fadeIn 0.6s ease; }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

            .section-title { color: var(--accent); font-size: 1.4rem; margin: 40px 20px 15px 20px; font-weight: 800; text-transform: uppercase; }
            
            /* PRODUCT CARDS: Full View */
            .item-card { background: var(--card); margin: 0 15px 25px 15px; border-radius: 24px; overflow: hidden; border: 1px solid #252525; }
            .item-img { width: 100%; height: auto; max-height: 350px; object-fit: cover; display: block; }
            
            .item-body { padding: 20px; }
            .stars { color: #ffcc00; font-size: 0.8rem; margin-bottom: 8px; letter-spacing: 2px; }
            .item-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
            .item-name { font-weight: 800; font-size: 1.2rem; flex: 1; }
            .item-price { color: #00ff00; font-weight: 900; font-size: 1.2rem; margin-left: 10px; }
            .item-desc { color: #aaa; font-size: 0.95rem; margin-bottom: 20px; white-space: pre-wrap; }

            /* QUANTITY SELECTOR */
            .qty-controls { display: flex; align-items: center; background: #222; border-radius: 50px; width: fit-content; padding: 5px 15px; }
            .qty-btn { background: none; border: none; color: var(--accent); font-size: 1.5rem; font-weight: bold; cursor: pointer; padding: 0 10px; }
            .qty-val { font-weight: bold; min-width: 30px; text-align: center; font-size: 1.1rem; }

            /* FLOATING ORDER BAR */
            .order-bar { position: fixed; bottom: 0; left: 0; width: 100%; background: #111; border-top: 1px solid #333; padding: 20px; box-sizing: border-box; z-index: 1000; display: flex; justify-content: space-between; align-items: center; }
            .total-info { display: flex; flex-direction: column; }
            .wa-btn { background: #25d366; color: white; text-decoration: none; padding: 12px 25px; border-radius: 50px; font-weight: 800; box-shadow: 0 5px 15px rgba(37,211,102,0.3); }
            
            .loader-wrap { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; }
            .loader { border: 4px solid #333; border-top: 4px solid var(--accent); border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite; }
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
                </header>
                <div id="menu-container"></div>
            </div>

            <div class="order-bar">
                <div class="total-info">
                    <span style="color:#888; font-size:0.8rem;">TOTAL ESTIMATE</span>
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
                    if (storeData.error) { document.body.innerHTML = "<h1>Offline</h1>"; return; }

                    document.getElementById('loader-box').style.display = 'none';
                    document.getElementById('full-store').style.display = 'block';
                    document.getElementById('content').style.display = 'block';

                    document.getElementById('store-name').innerText = storeData.businessName;
                    document.getElementById('store-tagline').innerText = storeData.tagline;
                    if(storeData.logo) document.getElementById('store-logo').src = storeData.logo;
                    if(storeData.banner) document.getElementById('store-banner').src = storeData.banner;

                    renderMenu();
                } catch (err) { console.error(err); }
            }

            function renderMenu() {
                const container = document.getElementById('menu-container');
                container.innerHTML = "";
                storeData.menu.forEach((section, sIdx) => {
                    const secNode = document.createElement('div');
                    secNode.innerHTML = '<h2 class="section-title">' + section.title + '</h2>';
                    
                    section.items.forEach((item, iIdx) => {
                        const itemKey = \`\${sIdx}-\${iIdx}\`;
                        const qty = cart[itemKey] ? cart[itemKey].qty : 0;
                        const imgUri = item.image || item.img || '';
                        
                        const itemCard = document.createElement('div');
                        itemCard.className = 'item-card';
                        itemCard.innerHTML = \`
                            \${imgUri ? \`<img src="\${imgUri}" class="item-img">\` : ''}
                            <div class="item-body">
                                <div class="stars">★★★★★</div>
                                <div class="item-header">
                                    <span class="item-name">\${item.name}</span>
                                    <span class="item-price">\${storeData.curr} \${item.price}</span>
                                </div>
                                <div class="item-desc">\${item.desc || ''}</div>
                                <div class="qty-controls">
                                    <button class="qty-btn" onclick="updateCart('\${itemKey}', \${item.price}, -1, '\${item.name}')">−</button>
                                    <span class="qty-val" id="qty-\${itemKey}">\${qty}</span>
                                    <button class="qty-btn" onclick="updateCart('\${itemKey}', \${item.price}, 1, '\${item.name}')">+</button>
                                </div>
                            </div>
                        \`;
                        secNode.appendChild(itemCard);
                    });
                    container.appendChild(secNode);
                });
                updateFloatingTotal();
            }

            function updateCart(key, price, delta, name) {
                if (!cart[key]) cart[key] = { qty: 0, price: price, name: name };
                cart[key].qty += delta;
                if (cart[key].qty <= 0) delete cart[key];
                document.getElementById('qty-'+key).innerText = cart[key] ? cart[key].qty : 0;
                updateFloatingTotal();
            }

            function updateFloatingTotal() {
                let total = 0;
                Object.values(cart).forEach(i => total += (i.qty * i.price));
                document.getElementById('float-total').innerText = \`\${storeData.curr} \${total}\`;
            }

            async function sendOrder() {
                if (Object.keys(cart).length === 0) return alert("Select some items first!");
                
                let total = 0;
                let text = "🚀 *NEW ORDER*\\n\\n";
                Object.values(cart).forEach(i => {
                    text += \`• \${i.qty}x \${i.name} (\${storeData.curr} \${i.qty * i.price})\\n\`;
                    total += (i.qty * i.price);
                });
                text += \`\\n💰 *TOTAL: \${storeData.curr} \${total}*\`;

                // SYNC TO DB
                await fetch('/api/log-sale', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ handle, cart, total })
                });

                window.location.href = \`https://wa.me/\${storeData.wa}?text=\${encodeURIComponent(text)}\`;
            }
            bootStore();
        </script>
    </body>
    </html>
  `);
});

/* ================== API: LOG SALE ================== */
app.post('/api/log-sale', async (req, res) => {
  const { handle, cart, total } = req.body;
  try {
    await pool.query('INSERT INTO sales (store_handle, order_data, total_amount) VALUES ($1, $2, $3)', [handle, cart, total]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ================== API: PUBLISH/UPDATE STORE ================== */
app.post('/api/publish', async (req, res) => {
  const { handle, configData } = req.body;
  try {
    const query = \`
      INSERT INTO stores (handle, config_data) VALUES ($1, $2) 
      ON CONFLICT (handle) DO UPDATE SET config_data = $2, updated_at = NOW();
    \`;
    await pool.query(query, [handle, configData]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

/* ================== API: GET STORE DATA ================== */
app.get('/api/store/:handle', async (req, res) => {
  try {
    const result = await pool.query('SELECT config_data FROM stores WHERE handle = $1', [req.params.handle]);
    if (result.rows.length > 0) res.json(result.rows[0].config_data);
    else res.status(404).json({ error: "Store not found" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ================== API: ADMIN ALL STORES ================== */
app.get('/api/admin/all-stores', async (req, res) => {
  try {
    const result = await pool.query("SELECT handle, config_data->>'businessName' as name FROM stores");
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: "Admin error" }); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(\`🚀 Server running on port \${PORT}\`));
