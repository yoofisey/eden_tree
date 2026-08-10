# Eden Tree Website — Project Status & Implementation Plan

*Last updated: August 10, 2026*

- **Live deployment:** https://eden-tree.onrender.com (auto-deploys from GitHub `yoofisey/eden_tree` → `main`)
- **Reference site:** https://edentreegh.com (Cambodia Estates, Community 18, Lashibi)
- **Deployment target:** company's existing domain `edentreegh.com` (DNS cutover — see §6)

---

## 1. Architecture Snapshot

- **Frontend:** static multi-page site (vanilla HTML/CSS/JS, no build step) — Home, Shop, About, Locations, Contact, Track, 404
- **Backend:** Node.js + Express REST API (`backend/server.js`) serving both the pages and `/api/*`
- **Database:** dual-engine — **PostgreSQL (Neon)** in production via `DATABASE_URL`; **sql.js** file fallback (`backend/eden.db`) for local dev. Identical SQL via engine-agnostic helpers (`backend/database.js`)
- **Auth:** bcrypt + JWT (24 h tokens) with **roles** (`owner`, `admin`, `manager`)
- **Hosting:** Render.com free web service; auto-deploy on push to `main`
- **Images:** 88 real product photos in `images/products/` (committed, served statically)
- **Payments/SMS:** currently **demo mode** (simulated payments, SMS logged to console) — Hubtel integration pending credentials
- **Email:** order + payment notifications via nodemailer (no-op until SMTP env vars are set)

---

## 2. Completed

### Public site & content
- [x] Full multi-page site: Home, Shop, About, Locations, Contact, Track Order, custom 404
- [x] Brand hero, "Who We Are", healthy-eating messaging, certified-excellence section
- [x] **Shop-by-Category section on home page** (Vegetables · Fruits · Boxes · Juices · Herbs · Processed → `shop.html?cat=...`)
- [x] About page: story, mission & vision, core values, stats strip, leadership team
- [x] Team section in pyramid layout (Managing Director at top)
- [x] Awards & accolades, "Get Involved" CTA
- [x] Sticky navbar, mobile slide-out menu, scroll-reveal, fully responsive

### Store & cart
- [x] Live product catalog from DB
- [x] Category filters (All, Vegetables, Fruits, Herbs, Boxes, Processed, Juices, Other) + live search + **`?cat=` deep links**
- [x] Stock badges ("Out of Stock", "Only X left"), stock-limit enforcement
- [x] Persistent cart (localStorage), slide-in drawer, qty +/− , remove, live subtotal, navbar badge
- [x] Checkout form (name, email, phone, address, delivery type, notes)
- [x] **Promo codes in checkout** (apply/validate, subtotal/discount/grand-total rows, discount shown after order)
- [x] Server-side stock validation; stock decremented on order

### Real catalog (recent)
- [x] Catalog recovered from company's live whatsorder widget (base64 + ROT13 decoded)
- [x] **98 real products live** — Vegetables 38 · Fruits 15 · Boxes 14 · Juices 12 · Processed 10 · Herbs 5 · Other 4
- [x] **88 real photos** downloaded and served from `images/products/`
- [x] Known box prices set: Salad 300 · Fruit 400 · Yellow 470 · Orange 500 · Fruit Basket 500 · Green Basket 600 (GH¢)

### Admin panel
- [x] Secure login (JWT, bcrypt); **default password rotated** (no longer `admin123`)
- [x] Dashboard: orders, revenue, unread messages, subscribers, 7-day revenue chart, low-stock, recent orders (revenue now **net of refunds**)
- [x] Orders: search, filter, status updates, **delete**, CSV export, **refund paid orders**, discount/promo/refund details shown
- [x] Products: CRUD, inline stock edit, image upload, low-stock warnings (owner/admin)
- [x] Messages: read/unread, delete
- [x] Subscribers: list, **delete**, CSV export, broadcast to all subscribers
- [x] **Multi-user admin with roles** — owner/admin/manager; role-aware sidebar; users CRUD (owner only, last-owner guard, password reset, per-user role change)
- [x] **Promo codes admin** — CRUD, percent/fixed, min order, usage limit, expiry, active toggle (owner/admin)
- [x] Password change endpoint

### Customer-facing extras
- [x] **Order tracking page** (`track.html` — status steps Payment → Delivered, cancelled/refunded badges, items, totals)
- [x] **Email notifications** for new orders + payment confirmations (nodemailer; env vars in `.env.example`)

### Security hardening (item 4 — DONE)
- [x] Static serving restricted to `css/`, `js/`, `images/`, `uploads/` (repo source files no longer downloadable)
- [x] Rate limiting: login 15m/20 · orders 60s/10 · promo validate 60s/30 · payments 60s/10 · messages + newsletter 60s/5 (per-IP, in-memory, auto-expiring)
- [x] Per-route input validation (email regex, length caps, item/quantity checks, promo math done server-side)
- [x] Global error handler + proper 404 handler (JSON for `/api/*`, `404.html` otherwise)
- [x] Security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS in prod) + HTTPS redirect via `x-forwarded-proto`
- [x] Async route wrapper (unhandled promise rejections now reach the error handler)
- [x] `express.json` body limit (100 kb)

### Infrastructure & cleanup
- [x] Migrated to hosted PostgreSQL with sql.js fallback
- [x] **Schema migrations** (`backend/database.js` `migrate()`): adds `users.role`, orders `discount`/`promo_code`/`refunded_amount`/`refunded_at`, creates `promo_codes` — safe on existing DBs
- [x] **DB backup script** (`scripts/backup.js`, `npm run backup`) — dumps all tables to `backups/eden-tree-<ts>.json` (Postgres or local sql.js), keeps last 14, includes a `--restore` mode
- [x] Live test data cleaned (test order + test subscriber removed)
- [x] Demo products replaced with real catalog on live DB
- [x] Deployed on Render, auto-deploy configured
- [x] `JWT_SECRET`, `DATABASE_URL`, `NODE_ENV=production` set on Render
- [x] `npm audit` clean (uuid bumped to ^11.1.1)

---

## 3. Launch Blockers — What We Need From the Client

| # | Item | Needed from client | Effect |
|---|------|-------------------|--------|
| 1 | **Hubtel merchant account** | API **Client ID + Client Secret** for the checkout API | Enables real payments (cards + Mobile Money) |
| 2 | **SMS Sender ID** | Sender ID approved for `EdenTree` (NCA approval for branded IDs) | Real order/payment SMS |
| 3 | **Verified prices** | Confirmed price list for the 98 products (most source prices were `#REF!`) | Accurate storefront pricing |
| 4 | **Domain/DNS access** | Registrar/DNS access for `edentreegh.com` | Cut the domain over to the new site |
| 5 | **Rotate Neon DB URL** | (Action for us) The Postgres connection string was shared in chat — rotate it | Security hygiene |
| 6 | **SMTP provider/credentials** | SMTP host/user/pass + a receiving inbox (e.g. `orders@edentreegh.com`) | Turn on order email notifications |

---

## 4. Implementation Work Remaining (Code)

### 4.1 Real Hubtel payments (the main item)
When credentials arrive, wire Hubtel's checkout API into the existing payment skeleton:
- [ ] Replace `POST /api/payments/initialize` with Hubtel **initiate-checkout** (uses `HUBTEL_CLIENT_ID` / `HUBTEL_CLIENT_SECRET`, amounts in GHS) → returns checkout `URL`
- [ ] Add **callback/webhook endpoint** (e.g. `POST /api/payments/hubtel-webhook`) to confirm payment → mark order `paid`
- [ ] Keep/adapt `GET /api/payments/verify` for the customer's return to the site
- [ ] Replace `sendSMS()` console stub with the Hubtel SMS API using `HUBTEL_SENDER_ID`
- [ ] Set `DEMO_MODE = false` in `backend/server.js` (currently hardcoded `true`)
- [ ] Env vars: `HUBTEL_MERCHANT_ACCOUNT`, `HUBTEL_CLIENT_ID`, `HUBTEL_CLIENT_SECRET`, `HUBTEL_SENDER_ID`
- [ ] Test a real MoMo transaction (MTN MoMo / Telecel Cash / AT Money) end-to-end
- [ ] Add webhook security (signature verification) and idempotency

### 4.2 Pricing & content cleanup
- [ ] Replace placeholder GH¢ prices with the client-confirmed price list
- [ ] (Cosmetic) Capitalize storefront category labels (currently lowercase, e.g. `boxes`)
- [ ] Review/trim long descriptions imported from the widget captions

### 4.3 Domain cutover
See §6 for the full plan — no code changes needed, just DNS.

### 4.4 Optional roadmap features still open
- [ ] **WhatsApp order button** on the shop (the company's current ordering channel is their WhatsApp widget)
- [ ] **Testimonials / reviews**
- [ ] **Blog / recipes** for SEO content

---

## 5. Optional / Roadmap Features — Status

| Feature | Status |
|---|---|
| **Order tracking** | ✅ Done — `track.html` + `GET /api/orders/:id` |
| **Email order notifications** | ✅ Done (backend + `.env.example`) — needs SMTP creds to activate |
| **Multi-user admin with roles** | ✅ Done — owner/admin/manager, role-guarded routes + UI |
| **Refunds / payment reconciliation** | ✅ Done — refund endpoint + admin UI + net revenue |
| **DB backup strategy** | ✅ Done — `npm run backup` (dumps Postgres or sql.js, prunes to last 14) |
| **Discounts / promo codes** | ✅ Done — validate/apply in checkout + admin CRUD |
| **Product categories on home page** | ✅ Done — category cards → filtered shop |
| WhatsApp order button | ⏳ Open |
| Testimonials / reviews | ⏳ Open |
| Blog / recipes | ⏳ Open |

---

## 6. Deployment & Domain Plan

### Current
- Render service runs `npm start`; live at `https://eden-tree.onrender.com`
- Env vars on Render: `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`

### Cut `edentreegh.com` over (once DNS access is available)
1. Identify the current host/registrar for `edentreegh.com` (old site is WordPress-style, images on `ultraswift.co.za`)
2. Render → service → **Settings → Custom Domains** → add `edentreegh.com` + `www.edentreegh.com`
3. Create the DNS records Render specifies (verification record, `www` → CNAME to Render, apex → A/ALIAS)
4. Leave **MX records untouched** so email keeps working; lower TTL the day before
5. Render auto-provisions a **Let's Encrypt SSL** certificate
6. Test site + `/api/products` + checkout on the custom domain
7. Optional: 301 redirects from the old site's pages, or keep the old site temporarily at `old.edentreegh.com`

---

## 7. Key Files

| File | Purpose |
|---|---|
| `backend/server.js` | Express app, all routes, auth+roles, security middleware, promo/refund/tracking/email endpoints, demo payments/SMS |
| `backend/database.js` | Dual-engine data layer, schema (8 tables), **migrations**, seeding |
| `scripts/backup.js` | DB backup + restore (`npm run backup`) |
| `js/app.js` | Public site: cart, shop grid, promo totals, checkout, order tracking, forms, toasts |
| `js/admin.js` | Admin panel (login, dashboard, orders, products, messages, subscribers, **users, promos, refunds**) |
| `css/style.css` | Single shared stylesheet (incl. promo, tracking, category, admin users/promos styles) |
| `index.html`, `shop.html`, `track.html` | Home (category cards), product grid + filter pills, order tracking page |
| `images/products/` | 88 real product photos (committed) |
| `backend/.env.example` | All supported env vars incl. Hubtel + SMTP |
| `FEATURES.md` | Original (demo-era) feature breakdown |

---

## 8. Quick Answer: "What else do we have to implement?"

1. **Real payments + SMS via Hubtel** (the only big code item) — needs merchant credentials from the company
2. **Verified prices** for the catalog (needs the client's price list)
3. **Domain cutover** for `edentreegh.com` (DNS change — needs registrar access)
4. **Activate email notifications** — needs SMTP provider credentials
5. Optional roadmap leftovers: WhatsApp ordering, testimonials, blog/recipes

Everything else is built, deployed, and working on the live preview.
