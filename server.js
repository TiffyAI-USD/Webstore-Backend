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
    console.log("✅ Database Engine Ready");
  } catch (err) { console.error("❌ DB Init Error:", err); }
};
initDb();

/* ================== THE PUBLIC STOREFRONT (LIVE VIEW) ================== */
app.get('/view/:handle', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM stores WHERE handle = $1', [req.params.handle]);
    
    if (result.rows.length === 0) {
        return res.status(404).send('<body style="background:#000;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;"><h1>Store Not Found</h1></body>');
    }

    const store = result.rows[0];
    const config = typeof store.config_data === 'string' ? JSON.parse(store.config_data) : store.config_data;
    
    // Safety check for suspended or expired stores
    const isExpired = store.trial_expires && new Date(store.trial_expires) < new Date();
    if (!store.is_active || (store.plan_type === 'trial' && isExpired)) {
        return res.send('<body style="background:#000;color:red;display:flex;justify-content:center;align-items:center;height:100vh;text-align:center;"><h1>STORE SUSPENDED</h1></body>');
    }

    // CTA Button Rendering Logic
    const ctaHtml = (config.ctaText && config.ctaUrl) ? 
        `<div style="text-align:center; padding:30px 0;">
            <a href="${config.ctaUrl}" style="background:linear-gradient(180deg,#d4a373,#f1b86b); color:#000; padding:15px 35px; border-radius:50px; text-decoration:none; font-weight:800; text-transform:uppercase; box-shadow:0 4px 15px rgba(212,163,115,0.4); display:inline-block;">${config.ctaText}</a>
        </div>` : '';

    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>\${config.businessName}</title>
        <style>
            :root { --accent: #d4a373; --bg: #0a0a0a; --card: #151515; }
            body { background: var(--bg); color: #fff; margin: 0; font-family: -apple-system, sans-serif; padding-bottom: 100px; }
            .banner { width: 100%; height: 50vh; object-fit: cover; }
            .header-area { text-align: center; padding: 20px; margin-top: -50px; position: relative; }
            .logo { width: 100px; height: 100px; border-radius: 20px; border: 3px solid var(--bg); background: var(--card); margin: 0 auto; object-fit: cover; }
            .menu-section { padding: 0 20px; max-width: 600px; margin: 0 auto; }
            .section-title { color: var(--accent); text-transform: uppercase; letter-spacing: 1px; margin: 30px 0 15px; }
            .item-card { background: var(--card); border-radius: 15px; margin-bottom: 20px; border: 1px solid #222; overflow: hidden; }
            .item-img { width: 100%; height: auto; display: block; }
            .item-info { padding: 15px; }
            .item-name { font-weight: bold; font-size: 1.1rem; }
            .item-price { color: #00ff00; font-weight: 900; float: right; }
            .wa-order-bar { position: fixed; bottom: 0; width: 100%; background: #111; padding: 20px; border-top: 1px solid #333; text-align: center; box-sizing: border-box; }
            .btn-send { background: #25d366; color: #fff; text-decoration: none; padding: 12px 40px; border-radius: 50px; font-weight: 800; display: inline-block; }
        </style>
    </head>
    <body>
        <img src="\${config.banner}" class="banner">
        <div class="header-area">
            \${config.logo ? \`<img src="\${config.logo}" class="logo">\` : ''}
            <h1>\${config.businessName}</h1>
            <p style="color:#888">\${config.tagline || ''}</p>
        </div>

        <div class="menu-section">
            \${config.menu.map(sec => \`
                <h2 class="section-title">\${sec.title}</h2>
                \${sec.items.map(it => \`
                    <div class="item-card">
                        \${it.img ? \`<img src="\${it.img}" class="item-img">\` : ''}
                        <div class="item-info">
                            <span class="item-price">\${config.curr} \${it.price}</span>
                            <div class="item-name">\${it.name}</div>
                            <p style="color:#aaa; font-size:0.9rem;">\${it.desc || ''}</p>
                        </div>
                    </div>
                \`).join('')}
            \`).join('')}
        </div>

        \${ctaHtml}

        <div class="wa-order-bar">
            <a href="https://wa.me/\${config.wa}" class="btn-send">CONTACT ON WHATSAPP</a>
        </div>
    </body>
    </html>
  `);
  } catch (err) { res.status(500).send("Critical Store Error"); }
});

/* ================== API ENDPOINTS ================== */

// Save/Publish Store
app.post('/api/publish', async (req, res) => {
  try {
    const { handle, configData, ownerWhatsapp, isActivated } = req.body;
    const plan = isActivated ? 'pro' : 'trial';

    await pool.query(`
      INSERT INTO stores (handle, config_data, owner_whatsapp, plan_type) 
      VALUES ($1, $2, $3, $4) 
      ON CONFLICT (handle) DO UPDATE SET 
        config_data = $2, 
        owner_whatsapp = EXCLUDED.owner_whatsapp,
        plan_type = EXCLUDED.plan_type,
        updated_at = CURRENT_TIMESTAMP`, 
    [handle, JSON.stringify(configData), ownerWhatsapp, plan]);
    
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

// Admin Dashboard Data
app.get('/api/admin/all-stores', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM stores ORDER BY created_at DESC');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin Actions (Ban/Extend)
app.post('/api/admin/action', async (req, res) => {
  const { handle, action } = req.body;
  try {
    if (action === 'toggle') {
      await pool.query('UPDATE stores SET is_active = NOT is_active WHERE handle = $1', [handle]);
    } else if (action === 'extend') {
      await pool.query("UPDATE stores SET trial_expires = trial_expires + INTERVAL '30 days' WHERE handle = $1", [handle]);
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('🛰️ Engine Active on Port ' + PORT));
