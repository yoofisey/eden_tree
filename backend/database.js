const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'eden.db');
const DATABASE_URL = process.env.DATABASE_URL || '';
const USE_PG = /^postgres(ql)?:\/\//.test(DATABASE_URL);

/* ── Postgres pool (singleton, created lazily) ── */
let pgPool = null;
function getPgPool() {
  if (!pgPool) {
    const { Pool } = require('pg');
    pgPool = new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    pgPool.on('error', (err) => console.error('[pg pool error]', err.message));
  }
  return pgPool;
}

function makePgDb(pool) {
  return {
    isPg: true,
    query: (sql, params) => pool.query(sql, params),
    close: () => {}, // singleton pool — never closed per request
  };
}

/* Translate sql.js `?` placeholders to Postgres `$1..$n` */
function pgParams(sql, params) {
  if (!params || params.length === 0) return { sql, params: [] };
  let i = 0;
  const converted = sql.replace(/\?/g, () => '$' + (++i));
  return { sql: converted, params };
}

/* Postgres folds unquoted identifiers to lowercase; sql.js preserves the
   declared casing. Map the few camelCase columns back so both engines return
   identical row shapes. */
const PG_KEY_MAP = {
  instock: 'inStock',
  minstock: 'minStock',
  createdat: 'createdAt',
  updatedat: 'updatedAt',
};

function mapPgRow(row) {
  const mapped = {};
  for (const k of Object.keys(row)) mapped[PG_KEY_MAP[k] || k] = row[k];
  return mapped;
}

async function getDb() {
  if (USE_PG) return { db: makePgDb(getPgPool()), SQL: null };
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    return { db: new SQL.Database(buffer), SQL };
  }
  return { db: new SQL.Database(), SQL };
}

function saveDb(db) {
  if (db.isPg) return; // Postgres persists immediately — nothing to write
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

async function queryAll(db, sql, params) {
  if (db.isPg) {
    const { sql: pgSql, params: pgParamsList } = pgParams(sql, params);
    const res = await db.query(pgSql, pgParamsList);
    return res.rows.map(mapPgRow);
  }
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

async function queryOne(db, sql, params) {
  const rows = await queryAll(db, sql, params);
  return rows.length ? rows[0] : null;
}

async function run(db, sql, params) {
  if (db.isPg) {
    const { sql: pgSql, params: pgParamsList } = pgParams(sql, params);
    await db.query(pgSql, pgParamsList);
    return;
  }
  if (params) db.run(sql, params);
  else db.run(sql);
}

/* Insert then return the new row id (engine-agnostic) */
async function insertAndGetId(db, sql, params) {
  if (db.isPg) {
    const { sql: pgSql, params: pgParamsList } = pgParams(sql, params);
    const res = await db.query(pgSql + ' RETURNING id', pgParamsList);
    return res.rows[0].id;
  }
  await run(db, sql, params);
  const res = db.exec('SELECT last_insert_rowid() AS id');
  return res[0]?.values?.[0]?.[0];
}

/* ── Schema: same tables, engine-specific id types + timestamp defaults ── */
function createSchemaStatements() {
  const idType = USE_PG ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const nowExpr = USE_PG ? 'now()' : "(datetime('now'))";

  return [
    `CREATE TABLE IF NOT EXISTS products (
      id ${idType},
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price REAL NOT NULL,
      unit TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      image TEXT NOT NULL DEFAULT '',
      inStock INTEGER NOT NULL DEFAULT 1,
      stock INTEGER NOT NULL DEFAULT 0,
      minStock INTEGER NOT NULL DEFAULT 5,
      createdAt TEXT NOT NULL DEFAULT ${nowExpr},
      updatedAt TEXT NOT NULL DEFAULT ${nowExpr}
    )`,

    `CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT NOT NULL DEFAULT '',
      customer_address TEXT NOT NULL DEFAULT '',
      total REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      delivery_type TEXT NOT NULL DEFAULT 'delivery',
      notes TEXT NOT NULL DEFAULT '',
      payment_reference TEXT DEFAULT '',
      payment_status TEXT DEFAULT 'unpaid',
      createdAt TEXT NOT NULL DEFAULT ${nowExpr}
    )`,

    `CREATE TABLE IF NOT EXISTS order_items (
      id ${idType},
      order_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )`,

    `CREATE TABLE IF NOT EXISTS messages (
      id ${idType},
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT ${nowExpr}
    )`,

    `CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id ${idType},
      email TEXT NOT NULL UNIQUE,
      createdAt TEXT NOT NULL DEFAULT ${nowExpr}
    )`,

    `CREATE TABLE IF NOT EXISTS broadcasts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT ${nowExpr}
    )`,

    `CREATE TABLE IF NOT EXISTS users (
      id ${idType},
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT ${nowExpr}
    )`,
  ];
}

const SEED_IMAGES = [
  '1459411552884-841db9b3cc2a','1576045057995-568f588f82fb','1546470427-0d4db154ceb8',
  '1563565375-f3fdfdbefa83','1594282486552-05b4d80fbb9f','1622206151226-18ca2c9ab4a1',
  '1523049673857-eb18f1d7b578','1553279768-865429fa0078','1550258987-190a2d41a8ba',
  '1587049352846-4a222e784d38','1590502593747-42a996133562','1571771894821-ce9b6c11b08e',
  '1618164435735-413d3b066c9a','1515586838455-8f8f940d6853','1583942150181-69db4eed3e1c',
  '1615485500704-8e990f9900f7','1622597467836-f3285f2131b8','1621506289937-a8e4df240d0b',
  '1536935338788-846bb9981813','1623065422902-30a2d299bbe4',
];

const SEED_PRODUCTS = [
  { name: 'Fresh Broccoli', category: 'vegetables', price: 25.00, unit: 'bunch', description: 'Crisp, nutrient-rich broccoli florets freshly harvested from local farms.', stock: 40, minStock: 10 },
  { name: 'Organic Spinach', category: 'vegetables', price: 20.00, unit: 'bunch', description: 'Tender, dark-green spinach leaves grown without pesticides or chemicals.', stock: 35, minStock: 8 },
  { name: 'Red Tomatoes', category: 'vegetables', price: 18.00, unit: 'kg', description: 'Vine-ripened tomatoes bursting with flavor, perfect for salads and sauces.', stock: 60, minStock: 15 },
  { name: 'Sweet Bell Peppers', category: 'vegetables', price: 30.00, unit: 'kg', description: 'Colorful, crunchy bell peppers available in red, yellow and green varieties.', stock: 25, minStock: 8 },
  { name: 'Fresh Cabbage', category: 'vegetables', price: 15.00, unit: 'head', description: 'Dense, leafy cabbage heads ideal for coleslaw, soups and stir-fries.', stock: 30, minStock: 8 },
  { name: 'Garden Lettuce', category: 'vegetables', price: 12.00, unit: 'head', description: 'Crisp, fresh lettuce leaves perfect for wraps, sandwiches and garden salads.', stock: 50, minStock: 12 },
  { name: 'Avocados', category: 'fruits', price: 35.00, unit: 'piece', description: 'Creamy, ripe Hass avocados packed with healthy fats and rich flavour.', stock: 20, minStock: 8 },
  { name: 'Fresh Mangoes', category: 'fruits', price: 28.00, unit: 'kg', description: 'Sweet, juicy Kent mangoes bursting with tropical flavour.', stock: 45, minStock: 10 },
  { name: 'Pineapples', category: 'fruits', price: 22.00, unit: 'piece', description: 'Golden, aromatic Sweetaway pineapples grown in the Volta Region.', stock: 30, minStock: 8 },
  { name: 'Watermelons', category: 'fruits', price: 20.00, unit: 'piece', description: 'Refreshing, seedless watermelons perfect for hot days.', stock: 15, minStock: 5 },
  { name: 'Fresh Lemons', category: 'fruits', price: 15.00, unit: 'kg', description: 'Zesty, bright lemons ideal for juices, teas and marinades.', stock: 38, minStock: 10 },
  { name: 'Bananas', category: 'fruits', price: 12.00, unit: 'bunch', description: 'Sweet, ripe Cavendish bananas — a daily favourite.', stock: 55, minStock: 12 },
  { name: 'Fresh Basil', category: 'herbs', price: 8.00, unit: 'bunch', description: 'Aromatic sweet basil, perfect for pasta, salads and garnishes.', stock: 22, minStock: 5 },
  { name: 'Fresh Rosemary', category: 'herbs', price: 8.00, unit: 'bunch', description: 'Fragrant rosemary sprigs for roasts, breads and infused oils.', stock: 18, minStock: 5 },
  { name: 'Fresh Thyme', category: 'herbs', price: 8.00, unit: 'bunch', description: 'Fresh thyme leaves with a earthy, lemony flavour.', stock: 20, minStock: 5 },
  { name: 'Ginger Root', category: 'herbs', price: 15.00, unit: 'kg', description: 'Fresh ginger root with a warm, spicy kick.', stock: 28, minStock: 8 },
  { name: 'Green Juice Blend', category: 'juices', price: 35.00, unit: 'bottle', description: 'Cold-pressed green juice — spinach, kale, cucumber & apple.', stock: 12, minStock: 5 },
  { name: 'Fresh Orange Juice', category: 'juices', price: 25.00, unit: 'bottle', description: 'Pure squeezed orange juice, no added sugar.', stock: 14, minStock: 5 },
  { name: 'Watermelon Juice', category: 'juices', price: 20.00, unit: 'bottle', description: 'Refreshing watermelon juice, lightly chilled.', stock: 10, minStock: 4 },
  { name: 'Mango Juice', category: 'juices', price: 25.00, unit: 'bottle', description: 'Rich, thick mango juice made from Kent mangoes.', stock: 16, minStock: 5 },
];

async function initDatabase() {
  const { db } = await getDb();

  for (const sql of createSchemaStatements()) {
    await run(db, sql);
  }

  const existing = await queryOne(db, 'SELECT id FROM users WHERE username = ?', ['admin']);
  if (!existing) {
    const hash = await bcrypt.hash('admin123', 10);
    await run(db, 'INSERT INTO users (username, password_hash) VALUES (?, ?)', ['admin', hash]);
    console.log('→ Default admin user created (admin / admin123)');
  }

  const productCount = await queryOne(db, 'SELECT COUNT(*) AS count FROM products');
  if (Number(productCount.count) === 0) {
    const insert = `INSERT INTO products (name, category, price, unit, description, image, inStock, stock, minStock)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`;
    for (let i = 0; i < SEED_PRODUCTS.length; i++) {
      const p = SEED_PRODUCTS[i];
      await run(db, insert, [
        p.name, p.category, p.price, p.unit, p.description,
        `https://images.unsplash.com/photo-${SEED_IMAGES[i]}?w=400&h=300&fit=crop`,
        p.stock, p.minStock,
      ]);
    }
    console.log('→ 20 seed products inserted');
  }

  await saveDb(db);
  console.log('→ Database ready at', USE_PG ? ('hosted Postgres @ ' + DATABASE_URL.split('@').pop()) : DB_PATH);
  return db;
}

module.exports = { getDb, saveDb, queryAll, queryOne, run, insertAndGetId, initDatabase, pgParams };
