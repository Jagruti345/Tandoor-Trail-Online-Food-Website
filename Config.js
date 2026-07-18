// ============================================================
// SHARED CONFIG — used by both script.js (storefront) and admin.js (dashboard)
// ============================================================
const CONFIG = {
  // Example: "https://abc123.execute-api.ap-south-1.amazonaws.com"
  API_BASE: "https://k18mlqhv78.execute-api.ap-south-1.amazonaws.com",

  // If true, screens fall back to bundled demo data whenever a live call fails.
  // Set to false (default) so the dashboard always reflects your real backend —
  // if something's broken, you'll see a real error instead of quiet fake data.
  DEMO_MODE_FALLBACK: false

  // Note: the admin passcode is NOT configured here anymore. It's checked by
  // the Lambda against the ADMIN_PASSCODE environment variable, and the
  // Lambda hands back a signed session token on success. Set ADMIN_PASSCODE
  // and ADMIN_SECRET in the Lambda's environment variables (see lambda_function.py).
};

// Order status flow — mirrors the backend's allowed_status list exactly.
const STATUS_FLOW = ["Pending", "Accepted", "Preparing", "Ready", "Out For Delivery", "Delivered"];
const ALL_STATUSES = [...STATUS_FLOW, "Cancelled"];