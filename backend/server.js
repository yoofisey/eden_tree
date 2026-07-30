require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { getDb, saveDb, queryAll, queryOne, run, initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'eden-tree-dev-secret-change-in-prod';

/* ── Multer: image uploads ── */
const uploadsDir = path.join(__dirname, 'uploads');
if (!require('fs').existsSync(uploadsDir)) require('fs').mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, uploadsDir); },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, uuidv4() + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));
app.use('/uploads', express.static(uploadsDir));

/* ── Auth Middleware ── */
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/* ── Helper: load DB, run callback, save ── */
async function withDb(cb) {
  const { db } = await getDb();
  try {
    const result = await cb(db);
    saveDb(db);
    return result;
  } finally {
    db.close();
  }
}

/* ══════════════════════════════════════════
   AUTH
   ══════════════════════════════════════════ */
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  await withDb(async (db) => {
    const user = queryOne(db, 'SELECT * FROM users WHERE username = ?', [username]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    return res.json({ token, username: user.username });
  });
});

/* ══════════════════════════════════════════
   API ROOT
   ══════════════════════════════════════════ */
app.get('/api', (req, res) => {
  res.json({
    name: 'Eden Tree API',
    version: '1.0',
    endpoints: ['/api/products', '/api/orders', '/api/auth/login', '/api/payments/initialize', '/api/payments/verify', '/api/messages', '/api/newsletter', '/api/broadcasts', '/api/admin/dashboard', '/api/admin/orders', '/api/admin/products', '/api/admin/messages', '/api/admin/subscribers', '/api/admin/broadcasts', '/api/admin/upload', '/api/admin/password']
  });
});

/* ══════════════════════════════════════════
   PRODUCTS (public)
   ══════════════════════════════════════════ */
app.get('/api/products', async (req, res) => {
  await withDb(async (db) => {
    const products = queryAll(db, 'SELECT * FROM products ORDER BY id');
    return res.json(products.map(p => ({ ...p, inStock: !!p.inStock })));
  });
});

app.get('/api/products/:id', async (req, res) => {
  await withDb(async (db) => {
    const product = queryOne(db, 'SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    return res.json({ ...product, inStock: !!product.inStock });
  });
});

/* ══════════════════════════════════════════
   ORDERS (public)
   ══════════════════════════════════════════ */
app.post('/api/orders', async (req, res) => {
  const { customer, items, deliveryType, notes } = req.body;
  if (!customer || !customer.name || !customer.email || !items || !items.length) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  await withDb(async (db) => {
    let total = 0;
    const orderItems = [];

    for (const item of items) {
      const product = queryOne(db, 'SELECT * FROM products WHERE name = ?', [item.name]);
      if (!product) return res.status(400).json({ error: `Product "${item.name}" not found` });
      if (product.stock < item.quantity) return res.status(400).json({ error: `Insufficient stock for "${item.name}"` });
      total += product.price * item.quantity;
      orderItems.push({ name: product.name, quantity: item.quantity, price: product.price });
    }

    const orderId = 'ORD-' + Date.now().toString(36).toUpperCase();

    run(db, `INSERT INTO orders (id, customer_name, customer_email, customer_phone, customer_address, total, status, delivery_type, notes, payment_status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending_payment', ?, ?, 'unpaid')`,
      [orderId, customer.name, customer.email, customer.phone || '', customer.address || '', total, deliveryType || 'delivery', notes || '']);

    const stmt = db.prepare('INSERT INTO order_items (order_id, product_name, quantity, price) VALUES (?, ?, ?, ?)');
    for (const oi of orderItems) {
      stmt.run([orderId, oi.name, oi.quantity, oi.price]);
    }
    stmt.free();

    for (const item of items) {
      run(db, 'UPDATE products SET stock = stock - ? WHERE name = ?', [item.quantity, item.name]);
    }

    return res.json({ id: orderId, total });
  });
});

/* ══════════════════════════════════════════
   PAYMENTS (Paystack)
   ══════════════════════════════════════════ */
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || '';

app.post('/api/payments/initialize', async (req, res) => {
  const { orderId, email, amount } = req.body;
  if (!orderId || !email || !amount) return res.status(400).json({ error: 'Missing required fields' });

  if (!PAYSTACK_SECRET) return res.status(500).json({ error: 'Paystack not configured' });

  try {
    const resp = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + PAYSTACK_SECRET,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: Math.round(amount * 100),
        reference: 'EDEN-' + orderId + '-' + Date.now(),
        callback_url: req.headers.origin + '/shop.html?payment=success&order=' + orderId,
        metadata: { order_id: orderId },
      }),
    });
    const data = await resp.json();

    if (data.status) {
      await withDb(async (db) => {
        run(db, 'UPDATE orders SET payment_reference = ? WHERE id = ?', [data.data.reference, orderId]);
      });
      return res.json({ authorization_url: data.data.authorization_url, reference: data.data.reference });
    }
    return res.status(400).json({ error: data.message || 'Payment initialization failed' });
  } catch (err) {
    return res.status(500).json({ error: 'Payment service error' });
  }
});

app.get('/api/payments/verify', async (req, res) => {
  const { reference } = req.query;
  if (!reference) return res.status(400).json({ error: 'Reference required' });
  if (!PAYSTACK_SECRET) return res.status(500).json({ error: 'Paystack not configured' });

  try {
    const resp = await fetch('https://api.paystack.co/transaction/verify/' + encodeURIComponent(reference), {
      headers: { 'Authorization': 'Bearer ' + PAYSTACK_SECRET },
    });
    const data = await resp.json();

    if (data.status && data.data.status === 'success') {
      const orderId = data.data.metadata?.order_id;
      await withDb(async (db) => {
        run(db, 'UPDATE orders SET payment_status = ?, status = ? WHERE id = ?', ['paid', 'pending', orderId]);
      });
      return res.json({ verified: true, order_id: orderId });
    }
    return res.json({ verified: false });
  } catch (err) {
    return res.status(500).json({ error: 'Verification failed' });
  }
});

/* ══════════════════════════════════════════
   CONTACT FORM
   ══════════════════════════════════════════ */
app.post('/api/messages', async (req, res) => {
  const { name, email, phone, subject, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'Name, email, and message required' });

  await withDb(async (db) => {
    run(db, 'INSERT INTO messages (name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)',
      [name, email, phone || '', subject || '', message]);
    return res.json({ success: true });
  });
});

/* ══════════════════════════════════════════
   NEWSLETTER
   ══════════════════════════════════════════ */
app.post('/api/newsletter', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  await withDb(async (db) => {
    try {
      run(db, 'INSERT INTO newsletter_subscribers (email) VALUES (?)', [email]);
      return res.json({ success: true });
    } catch (e) {
      if (e.message && e.message.includes('UNIQUE')) return res.json({ success: true, already: true });
      return res.status(500).json({ error: 'Server error' });
    }
  });
});

/* ══════════════════════════════════════════
   BROADCASTS (public)
   ══════════════════════════════════════════ */
app.get('/api/broadcasts', async (req, res) => {
  await withDb(async (db) => {
    const broadcasts = queryAll(db, 'SELECT * FROM broadcasts ORDER BY createdAt DESC LIMIT 1');
    return res.json(broadcasts);
  });
});

/* ══════════════════════════════════════════
   ADMIN — DASHBOARD
   ══════════════════════════════════════════ */
app.get('/api/admin/dashboard', requireAuth, async (req, res) => {
  await withDb(async (db) => {
    const totalOrders = queryOne(db, 'SELECT COUNT(*) as count FROM orders');
    const pendingOrders = queryOne(db, "SELECT COUNT(*) as count FROM orders WHERE status IN ('pending','pending_payment','confirmed')");
    const totalRevenue = queryOne(db, "SELECT COALESCE(SUM(total),0) as sum FROM orders WHERE payment_status='paid'");
    const lowStock = queryAll(db, 'SELECT * FROM products WHERE stock <= minStock ORDER BY stock ASC LIMIT 5');
    const recentOrders = queryAll(db, "SELECT * FROM orders ORDER BY createdAt DESC LIMIT 5");
    const unreadMessages = queryOne(db, 'SELECT COUNT(*) as count FROM messages WHERE is_read = 0');
    const subscriberCount = queryOne(db, 'SELECT COUNT(*) as count FROM newsletter_subscribers');

    return res.json({
      total_orders: totalOrders.count,
      pending_orders: pendingOrders.count,
      total_revenue: totalRevenue.sum,
      low_stock: lowStock.map(p => ({ ...p, inStock: !!p.inStock })),
      recent_orders: recentOrders,
      unread_messages: unreadMessages.count,
      subscriber_count: subscriberCount.count,
    });
  });
});

/* ══════════════════════════════════════════
   ADMIN — ORDERS
   ══════════════════════════════════════════ */
app.get('/api/admin/orders', requireAuth, async (req, res) => {
  await withDb(async (db) => {
    const orders = queryAll(db, 'SELECT * FROM orders ORDER BY createdAt DESC');
    const enriched = orders.map(o => {
      const items = queryAll(db, 'SELECT * FROM order_items WHERE order_id = ?', [o.id]);
      return { ...o, items };
    });
    return res.json(enriched);
  });
});

app.put('/api/admin/orders/:id', requireAuth, async (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Status required' });

  await withDb(async (db) => {
    run(db, 'UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);
    return res.json({ success: true });
  });
});

/* ══════════════════════════════════════════
   ADMIN — PRODUCTS
   ══════════════════════════════════════════ */
app.get('/api/admin/products', requireAuth, async (req, res) => {
  await withDb(async (db) => {
    const products = queryAll(db, 'SELECT * FROM products ORDER BY id');
    return res.json(products.map(p => ({ ...p, inStock: !!p.inStock })));
  });
});

app.post('/api/admin/products', requireAuth, async (req, res) => {
  const { name, category, price, unit, description, image, stock, minStock } = req.body;
  if (!name || !category || !price || !unit) return res.status(400).json({ error: 'Missing required fields' });

  await withDb(async (db) => {
    run(db, `INSERT INTO products (name, category, price, unit, description, image, inStock, stock, minStock)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`, [name, category, price, unit, description || '', image || '', stock || 0, minStock || 5]);
    return res.json({ success: true, id: db.exec("SELECT last_insert_rowid()")[0]?.values?.[0]?.[0] });
  });
});

app.put('/api/admin/products/:id', requireAuth, async (req, res) => {
  const { name, category, price, unit, description, image, inStock, stock, minStock } = req.body;

  await withDb(async (db) => {
    run(db, `UPDATE products SET name=?, category=?, price=?, unit=?, description=?, image=?, inStock=?, stock=?, minStock=?, updatedAt=datetime('now') WHERE id=?`,
      [name, category, price, unit, description, image, inStock ? 1 : 0, stock, minStock, req.params.id]);
    return res.json({ success: true });
  });
});

app.delete('/api/admin/products/:id', requireAuth, async (req, res) => {
  await withDb(async (db) => {
    run(db, 'DELETE FROM products WHERE id = ?', [req.params.id]);
    return res.json({ success: true });
  });
});

/* ══════════════════════════════════════════
   ADMIN — MESSAGES
   ══════════════════════════════════════════ */
app.get('/api/admin/messages', requireAuth, async (req, res) => {
  await withDb(async (db) => {
    const messages = queryAll(db, 'SELECT * FROM messages ORDER BY createdAt DESC');
    return res.json(messages);
  });
});

app.put('/api/admin/messages/:id', requireAuth, async (req, res) => {
  const { is_read } = req.body;
  await withDb(async (db) => {
    run(db, 'UPDATE messages SET is_read = ? WHERE id = ?', [is_read ? 1 : 0, req.params.id]);
    return res.json({ success: true });
  });
});

app.delete('/api/admin/messages/:id', requireAuth, async (req, res) => {
  await withDb(async (db) => {
    run(db, 'DELETE FROM messages WHERE id = ?', [req.params.id]);
    return res.json({ success: true });
  });
});

/* ══════════════════════════════════════════
   ADMIN — NEWSLETTER SUBSCRIBERS
   ══════════════════════════════════════════ */
app.get('/api/admin/subscribers', requireAuth, async (req, res) => {
  await withDb(async (db) => {
    const subs = queryAll(db, 'SELECT * FROM newsletter_subscribers ORDER BY createdAt DESC');
    return res.json(subs);
  });
});

/* ══════════════════════════════════════════
   ADMIN — BROADCASTS
   ══════════════════════════════════════════ */
app.get('/api/admin/broadcasts', requireAuth, async (req, res) => {
  await withDb(async (db) => {
    const broadcasts = queryAll(db, 'SELECT * FROM broadcasts ORDER BY createdAt DESC LIMIT 10');
    return res.json(broadcasts);
  });
});

app.post('/api/admin/broadcasts', requireAuth, async (req, res) => {
  const { title, message } = req.body;
  if (!title || !message) return res.status(400).json({ error: 'Title and message required' });

  await withDb(async (db) => {
    const id = uuidv4();
    run(db, 'INSERT INTO broadcasts (id, title, message) VALUES (?, ?, ?)', [id, title, message]);
    const subCount = queryOne(db, 'SELECT COUNT(*) as count FROM newsletter_subscribers');
    return res.json({ success: true, id, recipient_count: subCount.count });
  });
});

/* ══════════════════════════════════════════
   ADMIN — IMAGE UPLOAD
   ══════════════════════════════════════════ */
app.post('/api/admin/upload', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  const url = '/uploads/' + req.file.filename;
  return res.json({ url, filename: req.file.filename });
});

/* ══════════════════════════════════════════
   ADMIN — PASSWORD UPDATE
   ══════════════════════════════════════════ */
app.put('/api/admin/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password required' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  await withDb(async (db) => {
    const user = queryOne(db, 'SELECT * FROM users WHERE id = ?', [req.user.id]);
    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(newPassword, 10);
    run(db, 'UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
    return res.json({ success: true });
  });
});

/* ── SPA fallback: serve index.html for root ── */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

/* ── Start ── */
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`\n  Eden Tree Backend running at http://localhost:${PORT}`);
    console.log(`  API: http://localhost:${PORT}/api/`);
    console.log(`  Admin: http://localhost:${PORT}/admin.html`);
    if (!PAYSTACK_SECRET) console.log('  ⚠  PAYSTACK_SECRET_KEY not set — payments disabled');
    console.log();
  });
}).catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
