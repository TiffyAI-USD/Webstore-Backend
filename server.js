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
        plan_type TEXT DEFAULT 'pro',
        is_active BOOLEAN DEFAULT TRUE,
        trial_expires TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '99 years'),
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
    console.log("✅ Database Synced: Forced Pro Plan Defaults.");
  } catch (err) { console.error("❌ DB Sync Error:", err); }
};
initDb();

/* ================== THE VIEWER (The Storefront) ================== */
app.get('/view/:handle', async (req, res) => {
  try {
    const check = await pool.query('SELECT is_active, config_data FROM stores WHERE handle = $1', [req.params.handle]);
    
    if (check.rows.length === 0) {
        return res.status(404).send('<body style="background:#000;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;"><h1>Store Not Found</h1></body>');
    }

    const store = check.rows[0];
    
    // REMOVED TRIAL EXPIRATION CHECK - Only checks if Admin manually deactivated
    if (!store.is_active) {
        return res.send('<body style="background:#000;color:red;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;text-align:center;"><div><h1>STORE SUSPENDED</h1><p>Contact administrator.</p></div></body>');
    }

    const storeData = store.config_data;

    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>\${storeData.businessName || 'Retail OS'}</title>
        <style>
            :root { --accent: #d4a373; --bg: #0f0f0f; --card: #1a1a1a; --text: #ffffff; }
            body { background: var(--bg); color: var(--text); margin: 0; font-family: -apple-system, sans-serif; line-height: 1.4; padding-bottom: 120px; }
            
            .banner-container { width: 100%; height: 50vh; background: #000; position: relative; overflow: hidden; }
            #store-banner { width: 100%; height: 100%; object-fit: cover; }
            .banner-overlay { position: absolute; bottom: 0; width: 100%; height: 100%; background: linear-gradient(to top, var(--bg) 5%, transparent 90%); }
            
            header { text-align: center; margin-top: -80px; position: relative; z-index: 10; padding: 0 20px; }
            .logo { width: 100px; height: 100px; object-fit: cover; border-radius: 20px; border: 3px solid var(--accent); margin: 0 auto; background: #000; }
            
            /* CTA BUTTON STYLE */
            .cta-container { margin-top: 15px; }
            .btn-cta {
                display: inline-block;
                background: linear-gradient(180deg, #d4a373, #f1b86b);
                color: #000;
                padding: 10px 25px;
                border-radius: 50px;
                text-decoration: none;
                font-weight: bold;
                font-size: 0.9rem;
                text-transform: uppercase;
                box-shadow: 0 4px 15px rgba(212, 163, 115, 0.3);
            }

            #content { max-width: 600px; margin: 0 auto; }
            .section-title { color: var(--accent); font-size: 1.2rem; margin: 30px 20px 10px; text-transform: uppercase; letter-spacing: 1px; }
            .item-card { background: var(--card); margin: 0 20px 20px; border-radius: 15px; overflow: hidden; border: 1px solid #252525; }
            .item-img { width: 100%; height: 200px; object-fit: cover; }
            .item-body { padding: 15px; }
            .item-header { display: flex; justify-content: space-between; align-items: center; }
            .item-price { color: var(--accent); font-weight: bold; }

            .qty-controls { display: flex; align-items: center; margin-top: 10px; gap: 15px; }
            .qty-btn { background: #333; border: none; color: #fff; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; }

            .order-bar { position: fixed; bottom: 0; left: 0; width: 100%; background: #111; border-top: 1px solid #333; padding: 15px 20px; box-sizing: border-box; z-index: 1000; display: flex; justify-content: space-between; align-items: center; }
            .btn-group { display: flex; gap: 8px; }
            .wa-btn { background: #25d366; color: white; padding: 12px 20px; border-radius: 50px; text-decoration: none; font-weight: bold; font-size: 0.9rem; }
            .quote-btn { background: #fff; color: #000; padding: 12px 15px; border-radius: 50px; font-weight: bold; border: none; cursor: pointer; font-size: 0.8rem; }
        </style>
    </head>
    <body>
        <div class="banner-container">
            <img id="store-banner" src="\${storeData.banner || ''}">
            <div class="banner-overlay"></div>
        </div>
        
        <div id="content">
            <header>
                \${storeData.logo ? \`<img src="\${storeData.logo}" class="logo">\` : ''}
                <h1 style="margin:10px 0 5px;">\${storeData.businessName}</h1>
                <p style="color:#888; font-size: 0.9rem;">\${storeData.tagline || ''}</p>
                
                \${(storeData.ctaUrl && storeData.ctaText) ? \`
                    <div class="cta-container">
                        <a href="\${storeData.ctaUrl}" class="btn-cta">\${storeData.ctaText}</a>
                    </div>
                \` : ''}
            </header>

            <div id="menu-container"></div>
        </div>

        <div class="order-bar">
            <div>
                <span style="color:#888; font-size:0.7rem; display:block;">TOTAL</span>
                <span id="float-total" style="font-weight:bold; font-size:1.2rem; color:#fff;">\${storeData.curr} 0</span>
            </div>
            <div class="btn-group">
                <button onclick="printQuote()" class="quote-btn">QUOTE</button>
                <button onclick="sendOrder()" class="wa-btn">ORDER</button>
            </div>
        </div>

        <script>
            let cart = {};
            const storeData = \${JSON.stringify(storeData)};

            function renderMenu() {
                const container = document.getElementById('menu-container');
                storeData.menu.forEach((sec, sIdx) => {
                    const sDiv = document.createElement('div');
                    sDiv.innerHTML = \`<h2 class="section-title">\${sec.title}</h2>\`;
                    sec.items.forEach((it, iIdx) => {
                        const key = sIdx + '-' + iIdx;
                        const card = document.createElement('div');
                        card.className = 'item-card';
                        card.innerHTML = \`
                            \${it.img ? \`<img src="\${it.img}" class="item-img">\` : ''}
                            <div class="item-body">
                                <div class="item-header">
                                    <strong>\${it.name}</strong>
                                    <span class="item-price">\${storeData.curr} \${it.price}</span>
                                </div>
                                <div class="qty-controls">
                                    <button class="qty-btn" onclick="updateCart('\${key}', \${it.price}, -1, '\${it.name}')">−</button>
                                    <span id="qty-\${key}">0</span>
                                    <button class="qty-btn" onclick="updateCart('\${key}', \${it.price}, 1, '\${it.name}')">+</button>
                                </div>
                            </div>\`;
                        sDiv.appendChild(card);
                    });
                    container.appendChild(sDiv);
                });
            }

            function updateCart(key, price, delta, name) {
                if (!cart[key]) cart[key] = { qty: 0, price: price, name: name };
                cart[key].qty = Math.max(0, cart[key].qty + delta);
                document.getElementById('qty-'+key).innerText = cart[key].qty;
                
                let total = 0;
                Object.values(cart).forEach(i => total += (i.qty * i.price));
                document.getElementById('float-total').innerText = storeData.curr + ' ' + total;
            }

            function generateOrderText() {
                let text = "*NEW ORDER - \${storeData.businessName}*\\n\\n";
                let total = 0;
                Object.values(cart).forEach(i => {
                    if(i.qty > 0) {
                        text += "• " + i.qty + "x " + i.name + " (" + storeData.curr + (i.qty * i.price) + ")\\n";
                        total += (i.qty * i.price);
                    }
                });
                text += "\\n*TOTAL: " + storeData.curr + " " + total + "*";
                return { text, total };
            }

            async function sendOrder() {
                const { text, total } = generateOrderText();
                if (total === 0) return alert("Select items");
                
                fetch('/api/log-sale', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ handle: window.location.pathname.split('/').pop(), cart, total })
                });
                window.location.href = "https://wa.me/" + storeData.wa + "?text=" + encodeURIComponent(text);
            }

            function printQuote() {
                const { text, total } = generateOrderText();
                if (total === 0) return alert("Select items");
                const win = window.open('', '_blank');
                win.document.write(\`<html><body style="font-family:monospace; padding:40px;">
                    <center><h1>\${storeData.businessName}</h1><p>QUOTATION</p></center><hr>
                    <pre style="font-size:1.2rem;">\${text.replace(/\\\\n/g, '<br>')}</pre>
                    <hr><center><button onclick="window.print()">PRINT QUOTE</button></center>
                </body></html>\`);
            }

            renderMenu();
        </script>
    </body>
    </html>
  `);
  } catch (err) { res.status(500).send("Critical View Error"); }
});

/* ================== API SECTION ================== */

app.post('/api/log-sale', async (req, res) => {
  const { handle, cart, total } = req.body;
  await pool.query('INSERT INTO sales (store_handle, order_data, total_amount) VALUES ($1, $2, $3)', [handle, cart, total]);
  res.json({ success: true });
});

app.post('/api/publish', async (req, res) => {
  try {
    const { handle, configData } = req.body;
    // Extract WhatsApp for the healer
    const wa = configData.wa || '';
    await pool.query(`
      INSERT INTO stores (handle, config_data, owner_whatsapp, plan_type) 
      VALUES ($1, $2, $3, 'pro') 
      ON CONFLICT (handle) DO UPDATE SET config_data = $2, owner_whatsapp = $3`, 
    [handle, configData, wa]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.get('/api/store/:handle', async (req, res) => {
  const result = await pool.query('SELECT config_data FROM stores WHERE handle = $1', [req.params.handle]);
  if (result.rows.length > 0) res.json(result.rows[0].config_data);
  else res.status(404).json({ error: "Store not found" });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('🚀 Engine Live - No Expiry Mode'));
