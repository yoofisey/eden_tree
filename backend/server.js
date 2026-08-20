require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const nodemailer = require('nodemailer');
const { getDb, saveDb, queryAll, queryOne, run, insertAndGetId, initDatabase } = require('./database');

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

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '100kb' }));

/* ── Security headers + HTTPS redirect (production) ── */
app.use(function (req, res, next) {
  if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect('https://' + req.headers.host + req.url);
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

/* ── Static assets: only css/, js/, images/ and /uploads are public ── */
function noCacheInDev(res) {
  if (process.env.NODE_ENV !== 'production') res.setHeader('Cache-Control', 'no-store');
}
app.use('/css', express.static(path.join(__dirname, '..', 'css'), { setHeaders: noCacheInDev }));
app.use('/js', express.static(path.join(__dirname, '..', 'js'), { setHeaders: noCacheInDev }));
app.use('/images', express.static(path.join(__dirname, '..', 'images'), { setHeaders: noCacheInDev }));
app.use('/uploads', express.static(uploadsDir));

/* ── Async route wrapper: forwards rejections to the global error handler ── */
['get', 'post', 'put', 'delete'].forEach(function (m) {
  const orig = app[m].bind(app);
  app[m] = function (path) {
    const handlers = Array.prototype.slice.call(arguments, 1).map(function (h) {
      if (typeof h !== 'function' || h.length === 4) return h; // skip error middleware
      const wrapped = function (req, res, next) {
        try {
          const result = h(req, res, next);
          if (result && typeof result.catch === 'function') result.catch(next);
        } catch (err) {
          next(err);
        }
      };
      Object.defineProperty(wrapped, 'length', { value: h.length });
      return wrapped;
    });
    return orig.apply(app, [path].concat(handlers));
  };
});

/* ── In-memory rate limiter (per IP + path) ── */
const rateBuckets = new Map();
setInterval(function () { rateBuckets.clear(); }, 15 * 60 * 1000).unref();
function rateLimit(windowMs, max) {
  return function (req, res, next) {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
    const key = ip + '|' + req.path;
    const now = Date.now();
    const list = (rateBuckets.get(key) || []).filter(function (t) { return now - t < windowMs; });
    if (list.length >= max) return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    list.push(now);
    rateBuckets.set(key, list);
    next();
  };
}

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

/* ── Role guard: must be called AFTER requireAuth ── */
function requireRole() {
  const roles = Array.prototype.slice.call(arguments);
  return function (req, res, next) {
    if (!req.user || roles.indexOf(req.user.role) === -1) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

/* ── Demo mode flag — flip to false when real payments go live ── */
const DEMO_MODE = true;

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
app.post('/api/auth/login', rateLimit(15 * 60 * 1000, 20), async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  await withDb(async (db) => {
    const user = await queryOne(db, 'SELECT * FROM users WHERE username = ?', [String(username).trim()]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(String(password), user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const role = user.role || 'owner';
    const token = jwt.sign({ id: user.id, username: user.username, role }, JWT_SECRET, { expiresIn: '24h' });
    return res.json({ token, username: user.username, role });
  });
});

/* ══════════════════════════════════════════
   API ROOT
   ══════════════════════════════════════════ */
app.get('/api', (req, res) => {
  res.json({
    name: 'Eden Tree API',
    version: '1.0',
    endpoints: ['/api/products', '/api/orders', '/api/orders/:id', '/api/promos/validate', '/api/auth/login', '/api/payments/initialize', '/api/payments/demo-confirm', '/api/payments/verify', '/api/messages', '/api/newsletter', '/api/broadcasts', '/api/admin/dashboard', '/api/admin/orders', '/api/admin/products', '/api/admin/users', '/api/admin/promos', '/api/admin/messages', '/api/admin/subscribers', '/api/admin/broadcasts', '/api/admin/upload', '/api/admin/password']
  });
});

/* ══════════════════════════════════════════
   PRODUCTS (public)
   ══════════════════════════════════════════ */
app.get('/api/products', async (req, res) => {
  await withDb(async (db) => {
    const products = await queryAll(db, 'SELECT * FROM products ORDER BY id');
    return res.json(products.map(p => ({ ...p, inStock: !!p.inStock })));
  });
});

app.get('/api/products/:id', async (req, res) => {
  await withDb(async (db) => {
    const product = await queryOne(db, 'SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    return res.json({ ...product, inStock: !!product.inStock });
  });
});

/* ══════════════════════════════════════════
   ORDERS (public)
   ══════════════════════════════════════════ */
app.post('/api/orders', rateLimit(60 * 1000, 10), async (req, res) => {
  const { customer, items, deliveryType, notes, promoCode } = req.body;
  if (!customer || !customer.name || !customer.email || !items || !items.length) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(customer.email).trim())) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }

  await withDb(async (db) => {
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      if (!item || typeof item.name !== 'string' || !Number.isInteger(item.quantity) || item.quantity < 1) {
        return res.status(400).json({ error: 'Invalid order items' });
      }
      const product = await queryOne(db, 'SELECT * FROM products WHERE name = ?', [item.name]);
      if (!product) return res.status(400).json({ error: `Product "${item.name}" not found` });
      if (product.stock < item.quantity) return res.status(400).json({ error: `Insufficient stock for "${item.name}"` });
      subtotal += product.price * item.quantity;
      orderItems.push({ name: product.name, quantity: item.quantity, price: product.price });
    }

    /* Promo code: validate and compute discount server-side */
    let discount = 0;
    let appliedCode = null;
    if (promoCode && String(promoCode).trim()) {
      const promo = await queryOne(db, 'SELECT * FROM promo_codes WHERE UPPER(code) = UPPER(?)', [String(promoCode).trim()]);
      if (!promo || !promo.active) return res.status(400).json({ error: 'Invalid promo code' });
      if (promo.expires_at && new Date(promo.expires_at) < new Date()) return res.status(400).json({ error: 'Promo code has expired' });
      if (promo.usage_limit > 0 && promo.used_count >= promo.usage_limit) return res.status(400).json({ error: 'Promo code has been fully used' });
      if (subtotal < promo.min_order) return res.status(400).json({ error: 'Order does not meet the minimum for this promo code' });
      discount = promo.discount_type === 'percent'
        ? Math.round(subtotal * promo.discount_value / 100)
        : Math.min(Number(promo.discount_value), subtotal);
      appliedCode = promo.code;
      await run(db, 'UPDATE promo_codes SET used_count = used_count + 1 WHERE id = ?', [promo.id]);
    }

    const total = subtotal - discount;
    const orderId = 'ORD-' + Date.now().toString(36).toUpperCase();

    await run(db, `INSERT INTO orders (id, customer_name, customer_email, customer_phone, customer_address, total, status, delivery_type, notes, payment_status, discount, promo_code)
      VALUES (?, ?, ?, ?, ?, ?, 'pending_payment', ?, ?, 'unpaid', ?, ?)`,
      [orderId, String(customer.name).trim(), String(customer.email).trim(), customer.phone || '', customer.address || '', total, deliveryType || 'delivery', notes || '', discount, appliedCode || '']);

    for (const oi of orderItems) {
      await run(db, 'INSERT INTO order_items (order_id, product_name, quantity, price) VALUES (?, ?, ?, ?)',
        [orderId, oi.name, oi.quantity, oi.price]);
    }

    for (const item of items) {
      await run(db, 'UPDATE products SET stock = stock - ? WHERE name = ?', [item.quantity, item.name]);
    }

    sendSMS(customer.phone, 'Eden Tree: Order ' + orderId + ' received (GH¢' + total.toFixed(2) + '). Thank you!');
    sendOrderEmail({ orderId, total, discount, customer, deliveryType, orderItems });

    return res.json({ id: orderId, total, discount });
  });
});

/* ── Public order status lookup (order tracking) ── */
app.get('/api/orders/:id', async (req, res) => {
  await withDb(async (db) => {
    const order = await queryOne(db, 'SELECT id, status, payment_status, total, discount, delivery_type, notes, customer_name, createdAt FROM orders WHERE id = ?', [String(req.params.id).trim()]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const items = await queryAll(db, 'SELECT product_name, quantity, price FROM order_items WHERE order_id = ?', [order.id]);
    return res.json({ ...order, items });
  });
});

/* ══════════════════════════════════════════
   PROMO CODES (public)
   ══════════════════════════════════════════ */
app.post('/api/promos/validate', rateLimit(60 * 1000, 30), async (req, res) => {
  const { code, subtotal } = req.body;
  if (!code) return res.json({ valid: false, error: 'Enter a promo code' });
  const sub = Number(subtotal) || 0;

  await withDb(async (db) => {
    const promo = await queryOne(db, 'SELECT * FROM promo_codes WHERE UPPER(code) = UPPER(?)', [String(code).trim()]);
    if (!promo || !promo.active) return res.json({ valid: false, error: 'Invalid promo code' });
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) return res.json({ valid: false, error: 'Promo code has expired' });
    if (promo.usage_limit > 0 && promo.used_count >= promo.usage_limit) return res.json({ valid: false, error: 'Promo code has been fully used' });
    if (sub < promo.min_order) return res.json({ valid: false, error: 'Order does not meet the minimum for this code' });
    const discount = promo.discount_type === 'percent'
      ? Math.round(sub * promo.discount_value / 100)
      : Math.min(Number(promo.discount_value), sub);
    return res.json({ valid: true, code: promo.code, discount, total_after: sub - discount });
  });
});

/* ══════════════════════════════════════════
   PAYMENTS (Demo Mode)
   ══════════════════════════════════════════ */

/* ── Demo-mode SMS: just logs to console ── */
async function sendSMS(to, message) {
  console.log('\n  [SMS to ' + to + '] ' + message + '\n');
}

/* ── Email notifications (no-op unless SMTP is configured) ── */
async function sendEmail(to, subject, html) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM || !process.env.NOTIFY_EMAIL) return;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  await transporter.sendMail({ from: process.env.SMTP_FROM, to, subject, html });
}

function sendOrderEmail({ orderId, total, discount, customer, deliveryType, orderItems }) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM || !process.env.NOTIFY_EMAIL) return;
  const itemsHtml = orderItems.map(function (oi) {
    return '<tr><td>' + oi.name + '</td><td>' + oi.quantity + '</td><td>GH¢ ' + Number(oi.price * oi.quantity).toFixed(2) + '</td></tr>';
  }).join('');
  const lines = [
    '<h2>New Order ' + orderId + '</h2>',
    '<p><strong>' + customer.name + '</strong> (' + customer.email + (customer.phone ? ', ' + customer.phone : '') + ')</p>',
    '<p>Delivery: <strong>' + deliveryType + '</strong>' + (customer.address ? ' — ' + customer.address : '') + '</p>',
    '<table border="1" cellpadding="6" cellspacing="0"><tr><th>Item</th><th>Qty</th><th>Amount</th></tr>' + itemsHtml + '</table>',
    discount > 0 ? '<p>Discount: <strong>GH¢ ' + Number(discount).toFixed(2) + '</strong></p>' : '',
    '<p>Total: <strong>GH¢ ' + Number(total).toFixed(2) + '</strong></p>',
  ].join('');
  sendEmail(process.env.NOTIFY_EMAIL, 'New order ' + orderId, lines).catch(function (err) {
    console.error('[email] order notification failed:', err.message);
  });
}

/* ── Demo payment init: returns success token ── */
app.post('/api/payments/initialize', rateLimit(60 * 1000, 10), async (req, res) => {
  const { orderId, email, amount } = req.body;
  if (!orderId || !email || !amount) return res.status(400).json({ error: 'Missing required fields' });

  /* In demo mode, mark the order so the confirm step can finalise it */
  await withDb(async (db) => {
    await run(db, 'UPDATE orders SET payment_reference = ? WHERE id = ?', ['demo_' + Date.now(), orderId]);
  });
  return res.json({ demo: true, reference: orderId });
});

/* ── Demo payment confirm: marks order as paid ── */
app.post('/api/payments/demo-confirm', rateLimit(60 * 1000, 10), async (req, res) => {
  const { orderId } = req.body;
  if (!orderId) return res.status(400).json({ error: 'Order ID required' });

  await withDb(async (db) => {
    const order = await queryOne(db, 'SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.payment_status === 'paid') return res.json({ success: true, already: true });

    await run(db, 'UPDATE orders SET payment_status = ?, status = ? WHERE id = ?', ['paid', 'pending', orderId]);
    if (order.customer_phone) {
      sendSMS(order.customer_phone, 'Eden Tree: Payment confirmed for ' + orderId + ' (GH¢' + Number(order.total).toFixed(2) + '). We are processing your order. Thank you!');
    }
    if (process.env.NOTIFY_EMAIL) {
      sendEmail(process.env.NOTIFY_EMAIL, 'Payment confirmed for ' + orderId,
        '<h2>Payment received</h2><p>Order <strong>' + orderId + '</strong> has been paid (GH¢ ' + Number(order.total).toFixed(2) + ').</p>')
        .catch(function (err) { console.error('[email] payment notification failed:', err.message); });
    }
    return res.json({ success: true });
  });
});

/* ── Payment verify: checks DB ── */
app.get('/api/payments/verify', async (req, res) => {
  const { reference } = req.query;
  if (!reference) return res.status(400).json({ error: 'Reference required' });

  await withDb(async (db) => {
    const order = await queryOne(db, 'SELECT * FROM orders WHERE id = ?', [reference]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    return res.json({ verified: order.payment_status === 'paid', order_id: order.id });
  });
});

/* ══════════════════════════════════════════
   CONTACT FORM
   ══════════════════════════════════════════ */
app.post('/api/messages', rateLimit(60 * 1000, 5), async (req, res) => {
  const { name, email, phone, subject, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'Name, email, and message required' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email).trim())) return res.status(400).json({ error: 'Please enter a valid email address' });
  if (String(name).trim().length > 100 || String(message).trim().length > 2000) return res.status(400).json({ error: 'Fields too long' });

  await withDb(async (db) => {
    await run(db, 'INSERT INTO messages (name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)',
      [String(name).trim().slice(0, 100), String(email).trim(), phone || '', subject || '', String(message).trim().slice(0, 2000)]);
    return res.json({ success: true });
  });
});

/* ══════════════════════════════════════════
   BLOG (public)
   ══════════════════════════════════════════ */
app.get('/api/blog', async (req, res) => {
  await withDb(async (db) => {
    const posts = await queryAll(db, 'SELECT id, title, slug, excerpt, category, image, author, createdAt FROM blog_posts WHERE published = 1 ORDER BY createdAt DESC');
    return res.json(posts);
  });
});

app.get('/api/blog/:slug', async (req, res) => {
  await withDb(async (db) => {
    const post = await queryOne(db, 'SELECT * FROM blog_posts WHERE slug = ? AND published = 1', [req.params.slug]);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    return res.json(post);
  });
});

/* ══════════════════════════════════════════
   NEWSLETTER
   ══════════════════════════════════════════ */
app.post('/api/newsletter', rateLimit(60 * 1000, 5), async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email).trim())) return res.status(400).json({ error: 'Please enter a valid email address' });

  await withDb(async (db) => {
    try {
      await run(db, 'INSERT INTO newsletter_subscribers (email) VALUES (?)', [String(email).trim()]);
      return res.json({ success: true });
    } catch (e) {
      if (e.code === '23505' || (e.message && e.message.includes('UNIQUE'))) return res.json({ success: true, already: true });
      return res.status(500).json({ error: 'Server error' });
    }
  });
});

/* ══════════════════════════════════════════
   BROADCASTS (public)
   ══════════════════════════════════════════ */
app.get('/api/broadcasts', async (req, res) => {
  await withDb(async (db) => {
    const broadcasts = await queryAll(db, 'SELECT * FROM broadcasts ORDER BY createdAt DESC LIMIT 1');
    return res.json(broadcasts);
  });
});

/* ══════════════════════════════════════════
   ADMIN — DASHBOARD
   ══════════════════════════════════════════ */
app.get('/api/admin/dashboard', requireAuth, async (req, res) => {
  const days = Number(req.query.days) || 7;
  const startDate = req.query.start || '';
  const endDate = req.query.end || '';

  await withDb(async (db) => {
    const totalOrders = await queryOne(db, 'SELECT COUNT(*) as count FROM orders');
    const pendingOrders = await queryOne(db, "SELECT COUNT(*) as count FROM orders WHERE status IN ('pending','pending_payment','confirmed')");
    const totalRevenue = await queryOne(db, "SELECT COALESCE(SUM(total),0) - COALESCE(SUM(refunded_amount),0) as sum FROM orders WHERE payment_status IN ('paid','refunded')");
    const lowStock = await queryAll(db, 'SELECT * FROM products WHERE stock <= minStock ORDER BY stock ASC LIMIT 5');
    const recentOrders = await queryAll(db, "SELECT * FROM orders ORDER BY createdAt DESC LIMIT 5");
    const unreadMessages = await queryOne(db, 'SELECT COUNT(*) as count FROM messages WHERE is_read = 0');
    const subscriberCount = await queryOne(db, 'SELECT COUNT(*) as count FROM newsletter_subscribers');

    let dateFilter = '';
    let params = [];
    if (startDate && endDate) {
      dateFilter = "WHERE payment_status IN ('paid','refunded') AND createdAt >= ? AND createdAt <= ?";
      params = [startDate + 'T00:00:00', endDate + 'T23:59:59'];
    } else {
      dateFilter = "WHERE payment_status IN ('paid','refunded')";
    }
    const paidOrders = await queryAll(db, `SELECT createdAt, total, refunded_amount FROM orders ${dateFilter}`, params);

    const revenueByDayMap = {};
    paidOrders.forEach(r => {
      const day = String(r.createdAt).slice(0, 10);
      revenueByDayMap[day] = (revenueByDayMap[day] || 0) + Number(r.total) - Number(r.refunded_amount || 0);
    });

    let dayCount = days;
    if (startDate && endDate) {
      const s = new Date(startDate);
      const e = new Date(endDate);
      dayCount = Math.max(1, Math.round((e - s) / 86400000) + 1);
    }
    const dayList = [];
    for (let i = dayCount - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      dayList.push({ day: key, total: revenueByDayMap[key] || 0 });
    }

    /* Top products by revenue */
    const topProducts = await queryAll(db, `
      SELECT oi.product_name, SUM(oi.quantity) as total_qty, SUM(oi.price * oi.quantity) as total_rev
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.payment_status IN ('paid','refunded')
      GROUP BY oi.product_name
      ORDER BY total_rev DESC
      LIMIT 10
    `);

    /* Orders by status */
    const statusCounts = await queryAll(db, 'SELECT status, COUNT(*) as count FROM orders GROUP BY status');

    return res.json({
      total_orders: Number(totalOrders.count),
      pending_orders: Number(pendingOrders.count),
      total_revenue: Number(totalRevenue.sum),
      low_stock: lowStock.map(p => ({ ...p, inStock: !!p.inStock })),
      recent_orders: recentOrders,
      unread_messages: Number(unreadMessages.count),
      subscriber_count: Number(subscriberCount.count),
      revenue_by_day: dayList,
      top_products: topProducts,
      status_counts: statusCounts,
    });
  });
});

/* ── Product Sales Report ── */
app.get('/api/admin/reports/products', requireAuth, requireRole('owner', 'admin'), async (req, res) => {
  await withDb(async (db) => {
    const sales = await queryAll(db, `
      SELECT oi.product_name, SUM(oi.quantity) as total_sold, SUM(oi.price * oi.quantity) as total_revenue, COUNT(DISTINCT oi.order_id) as order_count
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.payment_status IN ('paid','refunded')
      GROUP BY oi.product_name
      ORDER BY total_revenue DESC
    `);
    return res.json(sales);
  });
});

/* ══════════════════════════════════════════
   ADMIN — ORDERS
   ══════════════════════════════════════════ */
app.get('/api/admin/orders', requireAuth, async (req, res) => {
  await withDb(async (db) => {
    const orders = await queryAll(db, 'SELECT * FROM orders ORDER BY createdAt DESC');
    const enriched = [];
    for (const o of orders) {
      const items = await queryAll(db, 'SELECT * FROM order_items WHERE order_id = ?', [o.id]);
      enriched.push({ ...o, items });
    }
    return res.json(enriched);
  });
});

app.put('/api/admin/orders/:id', requireAuth, async (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Status required' });

  await withDb(async (db) => {
    await run(db, 'UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);
    return res.json({ success: true });
  });
});

/* ── Refund a paid order (reconciliation) ── */
app.put('/api/admin/orders/:id/refund', requireAuth, requireRole('owner', 'admin'), async (req, res) => {
  const { amount } = req.body;

  await withDb(async (db) => {
    const order = await queryOne(db, 'SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.payment_status !== 'paid') return res.status(400).json({ error: 'Only paid orders can be refunded' });

    const refundAmount = Math.min(Number(amount) > 0 ? Number(amount) : Number(order.total), Number(order.total));
    await run(db, 'UPDATE orders SET payment_status = ?, refunded_amount = ?, refunded_at = ? WHERE id = ?',
      ['refunded', refundAmount, new Date().toISOString(), order.id]);
    return res.json({ success: true, refunded_amount: refundAmount });
  });
});

app.delete('/api/admin/orders/:id', requireAuth, async (req, res) => {
  await withDb(async (db) => {
    await run(db, 'DELETE FROM order_items WHERE order_id = ?', [req.params.id]);
    await run(db, 'DELETE FROM orders WHERE id = ?', [req.params.id]);
    return res.json({ success: true });
  });
});

/* ══════════════════════════════════════════
   ADMIN — PRODUCTS
   ══════════════════════════════════════════ */
app.get('/api/admin/products', requireAuth, requireRole('owner', 'admin'), async (req, res) => {
  await withDb(async (db) => {
    const products = await queryAll(db, 'SELECT * FROM products ORDER BY id');
    return res.json(products.map(p => ({ ...p, inStock: !!p.inStock })));
  });
});

app.post('/api/admin/products', requireAuth, requireRole('owner', 'admin'), async (req, res) => {
  const { name, category, price, unit, description, image, stock, minStock } = req.body;
  if (!name || !category || !price || !unit) return res.status(400).json({ error: 'Missing required fields' });

  await withDb(async (db) => {
    const id = await insertAndGetId(db, `INSERT INTO products (name, category, price, unit, description, image, inStock, stock, minStock)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`, [name, category, price, unit, description || '', image || '', stock || 0, minStock || 5]);
    return res.json({ success: true, id });
  });
});

app.put('/api/admin/products/:id', requireAuth, requireRole('owner', 'admin'), async (req, res) => {
  const { name, category, price, unit, description, image, inStock, stock, minStock } = req.body;

  await withDb(async (db) => {
    await run(db, `UPDATE products SET name=?, category=?, price=?, unit=?, description=?, image=?, inStock=?, stock=?, minStock=?, updatedAt=? WHERE id=?`,
      [name, category, price, unit, description, image, inStock ? 1 : 0, stock, minStock, new Date().toISOString(), req.params.id]);
    return res.json({ success: true });
  });
});

app.delete('/api/admin/products/:id', requireAuth, requireRole('owner', 'admin'), async (req, res) => {
  await withDb(async (db) => {
    await run(db, 'DELETE FROM products WHERE id = ?', [req.params.id]);
    return res.json({ success: true });
  });
});

/* ══════════════════════════════════════════
   ADMIN — USERS (owner only)
   ══════════════════════════════════════════ */
app.get('/api/admin/users', requireAuth, requireRole('owner'), async (req, res) => {
  await withDb(async (db) => {
    const users = await queryAll(db, 'SELECT id, username, role, createdAt FROM users ORDER BY id');
    return res.json(users);
  });
});

app.post('/api/admin/users', requireAuth, requireRole('owner'), async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const finalRole = ['owner', 'admin', 'manager'].indexOf(role) !== -1 ? role : 'manager';

  await withDb(async (db) => {
    const existing = await queryOne(db, 'SELECT id FROM users WHERE username = ?', [String(username).trim()]);
    if (existing) return res.status(409).json({ error: 'Username already exists' });
    const hash = await bcrypt.hash(String(password), 10);
    const id = await insertAndGetId(db, 'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
      [String(username).trim(), hash, finalRole]);
    return res.json({ success: true, id });
  });
});

app.put('/api/admin/users/:id', requireAuth, requireRole('owner'), async (req, res) => {
  const { role, password } = req.body;

  await withDb(async (db) => {
    const user = await queryOne(db, 'SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (role) {
      if (['owner', 'admin', 'manager'].indexOf(role) === -1) return res.status(400).json({ error: 'Invalid role' });
      if (user.role === 'owner' && role !== 'owner') {
        const owners = await queryOne(db, "SELECT COUNT(*) as count FROM users WHERE role = 'owner'");
        if (Number(owners.count) <= 1) return res.status(400).json({ error: 'Cannot demote the last owner' });
      }
      await run(db, 'UPDATE users SET role = ? WHERE id = ?', [role, user.id]);
    }
    if (password) {
      if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
      const hash = await bcrypt.hash(String(password), 10);
      await run(db, 'UPDATE users SET password_hash = ? WHERE id = ?', [hash, user.id]);
    }
    return res.json({ success: true });
  });
});

app.delete('/api/admin/users/:id', requireAuth, requireRole('owner'), async (req, res) => {
  await withDb(async (db) => {
    if (String(req.params.id) === String(req.user.id)) return res.status(400).json({ error: 'You cannot delete your own account' });
    const user = await queryOne(db, 'SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'owner') {
      const owners = await queryOne(db, "SELECT COUNT(*) as count FROM users WHERE role = 'owner'");
      if (Number(owners.count) <= 1) return res.status(400).json({ error: 'Cannot delete the last owner' });
    }
    await run(db, 'DELETE FROM users WHERE id = ?', [user.id]);
    return res.json({ success: true });
  });
});

/* ══════════════════════════════════════════
   ADMIN — MESSAGES
   ══════════════════════════════════════════ */
app.get('/api/admin/messages', requireAuth, async (req, res) => {
  await withDb(async (db) => {
    const messages = await queryAll(db, 'SELECT * FROM messages ORDER BY createdAt DESC');
    return res.json(messages);
  });
});

app.put('/api/admin/messages/:id', requireAuth, async (req, res) => {
  const { is_read } = req.body;
  await withDb(async (db) => {
    await run(db, 'UPDATE messages SET is_read = ? WHERE id = ?', [is_read ? 1 : 0, req.params.id]);
    return res.json({ success: true });
  });
});

app.delete('/api/admin/messages/:id', requireAuth, async (req, res) => {
  await withDb(async (db) => {
    await run(db, 'DELETE FROM messages WHERE id = ?', [req.params.id]);
    return res.json({ success: true });
  });
});

/* ══════════════════════════════════════════
   ADMIN — NEWSLETTER SUBSCRIBERS
   ══════════════════════════════════════════ */
app.get('/api/admin/subscribers', requireAuth, async (req, res) => {
  await withDb(async (db) => {
    const subs = await queryAll(db, 'SELECT * FROM newsletter_subscribers ORDER BY createdAt DESC');
    return res.json(subs);
  });
});

app.delete('/api/admin/subscribers/:id', requireAuth, async (req, res) => {
  await withDb(async (db) => {
    await run(db, 'DELETE FROM newsletter_subscribers WHERE id = ?', [req.params.id]);
    return res.json({ success: true });
  });
});

/* ══════════════════════════════════════════
   ADMIN — BROADCASTS
   ══════════════════════════════════════════ */
app.get('/api/admin/broadcasts', requireAuth, async (req, res) => {
  await withDb(async (db) => {
    const broadcasts = await queryAll(db, 'SELECT * FROM broadcasts ORDER BY createdAt DESC LIMIT 10');
    return res.json(broadcasts);
  });
});

app.post('/api/admin/broadcasts', requireAuth, requireRole('owner', 'admin'), async (req, res) => {
  const { title, message } = req.body;
  if (!title || !message) return res.status(400).json({ error: 'Title and message required' });

  await withDb(async (db) => {
    const id = uuidv4();
    await run(db, 'INSERT INTO broadcasts (id, title, message) VALUES (?, ?, ?)', [id, title, message]);
    const subCount = await queryOne(db, 'SELECT COUNT(*) as count FROM newsletter_subscribers');
    return res.json({ success: true, id, recipient_count: Number(subCount.count) });
  });
});

/* ══════════════════════════════════════════
   ADMIN — PROMO CODES
   ══════════════════════════════════════════ */
app.get('/api/admin/promos', requireAuth, requireRole('owner', 'admin'), async (req, res) => {
  await withDb(async (db) => {
    const promos = await queryAll(db, 'SELECT * FROM promo_codes ORDER BY createdAt DESC');
    return res.json(promos);
  });
});

app.post('/api/admin/promos', requireAuth, requireRole('owner', 'admin'), async (req, res) => {
  const { code, discount_type, discount_value, min_order, usage_limit, expires_at, active } = req.body;
  if (!code || !discount_type || discount_value === undefined || discount_value === null || Number(discount_value) <= 0) {
    return res.status(400).json({ error: 'Code, type and a positive value are required' });
  }
  if (['percent', 'fixed'].indexOf(discount_type) === -1) return res.status(400).json({ error: 'discount_type must be percent or fixed' });
  if (discount_type === 'percent' && Number(discount_value) > 100) return res.status(400).json({ error: 'Percent cannot exceed 100' });

  await withDb(async (db) => {
    const existing = await queryOne(db, 'SELECT id FROM promo_codes WHERE UPPER(code) = UPPER(?)', [String(code).trim()]);
    if (existing) return res.status(409).json({ error: 'That promo code already exists' });
    const id = await insertAndGetId(db, `INSERT INTO promo_codes (code, discount_type, discount_value, min_order, usage_limit, expires_at, active)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [String(code).trim().toUpperCase(), discount_type, Number(discount_value), Number(min_order) || 0, Number(usage_limit) || 0, expires_at || '', active === undefined ? 1 : (active ? 1 : 0)]);
    return res.json({ success: true, id });
  });
});

app.put('/api/admin/promos/:id', requireAuth, requireRole('owner', 'admin'), async (req, res) => {
  const { code, discount_type, discount_value, min_order, usage_limit, expires_at, active } = req.body;

  await withDb(async (db) => {
    const promo = await queryOne(db, 'SELECT * FROM promo_codes WHERE id = ?', [req.params.id]);
    if (!promo) return res.status(404).json({ error: 'Promo code not found' });
    await run(db, `UPDATE promo_codes SET code=?, discount_type=?, discount_value=?, min_order=?, usage_limit=?, expires_at=?, active=? WHERE id=?`,
      [String(code || promo.code).trim().toUpperCase(), discount_type || promo.discount_type, discount_value !== undefined ? Number(discount_value) : promo.discount_value,
       min_order !== undefined ? Number(min_order) : promo.min_order, usage_limit !== undefined ? Number(usage_limit) : promo.usage_limit,
       expires_at !== undefined ? expires_at : promo.expires_at, active !== undefined ? (active ? 1 : 0) : promo.active, req.params.id]);
    return res.json({ success: true });
  });
});

app.delete('/api/admin/promos/:id', requireAuth, requireRole('owner', 'admin'), async (req, res) => {
  await withDb(async (db) => {
    await run(db, 'DELETE FROM promo_codes WHERE id = ?', [req.params.id]);
    return res.json({ success: true });
  });
});

/* ══════════════════════════════════════════
   ADMIN — BLOG
   ══════════════════════════════════════════ */
app.get('/api/admin/blog', requireAuth, requireRole('owner', 'admin'), async (req, res) => {
  await withDb(async (db) => {
    const posts = await queryAll(db, 'SELECT * FROM blog_posts ORDER BY createdAt DESC');
    return res.json(posts);
  });
});

app.post('/api/admin/blog', requireAuth, requireRole('owner', 'admin'), async (req, res) => {
  const { title, excerpt, content, category, image, author, published } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const id = 'blog_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const slug = String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now();
  await withDb(async (db) => {
    await run(db, 'INSERT INTO blog_posts (id, title, slug, excerpt, content, category, image, author, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, String(title).trim(), slug, (excerpt || '').trim(), (content || '').trim(), category || 'general', image || '', author || 'Eden Tree Team', published !== undefined ? (published ? 1 : 0) : 1]);
    return res.json({ success: true, id, slug });
  });
});

app.put('/api/admin/blog/:id', requireAuth, requireRole('owner', 'admin'), async (req, res) => {
  const { title, excerpt, content, category, image, author, published } = req.body;
  await withDb(async (db) => {
    const post = await queryOne(db, 'SELECT * FROM blog_posts WHERE id = ?', [req.params.id]);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    let slug = post.slug;
    if (title && title !== post.title) {
      slug = String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now();
    }
    await run(db, 'UPDATE blog_posts SET title=?, slug=?, excerpt=?, content=?, category=?, image=?, author=?, published=?, updatedAt=? WHERE id=?',
      [title !== undefined ? String(title).trim() : post.title, slug, excerpt !== undefined ? excerpt.trim() : post.excerpt,
       content !== undefined ? content.trim() : post.content, category || post.category, image !== undefined ? image : post.image,
       author || post.author, published !== undefined ? (published ? 1 : 0) : post.published, new Date().toISOString(), req.params.id]);
    return res.json({ success: true, slug });
  });
});

app.delete('/api/admin/blog/:id', requireAuth, requireRole('owner', 'admin'), async (req, res) => {
  await withDb(async (db) => {
    await run(db, 'DELETE FROM blog_posts WHERE id = ?', [req.params.id]);
    return res.json({ success: true });
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
    const user = await queryOne(db, 'SELECT * FROM users WHERE id = ?', [req.user.id]);
    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(newPassword, 10);
    await run(db, 'UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
    return res.json({ success: true });
  });
});

/* ── Pages: serve only the whitelisted HTML files ── */
const PUBLIC_PAGES = ['index.html', 'shop.html', 'about.html', 'locations.html', 'contact.html', 'blog.html', 'admin.html', 'track.html', '404.html'];

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

PUBLIC_PAGES.forEach((page) => {
  app.get('/' + page, (req, res) => {
    res.sendFile(path.join(__dirname, '..', page));
  });
});

/* ── 404 handler ── */
app.use((req, res) => {
  if (req.path.indexOf('/api/') === 0) return res.status(404).json({ error: 'Not found' });
  res.status(404).sendFile(path.join(__dirname, '..', '404.html'));
});

/* ── Global error handler ── */
app.use((err, req, res, next) => {
  console.error('[server error]', err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  if (req.path.indexOf('/api/') === 0) return res.status(500).json({ error: 'Internal server error' });
  res.status(500).send('Internal server error');
});

/* ── Start ── */
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`\n  Eden Tree Backend running at http://localhost:${PORT}`);
    console.log(`  API: http://localhost:${PORT}/api/`);
    console.log(`  Admin: http://localhost:${PORT}/admin.html`);
    console.log('  ' + (DEMO_MODE ? '🧪 Demo mode — payments simulated, SMS logged to console' : '🔒 Live mode'));
    console.log();
  });
}).catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
