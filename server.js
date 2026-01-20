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

// --- DATABASE SYNC & HEALER ---
const initDb = async () => {
  try {
    // Create base tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stores (
        id SERIAL PRIMARY KEY,
        handle TEXT UNIQUE NOT NULL,
        config_data JSONB NOT NULL,
        owner_whatsapp TEXT,
        plan_type TEXT DEFAULT 'trial',
        is_active BOOLEAN DEFAULT TRUE,
        trial_expires TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days'),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        client_ip TEXT
      );
      CREATE TABLE IF NOT EXISTS sales (
        id SERIAL PRIMARY KEY,
        store_handle TEXT,
        order_data JSONB,
        total_amount NUMERIC,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migration logic
    await pool.query(`
      ALTER TABLE stores ADD COLUMN IF NOT EXISTS owner_whatsapp TEXT;
      ALTER TABLE stores ADD COLUMN IF NOT EXISTS trial_expires TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days');
      ALTER TABLE stores ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'trial';
      ALTER TABLE stores ADD COLUMN IF NOT EXISTS client_ip TEXT;
    `);

    // THE HEALER
    await pool.query(`
      UPDATE stores 
      SET owner_whatsapp = config_data->>'wa' 
      WHERE owner_whatsapp IS NULL AND config_data->>'wa' IS NOT NULL;
    `);
    
    console.log("✅ Database Synced, Migrated & WhatsApp Numbers Healed.");
  } catch (err) { console.error("❌ DB Sync Error:", err); }
};
initDb();

/* ================== THE VIEWER (The Storefront) ================== */
app.get('/view/:handle', async (req, res) => {
  try {
    const check = await pool.query('SELECT is_active, trial_expires, config_data, plan_type FROM stores WHERE handle = $1', [req.params.handle]);
    
    if (check.rows.length === 0) {
        return res.status(404).send('<body style="background:#000;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;"><h1>Store Not Found</h1></body>');
    }

    const store = check.rows[0];
    const storeData = store.config_data;
    const businessName = storeData.businessName || 'Retail OS';
    
    const isExpired = store.trial_expires && new Date(store.trial_expires) < new Date();
    if (!store.is_active || (store.plan_type === 'trial' && isExpired)) {
        return res.send('<body style="background:#000;color:red;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;text-align:center;"><div><h1>STORE SUSPENDED</h1><p>Contact administrator to renew.</p></div></body>');
    }

    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${businessName}</title>
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
            
            .cta-btn { 
                display: inline-block; 
                background: linear-gradient(180deg, #d4a373, #f1b86b); 
                color: #000; 
                padding: 12px 30px; 
                border-radius: 50px; 
                text-decoration: none; 
                font-weight: 800; 
                margin-top: 30px; 
                text-transform: uppercase; 
                font-size: 0.85rem;
                box-shadow: 0 4px 15px rgba(212, 163, 115, 0.4);
            }

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
            .quote-btn { background: #fff; color: #000; border: none; padding: 12px 20px; border-radius: 50px; font-weight: 800; cursor: pointer; margin-right: 10px; font-size: 0.85rem; }

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
                <div id="cta-wrap" style="text-align:center; padding-bottom:40px;"></div>
            </div>
            <div class="order-bar">
                <div style="display:flex; flex-direction:column;">
                    <span style="color:#888; font-size:0.7rem;">TOTAL</span>
                    <span id="float-total" style="font-weight:900; font-size:1.3rem; color:#00ff00;">--</span>
                </div>
                <div style="display:flex;">
                    <button onclick="printQuote()" class="quote-btn">QUOTE</button>
                    <button onclick="sendOrder()" class="wa-btn">SEND ORDER</button>
                </div>
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
                    document.getElementById('store-tagline').innerText = storeData.tagline || '';
                    
                    // HEALER: Ensures CTA link actually leaves Render
                    if(storeData.ctaUrl && storeData.ctaText) {
                        let finalUrl = storeData.ctaUrl;
                        if (!finalUrl.startsWith('http')) finalUrl = 'https://' + finalUrl;
                        document.getElementById('cta-wrap').innerHTML = '<a href="'+finalUrl+'" target="_blank" class="cta-btn">'+storeData.ctaText+'</a>';
                    }

                    if (salesData.length > 0) {
                        document.getElementById('analytics-box').innerHTML = '<div class="sales-count">🔥 ' + salesData.length + ' Orders</div>';
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

            function printQuote() {
                let total = 0;
                let text = "<h1>QUOTE: " + storeData.businessName + "</h1><hr>";
                Object.values(cart).forEach(i => {
                    if(i.qty > 0) {
                        text += "<p>" + i.qty + "x " + i.name + " - " + storeData.curr + (i.qty * i.price) + "</p>";
                        total += (i.qty * i.price);
                    }
                });
                if(total === 0) return alert("Select items first");
                const win = window.open('', '_blank');
                win.document.write(text + "<h2>TOTAL: " + storeData.curr + " " + total + "</h2><button onclick='window.print()'>Print Quote</button>");
            }

            async function sendOrder() {
                if (Object.keys(cart).length === 0) return alert("Select items first");
                let total = 0;
                let text = "*NEW ORDER*\\n\\n";
                Object.values(cart).forEach(i => {
                    text += "• " + i.qty + "x " + i.name + "\\n";
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
    const { handle, configData, ownerWhatsapp, isActivated } = req.body;
    
    // Look for the Real IP provided by Render's proxy, or fallback to remoteAddress
    const forwarded = req.headers['x-forwarded-for'];
    const client_ip = forwarded ? forwarded.split(',')[0] : req.socket.remoteAddress;
    
    const plan = isActivated ? 'pro' : 'trial';

    await pool.query(`
      INSERT INTO stores (handle, config_data, owner_whatsapp, plan_type, client_ip) 
      VALUES ($1, $2, $3, $4, $5) 
      ON CONFLICT (handle) DO UPDATE SET 
        config_data = $2, 
        owner_whatsapp = EXCLUDED.owner_whatsapp,
        plan_type = EXCLUDED.plan_type,
        client_ip = EXCLUDED.client_ip`, 
    [handle, configData, ownerWhatsapp, plan, client_ip]);
    
    res.json({ success: true });
  } catch (err) { 
    console.error("Publish Error:", err);
    res.status(500).json({ success: false }); 
  }
});

app.get('/api/store/:handle', async (req, res) => {
  const result = await pool.query('SELECT config_data FROM stores WHERE handle = $1', [req.params.handle]);
  if (result.rows.length > 0) res.json(result.rows[0].config_data);
  else res.status(404).json({ error: "Store not found" });
});

app.get('/api/admin/all-stores', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT 
        handle, 
        owner_whatsapp,
        is_active, 
        trial_expires,
        plan_type,
        created_at, 
        config_data,
        client_ip
      FROM stores 
      ORDER BY created_at DESC
    `);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/action', async (req, res) => {
  const { handle, action } = req.body;
  try {
    if (action === 'toggle') {
      await pool.query('UPDATE stores SET is_active = NOT is_active WHERE handle = $1', [handle]);
    } else if (action === 'extend') {
      await pool.query("UPDATE stores SET trial_expires = trial_expires + INTERVAL '30 days' WHERE handle = $1", [handle]);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('🚀 Engine Live'));
