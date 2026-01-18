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

// --- DATABASE SYNC & AUTO-MIGRATION ---
const initDb = async () => {
  try {
    // Create base tables
    await pool.query(`
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
    `);

    // Add columns if they were missing from older versions (Fixes the crash)
    await pool.query(`
      ALTER TABLE stores ADD COLUMN IF NOT EXISTS owner_whatsapp TEXT;
      ALTER TABLE stores ADD COLUMN IF NOT EXISTS trial_expires TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days');
    `);
    
    console.log("✅ Database Synced & Migrated.");
  } catch (err) { console.error("❌ DB Error:", err); }
};
initDb();

/* ================== THE VIEWER (The Storefront) ================== */
app.get('/view/:handle', async (req, res) => {
  try {
    const check = await pool.query('SELECT is_active, trial_expires, config_data FROM stores WHERE handle = $1', [req.params.handle]);
    
    if (check.rows.length === 0) {
        return res.status(404).send('<body style="background:#000;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;"><h1>Store Not Found</h1></body>');
    }

    const store = check.rows[0];
    
    // Safety check for suspended stores or expired trials
    if (!store.is_active || (store.trial_expires && new Date(store.trial_expires) < new Date())) {
        return res.send('<body style="background:#000;color:red;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;text-align:center;"><div><h1>STORE SUSPENDED</h1><p>Contact administrator to renew.</p></div></body>');
    }

    // Serving the HTML (Using standard quotes for safety against Render parser errors)
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Retail OS</title>
        <style>
            :root { --accent: #00d4ff; --bg: #0f0f0f; --card: #1a1a1a; --text: #ffffff; }
            body { background: var(--bg); color: var(--text); margin: 0; font-family: -apple-system, sans-serif; line-height: 1.4; padding-bottom: 120px; overflow-x: hidden; }
            
            .banner-container { width: 100%; height: 55vh; background: #000; position: relative; overflow: hidden; }
            #store-banner { 
                width: 100.2%; 
                height: 100%; 
                object-fit: cover; 
                object-position: center;
                display: block;
                margin-left: -0.1%;
            }
            .banner-overlay { position: absolute; bottom: 0; width: 100%; height: 60%; background: linear-gradient(to top, var(--bg), transparent); }
            
            header { text-align: center; margin-top: -60px; position: relative; z-index: 10; padding: 0 20px; }
            .logo { width: 120px; height: 120px; object-fit: cover; border-radius: 25px; border: 4px solid var(--bg); box-shadow: 0 10px 30px rgba(0,0,0,0.8); background: var(--card); margin: 0 auto; display: none; }
            
            .sales-count { background: rgba(0, 212, 255, 0.1); border: 1px solid var(--accent); color: var(--accent); padding: 5px 15px; border-radius: 50px; font-size: 0.8rem; font-weight: bold; margin-top: 15px; display: inline-block; }

            #content { display: none; max-width: 600px; margin: 0 auto; }
            .section-title { color: var(--accent); font-size: 1.4rem; margin: 40px 20px 15px 20px; font-weight: 800; text-transform: uppercase; }
            .item-card { background: var(--card); margin: 0 20px 25px 20px; border-radius: 24px; overflow: hidden; border: 1px solid #252525; }
            .item-img { width: 100%; height: auto; max-height: 350px; object-fit: cover; display: block; }
            .item-body { padding: 20px; }
            .item-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
            .item-name { font-weight: 800; font-size: 1.2rem; flex: 1; }
            .item-price { color: #00ff00; font-weight: 900; font-size: 1.2rem; margin-left: 10px; }
            .item-desc { color: #aaa; font-size: 0.95rem; margin-bottom: 20px; white-space: pre-wrap; }

            .qty-controls { display: flex; align-items: center; background: #222; border-radius: 50px; width: fit-content; padding: 5px 15px; }
            .qty-btn { background: none; border: none; color: var(--accent); font-size: 1.5rem; font-weight: bold; cursor: pointer; padding: 0 10px; }
            .qty-val { font-weight: bold; min-width: 30px; text-align: center; font-size: 1.1rem; color: #fff; }

            .order-bar { position: fixed; bottom: 0; left: 0; width: 100%; background: #111; border-top: 1px solid #333; padding: 20px; box-sizing: border-box; z-index: 1000; display: flex; justify-content: space-between; align-items: center; }
            .wa-btn { background: #25d366; color: white; text-decoration: none; padding: 12px 25px; border-radius: 50px; font-weight: 800; border: none; cursor: pointer; }
            .loader-wrap { display: flex; justify-content: center; align-items: center; height: 100vh; }
            .loader { border: 4px solid #333; border-top: 4px solid var(--accent); border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
    </head>
    <body>
        <div id="loader-box" class="loader-wrap"><div class="loader"></div></div>
        <div id="full-store" style="display:none;">
            <div class="banner-container"><img id="store-banner" src=""><div class="banner-overlay"></div></div>
            <div id="content">
                <header>
                    <img id="store-logo" class="logo">
                    <h1 id="store-name" style="margin:15px 0 5px 0;"></h1>
                    <p id="store-tagline" style="color:#888;"></p>
                    <div id="analytics-box"></div>
                </header>
                <div id="menu-container"></div>
            </div>
            <div class="order-bar">
                <div style="display:flex; flex-direction:column;">
                    <span style="color:#888; font-size:0.7rem;">TOTAL</span>
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
                    const salesRes = await fetch('/api/sales/' + handle);
                    const salesData = await salesRes.json();
                    
                    document.getElementById('loader-box').style.display = 'none';
                    document.getElementById('full-store').style.display = 'block';
                    document.getElementById('content').style.display = 'block';
                    document.getElementById('store-name').innerText = storeData.businessName;
                    document.getElementById('store-tagline').innerText = storeData.tagline;
                    
                    if (salesData.length > 0) {
                        document.getElementById('analytics-box').innerHTML = '<div class="sales-count">🔥 ' + salesData.length + ' Orders Pushed</div>';
                    }

                    const logoEl = document.getElementById('store-logo');
                    if(storeData.logo && storeData.logo.trim() !== "") {
                        logoEl.src = storeData.logo;
                        logoEl.style.display = "block";
                    }

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
                        const key = sIdx + '-' + iIdx;
                        const card = document.createElement('div');
                        card.className = 'item-card';
                        card.innerHTML = \`
                            \${(item.image || item.img) ? '<img src="'+(item.image || item.img)+'" class="item-img">' : ''}
                            <div class="item-body">
                                <div class="item-header">
                                    <span class="item-name">\${item.name}</span>
                                    <span class="item-price">\${storeData.curr} \${item.price}</span>
                                </div>
                                <div class="item-desc">\${item.desc || ''}</div>
                                <div class="qty-controls">
                                    <button class="qty-btn" onclick="updateCart('\${key}', \${item.price}, -1, '\${item.name}')">−</button>
                                    <span class="qty-val" id="qty-\${key}">0</span>
                                    <button class="qty-btn" onclick="updateCart('\${key}', \${item.price}, 1, '\${item.name}')">+</button>
                                </div>
                            </div>\`;
                        secNode.appendChild(card);
                    });
                    container.appendChild(secNode);
                });
            }

            function updateCart(key, price, delta, name) {
                if (!cart[key]) cart[key] = { qty: 0, price: price, name: name };
                cart[key].qty += delta;
                if (cart[key].qty <= 0) {
                    delete cart[key];
                    document.getElementById('qty-'+key).innerText = "0";
                } else {
                    document.getElementById('qty-'+key).innerText = cart[key].qty;
                }
                let total = 0;
                Object.values(cart).forEach(i => total += (i.qty * i.price));
                document.getElementById('float-total').innerText = storeData.curr + ' ' + total;
            }

            async function sendOrder() {
                if (Object.keys(cart).length === 0) return alert("Select items first");
                let total = 0;
                let text = "*NEW ORDER*\\n\\n";
                Object.values(cart).forEach(i => {
                    text += "• " + i.qty + "x " + i.name + " (" + storeData.curr + " " + (i.qty * i.price) + ")\\n";
                    total += (i.qty * i.price);
                });
                text += "\\n*TOTAL: " + storeData.curr + " " + total + "*";
                await fetch('/api/log-sale', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ handle, cart, total })
                });
                window.location.href = "https://wa.me/" + storeData.wa + "?text=" + encodeURIComponent(text);
            }
            bootStore();
        </script>
    </body>
    </html>
  `);
  } catch (err) { res.status(500).send("Critical View Error"); }
});

/* ================== OWNER DASHBOARD ================== */
app.get('/dashboard/:handle', (req, res) => {
    res.send(`<html><body style="background:#000;color:#fff;font-family:sans-serif;padding:20px;">
        <h2>📊 Dashboard: ${req.params.handle}</h2>
        <div id="stats" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;">
            <div style="background:#111;padding:20px;border-radius:10px;">ORDERS: <b id="count">0</b></div>
            <div style="background:#111;padding:20px;border-radius:10px;">REVENUE: <b id="rev">0</b></div>
        </div>
        <div id="list">Loading...</div>
        <script>
            async function load() {
                const r = await fetch('/api/sales/${req.params.handle}');
                const data = await r.json();
                let rev = 0;
                document.getElementById('list').innerHTML = data.map(s => {
                    rev += parseFloat(s.total_amount || 0);
                    return '<div style="background:#111;padding:15px;margin-bottom:10px;border-radius:10px;border:1px solid #222;"><b>Total: ' + s.total_amount + '</b><br><small>' + new Date(s.created_at).toLocaleString() + '</small></div>';
                }).join('');
                document.getElementById('count').innerText = data.length;
                document.getElementById('rev').innerText = rev.toFixed(2);
            }
            load();
        </script></body></html>`);
});

/* ================== ADMIN MASTER ================== */
app.get('/admin/master', async (req, res) => {
    try {
        const r = await pool.query("SELECT handle, owner_whatsapp, is_active, trial_expires FROM stores ORDER BY created_at DESC");
        const rows = r.rows.map(s => `<tr><td style="padding:10px;border:1px solid #333;">${s.handle}</td><td style="padding:10px;border:1px solid #333;">${s.owner_whatsapp || 'N/A'}</td><td style="padding:10px;border:1px solid #333;">${new Date(s.trial_expires).toLocaleDateString()}</td><td style="padding:10px;border:1px solid #333;">${s.is_active}</td></tr>`).join('');
        res.send(`<html><body style="background:#000;color:#fff;font-family:sans-serif;padding:20px;"><h1>👑 Master Control</h1><table style="width:100%;border-collapse:collapse;background:#111;"><tr><th>Store</th><th>WhatsApp</th><th>Trial Ends</th><th>Active</th></tr>${rows}</table></body></html>`);
    } catch (e) { res.send("Admin Error"); }
});

/* ================== API SECTION ================== */
app.get('/api/sales/:handle', async (req, res) => {
  const result = await pool.query('SELECT * FROM sales WHERE store_handle = $1 ORDER BY created_at DESC', [req.params.handle]);
  res.json(result.rows);
});

app.post('/api/log-sale', async (req, res) => {
  const { handle, cart, total } = req.body;
  await pool.query('INSERT INTO sales (store_handle, order_data, total_amount) VALUES ($1, $2, $3)', [handle, cart, total]);
  res.json({ success: true });
});

app.post('/api/publish', async (req, res) => {
  try {
    const { handle, configData, ownerWhatsapp } = req.body;
    await pool.query("INSERT INTO stores (handle, config_data, owner_whatsapp) VALUES ($1, $2, $3) ON CONFLICT (handle) DO UPDATE SET config_data = $2, owner_whatsapp = EXCLUDED.owner_whatsapp", [handle, configData, ownerWhatsapp]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.get('/api/store/:handle', async (req, res) => {
  const result = await pool.query('SELECT config_data FROM stores WHERE handle = $1', [req.params.handle]);
  if (result.rows.length > 0) res.json(result.rows[0].config_data);
  else res.status(404).json({ error: "Store not found" });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('🚀 Final Retail OS Engine Live'));
