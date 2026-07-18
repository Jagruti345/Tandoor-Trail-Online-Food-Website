// CONFIG and STATUS_FLOW now live in config.js (shared with admin.js) — loaded before this file.

// ============================================================
// DEMO DATA (used until CONFIG.API_BASE is live, or if a call fails)
// ============================================================
const DEMO_MENU = [
  { foodId: "FOOD-DEMO01", foodName: "Smoked Paneer Tikka", price: 220, category: "Starters", description: "Charred over coals with a smoked yogurt marinade and kasundi drizzle.", emoji: "🔥", available: true },
  { foodId: "FOOD-DEMO02", foodName: "Ember Naan", price: 60, category: "Starters", description: "Puffed straight in the clay oven, brushed with garlic butter.", emoji: "🫓", available: true },
  { foodId: "FOOD-DEMO03", foodName: "Charcoal Dal Makhani", price: 260, category: "Mains", description: "24-hour slow-simmered black lentils, finished with a live-coal smoke.", emoji: "🍲", available: true },
  { foodId: "FOOD-DEMO04", foodName: "Tandoori Chicken Leg", price: 320, category: "Mains", description: "Marinated two ways, roasted until the skin blisters.", emoji: "🍗", available: true },
  { foodId: "FOOD-DEMO05", foodName: "Smoky Lamb Galouti", price: 380, category: "Mains", description: "Melt-in-mouth minced lamb kebab, pan-seared on a tawa.", emoji: "🥘", available: true },
  { foodId: "FOOD-DEMO06", foodName: "Street Pav Bhaji", price: 150, category: "Street Food", description: "Butter-loaded mash, griddled pav, a squeeze of lime.", emoji: "🍞", available: true },
  { foodId: "FOOD-DEMO07", foodName: "Vada Pav", price: 60, category: "Street Food", description: "Spiced potato fritter, garlic chutney, straight off the cart.", emoji: "🌶️", available: true },
  { foodId: "FOOD-DEMO08", foodName: "Kulfi Falooda", price: 140, category: "Desserts", description: "Saffron-pistachio kulfi over rose falooda noodles.", emoji: "🍧", available: true },
  { foodId: "FOOD-DEMO09", foodName: "Gulab Jamun (2pc)", price: 90, category: "Desserts", description: "Warm, syrup-soaked, finished with a pinch of cardamom.", emoji: "🍩", available: true },
  { foodId: "FOOD-DEMO10", foodName: "Masala Chaas", price: 50, category: "Drinks", description: "Spiced buttermilk, chilled, with a curry-leaf tempering.", emoji: "🥛", available: true },
  { foodId: "FOOD-DEMO11", foodName: "Fresh Sugarcane Juice", price: 70, category: "Drinks", description: "Pressed to order with ginger and lime.", emoji: "🧃", available: true },
  { foodId: "FOOD-DEMO12", foodName: "Bheega Kebab Platter", price: 450, category: "Starters", description: "Chef's seasonal selection — ask what's fresh off the fire today.", emoji: "🍢", available: false }
];

let isDemoMode = false;

const CUSTOMER_TOKEN_KEY = "tandoor_customer_token";
const CUSTOMER_PROFILE_KEY = "tandoor_customer_profile";

function getCustomerToken() { return localStorage.getItem(CUSTOMER_TOKEN_KEY); }
function getCustomerProfile() {
  try { return JSON.parse(localStorage.getItem(CUSTOMER_PROFILE_KEY) || "null"); } catch { return null; }
}
function setCustomerSession(token, profile) {
  localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
  localStorage.setItem(CUSTOMER_PROFILE_KEY, JSON.stringify(profile));
}
function clearCustomerSession() {
  localStorage.removeItem(CUSTOMER_TOKEN_KEY);
  localStorage.removeItem(CUSTOMER_PROFILE_KEY);
}
function isLoggedIn() { return !!getCustomerToken(); }

// ============================================================
// STATE
// ============================================================
const state = {
  menu: [],
  activeCategory: "All",
  searchQuery: "",
  cart: [], // { id, name, price, qty, image? , custom? }
  customImageBase64: null,
  customImageExt: null
};

// Deterministic "realistic" rating/ETA per dish so it stays stable across renders
// without needing extra backend fields.
function pseudoRating(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const rating = (4.2 + (h % 71) / 100).toFixed(1); // 4.2–4.9
  const eta = 18 + (h % 18); // 18–35 min
  return { rating, eta };
}

// ============================================================
// SMALL UTILS
// ============================================================
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const money = n => "₹" + Number(n || 0).toLocaleString("en-IN");
const uid = () => "c" + Math.random().toString(36).slice(2, 10);

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

async function apiFetch(path, options = {}) {
  const url = `${CONFIG.API_BASE}${path}`;
  const token = getCustomerToken();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token && options.auth !== false) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && options.auth !== false) {
    clearCustomerSession();
    updateAccountUI();
  }
  if (!res.ok || data.success === false) {
    const msg = data.message || data.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

// ============================================================
// MENU
// ============================================================
async function loadMenu() {
  const statusEl = $("#menuStatus");
  statusEl.textContent = "Loading tonight's board…";
  try {
    if (CONFIG.API_BASE.includes("YOUR-API-ID")) throw new Error("API not configured");
    const data = await apiFetch("/menu");
    const items = (data.menu || []).filter(m => m && m.foodName);
    if (items.length === 0) throw new Error("Empty menu");
    state.menu = items;
    isDemoMode = false;
    statusEl.textContent = "";
  } catch (err) {
    state.menu = DEMO_MENU;
    isDemoMode = true;
    statusEl.textContent = "Showing demo menu — connect CONFIG.API_BASE in script.js to load your live board.";
  }
  buildCategoryTabs();
  renderMenu();
}

function buildCategoryTabs() {
  const cats = ["All", ...new Set(state.menu.map(m => m.category || "Other"))];
  const wrap = $("#categoryTabs");
  wrap.innerHTML = "";
  cats.forEach(cat => {
    const btn = document.createElement("button");
    btn.className = "category-tab" + (cat === state.activeCategory ? " active" : "");
    btn.textContent = cat;
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", cat === state.activeCategory ? "true" : "false");
    btn.addEventListener("click", () => {
      state.activeCategory = cat;
      $$(".category-tab", wrap).forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderMenu();
    });
    wrap.appendChild(btn);
  });
}

function renderMenu() {
  const grid = $("#menuGrid");
  grid.innerHTML = "";
  const q = state.searchQuery.trim().toLowerCase();
  const items = state.menu.filter(m => {
    const inCategory = state.activeCategory === "All" || (m.category || "Other") === state.activeCategory;
    const matchesSearch = !q || m.foodName.toLowerCase().includes(q) || (m.description || "").toLowerCase().includes(q);
    return inCategory && matchesSearch;
  });

  items.forEach((item, i) => {
    const card = document.createElement("article");
    card.className = "dish-card" + (item.available === false ? " dish-unavailable" : "");
    const price = Number(item.price) || 0;
    const { rating, eta } = pseudoRating(item.foodName);

    card.innerHTML = `
      <div class="dish-media">
        ${item.image ? `<img src="${item.image}" alt="${item.foodName}">` : `<span class="dish-emoji">${item.emoji || "🍽️"}</span>`}
        <span class="dish-badge">${item.category || "Other"}</span>
        <span class="dish-rating">★ ${rating}</span>
        <span class="dish-eta">${eta} min</span>
      </div>
      <div class="dish-body">
        <h3 class="dish-name">${item.foodName}</h3>
        <p class="dish-desc">${item.description || ""}</p>
        <div class="dish-foot">
          <span class="dish-price">${money(price)}</span>
          <button class="add-btn" aria-label="Add ${item.foodName} to cart" ${item.available === false ? "disabled" : ""}>+</button>
        </div>
      </div>
    `;

    const addBtn = $(".add-btn", card);
    addBtn.addEventListener("click", () => {
      addToCart({ id: item.foodId || uid(), name: item.foodName, price });
      pulse(addBtn);
    });

    grid.appendChild(card);
    requestAnimationFrame(() => setTimeout(() => card.classList.add("in"), i * 40));
  });

  if (items.length === 0) {
    grid.innerHTML = `<p class="menu-status">${q ? `No dishes match "${q}".` : "Nothing in this category right now."}</p>`;
  }
}

function initMenuSearch() {
  const input = $("#menuSearchInput");
  if (!input) return;
  input.addEventListener("input", () => {
    state.searchQuery = input.value;
    renderMenu();
  });
}

function pulse(el) {
  el.style.transform = "scale(1.25)";
  setTimeout(() => (el.style.transform = ""), 160);
}

// ============================================================
// CART
// ============================================================
function addToCart({ id, name, price, custom = false, image = null }) {
  const existing = state.cart.find(c => c.id === id && !custom);
  if (existing) {
    existing.qty += 1;
  } else {
    state.cart.push({ id: id || uid(), name, price, qty: 1, custom, image });
  }
  renderCart();
  toast(`${name} added to your order`);
  openCart();
}

function updateQty(id, delta) {
  const item = state.cart.find(c => c.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    state.cart = state.cart.filter(c => c.id !== id);
  }
  renderCart();
}

function removeItem(id) {
  state.cart = state.cart.filter(c => c.id !== id);
  renderCart();
}

function cartTotal() {
  return state.cart.reduce((sum, c) => sum + c.price * c.qty, 0);
}

function renderCart() {
  const itemsEl = $("#cartItems");
  const footer = $("#cartFooter");
  const emptyEl = $("#cartEmpty");
  const count = state.cart.reduce((n, c) => n + c.qty, 0);
  $("#cartCount").textContent = count;

  itemsEl.innerHTML = "";
  if (state.cart.length === 0) {
    itemsEl.appendChild(emptyEl);
    footer.hidden = true;
    return;
  }
  footer.hidden = false;

  state.cart.forEach(item => {
    const row = document.createElement("div");
    row.className = "cart-item";
    row.innerHTML = `
      <div>
        <div class="cart-item-name">${item.name}${item.custom ? " <span style='color:var(--saffron)'>· custom</span>" : ""}</div>
        <div class="cart-item-price">${money(item.price)} each</div>
        <button class="remove-btn">Remove</button>
      </div>
      <div class="cart-item-controls">
        <button class="qty-btn" data-action="dec">−</button>
        <span class="qty-val">${item.qty}</span>
        <button class="qty-btn" data-action="inc">+</button>
      </div>
    `;
    $(".remove-btn", row).addEventListener("click", () => removeItem(item.id));
    $("[data-action='inc']", row).addEventListener("click", () => updateQty(item.id, 1));
    $("[data-action='dec']", row).addEventListener("click", () => updateQty(item.id, -1));
    itemsEl.appendChild(row);
  });

  $("#cartTotal").textContent = money(cartTotal());
  updateMobileCartBar(count);
}

function updateMobileCartBar(count) {
  const bar = $("#mobileCartBar");
  if (!bar) return;
  if (count > 0) {
    bar.classList.add("show");
    $("#mcbCount").textContent = `${count} item${count === 1 ? "" : "s"}`;
    $("#mcbTotal").textContent = money(cartTotal());
  } else {
    bar.classList.remove("show");
  }
}

function openCart() {
  $("#cartDrawer").classList.add("open");
  $("#drawerBackdrop").classList.add("show");
  $("#cartToggle").setAttribute("aria-expanded", "true");
}
function closeCart() {
  $("#cartDrawer").classList.remove("open");
  $("#drawerBackdrop").classList.remove("show");
  $("#cartToggle").setAttribute("aria-expanded", "false");
}

// ============================================================
// CUSTOM DISH REQUEST (uses /upload then adds to cart)
// ============================================================
function initCustomForm() {
  const fileInput = $("#customImage");
  const preview = $("#filePreview");

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast("Image is over 4MB — try a smaller photo", "error");
      fileInput.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result; // data:image/png;base64,....
      const [, meta, b64] = result.match(/^data:(.+);base64,(.*)$/) || [];
      state.customImageBase64 = b64;
      state.customImageExt = (file.name.split(".").pop() || "png").toLowerCase();
      preview.innerHTML = `<img src="${result}" alt="Preview"><span class="file-preview-hint">${file.name}</span>`;
    };
    reader.readAsDataURL(file);
  });

  $("#customForm").addEventListener("submit", async e => {
    e.preventDefault();
    const desc = $("#customDesc").value.trim();
    const note = $("#customNote");
    const btn = $("#customSubmitBtn");
    if (!desc) return;

    btn.disabled = true;
    btn.textContent = "Adding…";
    note.textContent = "";
    note.className = "form-note";

    let imageUrl = "";
    try {
      if (state.customImageBase64 && !CONFIG.API_BASE.includes("YOUR-API-ID")) {
        const uploadRes = await apiFetch("/upload", {
          method: "POST",
          body: JSON.stringify({ image: state.customImageBase64, extension: state.customImageExt })
        });
        imageUrl = uploadRes.imageUrl || "";
      }
      addToCart({ id: uid(), name: `Custom: ${desc.slice(0, 40)}${desc.length > 40 ? "…" : ""}`, price: 0, custom: true, image: imageUrl });
      note.textContent = "Added — we'll quote the price before firing it up.";
      $("#customForm").reset();
      $("#filePreview").innerHTML = `<span class="file-preview-hint">PNG or JPG, under 4MB</span>`;
      state.customImageBase64 = null;
    } catch (err) {
      note.textContent = `Couldn't upload the photo: ${err.message}. Added without it.`;
      note.className = "form-note error";
      addToCart({ id: uid(), name: `Custom: ${desc.slice(0, 40)}`, price: 0, custom: true });
    } finally {
      btn.disabled = false;
      btn.textContent = "Add custom request to cart";
    }
  });
}

// ============================================================
// CHECKOUT
// ============================================================
function openCheckout() {
  if (state.cart.length === 0) {
    toast("Your cart is empty", "error");
    return;
  }
  renderCheckoutSummary();
  prefillCheckoutFromProfile();
  closeCart();
  $("#checkoutBackdrop").classList.add("show");
  $("#checkoutModal").classList.add("open");
}
function closeCheckout() {
  $("#checkoutBackdrop").classList.remove("show");
  $("#checkoutModal").classList.remove("open");
}

function renderCheckoutSummary() {
  const el = $("#modalSummary");
  el.innerHTML = state.cart
    .map(c => `<div><span>${c.qty}× ${c.name}</span></div>`)
    .join("");
  el.innerHTML += `<div class="summary-total">TOTAL &nbsp; ${money(cartTotal())}</div>`;
}

function initCheckout() {
  $("#checkoutOpenBtn").addEventListener("click", openCheckout);
  $("#checkoutClose").addEventListener("click", closeCheckout);
  $("#checkoutBackdrop").addEventListener("click", closeCheckout);

  $("#checkoutForm").addEventListener("submit", async e => {
    e.preventDefault();
    const note = $("#checkoutNote");
    const btn = $("#placeOrderBtn");
    note.textContent = "";
    note.className = "form-note";

    const payload = {
      customerName: $("#ckName").value.trim(),
      phone: $("#ckPhone").value.trim(),
      address: $("#ckAddress").value.trim(),
      paymentStatus: $("#ckPayment").value,
      foodItems: state.cart.map(c => ({ name: c.name, price: c.price, qty: c.qty })),
      imageUrl: (state.cart.find(c => c.image)?.image) || ""
    };

    if (!payload.customerName || !payload.phone || !payload.address) return;

    btn.disabled = true;
    btn.textContent = "Sending to kitchen…";

    try {
      if (CONFIG.API_BASE.includes("YOUR-API-ID")) throw new Error("demo");
      const data = await apiFetch("/orders", { method: "POST", body: JSON.stringify(payload) });
      showConfirmation(data.order?.orderId || "ORD-UNKNOWN", "Pending");
    } catch (err) {
      // Demo fallback: fabricate an order so the flow is fully explorable offline
      const fakeId = "ORD-" + Math.random().toString(36).slice(2, 12).toUpperCase();
      showConfirmation(fakeId, "Pending");
      if (err.message !== "demo") toast(`Order sent in demo mode (${err.message})`, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Place order";
      state.cart = [];
      renderCart();
      $("#checkoutForm").reset();
      closeCheckout();
    }
  });
}

// ============================================================
// EMBER TRAIL (shared render for confirmation + tracking)
// ============================================================
function renderEmberTrail(container, currentStatus) {
  container.innerHTML = "";
  const cancelled = currentStatus === "Cancelled";
  const currentIndex = STATUS_FLOW.indexOf(currentStatus);

  STATUS_FLOW.forEach((step, i) => {
    const stepEl = document.createElement("div");
    let cls = "ember-step";
    if (cancelled) {
      cls += i === 0 ? " done" : "";
    } else if (i < currentIndex) cls += " done";
    else if (i === currentIndex) cls += " current";
    stepEl.className = cls;
    stepEl.innerHTML = `<div class="ember-line"></div><div class="ember-node"></div><div class="ember-label">${step}</div>`;
    container.appendChild(stepEl);
  });

  if (cancelled) {
    const note = document.createElement("p");
    note.className = "form-note error";
    note.style.textAlign = "center";
    note.style.marginTop = ".8rem";
    note.textContent = "This order was cancelled.";
    container.appendChild(note);
  }
}

function showConfirmation(orderId, status) {
  $("#confirmOrderId").textContent = orderId;
  renderEmberTrail($("#confirmTrail"), status);
  $("#confirmBackdrop").classList.add("show");
  $("#confirmModal").classList.add("open");
  $("#confirmModal").dataset.orderId = orderId;
}
function closeConfirm() {
  $("#confirmBackdrop").classList.remove("show");
  $("#confirmModal").classList.remove("open");
}

// ============================================================
// TRACK ORDER
// ============================================================
function initTrack() {
  $("#trackForm").addEventListener("submit", async e => {
    e.preventDefault();
    const query = $("#trackInput").value.trim();
    const resultEl = $("#trackResult");
    if (!query) return;
    resultEl.innerHTML = `<p class="track-empty">Searching the trail…</p>`;

    const looksLikeOrderId = /^ORD-/i.test(query);

    try {
      if (CONFIG.API_BASE.includes("YOUR-API-ID")) throw new Error("demo");

      if (looksLikeOrderId) {
        const data = await apiFetch(`/orders/${encodeURIComponent(query)}`);
        renderTrackResult(data.order);
      } else {
        const data = await apiFetch(`/customer/orders?phone=${encodeURIComponent(query)}`);
        if (!data.orders || data.orders.length === 0) throw new Error("No orders found for that phone number");
        renderTrackResult(data.orders[data.orders.length - 1]);
      }
    } catch (err) {
      if (err.message === "demo") {
        renderTrackResult({
          orderId: looksLikeOrderId ? query : "ORD-DEMO000001",
          customerName: "Demo Customer",
          status: "Preparing",
          total: 640,
          foodItems: [
            { name: "Smoked Paneer Tikka", qty: 2, price: 220 },
            { name: "Charcoal Dal Makhani", qty: 1, price: 260 },
            { name: "Ember Naan", qty: 1, price: 60 }
          ],
          createdAt: new Date().toISOString()
        });
        toast("Showing a demo order — connect your API to track real orders", "error");
      } else {
        resultEl.innerHTML = `<p class="track-error">${err.message}</p>`;
      }
    }
  });
}

function renderTrackResult(order) {
  const resultEl = $("#trackResult");
  if (!order) {
    resultEl.innerHTML = `<p class="track-error">Order not found.</p>`;
    return;
  }
  const statusClass = order.status === "Delivered" ? "delivered" : order.status === "Cancelled" ? "cancelled" : "";
  const items = (order.foodItems || [])
    .map(f => `<li><span>${f.qty || 1}× ${f.name || "Item"}</span><span>${money((f.qty || 1) * (f.price || 0))}</span></li>`)
    .join("");
  const cancellable = ["Pending", "Accepted"].includes(order.status);

  resultEl.innerHTML = `
    <div class="track-card">
      <div class="track-card-head">
        <div>
          <h4>${order.orderId}</h4>
          <p class="track-meta">${order.customerName || ""} · ${order.createdAt ? new Date(order.createdAt).toLocaleString() : ""}</p>
        </div>
        <span class="status-pill ${statusClass}">${order.status}</span>
      </div>
      <ul class="track-items">${items}</ul>
      <div class="track-card-head" style="border-top:1px solid var(--line); padding-top:1rem;">
        <span style="color:var(--muted)">Total</span>
        <span style="font-family:var(--font-mono); color:var(--saffron); font-weight:600;">${money(order.total)}</span>
      </div>
      <div class="ember-trail" id="liveTrail"></div>
      ${cancellable ? `<button class="btn btn-ghost btn-block" id="trackCancelBtn">Cancel this order</button>` : ""}
    </div>
  `;
  renderEmberTrail($("#liveTrail"), order.status);

  if (cancellable) {
    $("#trackCancelBtn").addEventListener("click", () => cancelOrder(order.orderId, order.phone));
  }
}

async function cancelOrder(orderId, phone) {
  if (!confirm(`Cancel order ${orderId}? This can't be undone.`)) return;
  try {
    await apiFetch(`/orders/${encodeURIComponent(orderId)}/cancel`, {
      method: "PUT",
      auth: false,
      body: JSON.stringify({ phone })
    });
    toast("Order cancelled");
    // refresh whichever view is showing this order
    if ($("#trackInput") && $("#trackInput").value.trim()) {
      $("#trackForm").dispatchEvent(new Event("submit"));
    }
    if (isLoggedIn() && !$("#accountDashboardView").hidden) {
      loadAccountDashboard();
    }
  } catch (err) {
    toast(err.message, "error");
  }
}

// ============================================================
// ACCOUNT (customer login / register / personal dashboard)
// ============================================================
function openAccount() {
  $("#accountBackdrop").classList.add("show");
  $("#accountModal").classList.add("open");
  if (isLoggedIn()) showAccountDashboard();
  else showAccountAuth();
}
function closeAccount() {
  $("#accountBackdrop").classList.remove("show");
  $("#accountModal").classList.remove("open");
}

function showAccountAuth() {
  $("#accountAuthView").hidden = false;
  $("#accountDashboardView").hidden = true;
}
function showAccountDashboard() {
  $("#accountAuthView").hidden = true;
  $("#accountDashboardView").hidden = false;
  loadAccountDashboard();
}

function updateAccountUI() {
  const btn = $("#accountToggle");
  btn.classList.toggle("logged-in", isLoggedIn());
}

function initAccountTabs() {
  $$(".account-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      $$(".account-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const isLogin = tab.dataset.tab === "login";
      $("#loginForm").hidden = !isLogin;
      $("#registerForm").hidden = isLogin;
    });
  });
}

function initAccountModal() {
  $("#accountToggle").addEventListener("click", openAccount);
  $("#accountClose").addEventListener("click", closeAccount);
  $("#accountBackdrop").addEventListener("click", closeAccount);
  $("#logoutBtn").addEventListener("click", () => {
    clearCustomerSession();
    updateAccountUI();
    showAccountAuth();
    toast("Logged out");
  });

  initAccountTabs();

  $("#loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const note = $("#loginNote");
    const btn = $("#loginSubmitBtn");
    note.className = "form-note";
    note.textContent = "";
    const phone = $("#loginPhone").value.trim();
    const password = $("#loginPassword").value;

    btn.disabled = true;
    btn.textContent = "Logging in…";
    try {
      if (CONFIG.API_BASE.includes("YOUR-API-ID")) throw new Error("Set CONFIG.API_BASE in config.js first.");
      const data = await apiFetch("/customer/login", { method: "POST", auth: false, body: JSON.stringify({ phone, password }) });
      setCustomerSession(data.token, data.customer);
      updateAccountUI();
      $("#loginForm").reset();
      showAccountDashboard();
      toast(`Welcome back, ${data.customer.name.split(" ")[0]}`);
    } catch (err) {
      note.className = "form-note error";
      note.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = "Log in";
    }
  });

  $("#registerForm").addEventListener("submit", async e => {
    e.preventDefault();
    const note = $("#registerNote");
    const btn = $("#registerSubmitBtn");
    note.className = "form-note";
    note.textContent = "";

    const payload = {
      name: $("#regName").value.trim(),
      phone: $("#regPhone").value.trim(),
      address: $("#regAddress").value.trim(),
      email: $("#regEmail").value.trim(),
      password: $("#regPassword").value
    };

    btn.disabled = true;
    btn.textContent = "Creating account…";
    try {
      if (CONFIG.API_BASE.includes("YOUR-API-ID")) throw new Error("Set CONFIG.API_BASE in config.js first.");
      const data = await apiFetch("/customers", { method: "POST", auth: false, body: JSON.stringify(payload) });
      setCustomerSession(data.token, data.customer);
      updateAccountUI();
      $("#registerForm").reset();
      showAccountDashboard();
      toast(`Account created — welcome, ${data.customer.name.split(" ")[0]}`);
    } catch (err) {
      note.className = "form-note error";
      note.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = "Create account";
    }
  });
}

async function loadAccountDashboard() {
  const profile = getCustomerProfile();
  $("#accountGreetingName").textContent = profile ? profile.name : "Your account";

  const statsEl = $("#accountStats");
  const ordersEl = $("#accountOrders");
  statsEl.innerHTML = `<div class="stat-card"><span class="stat-label">Loading</span><span class="stat-value">…</span></div>`;
  ordersEl.innerHTML = "";

  try {
    if (CONFIG.API_BASE.includes("YOUR-API-ID")) throw new Error("demo");
    const data = await apiFetch("/customer/dashboard");
    renderAccountStats(data.stats);
    renderAccountOrders(data.orders || []);
  } catch (err) {
    if (err.message !== "demo") toast(err.message, "error");
    renderAccountStats({ totalOrders: 0, active: 0, delivered: 0, totalSpent: 0 });
    ordersEl.innerHTML = `<p class="panel-empty">Couldn't load your orders right now.</p>`;
  }
}

function renderAccountStats(stats) {
  const cards = [
    { label: "Total orders", value: stats.totalOrders },
    { label: "In progress", value: stats.active },
    { label: "Delivered", value: stats.delivered },
    { label: "Total spent", value: money(stats.totalSpent) }
  ];
  $("#accountStats").innerHTML = cards.map(c => `<div class="stat-card"><span class="stat-label">${c.label}</span><span class="stat-value">${c.value}</span></div>`).join("");
}

function renderAccountOrders(orders) {
  const el = $("#accountOrders");
  if (!orders.length) {
    el.innerHTML = `<p class="panel-empty">No orders yet — your first one will show up here.</p>`;
    return;
  }
  el.innerHTML = orders.map(o => {
    const items = (o.foodItems || []).map(f => `${f.qty || 1}× ${f.name}`).join(", ");
    const statusClass = o.status === "Delivered" ? "delivered" : o.status === "Cancelled" ? "cancelled" : "";
    const cancellable = ["Pending", "Accepted"].includes(o.status);
    return `
      <div class="account-order-card">
        <div class="account-order-head">
          <code>${o.orderId}</code>
          <span class="status-pill ${statusClass}">${o.status}</span>
        </div>
        <div class="account-order-meta">${o.createdAt ? new Date(o.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""} · ${money(o.total)}</div>
        <div style="font-size:.85rem; color:var(--muted); margin-bottom:${cancellable ? ".7rem" : "0"};">${items}</div>
        ${cancellable ? `<button class="mini-btn danger" data-cancel-order="${o.orderId}" data-cancel-phone="${o.phone}">Cancel order</button>` : ""}
      </div>
    `;
  }).join("");

  $$("[data-cancel-order]", el).forEach(btn => {
    btn.addEventListener("click", () => cancelOrder(btn.dataset.cancelOrder, btn.dataset.cancelPhone));
  });
}

// Overwrites checkout with a logged-in customer's saved details and locks
// name/phone to the account (address stays editable — delivery spot can
// differ per order). Guests get untouched, empty, fully-editable fields.
function prefillCheckoutFromProfile() {
  const profile = getCustomerProfile();
  const nameField = $("#ckName");
  const phoneField = $("#ckPhone");
  let note = $("#checkoutAccountNote");

  if (!note) {
    note = document.createElement("p");
    note.id = "checkoutAccountNote";
    note.className = "form-note";
    note.style.color = "var(--mint)";
    $("#checkoutForm").insertBefore(note, $("#checkoutForm").firstChild);
  }

  if (profile && isLoggedIn()) {
    nameField.value = profile.name || "";
    phoneField.value = profile.phone || "";
    nameField.readOnly = true;
    phoneField.readOnly = true;
    nameField.style.background = "var(--bg-elev-2)";
    phoneField.style.background = "var(--bg-elev-2)";
    if (!$("#ckAddress").value) $("#ckAddress").value = profile.address || "";
    note.textContent = `Ordering as ${profile.name} — log out to use different details.`;
  } else {
    nameField.readOnly = false;
    phoneField.readOnly = false;
    nameField.style.background = "";
    phoneField.style.background = "";
    note.textContent = "";
  }
}

// ============================================================
// NAV / HEADER INTERACTIONS
// ============================================================
function initNav() {
  const toggle = $("#navToggle");
  const nav = $("#mainNav");
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
  $$("#mainNav a").forEach(a => a.addEventListener("click", () => nav.classList.remove("open")));

  $("#cartToggle").addEventListener("click", () => {
    state.cart.length ? openCart() : (openCart());
  });
  $("#cartClose").addEventListener("click", closeCart);
  $("#drawerBackdrop").addEventListener("click", closeCart);
  const mobileBar = $("#mobileCartBar");
  if (mobileBar) mobileBar.addEventListener("click", openCart);

  $("#confirmClose").addEventListener("click", closeConfirm);
  $("#confirmBackdrop").addEventListener("click", closeConfirm);
  $("#confirmContinueBtn").addEventListener("click", () => {
    closeConfirm();
    $("#menu").scrollIntoView({ behavior: "smooth" });
  });
  $("#confirmTrackBtn").addEventListener("click", () => {
    const id = $("#confirmModal").dataset.orderId;
    closeConfirm();
    $("#trackInput").value = id;
    $("#track").scrollIntoView({ behavior: "smooth" });
    $("#trackForm").dispatchEvent(new Event("submit"));
  });
}

// ============================================================
// HERO STATS + TICKET CLOCK (ambient, non-critical)
// ============================================================
function initHeroFlourish() {
  const timeEl = $("#ticketTime");
  const tick = () => {
    timeEl.textContent = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  };
  tick();
  setInterval(tick, 15000);

  // playful, non-authoritative "dishes plated today" counter
  let n = 180 + Math.floor(Math.random() * 40);
  $("#statOrders").textContent = n;
  setInterval(() => {
    n += Math.random() > 0.5 ? 1 : 0;
    $("#statOrders").textContent = n;
  }, 6000);
}

// ============================================================
// SCROLL REVEAL
// ============================================================
function initReveal() {
  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) entry.target.classList.add("in");
      });
    },
    { threshold: 0.15 }
  );
  $$(".dish-card").forEach(el => observer.observe(el));
}

// ============================================================
// INIT
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  initNav();
  initCheckout();
  initCustomForm();
  initTrack();
  initHeroFlourish();
  initAccountModal();
  initMenuSearch();
  updateAccountUI();
  renderCart();
  loadMenu();
});