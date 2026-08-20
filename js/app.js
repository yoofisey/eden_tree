/* ============================================================
   Eden Tree Ltd. — Public Site JS
   Navbar · Mobile Menu · Cart · Shop · Scroll Reveals
   ============================================================ */

(function () {
  'use strict';

  /* ── Helpers ── */
  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); };

  /* ── Splash Screen (fresh page loads only) ── */
  (function initSplash() {
    var splash = document.getElementById('splash');
    if (!splash) return;
    var navEntries = performance.getEntriesByType('navigation');
    var navType = navEntries.length ? navEntries[0].type : 'navigate';
    if (navType !== 'navigate') { splash.remove(); return; }
    var minDelay = 600;
    var start = Date.now();
    function hideSplash() {
      var elapsed = Date.now() - start;
      var wait = Math.max(0, minDelay - elapsed);
      setTimeout(function () { splash.classList.add('hidden'); }, wait);
    }
    if (document.readyState === 'complete') { hideSplash(); }
    else { window.addEventListener('load', hideSplash); }
  })();

  /* ── Processing Overlay ── */
  var processingOverlay = null;
  function showProcessing(msg) {
    if (!processingOverlay) {
      processingOverlay = document.createElement('div');
      processingOverlay.className = 'processing-overlay';
      processingOverlay.innerHTML = '<div class="processing-content"><div class="processing-spinner"></div><div class="processing-text"></div></div>';
      document.body.appendChild(processingOverlay);
    }
    processingOverlay.querySelector('.processing-text').textContent = msg || 'Processing...';
    processingOverlay.classList.add('active');
  }
  function hideProcessing() {
    if (processingOverlay) processingOverlay.classList.remove('active');
  }

  var API = function () {
    var base = window.location.origin;
    return {
      get: function (path) { return fetch(base + path).then(function (r) { if (!r.ok) throw new Error(r.statusText); return r.json(); }); },
      post: function (path, data) { return fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(function (r) { if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || r.statusText); }); return r.json(); }); },
    };
  }();

  function escapeHtml(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function getCart() {
    try { return JSON.parse(localStorage.getItem('eden_cart') || '[]'); }
    catch (e) { return []; }
  }

  function saveCart(cart) {
    try { localStorage.setItem('eden_cart', JSON.stringify(cart)); }
    catch (e) { /* ignore */ }
    updateBadge();
  }

  function updateBadge() {
    var count = getCart().reduce(function (s, i) { return s + i.qty; }, 0);
    $$('.cart-count, #cart-count').forEach(function (el) {
      el.textContent = count;
      el.style.display = count > 0 ? 'flex' : 'none';
    });
    var countEl = $('#cart-items-count');
    if (countEl) countEl.textContent = '(' + count + ' item' + (count !== 1 ? 's' : '') + ')';
  }

  var appliedPromo = null; /* { code, discount } */

  function cartSubtotal() {
    return getCart().reduce(function (s, i) { return s + (i.price * i.qty); }, 0);
  }

  function updateCartTotals() {
    var subtotal = cartSubtotal();
    var discount = appliedPromo ? appliedPromo.discount : 0;
    var total = Math.max(0, subtotal - discount);
    var subEl = $('#cart-subtotal');
    var discRow = $('#cart-discount-row');
    var grandRow = $('#cart-grand-row');
    if (subEl) subEl.textContent = 'GH¢ ' + subtotal.toFixed(2);
    if (discRow) {
      discRow.style.display = discount > 0 ? 'flex' : 'none';
      discRow.querySelector('span').textContent = 'Discount (' + appliedPromo.code + ')';
      discRow.querySelector('strong').textContent = '-GH¢ ' + discount.toFixed(2);
    }
    if (grandRow) {
      grandRow.style.display = discount > 0 ? 'flex' : 'none';
      var totalEl = $('#cart-grand-total');
      if (totalEl) totalEl.textContent = 'GH¢ ' + total.toFixed(2);
    }
  }

  function refreshPromo(silent) {
    if (!appliedPromo) { updateCartTotals(); return; }
    API.post('/api/promos/validate', { code: appliedPromo.code, subtotal: cartSubtotal() }).then(function (r) {
      var msg = $('#promo-msg');
      if (r && r.valid) {
        appliedPromo.discount = r.discount;
      } else {
        appliedPromo = null;
        if (msg) {
          msg.style.display = 'block';
          msg.textContent = r && r.error ? r.error : 'Promo code no longer applies';
          msg.className = 'promo-msg error';
        }
        if (!silent) showToast('Promo code removed', 'info');
      }
      updateCartTotals();
    }).catch(function () { /* keep current display */ });
  }

  var shopProducts = [];

  function renderShopGrid() {
    var productGrid = $('#product-grid');
    if (!productGrid || !shopProducts.length) return;
    var filtered = shopProducts;
    var activeCat = $('.filter-pill.active');
    if (activeCat && activeCat.dataset.filter !== 'all') {
      filtered = shopProducts.filter(function (p) { return p.category === activeCat.dataset.filter; });
    }
    var search = $('#search-input, #shop-search');
    var query = search ? search.value.trim().toLowerCase() : '';
    if (query) {
      filtered = filtered.filter(function (p) { return p.name.toLowerCase().indexOf(query) !== -1; });
    }
    var html = filtered.map(function (p) {
      var out = p.stock <= 0;
      var low = p.stock > 0 && p.stock <= p.minStock;
      var badge = '';
      if (out) badge = '<div class="product-out-badge">Out of Stock</div>';
      else if (low) badge = '<div class="product-low-badge">Only ' + p.stock + ' left</div>';
      return '<div class="product-card" data-id="' + p.id + '">' +
        '<div class="product-img' + (out ? ' out-of-stock' : '') + '">' +
          '<img src="' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.name) + '" loading="lazy">' +
          badge +
        '</div>' +
        '<div class="product-info">' +
          '<div class="product-category-tag">' + p.category + '</div>' +
          '<div class="product-name">' + escapeHtml(p.name) + '</div>' +
          '<div class="product-price">GH¢ ' + Number(p.price).toFixed(2) + ' <span class="product-unit">per ' + p.unit + '</span></div>' +
          '<div class="product-desc">' + escapeHtml(p.description) + '</div>' +
          '<button class="product-add-btn' + (out ? ' disabled' : '') + '" data-id="' + p.id + '"' + (out ? ' disabled' : '') + '>' +
            (out ? 'Unavailable' : 'Add to Cart') +
          '</button>' +
        '</div>' +
      '</div>';
    }).join('');
    if (!filtered.length) {
      html = '<div class="shop-empty"><p>No products found</p></div>';
    }
    productGrid.innerHTML = html;

    productGrid.querySelectorAll('.product-img img').forEach(function (img) {
      var parent = img.parentElement;
      if (img.complete) return;
      parent.classList.add('skeleton');
      img.addEventListener('load', function () { parent.classList.remove('skeleton'); });
      img.addEventListener('error', function () { parent.classList.remove('skeleton'); });
    });
  }

  /* ── Cart Drawer ── */
  function buildCartFooter(footer, cart) {
    var subtotal = cartSubtotal();
    var discount = appliedPromo ? appliedPromo.discount : 0;
    var total = Math.max(0, subtotal - discount);
    footer.innerHTML =
      '<div class="promo-row">' +
        '<input type="text" id="promo-input" placeholder="Promo code" autocomplete="off">' +
        '<button type="button" id="promo-apply-btn">Apply</button>' +
      '</div>' +
      '<div class="promo-msg" id="promo-msg" style="display:none"></div>' +
      '<div class="cart-total">' +
        '<span>Subtotal</span>' +
        '<strong id="cart-subtotal">GH¢ ' + subtotal.toFixed(2) + '</strong>' +
      '</div>' +
      '<div class="cart-total cart-grand-row" id="cart-discount-row" style="display:none">' +
        '<span>Discount</span>' +
        '<strong>-GH¢ 0.00</strong>' +
      '</div>' +
      '<div class="cart-total cart-grand-row" id="cart-grand-row" style="display:none">' +
        '<span>Total</span>' +
        '<strong id="cart-grand-total">GH¢ ' + total.toFixed(2) + '</strong>' +
      '</div>' +
      '<button type="button" class="cart-checkout-btn" id="cart-checkout-btn">Proceed to Checkout</button>' +
      '<form id="checkout-form" class="checkout-form" style="display:none">' +
        '<h3>Checkout</h3>' +
        '<div class="checkout-fields">' +
        '<div class="form-group"><label>Full Name</label><input type="text" name="name" required></div>' +
        '<div class="form-group"><label>Email</label><input type="email" name="email" required></div>' +
        '<div class="form-group"><label>Phone</label><input type="tel" name="phone" placeholder="e.g. +233 50 123 4567" required></div>' +
        '<div class="form-group"><label>Delivery Address</label><input type="text" name="address"></div>' +
        '<div class="form-group"><label>Delivery Type</label><select name="deliveryType">' +
          '<option value="delivery">Home Delivery</option>' +
          '<option value="pickup">Pickup</option>' +
        '</select></div>' +
        '<div class="form-group"><label>Order Notes (optional)</label><textarea name="notes" rows="2"></textarea></div>' +
        '</div>' +
        '<div class="checkout-btns">' +
          '<button type="button" class="back-btn" id="cart-back-btn">Back</button>' +
          '<button type="submit" class="place-btn">Place Order</button>' +
        '</div>' +
      '</form>';

    var checkoutBtn = $('#cart-checkout-btn');
    var form = $('#checkout-form');
    var backBtn = $('#cart-back-btn');
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', function () {
        checkoutBtn.style.display = 'none';
        form.style.display = 'flex';
      });
    }
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        form.style.display = 'none';
        checkoutBtn.style.display = '';
      });
    }

    var promoBtn = $('#promo-apply-btn');
    if (promoBtn) {
      promoBtn.addEventListener('click', function () {
        var input = $('#promo-input');
        var code = input ? input.value.trim() : '';
        if (!code) return;
        promoBtn.disabled = true;
        API.post('/api/promos/validate', { code: code, subtotal: cartSubtotal() }).then(function (r) {
          var msg = $('#promo-msg');
          if (msg) msg.style.display = 'block';
          if (r && r.valid) {
            appliedPromo = { code: r.code, discount: r.discount };
            if (msg) { msg.textContent = 'Code applied: -GH¢ ' + Number(r.discount).toFixed(2); msg.className = 'promo-msg success'; }
            if (input) input.value = r.code;
          } else {
            appliedPromo = null;
            if (msg) { msg.textContent = r && r.error ? r.error : 'Invalid promo code'; msg.className = 'promo-msg error'; }
          }
          updateCartTotals();
        }).catch(function (err) {
          var msg = $('#promo-msg');
          if (msg) { msg.style.display = 'block'; msg.textContent = err.message || 'Could not validate code'; msg.className = 'promo-msg error'; }
        }).then(function () { promoBtn.disabled = false; });
      });
    }

    initCheckoutForm(form, footer);
  }

  function renderCart() {
    var cart = getCart();
    var body = $('#cart-body');
    var footer = $('#cart-footer');
    if (!body) return;
    updateBadge();
    if (!cart.length) {
      body.innerHTML =
        '<div class="cart-empty">' +
          '<div class="cart-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"/></svg></div>' +
          '<p>Your cart is empty</p>' +
        '</div>';
      if (footer) footer.style.display = 'none';
      return;
    }
    if (footer) {
      footer.style.display = 'block';
      buildCartFooter(footer, cart);
    }
    body.innerHTML = cart.map(function (item) {
      var prod = shopProducts.find(function (p) { return String(p.id) === String(item.id); });
      var maxStock = prod ? prod.stock : 99;
      return '<div class="cart-item" data-id="' + item.id + '">' +
        '<div class="cart-item-img skeleton"><img src="' + escapeHtml(item.image) + '" alt="' + escapeHtml(item.name) + '" onload="this.parentElement.classList.remove(\'skeleton\')" onerror="this.parentElement.classList.remove(\'skeleton\')"></div>' +
        '<div class="cart-item-info">' +
          '<div class="cart-item-name">' + escapeHtml(item.name) + '</div>' +
          '<div class="cart-item-price">GH¢ ' + item.price.toFixed(2) + '</div>' +
        '</div>' +
        '<div class="cart-item-qty">' +
          '<button class="cart-qty-btn" data-id="' + item.id + '" data-action="decr"' + (item.qty <= 1 ? ' disabled' : '') + '>&minus;</button>' +
          '<span>' + item.qty + '</span>' +
          '<button class="cart-qty-btn" data-id="' + item.id + '" data-action="incr"' + (item.qty >= maxStock ? ' disabled' : '') + '>+</button>' +
        '</div>' +
        '<button class="cart-item-remove" data-id="' + item.id + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button>' +
      '</div>';
    }).join('');
  }

  function initCart() {
    var toggle = $('#cart-toggle');
    var drawer = $('#cart-drawer');
    var overlay = $('#cart-overlay');
    var close = $('#cart-close');
    if (!toggle || !drawer) return;

    function openCart() { drawer.classList.add('open'); if (overlay) overlay.classList.add('open'); document.body.classList.add('cart-open'); renderCart(); }
    function closeCart() { drawer.classList.remove('open'); if (overlay) overlay.classList.remove('open'); document.body.classList.remove('cart-open'); }
    toggle.addEventListener('click', openCart);
    if (close) close.addEventListener('click', closeCart);
    if (overlay) overlay.addEventListener('click', closeCart);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeCart(); });

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.cart-qty-btn');
      if (!btn) return;
      var cart = getCart();
      var item = cart.find(function (i) { return String(i.id) === String(btn.dataset.id); });
      if (!item) return;
      if (btn.dataset.action === 'incr') {
        var prod = shopProducts.find(function (p) { return String(p.id) === String(item.id); });
        if (prod && item.qty >= prod.stock) { showToast('Maximum stock reached', 'error'); return; }
        item.qty++;
      } else if (btn.dataset.action === 'decr' && item.qty > 1) {
        item.qty--;
      }
      saveCart(cart);
      var row = btn.closest('.cart-item');
      if (row) {
        var qtyEl = row.querySelector('.cart-item-qty span');
        if (qtyEl) qtyEl.textContent = item.qty;
        var decrBtn = row.querySelector('[data-action="decr"]');
        var incrBtn = row.querySelector('[data-action="incr"]');
        var prod2 = shopProducts.find(function (p) { return String(p.id) === String(item.id); });
        if (decrBtn) decrBtn.disabled = item.qty <= 1;
        if (incrBtn) incrBtn.disabled = !prod2 || item.qty >= prod2.stock;
      }
      updateCartTotals();
      refreshPromo(true);
    });

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.cart-item-remove');
      if (!btn) return;
      var id = btn.dataset.id;
      var cart = getCart().filter(function (i) { return String(i.id) !== id; });
      saveCart(cart);
      var row = btn.closest('.cart-item');
      if (row) row.remove();
      if (!cart.length) {
        renderCart();
      } else {
        updateCartTotals();
        refreshPromo(true);
      }
    });

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.product-add-btn');
      if (!btn || btn.disabled) return;
      var id = btn.dataset.id;
      var prod = shopProducts.find(function (p) { return String(p.id) === id; });
      if (!prod || prod.stock <= 0) return;
      var cart = getCart();
      var existing = cart.find(function (i) { return String(i.id) === id; });
      if (existing) {
        if (existing.qty >= prod.stock) { showToast('Maximum stock reached', 'error'); return; }
        existing.qty++;
      } else {
        cart.push({ id: prod.id, name: prod.name, price: prod.price, image: prod.image, qty: 1 });
      }
      saveCart(cart);
      showToast(prod.name + ' added to cart');
      btn.classList.add('added');
      btn.textContent = 'Added ✓';
      setTimeout(function () {
        btn.classList.remove('added');
        btn.textContent = 'Add to Cart';
      }, 1200);
    });
  }

  /* ── Toast ── */
  function showToast(msg, type) {
    try {
      type = type || 'success';
      var bg = type === 'error' ? '#dc2626' : type === 'info' ? '#6366f1' : 'var(--green-700)';
      var icon = type === 'error'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" style="width:18px;height:18px;flex-shrink:0"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" style="width:18px;height:18px;flex-shrink:0"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>';
      var t = document.createElement('div');
      t.style.cssText = 'position:fixed;bottom:32px;left:50%;transform:translateX(-50%) translateY(20px);background:' + bg + ';color:#fff;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,0.18);display:flex;align-items:center;gap:8px;opacity:0;transition:all .35s cubic-bezier(.4,0,.2,1);pointer-events:none';
      t.innerHTML = icon + '<span>' + msg + '</span>';
      document.body.appendChild(t);
      requestAnimationFrame(function () {
        t.style.opacity = '1';
        t.style.transform = 'translateX(-50%) translateY(0)';
      });
      setTimeout(function () {
        t.style.opacity = '0';
        t.style.transform = 'translateX(-50%) translateY(20px)';
        setTimeout(function () { t.remove(); }, 350);
      }, 2400);
    } catch (err) { /* ignore */ }
  }

  /* ── Checkout Form ── */
  function initCheckoutForm(form, footer) {
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var cart = getCart();
      if (!cart.length) return;

      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Processing...';
      showProcessing('Placing your order...');

      API.post('/api/orders', {
        customer: {
          name: form.elements.name.value.trim(),
          email: form.elements.email.value.trim(),
          phone: form.elements.phone.value.trim(),
          address: form.elements.address.value.trim()
        },
        items: cart.map(function (i) { return { name: i.name, quantity: i.qty, price: i.price }; }),
        deliveryType: form.elements.deliveryType.value,
        notes: form.elements.notes.value.trim(),
        promoCode: appliedPromo ? appliedPromo.code : ''
      }).then(function (order) {
        hideProcessing();
        saveCart([]);
        appliedPromo = null;
        var body = $('#cart-body');
        body.innerHTML =
          '<div class="cart-empty">' +
            '<div class="cart-empty-icon" style="background:var(--green-100)">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="var(--green-600)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:36px;height:36px">' +
                '<path d="M4.5 12.75l6 6 9-13.5"/>' +
              '</svg>' +
            '</div>' +
            '<h3>Order Placed!</h3>' +
            '<p style="margin-bottom:4px">Your order <strong>' + order.id + '</strong> has been received.</p>' +
            (order.discount > 0 ? '<p style="margin-bottom:4px">Discount applied: <strong>-GH¢ ' + Number(order.discount).toFixed(2) + '</strong></p>' : '') +
            '<p>Choose payment to complete your order.</p>' +
            '<button id="pay-now-btn" class="btn btn-primary" style="margin-top:16px">Pay Now — GH¢ ' + order.total.toFixed(2) + '</button>' +
            '<p style="margin-top:12px;font-size:13px;color:var(--gray-400)">Demo mode — simulated payment</p>' +
          '</div>';
        if (footer) footer.style.display = 'none';

        $('#pay-now-btn').addEventListener('click', function () {
          this.disabled = true;
          this.textContent = 'Processing...';
          showProcessing('Processing payment...');
          API.post('/api/payments/initialize', {
            orderId: order.id,
            email: form.elements.email.value.trim(),
            amount: order.total
          }).then(function (pay) {
            if (pay.demo) {
              hideProcessing();
              body.innerHTML =
                '<div class="cart-empty">' +
                  '<div class="cart-empty-icon" style="background:var(--amber-100)">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="var(--amber-600)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:36px;height:36px">' +
                      '<path d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>' +
                    '</svg>' +
                  '</div>' +
                  '<h3>Demo Payment</h3>' +
                  '<p style="margin-bottom:4px">Order <strong>' + pay.reference + '</strong></p>' +
                  '<p style="font-size:14px;color:var(--gray-500)">Click below to simulate a successful payment.</p>' +
                  '<button id="demo-confirm-btn" class="btn btn-primary" style="margin-top:16px">Confirm Demo Payment</button>' +
                '</div>';
              if (footer) footer.style.display = 'none';
              $('#demo-confirm-btn').addEventListener('click', function () {
                this.disabled = true;
                this.textContent = 'Confirming...';
                showProcessing('Confirming payment...');
                API.post('/api/payments/demo-confirm', { orderId: pay.reference }).then(function () {
                  hideProcessing();
                  body.innerHTML =
                    '<div class="cart-empty">' +
                      '<div class="cart-empty-icon" style="background:var(--green-100)">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="var(--green-600)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:36px;height:36px">' +
                          '<path d="M4.5 12.75l6 6 9-13.5"/>' +
                        '</svg>' +
                      '</div>' +
                      '<h3>Payment Successful!</h3>' +
                      '<p>Order <strong>' + pay.reference + '</strong> has been paid and confirmed.</p>' +
                      '<p style="font-size:13px;color:var(--gray-400)">We\'ll process your order shortly.</p>' +
                    '</div>';
                  showToast('Payment confirmed!');
                }).catch(function () {
                  hideProcessing();
                  showToast('Demo confirmation failed', 'error');
                  this.disabled = false;
                  this.textContent = 'Confirm Demo Payment';
                });
              });
            } else {
              window.location.href = pay.authorization_url;
            }
          }).catch(function (err) {
            hideProcessing();
            showToast(err.message || 'Payment failed', 'error');
            this.disabled = false;
            this.textContent = 'Pay Now';
          });
        });
      }).catch(function (err) {
        hideProcessing();
        showToast(err.message || 'Order failed', 'error');
        btn.disabled = false;
        btn.textContent = 'Place Order';
      });
    });
  }

  /* ══════════════════════════════════════════
     SHOP — Dynamic Product Grid
     ══════════════════════════════════════════ */
  var productGrid = $('#product-grid');
  if (productGrid) {
    productGrid.innerHTML =
      '<div class="shop-loading">' +
        '<div class="shop-loading-spinner"></div>' +
        '<p>Loading fresh produce...</p>' +
      '</div>';

    function loadProducts(attempts) {
      API.get('/api/products').then(function (products) {
        shopProducts = products;
        renderShopGrid();

        $$('.filter-pill').forEach(function (pill) {
          pill.addEventListener('click', function () {
            $$('.filter-pill').forEach(function (p) { p.classList.remove('active'); });
            this.classList.add('active');
            renderShopGrid();
          });
        });

        var search = $('#search-input, #shop-search');
        if (search) {
          search.addEventListener('input', function () {
            renderShopGrid();
          });
        }

        /* Preselect a category from the URL (?cat=boxes) */
        try {
          var catParam = new URLSearchParams(window.location.search).get('cat');
          if (catParam) {
            var target = Array.prototype.find.call($$('.filter-pill'), function (p) { return p.dataset.filter === catParam; });
            if (target) {
              $$('.filter-pill').forEach(function (p) { p.classList.remove('active'); });
              target.classList.add('active');
              renderShopGrid();
            }
          }
        } catch (e) { /* ignore */ }
      }).catch(function () {
        if (attempts > 0) {
          setTimeout(function () { loadProducts(attempts - 1); }, 700);
        } else {
          productGrid.innerHTML =
            '<div class="shop-error">' +
              '<p>Couldn\'t load products. Please check the server connection.</p>' +
              '<button class="btn btn-primary" id="shop-retry-btn" style="margin-top:12px">Retry</button>' +
            '</div>';
          $('#shop-retry-btn').addEventListener('click', function () {
            location.reload();
          });
        }
      });
    }

    loadProducts(3);
  }

  /* ══════════════════════════════════════════
     CHECKOUT — Payment success handler
     ══════════════════════════════════════════ */
  (function checkPaymentReturn() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      var orderId = params.get('order');
      if (orderId) {
        var body = $('#cart-body');
        if (body) {
          body.innerHTML =
            '<div class="cart-empty">' +
              '<div class="cart-empty-icon" style="background:var(--green-100)">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="var(--green-600)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:36px;height:36px">' +
                  '<path d="M4.5 12.75l6 6 9-13.5"/>' +
                '</svg>' +
              '</div>' +
              '<h3>Payment Successful!</h3>' +
              '<p>Order <strong>' + orderId + '</strong> has been paid and confirmed.</p>' +
              '<p style="font-size:13px;color:var(--gray-400)">We\'ll process your order shortly.</p>' +
            '</div>';
        }
      }
      window.history.replaceState({}, '', window.location.pathname);
    }
  })();

  /* ── Init cart ── */
  initCart();
  updateBadge();
  renderCart();

  /* ── Mobile / Sidebar ── */
  (function initNav() {
    var hamburger = $('.hamburger');
    var nav = $('.nav-links');
    if (hamburger && nav) {
      hamburger.addEventListener('click', function () {
        nav.classList.toggle('open');
        hamburger.classList.toggle('active');
      });
      document.addEventListener('click', function (e) {
        if (nav.classList.contains('open') && !e.target.closest('.nav-links') && !e.target.closest('.hamburger')) {
          nav.classList.remove('open');
          hamburger.classList.remove('active');
        }
      });
    }
  })();

  (function initMobileMenu() {
    var toggle = $('#mobile-toggle');
    var menu = $('#mobile-menu');
    var close = $('#mobile-close');
    var overlay = $('#mobile-overlay');
    if (!toggle || !menu) return;
    function openMenu() { menu.classList.add('open'); if (overlay) overlay.classList.add('open'); }
    function closeMenu() { menu.classList.remove('open'); if (overlay) overlay.classList.remove('open'); }
    toggle.addEventListener('click', openMenu);
    if (close) close.addEventListener('click', closeMenu);
    if (overlay) overlay.addEventListener('click', closeMenu);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
  })();

  /* ── Scroll Reveal ── */
  (function initReveal() {
    if ('IntersectionObserver' in window) {
      var revealEls = $$('.reveal, .reveal-left, .reveal-right');
      if (revealEls.length) {
        var observer = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add('visible');
              observer.unobserve(entry.target);
            }
          });
        }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
        revealEls.forEach(function (el) { observer.observe(el); });
      }
    } else {
      $$('.reveal, .reveal-left, .reveal-right').forEach(function (el) { el.classList.add('visible'); });
    }
  })();

  /* ── Order Tracking ── */
  var trackForm = $('#track-form');
  if (trackForm) {
    trackForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var id = trackForm.querySelector('input[name="orderId"]').value.trim();
      var result = $('#track-result');
      var btn = trackForm.querySelector('button[type="submit"]');
      if (!id) return;
      btn.disabled = true;
      result.innerHTML = '<div class="track-loading">Looking up order...</div>';
      API.get('/api/orders/' + encodeURIComponent(id)).then(function (order) {
        result.innerHTML = renderTrackResult(order);
      }).catch(function (err) {
        result.innerHTML = '<div class="track-error">' + escapeHtml(err.message || 'Order not found') + '</div>';
      }).then(function () { btn.disabled = false; });
    });
  }

  var STATUS_STEPS = ['pending_payment', 'pending', 'confirmed', 'processing', 'out_for_delivery', 'delivered'];

  function renderTrackResult(order) {
    var status = order.status;
    var idx = STATUS_STEPS.indexOf(status);
    var isCancelled = status === 'cancelled';
    var isRefunded = order.payment_status === 'refunded';
    var isPaid = order.payment_status === 'paid';

    var stepsHtml = '';
    if (isCancelled) {
      stepsHtml = '<div class="track-badge cancelled">Order Cancelled</div>';
    } else {
      var labels = ['Payment', 'Received', 'Confirmed', 'Processing', 'Out for Delivery', 'Delivered'];
      var stepIdx = idx < 0 ? 0 : idx;
      if (isPaid && idx === 0) stepIdx = 1;
      stepsHtml = '<div class="track-steps">' + labels.map(function (label, i) {
        var cls = i < stepIdx ? 'done' : (i === stepIdx ? 'current' : '');
        return '<div class="track-step ' + cls + '"><span class="track-dot"></span><span>' + label + '</span></div>';
      }).join('') + '</div>';
    }

    var itemsHtml = order.items.map(function (it) {
      return '<li>' + escapeHtml(it.product_name) + ' × ' + it.quantity + ' — GH¢ ' + Number(it.price * it.quantity).toFixed(2) + '</li>';
    }).join('');

    return '<div class="track-card">' +
      '<div class="track-order-id">Order <strong>' + escapeHtml(order.id) + '</strong></div>' +
      '<p class="track-meta">Placed ' + escapeHtml(String(order.createdAt).replace('T', ' ').slice(0, 16)) + ' · ' + escapeHtml(order.delivery_type) + '</p>' +
      stepsHtml +
      (isRefunded ? '<div class="track-badge refunded">Payment refunded</div>' : '') +
      '<ul class="track-items">' + itemsHtml + '</ul>' +
      '<div class="track-total">Total: <strong>GH¢ ' + Number(order.total).toFixed(2) + '</strong>' +
        (order.discount > 0 ? ' <span class="track-discount">(discount -GH¢ ' + Number(order.discount).toFixed(2) + ')</span>' : '') +
      '</div>' +
    '</div>';
  }

  /* ── Newsletter Subscribe ── */
  $$('.footer-newsletter-form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = form.querySelector('input[type="email"]');
      var email = input.value.trim();
      if (!email) return;
      API.post('/api/newsletter', { email: email }).then(function () {
        showToast('Subscribed!');
        input.value = '';
      }).catch(function () {
        showToast('Subscription failed', 'error');
      });
    });
  });

  /* ── Contact Form ── */
  var contactForm = $('.contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = contactForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      API.post('/api/messages', {
        name: contactForm.querySelector('[name="name"]').value.trim(),
        email: contactForm.querySelector('[name="email"]').value.trim(),
        phone: contactForm.querySelector('[name="phone"]') ? contactForm.querySelector('[name="phone"]').value.trim() : '',
        subject: contactForm.querySelector('[name="subject"]') ? contactForm.querySelector('[name="subject"]').value.trim() : '',
        message: contactForm.querySelector('[name="message"]').value.trim(),
      }).then(function () {
        showToast('Message sent! We\'ll get back to you soon.');
        contactForm.reset();
        btn.disabled = false;
      }).catch(function () {
        showToast('Failed to send message', 'error');
        btn.disabled = false;
      });
    });
  }

  /* ── Broadcast Notifications ── */
  function checkBroadcasts() {
    API.get('/api/broadcasts').then(function (broadcasts) {
      if (!broadcasts || !broadcasts.length) return;
      var latest = broadcasts[0];
      var dismissed = [];
      try { dismissed = JSON.parse(sessionStorage.getItem('eden_dismissed_broadcasts') || '[]'); } catch (e) { /* ignore */ }
      if (dismissed.indexOf(latest.id) !== -1) return;

      var overlay = document.createElement('div');
      overlay.className = 'broadcast-overlay';
      overlay.innerHTML =
        '<div class="broadcast-modal">' +
          '<button class="broadcast-close" aria-label="Dismiss">&times;</button>' +
          '<div class="broadcast-modal-header">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:20px;height:20px"><path stroke-linecap="round" stroke-linejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38a.502.502 0 01-.687-.216 12.09 12.09 0 01-1.418-3.977M10.34 15.84A10.5 10.5 0 0112 12.75m0 0c2.648 0 5.025.585 7.18 1.623.55.264 1.164.025 1.46-.553l.38-.657a.502.502 0 00-.216-.687 12.09 12.09 0 00-3.977-1.418M12 12.75V9m0 0V3.75a.75.75 0 01.75-.75h4.5a.75.75 0 01.75.75V9m-6 0h6"/></svg>' +
            '<span>' + escapeHtml(latest.title) + '</span>' +
          '</div>' +
          '<div class="broadcast-modal-body">' + escapeHtml(latest.message) + '</div>' +
        '</div>';
      document.body.appendChild(overlay);
      requestAnimationFrame(function () { overlay.classList.add('open'); });

      overlay.querySelector('.broadcast-close').addEventListener('click', function () {
        overlay.classList.remove('open');
        setTimeout(function () { document.body.removeChild(overlay); }, 300);
        dismissed.push(latest.id);
        try { sessionStorage.setItem('eden_dismissed_broadcasts', JSON.stringify(dismissed)); } catch (e) { /* ignore */ }
      });
    }).catch(function () { /* offline or no broadcasts */ });
  }

  setTimeout(checkBroadcasts, 800);

  /* ── WhatsApp floating button ── */
  (function initWhatsApp() {
    var WHATSAPP_PHONE = '233501234567';
    var WHATSAPP_MSG = encodeURIComponent('Hi Eden Tree! I\'d like to place an order.');
    var btn = document.createElement('a');
    btn.href = 'https://wa.me/' + WHATSAPP_PHONE + '?text=' + WHATSAPP_MSG;
    btn.target = '_blank';
    btn.rel = 'noopener noreferrer';
    btn.className = 'whatsapp-fab';
    btn.setAttribute('aria-label', 'Order on WhatsApp');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="white" width="28" height="28"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';
    document.body.appendChild(btn);
  })();

})();
