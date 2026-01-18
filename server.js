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

// 1. DATABASE INIT (Woven with Trial & Admin logic)
const initDb = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS stores (
      id SERIAL PRIMARY KEY,
      handle TEXT UNIQUE NOT NULL,
      config_data JSONB NOT NULL,
      owner_whatsapp TEXT,
      trial_expires TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days'),
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    console.log("✅ Database Synced: Retail OS Engine Ready.");
  } catch (err) { console.error("❌ DB Init Error:", err); }
};
initDb();

/* ================== THE VIEWER (Customer Front-end) ================== */
app.get('/view/:handle', async (req, res) => {
  try {
    const check = await pool.query('SELECT config_data, is_active, trial_expires FROM stores WHERE handle = $1', [req.params.handle]);
    if (check.rows.length === 0) return res.send("<h1>Store Not Found</h1>");

    const store = check.rows[0];
    const now = new Date();
    
    // SECURITY: Trial & Activation Check
    if (!store.is_active || new Date(store.trial_expires) < now) {
        return res.send(`
            <div style="text-align:center; padding:100px 20px; font-family:sans-serif; background:#0f0f0f; color:white; height:100vh;">
                <h1 style="color:#ff4444;">STORE SUSPENDED</h1>
                <p>The trial period has ended or the store is inactive.</p>
                <p style="color:#888;">Please contact the administrator to reactivate.</p>
            </div>
        `);
    }

    const storeData = store.config_data;

    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>\${storeData.businessName}</title>
        <style>
            :root { --accent: #00d4ff; --bg: #0f0f0f; --card: #1a1a1a; --text: #ffffff; }
            body { background: var(--bg); color: var(--text); margin: 0; font-family: -apple-system, sans-serif; overflow-x: hidden; padding-bottom:120px; }
            .banner-container { width: 100%; height: 55vh; background: #000; position: relative; overflow: hidden; }
            #store-banner { width: 100.2%; height: 100%; object-fit: cover; object-position: center; display: block; margin-left: -0.1%; }
            .banner-overlay { position: absolute; bottom: 0; width: 100%; height: 60%; background: linear-gradient(to top, var(--bg), transparent); }
            header { text-align: center; margin-top: -60px; position: relative; z-index: 10; padding: 0 20px; }
            .logo { width: 120px; height: 120px; object-fit: cover; border-radius: 25px; border: 4px solid var(--bg); background: var(--card); margin: 0 auto; display: \${storeData.logo ? 'block' : 'none'}; }
            .sales-count { background: rgba(0, 212, 255, 0.1); border: 1px solid var(--accent); color: var(--accent); padding: 5px 15px; border-radius: 50px; font-size: 0.8rem; font-weight: bold; margin-top: 15px; display: inline-block; }
            .item-card { background: var(--card); margin: 0 20px 25px 20px; border-radius: 24px; overflow: hidden; border: 1px solid #252525; }
            .item-img { width: 100%; height: auto; max-height: 350px; object-fit: cover; display: block; }
            .item-body { padding: 20px; }
            .item-price { color: #00ff00; font-weight: 900; font-size: 1.2rem; }
            .qty-controls { display: flex; align-items: center; background: #222; border-radius: 50px; width: fit-content; padding: 5px 15px; }
            .qty-btn { background: none; border: none; color: var(--accent); font-size: 1.5rem; font-weight: bold; cursor: pointer; }
            .order-bar { position: fixed; bottom: 0; left: 0; width: 100%; background: #111; border-top: 1px solid #333; padding: 20px; display: flex; justify-content: space-between; align-items: center; z-index:1000; }
            .wa-btn { background: #25d366; color: white; padding: 12px 25px; border-radius: 50px; font-weight: 800; border:none; cursor:pointer; }
        </style>
    </head>
    <body>
        <div class="banner-container">
            <img id="store-banner" src="\${storeData.banner || ''}">
            <div class="banner-overlay"></div>
        </div>
        <header>
            \${storeData.logo ? \`<img src="\${storeData.logo}" class="logo">\` : ''}
            <h1 style="margin:15px 0 5px 0;">\${storeData.businessName}</h1>
            <p style="color:#888;">\${storeData.tagline}</p>
            <div id="analytics-badge"></div>
        </header>
        <div id="menu-container"></div>
        <div class="order-bar">
            <div><span style="color:#888; font-size:0.7rem;">TOTAL</span><br><span id="float-total" style="font-weight:900; color:#00ff00;">--</span></div>
            <button onclick="sendOrder()" class="wa-btn">SEND ORDER</button>
        </div>

        <script>
            let cart = {};
            const store = \${JSON.stringify(storeData)};
            const handle = "\${req.params.handle}";

            async function init() {
                const sRes = await fetch('/api/sales/' + handle);
                const sData = await sRes.json();
                if(sData.length > 0) document.getElementById('analytics-badge').innerHTML = '<div class="sales-count">🔥 ' + sData.length + ' Orders Pushed</div>';
                render();
            }

            function render() {
                const cont = document.getElementById('menu-container');
                store.menu.forEach((sec, sIdx) => {
                    const h = document.createElement('h2'); h.innerText = sec.title; h.style.margin = "40px 20px 15px"; h.style.color = "var(--accent)";
                    cont.appendChild(h);
                    sec.items.forEach((it, iIdx) => {
                        const key = sIdx+'-'+iIdx;
                        const card = document.createElement('div'); card.className = 'item-card';
                        card.innerHTML = \`
                            \${it.image ? '<img src="'+it.image+'" class="item-img">' : ''}
                            <div class="item-body">
                                <div style="display:flex; justify-content:space-between;"><b>\${it.name}</b><span class="item-price">\${store.curr} \${it.price}</span></div>
                                <p style="color:#aaa; font-size:0.9rem;">\${it.desc || ''}</p>
                                <div class="qty-controls">
                                    <button class="qty-btn" onclick="updateCart('\${key}', \${it.price}, -1, '\${it.name}')">−</button>
                                    <span id="qty-\${key}" style="margin:0 15px; font-weight:bold;">0</span>
                                    <button class="qty-btn" onclick="updateCart('\${key}', \${it.price}, 1, '\${it.name}')">+</button>
                                </div>
                            </div>\`;
                        cont.appendChild(card);
                    });
                });
            }

            function updateCart(k, p, d, n) {
                if(!cart[k]) cart[k] = {qty:0, price:p, name:n};
                cart[k].qty += d;
                if(cart[k].qty <= 0) delete cart[k];
                document.getElementById('qty-'+k).innerText = cart[k] ? cart[k].qty : 0;
                let tot = 0; Object.values(cart).forEach(i => tot += (i.qty * i.price));
                document.getElementById('float-total').innerText = store.curr + ' ' + tot;
            }

            async function sendOrder() {
                if(Object.keys(cart).length === 0) return;
                let tot = 0; let txt = "*NEW ORDER*\\n\\n";
                Object.values(cart).forEach(i => { txt += "• "+i.qty+"x "+i.name+" ("+store.curr+" "+(i.qty*i.price)+")\\n"; tot += (i.qty*i.price); });
                await fetch('/api/log-sale', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({handle, cart, total:tot}) });
                window.location.href = "https://wa.me/"+store.wa+"?text="+encodeURIComponent(txt + "\\n*TOTAL: "+store.curr+" "+tot+"*");
            }
            init();
        </script>
    </body>
    </html>
    `);
  } catch (e) { res.status(500).send("Error"); }
});

/* ================== THE OWNER DASHBOARD ================== */
app.get('/dashboard/:handle', (req, res) => {
    res.send(\`
        <html>
        <head><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{background:#0a0a0a; color:#eee; font-family:sans-serif; padding:20px;} .card{background:#161616; padding:20px; border-radius:15px; margin-bottom:15px; border:1px solid #222;} .accent{color:#00d4ff;} .btn{background:#00d4ff; color:#000; border:none; padding:10px; width:100%; border-radius:8px; font-weight:bold;}</style></head>
        <body>
            <h2>📊 Store Dashboard</h2>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:20px;">
                <div class="card"><small>ORDERS</small><br><b id="count" class="accent" style="font-size:1.5rem;">0</b></div>
                <div class="card"><small>REVENUE</small><br><b id="rev" class="accent" style="font-size:1.5rem;">0</b></div>
            </div>
            <h3>Recent Sales</h3>
            <div id="sales-list">Loading...</div>
            <script>
                const handle = window.location.pathname.split('/').pop();
                async function load() {
                    const res = await fetch('/api/sales/'+handle);
                    const sales = await res.json();
                    let rev = 0;
                    document.getElementById('sales-list').innerHTML = sales.map(s => {
                        rev += parseFloat(s.total_amount);
                        return '<div class="card"><b>Order Total: '+s.total_amount+'</b><br><small>'+new Date(s.created_at).toLocaleString()+'</small><br><button class="btn" style="margin-top:10px;" onclick="alert(\\\'Receipt logic here\\\')">VIEW RECEIPT</button></div>';
                    }).join('');
                    document.getElementById('count').innerText = sales.length;
                    document.getElementById('rev').innerText = rev.toFixed(2);
                }
                load();
            </script>
        </body>
        </html>
    \`);
});

/* ================== THE ADMIN MASTER CONTROL ================== */
app.get('/admin/master', async (req, res) => {
    const result = await pool.query(\`
        SELECT handle, owner_whatsapp, trial_expires, is_active, 
        (SELECT COUNT(*) FROM sales WHERE store_handle = stores.handle) as total_sales
        FROM stores ORDER BY created_at DESC
    \`);
    const rows = result.rows.map(s => \`
        <tr>
            <td>\${s.handle}</td>
            <td>\${s.owner_whatsapp || 'N/A'}</td>
            <td>\${new Date(s.trial_expires).toLocaleDateString()}</td>
            <td>\${s.total_sales}</td>
            <td><button onclick="toggle('\${s.handle}', \${!s.is_active})">\${s.is_active ? 'Disable' : 'Enable'}</button></td>
        </tr>\`).join('');
    res.send(\`<html><body style="background:#111; color:#fff; font-family:sans-serif;"><h1>👑 Admin Master</h1><table border="1" cellpadding="10" style="width:100%; border-collapse:collapse;"><tr><th>Store</th><th>WhatsApp</th><th>Trial Ends</th><th>Sales</th><th>Action</th></tr>\${rows}</table><script>async function toggle(h, s){ await fetch('/api/admin/toggle', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({handle:h, status:s})}); location.reload(); }</script></body></html>\`);
});

/* ================== API ENDPOINTS ================== */
app.post('/api/publish', async (req, res) => {
    const { handle, configData, ownerWhatsapp } = req.body;
    try {
        await pool.query(\`
            INSERT INTO stores (handle, config_data, owner_whatsapp) 
            VALUES ($1, $2, $3) 
            ON CONFLICT (handle) DO UPDATE SET config_data = $2, owner_whatsapp = COALESCE($3, stores.owner_whatsapp)
        \`, [handle, configData, ownerWhatsapp]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/store/:handle', async (req, res) => {
    const r = await pool.query('SELECT config_data FROM stores WHERE handle = $1', [req.params.handle]);
    res.json(r.rows.length ? r.rows[0].config_data : {error: "No store"});
});

app.get('/api/sales/:handle', async (req, res) => {
    const r = await pool.query('SELECT * FROM sales WHERE store_handle = $1 ORDER BY created_at DESC', [req.params.handle]);
    res.json(r.rows);
});

app.post('/api/log-sale', async (req, res) => {
    const { handle, cart, total } = req.body;
    await pool.query('INSERT INTO sales (store_handle, order_data, total_amount) VALUES ($1, $2, $3)', [handle, cart, total]);
    res.json({ success: true });
});

app.post('/api/admin/toggle', async (req, res) => {
    const { handle, status } = req.body;
    await pool.query('UPDATE stores SET is_active = $2 WHERE handle = $1', [handle, status]);
    res.json({ success: true });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('🚀 Retail OS Engine Online'));
