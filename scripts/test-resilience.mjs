import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../resilience.js", import.meta.url), "utf8");
const events = new Map();
const stored = new Map([["broken-json", "{not-json"]]);
const counts = { products: 0, retryStatus: 0, createOrder: 0, reportBodies: [] };
const location = {
  origin: "https://mahin98250.github.io",
  hostname: "mahin98250.github.io",
  pathname: "/Dudh-Wallah/checkout.html",
  href: "https://mahin98250.github.io/Dudh-Wallah/checkout.html"
};
const localStorage = {
  getItem(key) { return stored.has(key) ? stored.get(key) : null; },
  setItem(key, value) {
    if (key === "storage-full") throw new Error("quota exceeded");
    stored.set(key, String(value));
  },
  removeItem(key) { stored.delete(key); }
};

async function mockFetch(input, init = {}) {
  const url = new URL(typeof input === "string" ? input : input.url, location.href);
  const method = String(init.method || (typeof input !== "string" && input.method) || "GET").toUpperCase();
  if (url.pathname.endsWith("/functions/v1/client-error-report")) {
    counts.reportBodies.push(JSON.parse(init.body || "{}"));
    return { ok: true, status: 202 };
  }
  if (url.pathname.endsWith("/rest/v1/products")) {
    counts.products++;
    if (counts.products === 1) throw new TypeError("simulated transient network error");
    return { ok: true, status: 200 };
  }
  if (url.pathname.endsWith("/rest/v1/retry-status")) {
    counts.retryStatus++;
    if (counts.retryStatus === 1) return { ok: false, status: 503 };
    return { ok: true, status: 200 };
  }
  if (url.pathname.endsWith("/rest/v1/rpc/create_order")) {
    counts.createOrder++;
    throw new TypeError("simulated write failure");
  }
  return { ok: true, status: 200, method };
}

const window = {
  location,
  navigator: { onLine: true },
  localStorage,
  DOODHWALA_SUPABASE_URL: "https://hmiboyfcvtfawrwujslg.supabase.co",
  DOODHWALA_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
  DOODHWALA_ERROR_REPORT_URL: "https://hmiboyfcvtfawrwujslg.supabase.co/functions/v1/client-error-report",
  fetch: mockFetch,
  console: { info() {}, warn() {}, error() {} },
  addEventListener(name, callback) { events.set(name, callback); },
  setTimeout(callback, _delay) { return setTimeout(callback, 0); },
  clearTimeout(id) { clearTimeout(id); },
  locationReloads: 0
};
const document = {
  body: { appendChild() {} },
  addEventListener() {},
  createElement() {
    return {
      style: {}, dataset: {}, hidden: false, children: [],
      setAttribute() {}, append() {}, appendChild() {}, addEventListener() {},
      querySelector() { return { set textContent(_value) {} }; }
    };
  }
};
vm.runInNewContext(source, {
  window, document, URL, Map, Date, Math, Promise, Number, Object, String, Array, JSON, RegExp, Error,
  setTimeout, clearTimeout
});

const recovery = window.DoodhwalaResilience;
assert.ok(recovery, "resilience layer should bootstrap");
const fallback = {};
assert.equal(recovery.readObjectStorage("broken-json", fallback), fallback, "corrupted stored JSON should recover to a safe default");
assert.equal(recovery.setItem("storage-full", "value"), false, "storage quota errors should not escape");
const readResponse = await recovery.fetch("https://hmiboyfcvtfawrwujslg.supabase.co/rest/v1/products");
assert.equal(readResponse.status, 200, "transient safe-read failure should recover");
assert.equal(counts.products, 2, "safe GET should retry once after a network failure");
const statusResponse = await recovery.fetch("https://hmiboyfcvtfawrwujslg.supabase.co/rest/v1/retry-status", { method: "GET" });
assert.equal(statusResponse.status, 200, "transient 503 safe-read failure should recover");
assert.equal(counts.retryStatus, 2, "safe GET should retry transient server errors");
await assert.rejects(
  recovery.fetch("https://hmiboyfcvtfawrwujslg.supabase.co/rest/v1/rpc/create_order", { method: "POST", body: "{}" }),
  /simulated write failure/
);
assert.equal(counts.createOrder, 1, "order-creation writes must never be automatically retried");
recovery.report("manual_report", "error", "Test failure for customer@example.com at +919876543210");
recovery.report("manual_report", "error", "Test failure for customer@example.com at +919876543210");
await new Promise(resolve => setTimeout(resolve, 40));
assert.ok(counts.reportBodies.length > 0, "sanitized diagnostics should be sent to the configured endpoint");
assert.ok(counts.reportBodies.every(x => !JSON.stringify(x).includes("customer@example.com")), "reports must redact email addresses");
assert.ok(counts.reportBodies.every(x => !JSON.stringify(x).includes("9876543210")), "reports must redact phone numbers");
console.log("Resilience behavior tests passed: corrupted storage, safe-read retries, write no-retry, and PII redaction.");
