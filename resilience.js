/* Doodhwala resilience layer: safe storage, conservative fetch telemetry, and recoverable UI failures. */
(function (w, d) {
  "use strict";
  if (w.DoodhwalaResilience) return;

  const APP_VERSION = "20261009.1";
  const QUIET_WINDOW = 5 * 60 * 1000;
  const recent = new Map();
  const pending = [];
  const nativeFetch = typeof w.fetch === "function" ? w.fetch.bind(w) : null;
  let notice = null;
  let noticeTimer = null;
  let sending = false;

  function currentRoute() {
    try { return String(w.location.pathname || "/").split(/[?#]/, 1)[0].slice(0, 240) || "/"; }
    catch (_) { return "/"; }
  }

  function safeText(value, limit) {
    let text = String(value == null ? "" : value).slice(0, limit || 1000);
    text = text
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
      .replace(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}(?:\.[a-zA-Z0-9_-]+)?/g, "[token]")
      .replace(/sb_(?:publishable|secret)_[A-Za-z0-9_-]+/g, "[api-key]")
      .replace(/\b(?:\+?91[\s-]?)?[6-9]\d{9}\b/g, "[phone]")
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[id]")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, 500) || "Unspecified error";
  }

  function safeResource(value) {
    if (!value) return null;
    try {
      const url = new URL(String(value), w.location.href);
      return (url.hostname + url.pathname).replace(/[^a-zA-Z0-9/_.:-]/g, "").slice(0, 240) || null;
    } catch (_) {
      return String(value).split(/[?#]/, 1)[0].replace(/[^a-zA-Z0-9/_.:-]/g, "").slice(0, 240) || null;
    }
  }

  function hash(value) {
    let h = 2166136261;
    for (let i = 0; i < value.length; i++) {
      h ^= value.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ("00000000" + (h >>> 0).toString(16)).slice(-8);
  }

  function endpoint() {
    if (w.DOODHWALA_ERROR_REPORT_URL) return String(w.DOODHWALA_ERROR_REPORT_URL);
    const base = String(w.DOODHWALA_SUPABASE_URL || "").replace(/\/+$/, "");
    return base ? base + "/functions/v1/client-error-report" : "";
  }

  function flush() {
    if (sending || !nativeFetch || !pending.length || (w.navigator && w.navigator.onLine === false)) return;
    const url = endpoint();
    const key = String(w.DOODHWALA_SUPABASE_PUBLISHABLE_KEY || "");
    if (!url || !key) return;
    const item = pending.shift();
    const attempt = Number(item.__reportAttempt || 0);
    const payload = Object.assign({}, item);
    delete payload.__reportAttempt;
    sending = true;
    nativeFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": key },
      body: JSON.stringify(payload),
      keepalive: true
    }).then(function (response) {
      if (!response.ok && response.status !== 429) {
        try { if (w.console) w.console.warn("Doodhwala diagnostics endpoint returned", response.status); } catch (_) {}
      }
    }).catch(function () {
      if (attempt < 2 && pending.length < 12) {
        item.__reportAttempt = attempt + 1;
        pending.unshift(item);
      }
    }).finally(function () {
      sending = false;
      if (pending.length) w.setTimeout(flush, attempt ? 2500 : 1000);
    });
  }

  function report(eventType, severity, message, details) {
    try {
      details = details || {};
      const safeMessage = safeText(message, 500);
      const resource = safeResource(details.resource);
      const route = currentRoute();
      const status = Number(details.status_code);
      const statusCode = Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
      const fingerprint = hash([eventType, safeMessage, route, resource || "", statusCode || ""].join("|"));
      const now = Date.now();
      if (recent.has(fingerprint) && now - recent.get(fingerprint) < QUIET_WINDOW) return fingerprint;
      recent.set(fingerprint, now);
      if (recent.size > 300) {
        for (const entry of recent) if (now - entry[1] > QUIET_WINDOW) recent.delete(entry[0]);
      }
      const record = {
        event_type: eventType,
        severity: severity === "critical" ? "critical" : severity === "warning" ? "warning" : "error",
        fingerprint: fingerprint,
        message: safeMessage,
        route: route,
        resource: resource,
        status_code: statusCode
      };
      if (pending.length < 12) pending.push(record);
      flush();
      return fingerprint;
    } catch (_) {
      return "";
    }
  }

  function showNotice(title, detail) {
    const create = function () {
      if (!d.body) return;
      if (!notice) {
        notice = d.createElement("section");
        notice.setAttribute("role", "status");
        notice.setAttribute("aria-live", "polite");
        notice.style.cssText = "position:fixed;z-index:2147483000;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));max-width:540px;margin:0 auto;padding:14px 15px;border:1px solid #e4c98d;border-radius:16px;background:#fffaf0;color:#243329;box-shadow:0 12px 38px rgba(0,0,0,.18);font:14px/1.45 system-ui,-apple-system,sans-serif";
        const heading = d.createElement("strong");
        heading.style.cssText = "display:block;font-size:15px;margin-bottom:4px";
        heading.dataset.role = "heading";
        const message = d.createElement("p");
        message.style.cssText = "margin:0 0 11px;color:#59645d";
        message.dataset.role = "message";
        const actions = d.createElement("div");
        actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap";
        const recover = d.createElement("button");
        recover.type = "button";
        recover.textContent = currentRoute().endsWith("/checkout.html") ? "Check my orders" : "Reload page";
        recover.style.cssText = "border:0;border-radius:10px;padding:9px 12px;background:#17603f;color:#fff;font-weight:700;cursor:pointer";
        recover.addEventListener("click", function () {
          if (currentRoute().endsWith("/checkout.html")) w.location.href = "/Dudh-Wallah/orders.html";
          else w.location.reload();
        });
        const close = d.createElement("button");
        close.type = "button";
        close.textContent = "Dismiss";
        close.style.cssText = "border:1px solid #d7ded8;border-radius:10px;padding:9px 12px;background:#fff;color:#243329;font-weight:650;cursor:pointer";
        close.addEventListener("click", function () { notice.hidden = true; });
        actions.append(recover, close);
        notice.append(heading, message, actions);
        d.body.appendChild(notice);
      }
      notice.querySelector('[data-role="heading"]').textContent = title;
      notice.querySelector('[data-role="message"]').textContent = detail;
      notice.hidden = false;
      w.clearTimeout(noticeTimer);
      noticeTimer = w.setTimeout(function () { if (notice) notice.hidden = true; }, 18000);
    };
    if (d.body) create();
    else d.addEventListener("DOMContentLoaded", create, { once: true });
  }

  function parseJSON(raw, fallback, key) {
    if (raw == null || raw === "") return fallback;
    try { return JSON.parse(raw); }
    catch (_) {
      report("storage_parse_error", "warning", "Saved browser data could not be read; a safe default was restored.", { resource: key || "localStorage" });
      return fallback;
    }
  }

  function readStorage(key, fallback) {
    let raw;
    try { raw = w.localStorage.getItem(key); }
    catch (_) {
      report("storage_unavailable", "warning", "Browser storage is unavailable; this session will use temporary defaults.", { resource: key });
      return fallback;
    }
    return parseJSON(raw, fallback, key);
  }

  function readObjectStorage(key, fallback) {
    const value = readStorage(key, fallback);
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
    if (value !== fallback) report("storage_parse_error", "warning", "Saved browser data had an unexpected shape; a safe default was restored.", { resource: key });
    return fallback;
  }

  function setItem(key, value) {
    try { w.localStorage.setItem(key, String(value)); return true; }
    catch (_) {
      report("storage_unavailable", "warning", "Browser storage is full or unavailable; changes remain temporary for this session.", { resource: key });
      return false;
    }
  }

  function writeStorage(key, value) {
    try { return setItem(key, JSON.stringify(value)); }
    catch (_) {
      report("storage_unavailable", "warning", "Saved data could not be serialized; changes remain temporary for this session.", { resource: key });
      return false;
    }
  }

  function removeItem(key) {
    try { w.localStorage.removeItem(key); return true; }
    catch (_) {
      report("storage_unavailable", "warning", "Browser storage could not be updated.", { resource: key });
      return false;
    }
  }

  function monitoredFetch(input, init) {
    if (!nativeFetch) return Promise.reject(new Error("Fetch is unavailable in this browser."));
    let url;
    try { url = new URL(typeof input === "string" ? input : input.url, w.location.href); }
    catch (_) { return nativeFetch(input, init); }
    if (url.pathname.endsWith("/functions/v1/client-error-report")) return nativeFetch(input, init);
    const relevant = url.origin === w.location.origin || /\.supabase\.co$/i.test(url.hostname);
    const method = String((init && init.method) || (typeof input !== "string" && input && input.method) || "GET").toUpperCase();
    const safeRead = relevant && (method === "GET" || method === "HEAD");
    const started = Date.now();
    async function request(attempt) {
      let response;
      try {
        response = await nativeFetch(input, init);
      } catch (error) {
        if (safeRead && attempt < 2 && error && error.name !== "AbortError" && !(w.navigator && w.navigator.onLine === false)) {
          await new Promise(function (resolve) { w.setTimeout(resolve, 250 * Math.pow(2, attempt)); });
          return await request(attempt + 1);
        }
        throw error;
      }
      if (safeRead && attempt < 2 && [408, 500, 502, 503, 504].includes(response.status)) {
        await new Promise(function (resolve) { w.setTimeout(resolve, 250 * Math.pow(2, attempt)); });
        return await request(attempt + 1);
      }
      return response;
    }
    return request(0).then(function (response) {
      if (relevant && (response.status >= 500 || response.status === 408 || response.status === 429)) {
        report("http_server_error", response.status >= 500 ? "critical" : "warning", "A server request returned HTTP " + response.status + ".", { resource: url.origin + url.pathname, status_code: response.status });
      }
      if (relevant && Date.now() - started > 12000) {
        report("slow_request", "warning", "A server request took longer than 12 seconds.", { resource: url.origin + url.pathname, status_code: response.status });
      }
      return response;
    }).catch(function (error) {
      if (relevant && error && error.name !== "AbortError") {
        report("network_failure", "error", "A network request could not reach its server.", { resource: url.origin + url.pathname });
        if (w.navigator && w.navigator.onLine === false) showNotice("You appear to be offline", "Your current page is still open. Reconnect to refresh live prices, orders, and stock.");
      }
      throw error;
    });
  }

  w.fetch = monitoredFetch;
  w.DoodhwalaResilience = {
    version: APP_VERSION,
    report: report,
    parseJSON: parseJSON,
    readStorage: readStorage,
    readObjectStorage: readObjectStorage,
    setItem: setItem,
    writeStorage: writeStorage,
    removeItem: removeItem,
    fetch: monitoredFetch,
    retryRead: async function (operation, options) {
      options = options || {};
      const retries = Math.max(0, Math.min(3, Number(options.retries == null ? 2 : options.retries) || 0));
      const baseDelay = Math.max(100, Math.min(2000, Number(options.baseDelayMs) || 300));
      let lastError;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try { return await operation(); }
        catch (error) {
          lastError = error;
          if (attempt >= retries || (w.navigator && w.navigator.onLine === false)) break;
          await new Promise(function (resolve) { w.setTimeout(resolve, baseDelay * Math.pow(2, attempt)); });
        }
      }
      throw lastError;
    },
    showRecoveryNotice: showNotice,
    flush: flush
  };

  w.addEventListener("online", function () {
    flush();
    showNotice("Connection restored", "Reconnect detected. Refresh this screen or revisit Orders to synchronize the latest status.");
  });
  w.addEventListener("offline", function () {
    showNotice("You appear to be offline", "The app will stay open, but live inventory and order updates need a connection.");
  });
  w.addEventListener("error", function (event) {
    if (String(event && event.message || "").includes("Local development origin blocked; redirecting to production.")) return;
    const target = event && event.target;
    if (target && target !== w) {
      const isScript = String(target.tagName || "").toUpperCase() === "SCRIPT";
      report("resource_error", isScript ? "error" : "warning", "A page resource failed to load.", { resource: target.src || target.href || target.tagName || "resource" });
      if (isScript) showNotice("A page component did not load", "Try reloading this page. If the problem continues, return to Home and try again.");
      return;
    }
    const error = event && event.error;
    report("runtime_error", "critical", error && error.message || event && event.message || "An unexpected JavaScript error occurred.", { resource: event && event.filename || null });
    showNotice("Something went wrong", "Doodhwala caught an unexpected error. Your current page has been kept open; reload or use the safe navigation option.");
  }, true);
  w.addEventListener("unhandledrejection", function (event) {
    const reason = event && event.reason;
    report("unhandled_rejection", "critical", reason && reason.message || reason || "An asynchronous operation failed unexpectedly.");
    showNotice("A background operation failed", "The page is still available. Check your connection and try the action again once the issue clears.");
  });

  try { if (w.console) w.console.info("Doodhwala resilience layer active", APP_VERSION); } catch (_) {}
})(window, document);
