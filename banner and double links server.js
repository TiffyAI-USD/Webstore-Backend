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

    await pool.query(`
      ALTER TABLE stores ADD COLUMN IF NOT EXISTS owner_whatsapp TEXT;
      ALTER TABLE stores ADD COLUMN IF NOT EXISTS trial_expires TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days');
      ALTER TABLE stores ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'trial';
      ALTER TABLE stores ADD COLUMN IF NOT EXISTS client_ip TEXT;
    `);

    await pool.query(`
      UPDATE stores 
      SET owner_whatsapp = config_data->>'wa' 
      WHERE owner_whatsapp IS NULL AND config_data->>'wa' IS NOT NULL;
    `);
    
    console.log("✅ Database Synced & Marketing Engine Ready.");
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
    const tagline = storeData.tagline || 'Professional Web Store';
    const stampImage = storeData.banner || ''; 

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
        <meta property="og:title" content="${businessName}">
        <meta property="og:description" content="${tagline}">
        <meta property="og:image" content="${stampImage}">
        <meta property="og:type" content="website">

        <style>
            :root { --accent: #00d4ff; --bg: #0f0f0f; --card: #1a1a1a; --text: #ffffff; --gold: #d4a373; --gold-stars: #ffcc00; }
            body { background: var(--bg); color: var(--text); margin: 0; font-family: -apple-system, sans-serif; line-height: 1.4; padding-bottom: 120px; overflow-x: hidden; font-size: 16px; }
            
            .banner-container { width: 100%; height: 55vh; background: #000; position: relative; overflow: hidden; }
            #store-banner { width: 100.2%; height: 100%; object-fit: cover; object-position: center; display: block; margin-left: -0.1%; }
            .banner-overlay { position: absolute; bottom: 0; width: 100%; height: 60%; background: linear-gradient(to top, var(--bg), transparent); }
            
            header { text-align: center; margin-top: -60px; position: relative; z-index: 10; padding: 0 20px; }
            .logo { width: 120px; height: 120px; object-fit: cover; border-radius: 25px; border: 4px solid var(--bg); box-shadow: 0 10px 30px rgba(0,0,0,0.8); background: var(--card); margin: 0 auto; display: none; }
            
            .cta-btn { 
                display: inline-block; background: linear-gradient(180deg, #d4a373, #f1b86b); color: #000; padding: 12px 30px; 
                border-radius: 50px; text-decoration: none; font-weight: 800; margin-top: 30px; text-transform: uppercase; 
                font-size: 0.85rem; box-shadow: 0 4px 15px rgba(212, 163, 115, 0.4);
            }

            .sales-count { background: rgba(0, 212, 255, 0.1); border: 1px solid var(--accent); color: var(--accent); padding: 5px 15px; border-radius: 50px; font-size: 0.8rem; font-weight: bold; margin-top: 15px; display: inline-block; }

            .badge { position: absolute; top: 15px; left: 15px; padding: 5px 12px; border-radius: 4px; font-weight: bold; font-size: 0.7rem; z-index: 4; text-transform: uppercase; letter-spacing: 1px; }
            .badge-scarcity { background: #ff0000; color: #fff; animation: pulse-red 1.5s infinite; }
            .badge-hot { background: var(--gold); color: #000; }
            .badge-new { background: #3498db; color: #fff; }
            @keyframes pulse-red { 0% { transform: scale(1); } 70% { transform: scale(1.05); } 100% { transform: scale(1); } }

            .share-btn {
                position: absolute; top: 15px; right: 15px; background: rgba(0,0,0,0.6); border: 1px solid var(--accent); 
                color: var(--accent); border-radius: 50%; width: 38px; height: 38px; display: flex; align-items: center; 
                justify-content: center; cursor: pointer; backdrop-filter: blur(5px); z-index: 5;
            }

            .item-card { background: var(--card); margin: 0 20px 25px 20px; border-radius: 24px; overflow: hidden; border: 1px solid #252525; position: relative; }
            .item-img { width: 100%; height: auto; max-height: 350px; object-fit: cover; display: block; }
            .rating-stars { color: var(--gold-stars) !important; margin-bottom: 8px; font-size: 0.9rem; text-shadow: 0 0 8px rgba(255, 204, 0, 0.4); }

            .cart-controls { display: flex; align-items: center; gap: 8px; margin-top: 15px; width: 100%; }
            .btn-cart { flex: 1; border: none; padding: 12px 5px; border-radius: 10px; font-weight: 800; font-size: 0.75rem; cursor: pointer; text-transform: uppercase; }
            .btn-add { background: var(--accent); color: #000; }
            .btn-empty { background: rgba(255, 77, 77, 0.1); color: #ff4d4d; border: 1px solid #ff4d4d; }
            .hidden-btn { visibility: hidden; pointer-events: none; }
            .wa-service-btn { width: 100%; margin-top: 15px; cursor: pointer; transition: 0.2s; border-radius: 10px; }

            .watermark { text-align: center; padding: 30px 0; opacity: 0.5; font-size: 0.75rem; letter-spacing: 2px; }
            .watermark img { height: 20px; vertical-align: middle; margin-right: 5px; filter: grayscale(1); }

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
            <div id="content" style="display:none; max-width:600px; margin:0 auto;">
                <header>
                    <img id="store-logo" class="logo">
                    <h1 id="store-name" style="margin:15px 0 5px 0; font-size:1.8rem;"></h1>
                    <p id="store-tagline" style="color:#888; font-size:1rem;"></p>
                    <div id="analytics-box"></div>
                </header>
                <div id="menu-container"></div>
                <div id="cta-wrap" style="text-align:center; padding-bottom:10px;"></div>
                <div class="watermark">
                    <img src="https://i.imgur.com/8WwR2sL.png" alt="TiffyAI"> POWERED BY TIFFYAI
                </div>
            </div>
            <div class="order-bar" id="bottom-order-bar">
                <div style="display:flex; flex-direction:column;">
                    <span style="color:#888; font-size:0.7rem;">TOTAL</span>
                    <span id="float-total" style="font-weight:900; font-size:1.3rem; color:#00ff00;">--</span>
                </div>
                <div style="display:flex;">
                    <button onclick="printQuote()" style="background:#fff; color:#000; border:none; padding:12px 20px; border-radius:50px; font-weight:800; margin-right:10px; font-size:0.8rem;">QUOTE</button>
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
                    
                    // RE-INSERTED: Social Proof Flame Logic
                    const salesRes = await fetch('/api/sales/' + handle);
                    const salesData = await salesRes.json();
                    if (salesData.length > 0) {
                        document.getElementById('analytics-box').innerHTML = '<div class="sales-count">🔥 ' + salesData.length + ' Orders</div>';
                    }

                    document.getElementById('loader-box').style.display = 'none';
                    document.getElementById('full-store').style.display = 'block';
                    document.getElementById('content').style.display = 'block';
                    document.getElementById('store-name').innerText = storeData.businessName;
                    document.getElementById('store-tagline').innerText = storeData.tagline || '';
                    if(storeData.logo) { document.getElementById('store-logo').src = storeData.logo; document.getElementById('store-logo').style.display = 'block'; }
                    if(storeData.banner) document.getElementById('store-banner').src = storeData.banner;
                    
                    if(storeData.ctaUrl && storeData.ctaText) {
                        let url = storeData.ctaUrl.startsWith('http') ? storeData.ctaUrl : 'https://' + storeData.ctaUrl;
                        document.getElementById('cta-wrap').innerHTML = '<a href="'+url+'" target="_blank" class="cta-btn">'+storeData.ctaText+'</a>';
                    }
                    renderMenu();
                } catch (err) { console.error(err); }
            }

            function renderMenu() {
                const container = document.getElementById('menu-container');
                container.innerHTML = "";
                let hasCart = false;

                storeData.menu.forEach((section, sIdx) => {
                    const secTitle = document.createElement('h2');
                    secTitle.style = "color:var(--accent); font-size:1.4rem; margin:40px 20px 15px 20px; font-weight:800; text-transform:uppercase;";
                    secTitle.innerText = section.title;
                    container.appendChild(secTitle);

                    section.items.forEach((item, iIdx) => {
                        const key = sIdx + '-' + iIdx;
                        const qty = cart[key]?.qty || 0;
                        const stars = "★".repeat(item.rating || 5) + "☆".repeat(5 - (item.rating || 5));
                        
                        let badgeHtml = (item.badge && item.badge !== 'none') ? 
                            '<div class="badge badge-'+item.badge+'">'+(item.badge === 'scarcity' ? 'ONLY '+(item.stock || 3)+' LEFT' : item.badge.replace('-', ' '))+'</div>' : '';

                        let controls = '';
                        if(item.price == 0) {
                            controls = '<img src="../../WhatsApp.png" class="wa-service-btn" onclick="window.open(\\'https://wa.me/'+storeData.wa+'?text=Inquiry: '+item.name+'\\')">';
                        } else {
                            hasCart = true;
                            controls = \`
                                <div class="cart-controls">
                                    <button class="btn-cart btn-empty \${qty > 0 ? '' : 'hidden-btn'}" onclick="updateCart('\${key}', \${item.price}, -1, '\${item.name}')">EMPTY</button>
                                    <span style="font-weight:900; min-width:35px; text-align:center;">\${qty}</span>
                                    <button class="btn-cart btn-add" onclick="updateCart('\${key}', \${item.price}, 1, '\${item.name}')">ADD TO CART</button>
                                </div>\`;
                        }

                        const card = document.createElement('div');
                        card.className = 'item-card';
                        card.innerHTML = \`
                            \${badgeHtml}
                            <div class="share-btn" onclick="shareProduct('\${item.name}', \${item.price})">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                            </div>
                            <img src="\${item.img || item.image}" class="item-img">
                            <div style="padding:20px;">
                                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                                    <span style="font-weight:800; font-size:1.2rem; flex:1;">\${item.name}</span>
                                    <span style="color:#00ff00; font-weight:900; margin-left:10px;">\${item.price == 0 ? 'NEGOTIABLE' : storeData.curr + ' ' + item.price}</span>
                                </div>
                                <div class="rating-stars">\${stars}</div>
                                <div style="color:#aaa; font-size:0.9rem; margin-bottom:15px; white-space:pre-wrap;">\${item.desc}</div>
                                \${controls}
                            </div>\`;
                        container.appendChild(card);
                    });
                });
                document.getElementById('bottom-order-bar').style.display = hasCart ? 'flex' : 'none';
            }

            function shareProduct(n, p) {
                const text = 'Check out this ' + n + (p > 0 ? ' for ' + storeData.curr + p : '') + ' on ' + storeData.businessName + ':\\n' + window.location.href;
                if (navigator.share) {
                    navigator.share({ title: n, text: text, url: window.location.href });
                } else {
                    navigator.clipboard.writeText(text);
                    alert('Link copied to clipboard!');
                }
            }

            function updateCart(k, p, d, n) {
                if(!cart[k]) cart[k] = {qty:0, price:p, name:n};
                cart[k].qty += d;
                if(cart[k].qty <= 0) delete cart[k];
                renderMenu();
                let total = 0; Object.values(cart).forEach(i => total += (i.qty * i.price));
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
                let total = 0; let text = "*NEW ORDER*\\n\\n";
                Object.values(cart).forEach(i => { text += "• " + i.qty + "x " + i.name + "\\n"; total += (i.qty * i.price); });
                text += "\\n*TOTAL: " + storeData.curr + " " + total + "*";
                await fetch('/api/log-sale', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ handle, cart, total }) });
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

app.delete('/api/sales/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM sales WHERE id = $1', [id]);
    res.json({ success: result.rowCount > 0 });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.post('/api/publish', async (req, res) => {
  try {
    const { handle, configData, ownerWhatsapp, isActivated } = req.body;
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
  } catch (err) { res.status(500).json({ success: false }); }
});

app.get('/api/store/:handle', async (req, res) => {
  const result = await pool.query('SELECT config_data FROM stores WHERE handle = $1', [req.params.handle]);
  if (result.rows.length > 0) res.json(result.rows[0].config_data);
  else res.status(404).json({ error: "Store not found" });
});

app.get('/api/admin/all-stores', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM stores ORDER BY created_at DESC');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/action', async (req, res) => {
  const { handle, action } = req.body;
  try {
    if (action === 'toggle') await pool.query('UPDATE stores SET is_active = NOT is_active WHERE handle = $1', [handle]);
    else if (action === 'extend') await pool.query("UPDATE stores SET trial_expires = trial_expires + INTERVAL '30 days' WHERE handle = $1", [handle]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('🚀 Engine Live'));
