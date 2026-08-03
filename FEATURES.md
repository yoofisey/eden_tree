# Eden Tree Ltd. — Website Remake: Feature Breakdown

A complete redesign and rebuild of the Eden Tree website: a modern, mobile-first storefront plus a full back-office admin panel. Built as a working demo (see "Demo Mode" note) and deployed live for review.

---

## 1. Public Website

| Page | What it contains |
|---|---|
| **Home** (`index.html`) | Brand hero, "Who We Are", healthy-eating messaging, certified-excellence section, management team, awards & accolades, "Get Involved" call-to-action |
| **Shop** (`shop.html`) | Live product catalogue loaded from the database, category filters (Vegetables / Fruits / Herbs / Juices), live search, stock badges ("Out of Stock", "Only X left") |
| **About** (`about.html`) | Company story, mission & vision, core values, leadership team |
| **Locations** (`locations.html`) | Store locator cards (address, hours, phone) + embedded Google Map of the main store |
| **Contact** (`contact.html`) | Contact form that saves messages to the database (viewable in admin) |
| **404** | Custom error page |

**Global components (all pages):**
- Sticky navbar with cart button + live item-count badge
- Mobile slide-out menu with social links
- Cart drawer (slide-in) with full checkout flow
- Newsletter signup (footer) saved to the database
- Social links (Facebook, Instagram, LinkedIn)
- Footer with company info, certifications (HACCP, FDA, GSA, Green Label)
- Scroll-reveal animations and responsive layout for phone / tablet / desktop

---

## 2. Store & Cart

- Product cards with image, category, price (GH¢), unit, description
- "Add to Cart" with confirmation state ("Added ✓") and stock-limit enforcement
- Persistent cart (saved in the browser — survives page reloads)
- Slide-in cart drawer with:
  - Quantity **+ / −** controls (smooth, in-place updates, no page flicker)
  - Item removal
  - Live subtotal
  - Badge count on the navbar (e.g. "3")
- Checkout form: full name, email, phone, delivery address, delivery type (Home Delivery / Pickup), order notes
- **Place Order** validates stock server-side, records the order, and decrements stock

---

## 3. Payments & SMS

> **Demo Mode is currently ON.** Payments are simulated in the browser and SMS confirmations are logged to the server console. This is intentional — real payment processing (via **Hubtel**, the Ghanaian payment gateway, in GHS) requires the company's Hubtel merchant account, which the owner must provide.

- Full payment flow is built and ready: order created → payment initialised → payment confirmed → order marked **Paid**
- Order states tracked: `pending payment → paid`
- The exact same flow switches to live Hubtel when credentials are added and `DEMO_MODE` is set to `false` — no other code changes needed

---

## 4. Admin Dashboard (`admin.html`)

Secure login (username + password, JWT-authenticated sessions). Five modules:

| Module | Features |
|---|---|
| **Dashboard** | Key stats (total orders, pending, revenue, unread messages, subscribers), 7-day revenue chart, low-stock alerts, recent orders |
| **Orders** | Full order list with customer details & items, search by ID/name/email, filter by status, **status updates** (pending → confirmed → processing → out for delivery → delivered / cancelled), **Export CSV** |
| **Products** | Add / edit / delete products, category & unit, price, stock, min-stock, image upload, **inline stock editing** (click a stock badge to change it), low-stock & refill warnings |
| **Messages** | Read/unread contact-form messages, delete |
| **Subscribers** | Newsletter subscriber list, **Export CSV**, send broadcast messages to all subscribers (with history) |

Also included: admin password change endpoint, mobile-responsive admin layout.

---

## 5. Backend & Technical

- **Node.js + Express** API server with clean REST endpoints (`/api/products`, `/api/orders`, `/api/auth/login`, `/api/payments/*`, `/api/messages`, `/api/newsletter`, `/api/broadcasts`, `/api/admin/*`)
- **Database:** hosted **PostgreSQL** when `DATABASE_URL` is set (Neon/Render/Supabase — persistent across restarts); falls back to a zero-config local file DB (`sql.js`, `backend/eden.db`) for development. Auto-seeds 20 products and the default admin account on first run
- **Security:** password hashing (bcrypt), JWT auth for all admin routes, server-side stock validation
- **Image uploads** for products (Multer, 5 MB limit)
- **Error handling** everywhere: loading spinners, retry buttons, friendly error messages
- Cache-busting disabled in development; proper caching in production

---

## 6. Performance & Polish

- Dependency-free SVG revenue chart (no heavy chart library)
- Skeletons/loading states for images and product grid
- Smooth transitions on cart, menus, and buttons
- Tested against the real checkout flow end-to-end

---

## 7. Deployment

- Ready for hosting (currently live on **Render.com**)
- Root `package.json` start script for easy redeployment
- Environment-variable configuration (`JWT_SECRET`, `NODE_ENV`, `DATABASE_URL`, Hubtel credentials)

---

## Not Yet Included (for the live launch)

1. **Real Hubtel payments** — requires the company's merchant account + Sender ID
2. **Real SMS confirmations** — comes with the Hubtel integration
3. **Company's own catalog, pricing & photos** (currently demo products)
4. **Domain + SSL** (`edentreegh.com`)
5. **Change default admin password** (`admin` / `admin123`)

---

*Prepared as part of the Eden Tree website redesign proposal. The demo is intentionally fully working so the company can experience the finished product before deciding to go live.*
