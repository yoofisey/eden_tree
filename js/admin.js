const STATUS_LABELS = { pending: 'Pending', pending_payment: 'Pending Payment', confirmed: 'Confirmed', processing: 'Processing', out_for_delivery: 'Out for Delivery', delivered: 'Delivered', cancelled: 'Cancelled' };
const STATUS_COLORS = { pending: 'badge-amber', pending_payment: 'badge-amber', confirmed: 'badge-blue', processing: 'badge-purple', out_for_delivery: 'badge-indigo', delivered: 'badge-green', cancelled: 'badge-red' };
const STATUS_SELECT_COLORS = { pending: '#f59e0b', pending_payment: '#f59e0b', confirmed: '#3b82f6', processing: '#8b5cf6', out_for_delivery: '#6366f1', delivered: '#10b981', cancelled: '#ef4444' };
const STATUS_ORDER = ['pending', 'confirmed', 'processing', 'out_for_delivery', 'delivered'];

var API = function () {
  var base = window.location.origin;
  function token() { try { return sessionStorage.getItem('eden_admin_token') || ''; } catch (e) { return ''; } }
  function headers() { return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token() }; }
  return {
    login: function (u, p) { return fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) }).then(function (r) { if (!r.ok) return r.json().then(function (e) { throw new Error(e.error); }); return r.json(); }); },
    get: function (path) { return fetch(base + path, { headers: headers() }).then(function (r) { if (!r.ok) return r.json().then(function (e) { throw new Error(e.error); }); return r.json(); }); },
    post: function (path, data) { return fetch(base + path, { method: 'POST', headers: headers(), body: JSON.stringify(data) }).then(function (r) { if (!r.ok) return r.json().then(function (e) { throw new Error(e.error); }); return r.json(); }); },
    put: function (path, data) { return fetch(base + path, { method: 'PUT', headers: headers(), body: JSON.stringify(data) }).then(function (r) { if (!r.ok) return r.json().then(function (e) { throw new Error(e.error); }); return r.json(); }); },
    del: function (path) { return fetch(base + path, { method: 'DELETE', headers: headers() }).then(function (r) { if (!r.ok) return r.json().then(function (e) { throw new Error(e.error); }); return r.json(); }); },
  };
}();

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

var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
var $$ = function (sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); };

function escapeHtml(str) {
  var d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

var activeView = null;

function switchView(viewName) {
  if (viewName === activeView) return;
  activeView = viewName;
  $$('.admin-view').forEach(function (v) { v.style.display = 'none'; });
  var target = document.getElementById('view-' + viewName);
  if (target) target.style.display = 'block';
  $$('.admin-nav-item[data-view]').forEach(function (item) {
    item.classList.toggle('active', item.getAttribute('data-view') === viewName);
  });
  renderActiveView();
}

function renderActiveView() {
  if (activeView === 'dashboard') renderDashboard();
  else if (activeView === 'orders') renderOrders();
  else if (activeView === 'products') renderProducts();
  else if (activeView === 'messages') renderMessages();
  else if (activeView === 'subscribers') renderSubscribers();
}

/* ══════════════════════════════════════════
   DASHBOARD
   ══════════════════════════════════════════ */
function renderDashboard() {
  var container = $('#view-dashboard');
  container.innerHTML = '<div style="text-align:center;padding:80px"><p>Loading dashboard...</p></div>';

  API.get('/api/admin/dashboard').then(function (d) {
    container.innerHTML =
      '<div class="admin-page-title"><h1>Dashboard</h1><p>Overview of your store</p></div>' +
      '<div class="admin-stats-grid">' +
        '<div class="admin-stat-card"><div class="admin-stat-value">' + d.total_orders + '</div><div class="admin-stat-label">Total Orders</div></div>' +
        '<div class="admin-stat-card"><div class="admin-stat-value">' + d.pending_orders + '</div><div class="admin-stat-label">Pending</div></div>' +
        '<div class="admin-stat-card"><div class="admin-stat-value">GH¢ ' + Number(d.total_revenue).toFixed(2) + '</div><div class="admin-stat-label">Revenue (paid)</div></div>' +
        '<div class="admin-stat-card"><div class="admin-stat-value">' + d.unread_messages + '</div><div class="admin-stat-label">Unread Messages</div></div>' +
        '<div class="admin-stat-card"><div class="admin-stat-value">' + d.subscriber_count + '</div><div class="admin-stat-label">Subscribers</div></div>' +
      '</div>' +
      (d.low_stock && d.low_stock.length ? '<div class="admin-card" style="margin-top:24px"><h3 class="admin-card-title">Low Stock Alert</h3>' + d.low_stock.map(function (p) { return '<div class="admin-low-stock-item"><span>' + escapeHtml(p.name) + '</span><span class="badge badge-red">' + p.stock + ' left</span></div>'; }).join('') + '</div>' : '') +
      (d.recent_orders && d.recent_orders.length ? '<div class="admin-card" style="margin-top:16px"><h3 class="admin-card-title">Recent Orders</h3>' + d.recent_orders.map(function (o) { return '<div class="admin-recent-order"><span>' + o.id + '</span><span class="badge ' + (STATUS_COLORS[o.status] || 'badge-amber') + '">' + (STATUS_LABELS[o.status] || o.status) + '</span><span>GH¢ ' + Number(o.total).toFixed(2) + '</span></div>'; }).join('') + '</div>' : '');
  }).catch(function () {
    container.innerHTML = '<div class="admin-page-title"><h1>Dashboard</h1><p>Error loading data. Is the server running?</p></div>';
  });
}

/* ══════════════════════════════════════════
   ORDERS
   ══════════════════════════════════════════ */
function renderOrders() {
  var container = $('#view-orders');
  container.innerHTML = '<div style="text-align:center;padding:80px"><p>Loading orders...</p></div>';

  API.get('/api/admin/orders').then(function (allOrders) {
    var html = function (orders, query, statusFilter) {
      var filtered = orders.filter(function (o) {
        var q = query.toLowerCase();
        var matchSearch = !q || o.id.toLowerCase().indexOf(q) !== -1 || (o.customer_name && o.customer_name.toLowerCase().indexOf(q) !== -1) || (o.customer_email && o.customer_email.toLowerCase().indexOf(q) !== -1);
        var matchStatus = !statusFilter || statusFilter === 'all' || o.status === statusFilter;
        return matchSearch && matchStatus;
      });

      container.innerHTML =
        '<div class="admin-page-title"><h1>Orders</h1><p>' + orders.length + ' total</p></div>' +
        '<div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">' +
          '<input type="text" id="orders-search" placeholder="Search by ID, name, or email..." value="' + escapeHtml(query) + '" style="flex:1;min-width:200px;padding:10px 14px;border:1px solid var(--gray-200);border-radius:10px;font-size:14px;outline:none;font-family:inherit">' +
          '<select id="orders-status-filter" style="padding:10px 14px;border:1px solid var(--gray-200);border-radius:10px;font-size:14px;outline:none;font-family:inherit;background:white">' +
            '<option value="all"' + (statusFilter === 'all' || !statusFilter ? ' selected' : '') + '>All statuses</option>' +
            Object.keys(STATUS_LABELS).map(function (s) { return '<option value="' + s + '"' + (s === statusFilter ? ' selected' : '') + '>' + STATUS_LABELS[s] + '</option>'; }).join('') +
          '</select>' +
        '</div>' +
        '<div style="font-size:13px;color:var(--gray-400);margin-bottom:12px">' + filtered.length + ' result' + (filtered.length !== 1 ? 's' : '') + '</div>' +
        (filtered.length ? '<div class="admin-order-list">' + filtered.map(function (o) {
          return '<div class="admin-order-card">' +
            '<div class="admin-order-header">' +
              '<span class="admin-order-id">' + escapeHtml(o.id) + '</span>' +
              '<select class="admin-status-select" data-order-id="' + o.id + '" style="background:' + (STATUS_SELECT_COLORS[o.status] || '#f59e0b') + '20;color:' + (STATUS_SELECT_COLORS[o.status] || '#f59e0b') + ';border-color:' + (STATUS_SELECT_COLORS[o.status] || '#f59e0b') + '40">' +
                Object.keys(STATUS_LABELS).map(function (s) { return '<option value="' + s + '"' + (s === o.status ? ' selected' : '') + '>' + STATUS_LABELS[s] + '</option>'; }).join('') +
              '</select>' +
            '</div>' +
            '<div class="admin-order-customer"><strong>' + escapeHtml(o.customer_name) + '</strong> &lt;' + escapeHtml(o.customer_email) + '&gt;' + (o.customer_phone ? ' &mdash; ' + escapeHtml(o.customer_phone) : '') + '</div>' +
            '<div class="admin-order-meta">' + new Date(o.createdAt).toLocaleDateString() + ' &middot; GH¢ ' + Number(o.total).toFixed(2) + ' &middot; ' + o.delivery_type + ' &middot; Payment: ' + o.payment_status + '</div>' +
            (o.notes ? '<div class="admin-order-notes">' + escapeHtml(o.notes) + '</div>' : '') +
            (o.items && o.items.length ? '<div class="admin-order-items">' + o.items.map(function (i) { return '<div class="admin-order-item"><span>' + escapeHtml(i.product_name) + '</span><span>&times;' + i.quantity + '</span><span>GH¢ ' + Number(i.price * i.quantity).toFixed(2) + '</span></div>'; }).join('') + '</div>' : '') +
          '</div>';
        }).join('') + '</div>' : '<div style="text-align:center;padding:60px;color:var(--gray-400)">No matching orders</div>');

      container.querySelectorAll('.admin-status-select').forEach(function (sel) {
        sel.addEventListener('change', function () {
          API.put('/api/admin/orders/' + sel.dataset.orderId, { status: sel.value }).then(function () {
            showToast('Order status updated');
            renderOrders();
          }).catch(function (err) { showToast(err.message || 'Update failed', 'error'); });
        });
      });

      document.getElementById('orders-search').addEventListener('input', function () {
        html(orders, this.value, document.getElementById('orders-status-filter').value);
      });
      document.getElementById('orders-status-filter').addEventListener('change', function () {
        html(orders, document.getElementById('orders-search').value, this.value);
      });
    };

    html(allOrders, '', 'all');
  }).catch(function () {
    container.innerHTML = '<div class="admin-page-title"><h1>Orders</h1><p>Error loading orders</p></div>';
  });
}

/* ══════════════════════════════════════════
   PRODUCTS
   ══════════════════════════════════════════ */
function renderProducts() {
  var container = $('#view-products');
  container.innerHTML = '<div style="text-align:center;padding:80px"><p>Loading products...</p></div>';

  API.get('/api/admin/products').then(function (products) {
    var refillNeeded = products.filter(function (p) { return p.stock > 0 && p.stock <= p.minStock; });

    container.innerHTML =
      (refillNeeded.length ? '<div class="admin-refill-banner"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:18px;height:18px;flex-shrink:0"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg><span><strong>' + refillNeeded.length + ' product' + (refillNeeded.length !== 1 ? 's' : '') + ' need refill</strong> &mdash; stock at or below minimum level</span></div>' : '') +
      '<div class="admin-page-title header-row">' +
        '<div><h1>Products</h1><p>' + products.length + ' products</p></div>' +
        '<button class="admin-btn-primary" id="add-product-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path stroke-linecap="round" d="M12 4.5v15m7.5-7.5h-15"/></svg> Add Product</button>' +
      '</div>' +
      '<div class="admin-products-grid">' + products.map(function (p) {
        var low = p.stock <= p.minStock;
        var out = p.stock <= 0;
        var refill = p.stock > 0 && p.stock === p.minStock;
        return '<div class="admin-product-card">' +
          '<div class="admin-product-img"><img src="' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.name) + '" loading="lazy"></div>' +
          '<div class="admin-product-body">' +
            '<div class="admin-product-name">' + escapeHtml(p.name) + '</div>' +
            '<div class="admin-product-meta">' + p.category + ' &middot; per ' + p.unit + '</div>' +
            '<div class="admin-product-price">GH¢ ' + Number(p.price).toFixed(2) + '</div>' +
          '</div>' +
          '<div class="admin-product-aside">' +
            (out ? '<span class="admin-stock-badge out" data-id="' + p.id + '" data-stock="0">Out of stock</span>' : refill ? '<span class="admin-stock-badge refill" data-id="' + p.id + '" data-stock="' + p.stock + '">Refill needed</span>' : low ? '<span class="admin-stock-badge low" data-id="' + p.id + '" data-stock="' + p.stock + '">' + p.stock + ' left</span>' : '<span class="admin-stock-badge ok" data-id="' + p.id + '" data-stock="' + p.stock + '">' + p.stock + ' in stock</span>') +
            '<div class="admin-product-actions">' +
              '<button class="admin-icon-btn edit-product-btn" data-id="' + p.id + '" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:16px;height:16px"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"/></svg></button>' +
              '<button class="admin-icon-btn delete-product-btn" data-id="' + p.id + '" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:16px;height:16px"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg></button>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('') + '</div>' +
      '<div id="product-modal-container"></div>';

    document.getElementById('add-product-btn').addEventListener('click', function () { showProductModal(null); });
    container.querySelectorAll('.edit-product-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var prod = products.find(function (p) { return String(p.id) === String(btn.dataset.id); });
        if (prod) showProductModal(prod);
      });
    });
    container.querySelectorAll('.delete-product-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!confirm('Delete this product?')) return;
        API.del('/api/admin/products/' + btn.dataset.id).then(function () {
          showToast('Product deleted');
          renderProducts();
        }).catch(function (err) { showToast(err.message || 'Delete failed', 'error'); });
      });
    });

    /* inline stock edit */
    container.querySelectorAll('.admin-stock-badge').forEach(function (badge) {
      badge.addEventListener('click', function () {
        var id = badge.dataset.id;
        var currentStock = parseInt(badge.dataset.stock, 10);
        if (badge.classList.contains('out')) { currentStock = 0; }
        var input = document.createElement('input');
        input.type = 'number';
        input.className = 'admin-stock-input';
        input.value = currentStock;
        input.min = 0;
        badge.style.display = 'none';
        badge.parentNode.insertBefore(input, badge.nextSibling);
        input.focus();
        input.select();

        function commit() {
          var val = parseInt(input.value, 10);
          if (!isNaN(val) && val !== currentStock) {
            API.put('/api/admin/products/' + id, { stock: val }).then(function () {
              showToast('Stock updated');
              renderProducts();
            }).catch(function (err) { showToast(err.message || 'Update failed', 'error'); });
          } else {
            renderProducts();
          }
        }

        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
        input.addEventListener('blur', function () { commit(); });
      });
    });
  }).catch(function () {
    container.innerHTML = '<div class="admin-page-title"><h1>Products</h1><p>Error loading products</p></div>';
  });
}

function showProductModal(product) {
  var existing = document.getElementById('product-modal-container').querySelector('.admin-modal-overlay');
  if (existing) existing.remove();

  var isEdit = !!product;
  var currentImage = isEdit ? (product.image || '') : '';
  var overlay = document.createElement('div');
  overlay.className = 'admin-modal-overlay';
  overlay.innerHTML =
    '<div class="admin-modal">' +
      '<div class="admin-modal-header">' +
        '<h3>' + (isEdit ? 'Edit Product' : 'Add Product') + '</h3>' +
        '<button class="admin-modal-close" id="product-modal-close-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M6 18L18 6M6 6l12 12"/></svg></button>' +
      '</div>' +
      '<div class="admin-modal-body">' +
        '<form id="product-edit-form" class="admin-form">' +
          '<div class="admin-form-group"><label>Name</label><input type="text" id="prod-name" value="' + (isEdit ? escapeHtml(product.name) : '') + '" required></div>' +
          '<div class="admin-form-row">' +
            '<div class="admin-form-group"><label>Category</label><select id="prod-category"><option value="vegetables"' + (isEdit && product.category === 'vegetables' ? ' selected' : '') + '>Vegetables</option><option value="fruits"' + (isEdit && product.category === 'fruits' ? ' selected' : '') + '>Fruits</option><option value="herbs"' + (isEdit && product.category === 'herbs' ? ' selected' : '') + '>Herbs</option><option value="juices"' + (isEdit && product.category === 'juices' ? ' selected' : '') + '>Juices</option></select></div>' +
            '<div class="admin-form-group"><label>Unit</label><input type="text" id="prod-unit" value="' + (isEdit ? escapeHtml(product.unit) : '') + '" required></div>' +
          '</div>' +
          '<div class="admin-form-row">' +
            '<div class="admin-form-group"><label>Price (GH¢)</label><input type="number" id="prod-price" step="0.01" value="' + (isEdit ? product.price : '') + '" required></div>' +
            '<div class="admin-form-group"><label>Stock</label><input type="number" id="prod-stock" value="' + (isEdit ? product.stock : '') + '" required></div>' +
            '<div class="admin-form-group"><label>Min Stock</label><input type="number" id="prod-minstock" value="' + (isEdit ? product.minStock : '') + '" required></div>' +
          '</div>' +
          '<div class="admin-form-group"><label>Description</label><textarea id="prod-desc" rows="2">' + (isEdit ? escapeHtml(product.description) : '') + '</textarea></div>' +
          '<div class="admin-form-group"><label>Image</label><div style="display:flex;align-items:center;gap:12px">' +
            '<input type="file" id="prod-image-file" accept="image/*" style="flex:1">' +
            (currentImage ? '<img id="prod-image-preview" src="' + currentImage + '" style="width:52px;height:52px;border-radius:10px;object-fit:cover;border:1px solid var(--gray-200);flex-shrink:0">' : '<div id="prod-image-preview" style="display:none;width:52px;height:52px;border-radius:10px;background:var(--gray-50);flex-shrink:0"></div>') +
          '</div></div>' +
          '<input type="hidden" id="prod-image" value="' + escapeHtml(currentImage) + '">' +
          '<button type="submit" class="admin-btn-primary" style="align-self:flex-start">' + (isEdit ? 'Update Product' : 'Add Product') + '</button>' +
        '</form>' +
      '</div>' +
    '</div>';
  document.getElementById('product-modal-container').appendChild(overlay);
  requestAnimationFrame(function () { overlay.classList.add('open'); });

  document.getElementById('product-modal-close-btn').addEventListener('click', function () { overlay.remove(); });
  overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });

  /* file preview */
  var fileInput = document.getElementById('prod-image-file');
  var preview = document.getElementById('prod-image-preview');
  var hiddenInput = document.getElementById('prod-image');
  var uploading = false;

  fileInput.addEventListener('change', function () {
    var file = fileInput.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast('Image must be under 5MB', 'error'); fileInput.value = ''; return; }
    /* show preview immediately */
    var reader = new FileReader();
    reader.onload = function (e) {
      preview.src = e.target.result;
      preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('product-edit-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (uploading) return;
    uploading = true;

    var file = fileInput.files[0];
    var doSave = function (imageUrl) {
      var data = {
        name: document.getElementById('prod-name').value.trim(),
        category: document.getElementById('prod-category').value,
        price: parseFloat(document.getElementById('prod-price').value),
        unit: document.getElementById('prod-unit').value.trim(),
        description: document.getElementById('prod-desc').value.trim(),
        image: imageUrl,
        stock: parseInt(document.getElementById('prod-stock').value) || 0,
        minStock: parseInt(document.getElementById('prod-minstock').value) || 5,
        inStock: true,
      };
      var req = isEdit
        ? API.put('/api/admin/products/' + product.id, data)
        : API.post('/api/admin/products', data);
      req.then(function () {
        showToast(isEdit ? 'Product updated' : 'Product added');
        overlay.remove();
        renderProducts();
      }).catch(function (err) { showToast(err.message || 'Save failed', 'error'); uploading = false; });
    };

    if (file) {
      var formData = new FormData();
      formData.append('image', file);
      var token = (function () { try { return sessionStorage.getItem('eden_admin_token') || ''; } catch (e) { return ''; } })();
      fetch(window.location.origin + '/api/admin/upload', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token },
        body: formData,
      }).then(function (r) {
        if (!r.ok) return r.json().then(function (e) { throw new Error(e.error); });
        return r.json();
      }).then(function (res) {
        doSave(res.url);
      }).catch(function (err) {
        showToast(err.message || 'Upload failed', 'error');
        uploading = false;
      });
    } else {
      doSave(hiddenInput.value);
    }
  });
}

/* ══════════════════════════════════════════
   MESSAGES
   ══════════════════════════════════════════ */
function renderMessages() {
  var container = $('#view-messages');
  container.innerHTML = '<div style="text-align:center;padding:80px"><p>Loading messages...</p></div>';

  API.get('/api/admin/messages').then(function (messages) {
    container.innerHTML =
      '<div class="admin-page-title"><h1>Messages</h1><p>' + messages.length + ' total</p></div>' +
      (messages.length ? '<div class="admin-message-list">' + messages.map(function (m) {
        return '<div class="admin-message-card' + (m.is_read ? '' : ' unread') + '" data-id="' + m.id + '">' +
          '<div class="admin-message-header">' +
            '<strong>' + escapeHtml(m.name) + '</strong>' +
            '<span class="admin-message-date">' + new Date(m.createdAt).toLocaleDateString() + '</span>' +
          '</div>' +
          (m.subject ? '<div class="admin-message-subject">' + escapeHtml(m.subject) + '</div>' : '') +
          '<div class="admin-message-body">' + escapeHtml(m.message) + '</div>' +
          '<div class="admin-message-meta">' + escapeHtml(m.email) + (m.phone ? ' &middot; ' + escapeHtml(m.phone) : '') + '</div>' +
          '<div class="admin-message-actions">' +
            '<button class="admin-btn-outline msg-toggle-btn" data-id="' + m.id + '" style="font-size:12px;padding:4px 10px">' + (m.is_read ? 'Mark Unread' : 'Mark Read') + '</button>' +
            '<button class="admin-btn-outline msg-delete-btn" data-id="' + m.id + '" style="font-size:12px;padding:4px 10px;color:#dc2626;border-color:#dc2626">Delete</button>' +
          '</div>' +
        '</div>';
      }).join('') + '</div>' : '<div style="text-align:center;padding:60px;color:var(--gray-400)">No messages yet</div>');

    container.querySelectorAll('.msg-toggle-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var msg = messages.find(function (m) { return String(m.id) === String(btn.dataset.id); });
        if (!msg) return;
        API.put('/api/admin/messages/' + btn.dataset.id, { is_read: !msg.is_read }).then(function () {
          renderMessages();
        }).catch(function (err) { showToast(err.message || 'Update failed', 'error'); });
      });
    });
    container.querySelectorAll('.msg-delete-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!confirm('Delete this message?')) return;
        API.del('/api/admin/messages/' + btn.dataset.id).then(function () {
          renderMessages();
        }).catch(function (err) { showToast(err.message || 'Delete failed', 'error'); });
      });
    });
  }).catch(function () {
    container.innerHTML = '<div class="admin-page-title"><h1>Messages</h1><p>Error loading messages</p></div>';
  });
}

/* ══════════════════════════════════════════
   SUBSCRIBERS + BROADCAST
   ══════════════════════════════════════════ */
function renderSubscribers() {
  var container = $('#view-subscribers');
  container.innerHTML = '<div style="text-align:center;padding:80px"><p>Loading...</p></div>';

  Promise.all([
    API.get('/api/admin/subscribers'),
    API.get('/api/admin/broadcasts')
  ]).then(function (results) {
    var emails = results[0];
    var broadcasts = results[1];

    container.innerHTML =
      '<div class="admin-page-title"><h1>Subscribers</h1><p>Newsletter email subscribers</p></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:28px;align-items:start">' +
        '<div>' +
          (emails.length === 0
            ? '<div style="text-align:center;padding:60px 20px;background:white;border:1px solid var(--gray-100);border-radius:14px"><h3 style="font-size:16px;color:var(--gray-900)">No subscribers yet</h3><p style="color:var(--gray-400);font-size:13px">Signups from the footer will appear here.</p></div>'
            : '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:12px"><span style="font-size:14px;color:var(--gray-500)">' + emails.length + ' subscriber' + (emails.length !== 1 ? 's' : '') + '</span><button id="export-subscribers-btn" class="admin-btn-outline" style="font-size:13px;padding:7px 18px">Export CSV</button></div>' +
              '<div class="admin-subscriber-list">' + emails.map(function (e) {
                return '<div class="admin-subscriber-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:16px;height:16px;color:var(--green-500);flex-shrink:0"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg><span>' + escapeHtml(e.email) + '</span></div>';
              }).join('') + '</div>'
          ) +
        '</div>' +
        '<div class="admin-card" style="padding:24px">' +
          '<h3 style="font-size:16px;margin:0 0 4px">Send Broadcast</h3>' +
          '<p style="font-size:13px;color:var(--gray-400);margin:0 0 20px">All subscribers will see this message when they visit the site.</p>' +
          '<form id="broadcast-form" class="admin-form">' +
            '<div class="admin-form-group"><label>Title</label><input type="text" id="broadcast-title" required placeholder="e.g. New Stock Arrival"></div>' +
            '<div class="admin-form-group"><label>Message</label><textarea id="broadcast-message" required rows="4" placeholder="Write your message..."></textarea></div>' +
            '<button type="submit" class="admin-btn-primary">Send to All Subscribers</button>' +
          '</form>' +
          (broadcasts.length ? '<div id="broadcast-history" style="margin-top:20px"><h4 style="font-size:13px;font-weight:600;color:var(--gray-500);margin:0 0 10px">Sent Broadcasts</h4>' + broadcasts.slice(0, 5).map(function (b) {
            return '<div style="padding:12px 14px;background:var(--gray-50);border-radius:10px;margin-bottom:8px"><div style="font-size:13px;font-weight:600;color:var(--gray-800);margin-bottom:2px">' + escapeHtml(b.title) + '</div><div style="font-size:12px;color:var(--gray-400)">' + new Date(b.createdAt).toLocaleDateString() + '</div></div>';
          }).join('') + '</div>' : '') +
        '</div>' +
      '</div>';

    var exportBtn = document.getElementById('export-subscribers-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        var csv = 'data:text/csv;charset=utf-8,' + encodeURIComponent('Email\n' + emails.map(function (e) { return e.email; }).join('\n'));
        var a = document.createElement('a');
        a.href = csv;
        a.download = 'eden_tree_subscribers.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
    }

    $('#broadcast-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var title = $('#broadcast-title').value.trim();
      var message = $('#broadcast-message').value.trim();
      if (!title || !message) return;
      API.post('/api/admin/broadcasts', { title: title, message: message }).then(function (r) {
        $('#broadcast-title').value = '';
        $('#broadcast-message').value = '';
        showToast('Broadcast sent to ' + (r.recipient_count || 0) + ' subscriber(s)');
        renderSubscribers();
      }).catch(function (err) { showToast(err.message || 'Failed to send', 'error'); });
    });
  }).catch(function () {
    container.innerHTML = '<div class="admin-page-title"><h1>Subscribers</h1><p>Error loading data</p></div>';
  });
}

/* ══════════════════════════════════════════
   AUTH
   ══════════════════════════════════════════ */
function isLoggedIn() {
  try { return !!sessionStorage.getItem('eden_admin_token'); } catch (e) { return false; }
}

function showLogin() {
  $('#login-overlay').classList.add('open');
  $('#admin-sidebar').classList.remove('open');
}

function hideLogin() {
  $('#login-overlay').classList.remove('open');
}

function doLogout() {
  try { sessionStorage.removeItem('eden_admin_token'); sessionStorage.removeItem('eden_admin_username'); } catch (e) { /* ignore */ }
  showLogin();
}

function initAdmin() {
  $('#logout-btn').addEventListener('click', doLogout);
  $('#sidebar-toggle').addEventListener('click', function () {
    $('#admin-sidebar').classList.toggle('open');
  });

  function navigateToHash() {
    var view = window.location.hash.replace('#', '') || 'dashboard';
    switchView(view);
  }

  /* hash routing: the nav href=#viewname updates the hash, hashchange handles the rest */
  window.addEventListener('hashchange', navigateToHash);
  navigateToHash();
}

document.addEventListener('DOMContentLoaded', function () {
  if (isLoggedIn()) { initAdmin(); return; }

  showLogin();

  $('#login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var pw = $('#login-password').value;
    API.login('admin', pw).then(function (res) {
      try { sessionStorage.setItem('eden_admin_token', res.token); sessionStorage.setItem('eden_admin_username', res.username || 'admin'); } catch (e) { /* ignore */ }
      hideLogin();
      $('#login-error').style.display = 'none';
      $('#login-password').value = '';
      initAdmin();
    }).catch(function () {
      $('#login-error').style.display = 'block';
    });
  });
});
