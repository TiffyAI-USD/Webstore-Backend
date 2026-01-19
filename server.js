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
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Database Ready.");
  } catch (err) { console.error("❌ DB Sync Error:", err); }
};
initDb();

/* ================== THE VIEWER (Restored & Updated) ================== */
app.get('/view/:handle', async (req, res) => {
  try {
    const check = await pool.query('SELECT is_active, trial_expires, config_data, plan_type FROM stores WHERE handle = $1', [req.params.handle]);
    if (check.rows.length === 0) return res.status(404).send('Store Not Found');

    const store = check.rows[0];
    const isExpired = store.trial_expires && new Date(store.trial_expires) < new Date();
    
    // Logic: If trial AND expired, suspend. If 'pro', it ignores expiry.
    if (!store.is_active || (store.plan_type === 'trial' && isExpired)) {
        return res.send('<body style="background:#000;color:red;display:flex;justify-content:center;align-items:center;height:100vh;text-align:center;font-family:sans-serif;"><div><h1>STORE SUSPENDED</h1><p>Contact administrator to renew.</p></div></body>');
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
            body { background: var(--bg); color: var(--text); margin: 0; font-family: -apple-system, sans-serif; padding-bottom: 120px; overflow-x: hidden; }
            .banner-container { width: 100%; height: 55vh; background: #000; position: relative; overflow: hidden; }
            #store-banner { width: 100.2%; height: 100%; object-fit: cover; margin-left: -0.1%; }
            .banner-overlay { position: absolute; bottom: 0; width: 100%; height: 60%; background: linear-gradient(to top, var(--bg), transparent); }
            header { text-align: center; margin-top: -60px; position: relative; z-index: 10; padding: 0 20px; }
            .logo { width: 120px; height: 120px; object-fit: cover; border-radius: 25px; border: 4px solid var(--bg); background: var(--card); margin: 0 auto; display: none; }
            .cta-btn { display: inline-block; background: linear-gradient(180deg, #d4a373, #f1b86b); color: #000; padding: 12px 25px; border-radius: 50px; text-decoration: none; font-weight: bold; margin-top: 15px; text-transform: uppercase; font-size: 0.9rem; }
            #content { display: none; max-width: 600px; margin: 0 auto; }
            .section-title { color: var(--accent); font-size: 1.4rem; margin: 40px 20px 15px; font-weight: 800; text-transform: uppercase; }
            .item-card { background: var(--card); margin: 0 20px 25px; border-radius: 24px; overflow: hidden; border: 1px solid #252525; }
            .item-img { width: 100%; height: auto; max-height: 350px; object-fit: cover; }
            .item-body { padding: 20px; }
            .item-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
            .item-price { color: #00ff00; font-weight: 900; font-size: 1.2rem; }
            .qty-controls { display: flex; align-items: center; background: #222; border-radius: 50px; width: fit-content; padding: 5px 15px; }
            .qty-btn { background: none; border: none; color: var(--accent); font-size: 1.5rem; font-weight: bold; cursor: pointer; padding: 0 10px; }
            .order-bar { position: fixed; bottom: 0; left: 0; width: 100%; background: #111; border-top: 1px solid #333; padding: 20px; box-sizing: border-box; z-index: 1000; display: flex; justify-content: space-between; align-items: center; }
            .wa-btn { background: #25d366; color: white; text-decoration: none; padding: 12px 25px; border-radius: 50px; font-weight: 800; }
        </style>
    </head>
    <body>
        <div id="full-store">
            <div class="banner-container"><img id="store-banner" src="\${storeData.banner || ''}"><div class="banner-overlay"></div></div>
            <div id="content">
                <header>
                    <img id="store-logo" class="logo" src="\${storeData.logo || ''}" style="\${storeData.logo ? 'display:block' : 'display:none'}">
                    <h1>\${storeData.businessName}</h1>
                    <p style="color:#888;">\${storeData.tagline || ''}</p>
                    \${(storeData.ctaUrl && storeData.ctaText) ? \`<a href="\${storeData.ctaUrl}" class="cta-btn">\${storeData.ctaText}</a>\` : ''}
                </header>
                <div id="menu-container"></div>
            </div>
            <div class="order-bar">
                <div><span style="color:#888; font-size:0.7rem;">TOTAL</span><br><span id="float-total" style="font-weight:900; font-size:1.3rem; color:#00ff00;">\${storeData.curr} 0</span></div>
                <button onclick="sendOrder()" class="wa-btn">SEND ORDER</button>
            </div>
        </div>
        <script>
            let cart = {};
            const storeData = \${JSON.stringify(storeData)};
            document.getElementById('content').style.display = 'block';

            function renderMenu() {
                const container = document.getElementById('menu-container');
                storeData.menu.forEach((sec, sIdx) => {
                    const h = document.createElement('h2'); h.className='section-title'; h.innerText=sec.title; container.appendChild(h);
                    sec.items.forEach((it, iIdx) => {
                        const key = sIdx+'-'+iIdx;
                        const div = document.createElement('div'); div.className='item-card';
                        div.innerHTML = \`\${it.img ? '<img src="'+it.img+'" class="item-img">' : ''}
                            <div class="item-body">
                                <div class="item-header"><b>\${it.name}</b><span class="item-price">\${storeData.curr} \${it.price}</span></div>
                                <div class="qty-controls">
                                    <button class="qty-btn" onclick="updateCart('\${key}',\${it.price},-1,'\${it.name}')">−</button>
                                    <span id="qty-\${key}">0</span>
                                    <button class="qty-btn" onclick="updateCart('\${key}',\${it.price},1,'\${it.name}')">+</button>
                                </div>
                            </div>\`;
                        container.appendChild(div);
                    });
                });
            }
            function updateCart(k,p,d,n){
                if(!cart[k]) cart[k]={qty:0,p:p,n:n}; cart[k].qty=Math.max(0,cart[k].qty+d);
                document.getElementById('qty-'+k).innerText=cart[k].qty;
                let t=0; Object.values(cart).forEach(i=>t+=(i.qty*i.p));
                document.getElementById('float-total').innerText=storeData.curr+' '+t;
            }
            function sendOrder(){
                let t=0, txt="*NEW ORDER*\\n\\n"; 
                Object.values(cart).forEach(i=>{ if(i.qty>0){ txt+="• "+i.qty+"x "+i.n+"\\n"; t+=(i.qty*i.p); } });
                if(t===0) return alert("Empty cart");
                window.location.href="https://wa.me/"+storeData.wa+"?text="+encodeURIComponent(txt+"\\n*TOTAL: "+storeData.curr+" "+t+"*");
            }
            renderMenu();
        </script>
    </body>
    </html>`);
  } catch (err) { res.status(500).send("Error"); }
});

/* ================== API SECTION ================== */
app.post('/api/publish', async (req, res) => {
  try {
    const { handle, configData, isActivated } = req.body;
    // Set plan_type to 'pro' ONLY IF isActivated is true
    const plan = isActivated ? 'pro' : 'trial';
    const wa = configData.wa || '';
    
    await pool.query(`
      INSERT INTO stores (handle, config_data, owner_whatsapp, plan_type) 
      VALUES ($1, $2, $3, $4) 
      ON CONFLICT (handle) DO UPDATE SET config_data = $2, owner_whatsapp = $3, plan_type = $4`, 
    [handle, configData, wa, plan]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.get('/api/admin/all-stores', async (req, res) => {
  const r = await pool.query('SELECT handle, owner_whatsapp, is_active, trial_expires, plan_type, created_at, config_data->>\'businessName\' as name FROM stores ORDER BY created_at DESC');
  res.json(r.rows);
});

app.get('/api/store/:handle', async (req, res) => {
  const r = await pool.query('SELECT config_data FROM stores WHERE handle = $1', [req.params.handle]);
  res.json(r.rows[0].config_data);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('🚀 Engine Live'));
