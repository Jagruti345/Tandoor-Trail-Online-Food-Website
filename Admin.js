// ============================================================
// SMALL UTILS
// ============================================================
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const money = n => "₹" + Number(n || 0).toLocaleString("en-IN");
const uid = () => "a" + Math.random().toString(36).slice(2, 10);

const TOKEN_KEY = "tandoor_admin_token";

function toast(message, type = "success") {
  const stack = $("#toastStack");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity .3s";
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

function apiReady() {
  return !CONFIG.API_BASE.includes("YOUR-API-ID");
}

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}
function setToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token);
}
function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

// ============================================================
// API — every call carries the admin token once logged in.
// A 401 means the session expired or was never valid; we boot back to the gate.
// ============================================================
async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${CONFIG.API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    clearToken();
    showGate("Your session expired — log in again.");
    throw new Error(data.message || "Session expired");
  }
  if (!res.ok || data.success === false) {
    throw new Error(data.message || data.error || `Request failed (${res.status})`);
  }
  return data;
}

async function loginRequest(passcode) {
  const res = await fetch(`${CONFIG.API_BASE}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passcode })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.message || `Login failed (${res.status})`);
  }
  return data.token;
}

// ============================================================
// fetchWithFallback — the ONLY place demo data is allowed to appear.
// If CONFIG.DEMO_MODE_FALLBACK is false (the default), a failed call
// surfaces a real toast and returns null instead of faking data.
// ============================================================
async function fetchWithFallback(path, options, demoFn) {
  if (!apiReady()) {
    setConnectionIndicator("unconfigured");
    if (CONFIG.DEMO_MODE_FALLBACK) return demoFn ? demoFn() : null;
    toast("CONFIG.API_BASE isn't set in config.js yet.", "error");
    return null;
  }
  try {
    const data = await apiFetch(path, options);
    setConnectionIndicator("live");
    return data;
  } catch (err) {
    setConnectionIndicator("error");
    if (CONFIG.DEMO_MODE_FALLBACK) {
      toast(`Live request failed (${err.message}) — showing demo data`, "error");
      return demoFn ? demoFn() : null;
    }
    toast(err.message, "error");
    return null;
  }
}

// ============================================================
// DEMO DATA — only ever used if CONFIG.DEMO_MODE_FALLBACK is set to true
// ============================================================
const DEMO_MENU = [
  { foodId: "FOOD-DEMO01", foodName: "Smoked Paneer Tikka", price: 220, category: "Starters", description: "Charred over coals with a smoked yogurt marinade.", image: "", available: true },
  { foodId: "FOOD-DEMO02", foodName: "Ember Naan", price: 60, category: "Starters", description: "Puffed straight in the clay oven.", image: "", available: true },
  { foodId: "FOOD-DEMO03", foodName: "Charcoal Dal Makhani", price: 260, category: "Mains", description: "24-hour slow-simmered black lentils.", image: "", available: true }
];
const DEMO_ORDERS = [
  { orderId: "ORD-A1B2C3D4E5", customerName: "Ananya Rao", phone: "9876543210", address: "12 MG Road, Pune", status: "Preparing", total: 640, foodItems: [{ name: "Smoked Paneer Tikka", qty: 2, price: 220 }], createdAt: new Date(Date.now() - 6 * 60000).toISOString() }
];
const DEMO_CUSTOMERS = [
  { name: "Ananya Rao", phone: "9876543210", email: "ananya@example.com", address: "12 MG Road, Pune", createdAt: new Date(Date.now() - 40 * 86400000).toISOString() }
];
function demoDashboard() {
  const d = { totalOrders: 0, pending: 0, accepted: 0, preparing: 0, ready: 0, outForDelivery: 0, delivered: 0, cancelled: 0, revenue: 0 };
  DEMO_ORDERS.forEach(o => {
    d.totalOrders++;
    const key = { Pending: "pending", Accepted: "accepted", Preparing: "preparing", Ready: "ready", "Out For Delivery": "outForDelivery", Delivered: "delivered", Cancelled: "cancelled" }[o.status];
    if (key) d[key]++;
    if (o.status === "Delivered") d.revenue += o.total;
  });
  return { dashboard: d };
}
function demoAnalytics() {
  const foodSales = {};
  const customers = new Set();
  DEMO_ORDERS.forEach(o => { if (o.phone) customers.add(o.phone); (o.foodItems || []).forEach(f => (foodSales[f.name] = (foodSales[f.name] || 0) + f.qty)); });
  return { analytics: { orders: DEMO_ORDERS.length, customers: customers.size, topFoods: Object.entries(foodSales).sort((a, b) => b[1] - a[1]).slice(0, 10) } };
}

// ============================================================
// STATE
// ============================================================
const state = { orders: [], menu: [], customers: [], currentOrderId: null };

// ============================================================
// GATE (real backend login)
// ============================================================
function showGate(message) {
  $("#adminShell").hidden = true;
  $("#gate").hidden = false;
  $("#gateNote").textContent = message || "";
  $("#gatePasscode").value = "";
  $("#gatePasscode").focus();
}

function initGate() {
  $("#gateForm").addEventListener("submit", async e => {
    e.preventDefault();
    const passcode = $("#gatePasscode").value;
    const note = $("#gateNote");
    const btn = $("#gateForm").querySelector("button[type=submit]");
    note.textContent = "";

    if (!apiReady()) {
      note.textContent = "Set CONFIG.API_BASE in config.js before logging in.";
      return;
    }

    btn.disabled = true;
    btn.textContent = "Checking…";
    try {
      const token = await loginRequest(passcode);
      setToken(token);
    } catch (err) {
      console.error("Login failed:", err);
      note.textContent = err.message;
      $("#gatePasscode").value = "";
      $("#gatePasscode").focus();
      btn.disabled = false;
      btn.textContent = "Enter console";
      return;
    }

    // Login succeeded — reveal the shell. Anything that goes wrong from here
    // is surfaced as a toast (visible), not written into the now-hidden gate.
    $("#gate").hidden = true;
    $("#adminShell").hidden = false;
    btn.disabled = false;
    btn.textContent = "Enter console";
    try {
      boot();
    } catch (err) {
      console.error("Dashboard failed to load:", err);
      toast(`Dashboard failed to load: ${err.message}`, "error");
    }
  });

  // If a session token already exists (e.g. page refresh), skip straight in
  // and let the first real API call confirm it's still valid.
  if (getToken() && apiReady()) {
    $("#gate").hidden = true;
    $("#adminShell").hidden = false;
    boot();
  }
}

function initLogout() {
  const foot = $(".admin-sidebar-foot");
  if ($("#logoutBtn")) return;
  const btn = document.createElement("button");
  btn.id = "logoutBtn";
  btn.className = "mini-btn";
  btn.textContent = "Log out";
  btn.style.marginLeft = "auto";
  btn.addEventListener("click", () => {
    clearToken();
    showGate("Logged out.");
  });
  foot.appendChild(btn);
}

// ============================================================
// NAV
// ============================================================
function initNav() {
  $$(".admin-nav-link").forEach(btn => btn.addEventListener("click", () => switchView(btn.dataset.view)));
  $("#refreshBtn").addEventListener("click", () => loadView(currentView()));
}
function currentView() {
  return $(".admin-nav-link.active")?.dataset.view || "overview";
}
function switchView(view) {
  $$(".admin-nav-link").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  $$(".admin-view").forEach(v => (v.hidden = v.id !== `view-${view}`));
  $("#viewTitle").textContent = { overview: "Overview", orders: "Orders", menu: "Menu", customers: "Customers" }[view];
  loadView(view);
}
function loadView(view) {
  if (view === "overview") loadOverview();
  if (view === "orders") loadOrders();
  if (view === "menu") loadMenu();
  if (view === "customers") loadCustomers();
  stampUpdated();
}
function stampUpdated() {
  $("#lastUpdated").textContent = "Updated " + new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function setConnectionIndicator(mode) {
  const dot = $("#liveDot");
  const label = $("#modeLabel");
  if (mode === "live") { dot.className = "live-dot live"; label.textContent = "Connected to API"; }
  else if (mode === "error") { dot.className = "live-dot demo"; label.textContent = "Last request failed"; }
  else { dot.className = "live-dot demo"; label.textContent = "API not configured"; }
}

// ============================================================
// OVERVIEW
// ============================================================
async function loadOverview() {
  await Promise.all([loadDashboardStats(), loadAnalyticsPanel(), loadRecentOrders(), loadTodayOrders()]);
}

async function loadDashboardStats() {
  const res = await fetchWithFallback("/dashboard", {}, demoDashboard);
  renderStatGrid(res ? res.dashboard : { totalOrders: 0, pending: 0, accepted: 0, preparing: 0, ready: 0, outForDelivery: 0, delivered: 0, cancelled: 0, revenue: 0 });
}

function renderStatGrid(d) {
  const cards = [
    { label: "Total orders", value: d.totalOrders, cls: "" },
    { label: "Pending", value: d.pending, cls: "" },
    { label: "Preparing", value: d.preparing, cls: "accent" },
    { label: "Out for delivery", value: d.outForDelivery, cls: "accent" },
    { label: "Delivered", value: d.delivered, cls: "good" },
    { label: "Cancelled", value: d.cancelled, cls: "danger" },
    { label: "Revenue (delivered)", value: money(d.revenue), cls: "good" }
  ];
  $("#statGrid").innerHTML = cards.map(c => `<div class="stat-card ${c.cls}"><span class="stat-label">${c.label}</span><span class="stat-value">${c.value}</span></div>`).join("");
}

async function loadAnalyticsPanel() {
  const res = await fetchWithFallback("/analytics", {}, demoAnalytics);
  const a = res ? res.analytics : { topFoods: [] };
  const list = $("#topFoods");
  const max = Math.max(1, ...(a.topFoods || []).map(f => f[1]));
  list.innerHTML = (a.topFoods && a.topFoods.length)
    ? a.topFoods.map(([name, qty], i) => `
        <li>
          <span class="rank">${i + 1}</span>
          <span style="flex:0 0 auto; min-width:120px;">${name}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${(qty / max) * 100}%"></span></span>
          <span class="qty">${qty}</span>
        </li>`).join("")
    : `<li class="panel-empty">No sales data yet.</li>`;
}

async function loadRecentOrders() {
  const res = await fetchWithFallback("/last5minutes", {}, () => ({ orders: [] }));
  renderMiniOrders("#recentOrders", res ? res.orders : [], "Nothing fired in the last 5 minutes.");
}

async function loadTodayOrders() {
  const res = await fetchWithFallback("/today", {}, () => ({ orders: [] }));
  renderMiniOrders("#todayOrders", res ? res.orders : [], "No orders yet today.");
}

function renderMiniOrders(sel, orders, emptyMsg) {
  const el = $(sel);
  if (!orders || orders.length === 0) {
    el.innerHTML = `<p class="panel-empty">${emptyMsg}</p>`;
    return;
  }
  el.innerHTML = orders.map(o => `<div class="mini-order-row"><span class="mo-name">${o.customerName || "Guest"} · ${money(o.total)}</span><span class="mo-meta">${o.status}</span></div>`).join("");
}

function initRevenueForm() {
  $("#revenueMonth").value = new Date().toISOString().slice(0, 7);
  $("#revenueForm").addEventListener("submit", async e => {
    e.preventDefault();
    const month = $("#revenueMonth").value;
    const resultEl = $("#revenueResult");
    if (!month) return;
    resultEl.textContent = "Looking up…";
    const res = await fetchWithFallback(`/revenue?month=${encodeURIComponent(month)}`, {}, () => ({ revenue: 0, deliveredOrders: 0 }));
    if (!res) { resultEl.textContent = "Couldn't load revenue for that month."; return; }
    resultEl.innerHTML = `<strong>${money(res.revenue)}</strong> from ${res.deliveredOrders} delivered order${res.deliveredOrders === 1 ? "" : "s"} in ${month}.`;
  });
}

// ============================================================
// ORDERS
// ============================================================
function initOrdersToolbar() {
  const select = $("#orderStatusFilter");
  select.innerHTML = `<option value="">All statuses</option>` + ALL_STATUSES.map(s => `<option value="${s}">${s}</option>`).join("");
  select.addEventListener("change", () => loadOrders());
  $("#orderSearchBtn").addEventListener("click", () => loadOrders());
  $("#orderSearch").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); loadOrders(); } });
}

async function loadOrders() {
  const status = $("#orderStatusFilter").value;
  const keyword = $("#orderSearch").value.trim();

  let res;
  if (keyword) {
    res = await fetchWithFallback(`/search?q=${encodeURIComponent(keyword)}`, {}, () => ({ orders: DEMO_ORDERS.filter(o => o.customerName.toLowerCase().includes(keyword.toLowerCase())) }));
  } else if (status) {
    res = await fetchWithFallback(`/orders/status?status=${encodeURIComponent(status)}`, {}, () => ({ orders: DEMO_ORDERS.filter(o => o.status === status) }));
  } else {
    res = await fetchWithFallback("/orders", {}, () => ({ orders: DEMO_ORDERS }));
  }

  const orders = res ? res.orders : [];
  state.orders = orders;
  renderOrdersTable(orders);
}

function renderOrdersTable(orders) {
  const body = $("#ordersBody");
  const emptyEl = $("#ordersEmpty");
  if (!orders || orders.length === 0) {
    body.innerHTML = "";
    emptyEl.textContent = "No orders match this filter.";
    return;
  }
  emptyEl.textContent = "";
  body.innerHTML = orders.map(o => `
      <tr class="clickable" data-id="${o.orderId}">
        <td><code>${o.orderId}</code></td>
        <td>${o.customerName || "—"}</td>
        <td>${o.phone || "—"}</td>
        <td>${(o.foodItems || []).length}</td>
        <td class="row-total">${money(o.total)}</td>
        <td><span class="status-pill ${o.status === "Delivered" ? "delivered" : o.status === "Cancelled" ? "cancelled" : ""}">${o.status}</span></td>
        <td>${o.createdAt ? new Date(o.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
        <td class="table-row-actions" onclick="event.stopPropagation()">
          <button class="mini-btn danger" data-delete="${o.orderId}">Delete</button>
        </td>
      </tr>
    `).join("");

  $$("tr.clickable", body).forEach(row => row.addEventListener("click", () => openOrderModal(row.dataset.id)));
  $$("[data-delete]", body).forEach(btn => btn.addEventListener("click", () => deleteOrder(btn.dataset.delete)));
}

async function openOrderModal(orderId) {
  state.currentOrderId = orderId;

  const orderRes = await fetchWithFallback(`/orders/${encodeURIComponent(orderId)}`, {}, () => ({ order: state.orders.find(o => o.orderId === orderId) }));
  const order = orderRes ? orderRes.order : state.orders.find(o => o.orderId === orderId);
  if (!order) { toast("Couldn't load that order.", "error"); return; }

  const histRes = await fetchWithFallback(`/history/${encodeURIComponent(orderId)}`, {}, () => ({ history: [] }));
  const history = histRes ? histRes.history : [];

  $("#orderModalTitle").textContent = order.orderId;
  $("#orderModalEyebrow").textContent = order.status;
  const items = (order.foodItems || []).map(f => `<li><span>${f.qty || 1}× ${f.name}</span><span>${money((f.qty || 1) * (f.price || 0))}</span></li>`).join("");
  $("#orderModalBody").innerHTML = `
    <div class="order-detail-row"><span>Customer</span><span>${order.customerName}</span></div>
    <div class="order-detail-row"><span>Phone</span><span>${order.phone}</span></div>
    <div class="order-detail-row"><span>Address</span><span>${order.address}</span></div>
    <div class="order-detail-row"><span>Payment</span><span>${order.paymentStatus || "Pending"}</span></div>
    ${order.imageUrl ? `<div class="order-detail-row"><span>Reference image</span><span><a href="${order.imageUrl}" target="_blank" style="color:var(--saffron)">View</a></span></div>` : ""}
    <ul class="order-detail-items">${items}</ul>
    <div class="order-detail-row" style="border-top:1px solid var(--line); padding-top:.6rem;"><span>Total</span><span style="color:var(--saffron); font-family:var(--font-mono);">${money(order.total)}</span></div>
    ${history.length ? `<div class="order-detail-row" style="flex-direction:column; align-items:stretch; gap:.3rem;"><span>History</span>${history.map(h => `<span style="font-size:.8rem;">${h.status} — ${new Date(h.time).toLocaleString()}</span>`).join("")}</div>` : ""}
  `;

  const statusSelect = $("#orderStatusSelect");
  statusSelect.innerHTML = ALL_STATUSES.map(s => `<option value="${s}" ${s === order.status ? "selected" : ""}>${s}</option>`).join("");

  renderEmberTrail($("#orderModalTrail"), order.status);
  $("#orderModalNote").textContent = "";
  $("#orderModalBackdrop").classList.add("show");
  $("#orderModal").classList.add("open");
}

function closeOrderModal() {
  $("#orderModalBackdrop").classList.remove("show");
  $("#orderModal").classList.remove("open");
}

function renderEmberTrail(container, currentStatus) {
  container.innerHTML = "";
  const cancelled = currentStatus === "Cancelled";
  const currentIndex = STATUS_FLOW.indexOf(currentStatus);
  STATUS_FLOW.forEach((step, i) => {
    let cls = "ember-step";
    if (cancelled) cls += i === 0 ? " done" : "";
    else if (i < currentIndex) cls += " done";
    else if (i === currentIndex) cls += " current";
    const el = document.createElement("div");
    el.className = cls;
    el.innerHTML = `<div class="ember-line"></div><div class="ember-node"></div><div class="ember-label">${step}</div>`;
    container.appendChild(el);
  });
}

async function saveOrderStatus() {
  const status = $("#orderStatusSelect").value;
  const note = $("#orderModalNote");
  const btn = $("#orderStatusSaveBtn");
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    if (!apiReady()) throw new Error("Set CONFIG.API_BASE in config.js first.");
    await apiFetch(`/orders/${encodeURIComponent(state.currentOrderId)}`, { method: "PUT", body: JSON.stringify({ status }) });
    note.className = "form-note";
    note.textContent = "Status updated.";
    toast(`Order marked ${status}`);
    renderEmberTrail($("#orderModalTrail"), status);
    loadOrders();
  } catch (err) {
    note.className = "form-note error";
    note.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Save status";
  }
}

async function deleteOrder(orderId) {
  if (!confirm(`Delete order ${orderId}? This can't be undone.`)) return;
  try {
    if (!apiReady()) throw new Error("Set CONFIG.API_BASE in config.js first.");
    await apiFetch(`/orders/${encodeURIComponent(orderId)}`, { method: "DELETE" });
    toast("Order deleted");
    closeOrderModal();
    loadOrders();
  } catch (err) {
    toast(err.message, "error");
  }
}

function initOrderModal() {
  $("#orderModalClose").addEventListener("click", closeOrderModal);
  $("#orderModalBackdrop").addEventListener("click", closeOrderModal);
  $("#orderStatusSaveBtn").addEventListener("click", saveOrderStatus);
  $("#orderDeleteBtn").addEventListener("click", () => deleteOrder(state.currentOrderId));
}

// ============================================================
// MENU (with real image upload)
// ============================================================
let pendingMenuImageBase64 = null;
let pendingMenuImageExt = null;
let editingFoodId = null;

async function loadMenu() {
  const res = await fetchWithFallback("/menu", {}, () => ({ menu: DEMO_MENU }));
  const items = res ? res.menu : [];
  state.menu = items;
  renderAdminMenuGrid(items);
  const cats = [...new Set(items.map(i => i.category || "Other"))];
  $("#categoryList").innerHTML = cats.map(c => `<option value="${c}">`).join("");
  $("#menuCount").textContent = `${items.length} dish${items.length === 1 ? "" : "es"} on the board`;
}

function renderAdminMenuGrid(items) {
  const grid = $("#adminMenuGrid");
  if (!items || items.length === 0) {
    grid.innerHTML = `<p class="panel-empty">No dishes yet — add your first one.</p>`;
    return;
  }
  grid.innerHTML = items.map(item => `
    <div class="admin-dish-card" data-id="${item.foodId}">
      <div class="admin-dish-media">
        ${item.image ? `<img src="${item.image}" alt="${item.foodName}">` : `<span class="dish-emoji">🍽️</span>`}
        ${item.available === false ? `<div class="unavail-flag">Unavailable</div>` : ""}
      </div>
      <div class="admin-dish-body">
        <span class="admin-dish-name">${item.foodName}</span>
        <div class="admin-dish-meta"><span>${money(item.price)}</span><span class="admin-dish-cat">${item.category || "Other"}</span></div>
        <div class="admin-dish-actions">
          <button class="mini-btn" data-edit="${item.foodId}">Edit</button>
          <button class="mini-btn" data-toggle="${item.foodId}">${item.available === false ? "Mark available" : "Mark 86'd"}</button>
          <button class="mini-btn danger" data-remove="${item.foodId}">Delete</button>
        </div>
      </div>
    </div>
  `).join("");

  $$("[data-edit]", grid).forEach(b => b.addEventListener("click", () => startEditMenu(b.dataset.edit)));
  $$("[data-toggle]", grid).forEach(b => b.addEventListener("click", () => toggleAvailability(b.dataset.toggle)));
  $$("[data-remove]", grid).forEach(b => b.addEventListener("click", () => deleteMenuItem(b.dataset.remove)));
}

function startEditMenu(foodId) {
  const item = state.menu.find(m => m.foodId === foodId);
  if (!item) return;
  editingFoodId = foodId;
  $("#menuFoodId").value = foodId;
  $("#menuName").value = item.foodName;
  $("#menuPrice").value = item.price;
  $("#menuCategory").value = item.category || "";
  $("#menuDescription").value = item.description || "";
  $("#menuAvailable").checked = item.available !== false;
  $("#menuFilePreview").innerHTML = item.image
    ? `<img src="${item.image}" alt=""><span class="file-preview-hint">Current photo — upload a new one to replace it</span>`
    : `<span class="file-preview-hint">No photo yet — uploads to /upload</span>`;
  $("#menuFormTitle").textContent = `Editing: ${item.foodName}`;
  $("#menuSubmitBtn").textContent = "Save changes";
  $("#menuCancelEdit").hidden = false;
  pendingMenuImageBase64 = null;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetMenuForm() {
  editingFoodId = null;
  pendingMenuImageBase64 = null;
  pendingMenuImageExt = null;
  $("#menuForm").reset();
  $("#menuFoodId").value = "";
  $("#menuFilePreview").innerHTML = `<span class="file-preview-hint">Uploads to your S3 bucket via /upload</span>`;
  $("#menuFormTitle").textContent = "Add a dish";
  $("#menuSubmitBtn").textContent = "Add dish";
  $("#menuCancelEdit").hidden = true;
  $("#menuFormNote").textContent = "";
}

function initMenuForm() {
  $("#menuImageInput").addEventListener("change", () => {
    const file = $("#menuImageInput").files[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { toast("Image is over 4MB — try a smaller photo", "error"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      pendingMenuImageBase64 = result.split(",")[1];
      pendingMenuImageExt = (file.name.split(".").pop() || "png").toLowerCase();
      $("#menuFilePreview").innerHTML = `<img src="${result}" alt=""><span class="file-preview-hint">${file.name}</span>`;
    };
    reader.readAsDataURL(file);
  });

  $("#menuCancelEdit").addEventListener("click", resetMenuForm);

  $("#menuForm").addEventListener("submit", async e => {
    e.preventDefault();
    const note = $("#menuFormNote");
    const btn = $("#menuSubmitBtn");
    note.className = "form-note";
    note.textContent = "";

    const payload = {
      foodName: $("#menuName").value.trim(),
      price: Number($("#menuPrice").value),
      category: $("#menuCategory").value.trim() || "Other",
      description: $("#menuDescription").value.trim(),
      available: $("#menuAvailable").checked
    };
    if (!payload.foodName) return;

    btn.disabled = true;
    btn.textContent = editingFoodId ? "Saving…" : "Uploading & adding…";

    try {
      if (!apiReady()) throw new Error("Set CONFIG.API_BASE in config.js first.");

      if (pendingMenuImageBase64) {
        const uploadRes = await apiFetch("/upload", { method: "POST", body: JSON.stringify({ image: pendingMenuImageBase64, extension: pendingMenuImageExt }) });
        payload.image = uploadRes.imageUrl;
      }

      if (editingFoodId) {
        await apiFetch(`/menu/${encodeURIComponent(editingFoodId)}`, { method: "PUT", body: JSON.stringify(payload) });
        toast("Dish updated");
      } else {
        await apiFetch("/menu", { method: "POST", body: JSON.stringify(payload) });
        toast("Dish added to the board");
      }
      resetMenuForm();
      loadMenu();
    } catch (err) {
      note.className = "form-note error";
      note.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = editingFoodId ? "Save changes" : "Add dish";
    }
  });
}

async function toggleAvailability(foodId) {
  const item = state.menu.find(m => m.foodId === foodId);
  if (!item) return;
  try {
    if (!apiReady()) throw new Error("Set CONFIG.API_BASE in config.js first.");
    await apiFetch(`/menu/${encodeURIComponent(foodId)}`, { method: "PUT", body: JSON.stringify({ available: !(item.available !== false) }) });
    toast("Availability updated");
    loadMenu();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function deleteMenuItem(foodId) {
  if (!confirm("Remove this dish from the board?")) return;
  try {
    if (!apiReady()) throw new Error("Set CONFIG.API_BASE in config.js first.");
    await apiFetch(`/menu/${encodeURIComponent(foodId)}`, { method: "DELETE" });
    toast("Dish removed");
    loadMenu();
  } catch (err) {
    toast(err.message, "error");
  }
}

// ============================================================
// CUSTOMERS
// ============================================================
async function loadCustomers() {
  const res = await fetchWithFallback("/customers", {}, () => ({ customers: DEMO_CUSTOMERS }));
  const customers = res ? res.customers : [];
  state.customers = customers;
  const body = $("#customersBody");
  const emptyEl = $("#customersEmpty");
  if (!customers || customers.length === 0) {
    body.innerHTML = "";
    emptyEl.textContent = "No customers yet.";
    return;
  }
  emptyEl.textContent = "";
  body.innerHTML = customers.map(c => `
    <tr>
      <td>${c.name}</td>
      <td>${c.phone}</td>
      <td>${c.email || "—"}</td>
      <td>${c.address}</td>
      <td>${c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-IN") : "—"}</td>
    </tr>
  `).join("");
}

// ============================================================
// BOOT
// ============================================================
function boot() {
  initNav();
  initLogout();
  initRevenueForm();
  initOrdersToolbar();
  initOrderModal();
  initMenuForm();
  switchView("overview");

  setInterval(() => { if (currentView() === "overview") loadOverview(); }, 20000);
}

document.addEventListener("DOMContentLoaded", initGate);