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
    console.log("✅ Database Ready.");
  } catch (err) { console.error("❌ DB Error:", err); }
};
initDb();

/* ================== THE VIEWER ================== */
app.get('/view/:handle', async (req, res) => {
  try {
    const check = await pool.query('SELECT config_data, is_active, trial_expires FROM stores WHERE handle = $1', [req.params.handle]);
    if (check.rows.length === 0) return res.send("<h1>Store Not Found</h1>");

    const store = check.rows[0];
    const storeData = store.config_data;
    const now = new Date();
    
    if (!store.is_active || new Date(store.trial_expires) < now) {
        return res.send('<div style="text-align:center;padding:100px;background:#000;color:red;height:100vh;"><h1>SUSPENDED</h1><p>Trial ended or deactivated.</p></div>');
    }

    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            :root { --accent: #00d4ff; --bg: #0f0f0f; --card: #1a1a1a; --text: #ffffff; }
            body { background: var(--bg); color: var(--text); margin: 0; font-family: sans-serif; padding-bottom:120px; overflow-x:hidden; }
            .banner-container { width: 100%; height: 55vh; background: #000; position: relative; overflow: hidden; }
            #store-banner { width: 100.2%; height: 100%; object-fit: cover; margin-left: -0.1%; }
            .banner-overlay { position: absolute; bottom: 0; width: 100%; height: 60%; background: linear-gradient(to top, var(--bg), transparent); }
            header { text-align: center; margin-top: -60px; position: relative; z-index: 10; padding: 0 20px; }
            .logo { width: 120px; height: 120px; border-radius: 25px; border: 4px solid var(--bg); display: block; margin: 0 auto; object-fit: cover; }
            .sales-count { background: rgba(0,212,255,0.1); border: 1px solid var(--accent); color: var(--accent); padding: 5px 15px; border-radius: 50px; font-size: 0.8rem; margin-top: 15px; display: inline-block; }
            .item-card { background: var(--card); margin: 20px; border-radius: 24px; overflow: hidden; border: 1px solid #252525; }
            .item-img { width: 100%; height: auto; display: block; }
            .item-body { padding: 20px; }
            .order-bar { position: fixed; bottom: 0; left: 0; width: 100%; background: #111; padding: 20px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #333; box-sizing: border-box; }
            .wa-btn { background: #25d366; color: white; padding: 12px 25px; border-radius: 50px; font-weight: bold; border: none; }
        </style>
    </head>
    <body>
        <div class="banner-container">
            <img id="store-banner" src="\${storeData.banner || ''}">
            <div class="banner-overlay"></div>
        </div>
        <header>
            \${storeData.logo ? '<img src="'+storeData.logo+'" class="logo">' : ''}
            <h1>\${storeData.businessName}</h1>
            <p style="color:#888;">\${storeData.tagline}</p>
            <div id="analytics-badge"></div>
        </header>
        <div id="menu-container"></div>
        <div class="order-bar">
            <div><small>TOTAL</small><br><b id="float-total" style="color:#00ff00;">--</b></div>
            <button onclick="sendOrder()" class="wa-btn">SEND ORDER</button>
        </div>

        <script>
            let cart = {};
            const store = \${JSON.stringify(storeData)};
            const handle = "\${req.params.handle}";

            async function init() {
                const res = await fetch('/api/sales/' + handle);
                const sales = await res.json();
                if(sales.length > 0) document.getElementById('analytics-badge').innerHTML = '<div class="sales-count">🔥 ' + sales.length + ' Orders Pushed</div>';
                
                const cont = document.getElementById('menu-container');
                store.menu.forEach((sec, sIdx) => {
                    const h = document.createElement('h2'); h.innerText = sec.title; h.style.margin = "20px"; h.style.color = "var(--accent)";
                    cont.appendChild(h);
                    sec.items.forEach((it, iIdx) => {
                        const key = sIdx+'-'+iIdx;
                        const card = document.createElement('div'); card.className = 'item-card';
                        card.innerHTML = (it.image ? '<img src="'+it.image+'" class="item-img">' : '') +
                            '<div class="item-body">' +
                            '<div style="display:flex; justify-content:space-between;"><b>'+it.name+'</b><span style="color:#00ff00;">'+store.curr+' '+it.price+'</span></div>' +
                            '<p style="color:#aaa; font-size:0.8rem;">'+(it.desc || '')+'</p>' +
                            '<button onclick="updateCart(\\''+key+'\\','+it.price+', 1, \\''+it.name+'\\')" style="background:var(--accent); border:none; padding:5px 15px; border-radius:5px;">ADD (<span id="qty-'+key+'">0</span>)</button>' +
                            '</div>';
                        cont.appendChild(card);
                    });
                });
            }

            function updateCart(k, p, d, n) {
                if(!cart[k]) cart[k] = {qty:0, price:p, name:n};
                cart[k].qty += d;
                document.getElementById('qty-'+k).innerText = cart[k].qty;
                let tot = 0; Object.values(cart).forEach(i => tot += (i.qty * i.price));
                document.getElementById('float-total').innerText = store.curr + ' ' + tot;
            }

            async function sendOrder() {
                if(Object.keys(cart).length === 0) return;
                let tot = 0; let txt = "*NEW ORDER*\\n\\n";
                Object.values(cart).forEach(i => { txt += "• "+i.qty+"x "+i.name+"\\n"; tot += (i.qty*i.price); });
                await fetch('/api/log-sale', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({handle, cart, total:tot}) });
                window.location.href = "https://wa.me/"+store.wa+"?text="+encodeURIComponent(txt + "\\n*TOTAL: "+store.curr+" "+tot+"*");
            }
            init();
        </script>
    </body>
    </html>
    `);
  } catch (e) { res.status(500).send("Server Error"); }
});

/* ================== OWNER DASHBOARD ================== */
app.get('/dashboard/:handle', (req, res) => {
    res.send('<html><body style="background:#000;color:#fff;font-family:sans-serif;padding:20px;"><h2>Dashboard</h2><div id="stats">Loading...</div><script>async function load(){ const r=await fetch("/api/sales/'+req.params.handle+'"); const s=await r.json(); document.getElementById("stats").innerText = s.length + " Sales found"; } load();</script></body></html>');
});

/* ================== ADMIN MASTER ================== */
app.get('/admin/master', async (req, res) => {
    const r = await pool.query('SELECT handle, owner_whatsapp, is_active FROM stores');
    const rows = r.rows.map(s => '<li>'+s.handle+' ('+s.owner_whatsapp+') - Active: '+s.is_active+'</li>').join('');
    res.send('<html><body style="background:#000;color:#fff;"><h1>Admin Master</h1><ul>'+rows+'</ul></body></html>');
});

/* ================== API ================== */
app.post('/api/publish', async (req, res) => {
    const { handle, configData, ownerWhatsapp } = req.body;
    await pool.query('INSERT INTO stores (handle, config_data, owner_whatsapp) VALUES ($1, $2, $3) ON CONFLICT (handle) DO UPDATE SET config_data = $2', [handle, configData, ownerWhatsapp]);
    res.json({ success: true });
});

app.get('/api/sales/:handle', async (req, res) => {
    const r = await pool.query('SELECT * FROM sales WHERE store_handle = $1', [req.params.handle]);
    res.json(r.rows);
});

app.post('/api/log-sale', async (req, res) => {
    const { handle, cart, total } = req.body;
    await pool.query('INSERT INTO sales (store_handle, order_data, total_amount) VALUES ($1, $2, $3)', [handle, cart, total]);
    res.json({ success: true });
});

app.get('/api/store/:handle', async (req, res) => {
    const r = await pool.query('SELECT config_data FROM stores WHERE handle = $1', [req.params.handle]);
    res.json(r.rows.length ? r.rows[0].config_data : {error: "Not found"});
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('🚀 Live'));
