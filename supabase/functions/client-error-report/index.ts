import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PROJECT_URL = Deno.env.get("SUPABASE_URL") || "";
const SECRET_KEYS = (() => { try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"); } catch { return {}; } })();
const SERVICE_KEY = SECRET_KEYS.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const PUBLISHABLE_KEYS = (() => { try { return Object.values(JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}")); } catch { return []; } })();
const ALLOWED_ORIGINS = new Set(["https://mahin98250.github.io"]);
const APP_VERSION = "20261009.1";
const buckets = new Map<string, { start: number; count: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 20;
let lastPruneAt = 0;

function response(body: unknown, status: number, origin: string | null) {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin" });
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "content-type, apikey");
    headers.set("Access-Control-Max-Age", "600");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function cleanMessage(value: unknown): string {
  let text = String(value ?? "Unknown client error").slice(0, 1000);
  text = text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}(?:\.[a-zA-Z0-9_-]+)?/g, "[token]")
    .replace(/sb_(?:publishable|secret)_[A-Za-z0-9_-]+/g, "[api-key]")
    .replace(/\b(?:\+?91[\s-]?)?[6-9]\d{9}\b/g, "[phone]")
    .replace(/https?:\/\/[^\s?]+\?[^\s]+/gi, "[url-with-query]");
  return text.replace(/\s+/g, " ").trim().slice(0, 500) || "Unknown client error";
}

function cleanPath(value: unknown): string {
  const path = String(value ?? "/").split(/[?#]/, 1)[0];
  if (!path.startsWith("/Dudh-Wallah/") && path !== "/Dudh-Wallah" && path !== "/") return "/";
  return path.replace(/[^a-zA-Z0-9/_\-.]/g, "").slice(0, 240) || "/";
}

function cleanResource(value: unknown): string | null {
  if (!value) return null;
  try {
    const u = new URL(String(value));
    return (u.hostname + u.pathname).replace(/[^a-zA-Z0-9/_.:-]/g, "").slice(0, 240);
  } catch {
    return String(value).split(/[?#]/, 1)[0].replace(/[^a-zA-Z0-9/_.:-]/g, "").slice(0, 240) || null;
  }
}

async function rest(path: string, init: RequestInit) {
  const headers = new Headers(init.headers || {});
  headers.set("apikey", SERVICE_KEY);
  if (SERVICE_KEY.startsWith("eyJ")) headers.set("Authorization", "Bearer " + SERVICE_KEY);
  return fetch(PROJECT_URL + "/rest/v1/" + path, { ...init, headers });
}

function rateLimited(req: Request): boolean {
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown-client";
  const now = Date.now();
  let bucket = buckets.get(ip);
  if (!bucket || now - bucket.start >= RATE_WINDOW_MS) {
    bucket = { start: now, count: 0 };
    buckets.set(ip, bucket);
  }
  bucket.count++;
  if (buckets.size > 5000) {
    for (const [key, value] of buckets) if (now - value.start >= RATE_WINDOW_MS) buckets.delete(key);
  }
  return bucket.count > RATE_LIMIT;
}

async function pruneOldReports() {
  if (Date.now() - lastPruneAt < 60 * 60 * 1000) return;
  lastPruneAt = Date.now();
  const before = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const result = await rest("client_error_reports?created_at=lt." + encodeURIComponent(before), { method: "DELETE" });
    if (!result.ok) console.warn("Error report retention cleanup failed", result.status);
  } catch (error) {
    console.warn("Error report retention cleanup failed", error);
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    if (!origin || !ALLOWED_ORIGINS.has(origin)) return response({ ok: false }, 403, null);
    return response({ ok: true }, 200, origin);
  }
  if (req.method !== "POST") return response({ ok: false, error: "method_not_allowed" }, 405, origin);
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return response({ ok: false, error: "origin_not_allowed" }, 403, null);
  if (!PROJECT_URL || !SERVICE_KEY) {
    console.error("Client error reporter missing Supabase server configuration.");
    return response({ ok: false, error: "reporting_unavailable" }, 503, origin);
  }

  const suppliedKey = req.headers.get("apikey") || "";
  if (!suppliedKey || (!PUBLISHABLE_KEYS.some((key) => key === suppliedKey) && suppliedKey !== (Deno.env.get("SUPABASE_ANON_KEY") || ""))) {
    return response({ ok: false, error: "client_key_invalid" }, 401, origin);
  }
  if (rateLimited(req)) return response({ ok: false, error: "rate_limited" }, 429, origin);

  const length = Number(req.headers.get("content-length") || 0);
  if (length > 8192) return response({ ok: false, error: "payload_too_large" }, 413, origin);
  let input: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 8192) return response({ ok: false, error: "payload_too_large" }, 413, origin);
    input = JSON.parse(raw);
  } catch {
    return response({ ok: false, error: "invalid_json" }, 400, origin);
  }

  const allowedTypes = new Set(["runtime_error", "unhandled_rejection", "network_failure", "http_server_error", "slow_request", "resource_error", "storage_parse_error", "storage_unavailable", "manual_report"]);
  const allowedSeverity = new Set(["warning", "error", "critical"]);
  const eventType = String(input.event_type || "");
  const severity = String(input.severity || "error");
  const fingerprint = String(input.fingerprint || "");
  if (!allowedTypes.has(eventType) || !allowedSeverity.has(severity) || !/^[a-f0-9]{8,64}$/i.test(fingerprint)) {
    return response({ ok: false, error: "invalid_report" }, 400, origin);
  }

  const statusRaw = Number(input.status_code);
  const statusCode = Number.isInteger(statusRaw) && statusRaw >= 100 && statusRaw <= 599 ? statusRaw : null;
  const row = {
    severity,
    event_type: eventType,
    fingerprint: fingerprint.toLowerCase(),
    message: cleanMessage(input.message),
    route: cleanPath(input.route),
    resource: cleanResource(input.resource),
    status_code: statusCode,
    app_version: APP_VERSION,
    environment: "production",
  };

  let recent = false;
  try {
    const q = new URLSearchParams({
      fingerprint: "eq." + row.fingerprint,
      created_at: "gt." + new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      select: "id",
      limit: "1",
    });
    const previous = await rest("client_error_reports?" + q.toString(), { method: "GET" });
    if (previous.ok) recent = (await previous.json()).length > 0;
    const saved = await rest("client_error_reports", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Prefer": "return=minimal" },
      body: JSON.stringify(row),
    });
    if (!saved.ok) {
      console.error("Client error report insert failed", saved.status);
      return response({ ok: false, error: "report_store_failed" }, 503, origin);
    }
  } catch (error) {
    console.error("Client error report processing failed", error);
    return response({ ok: false, error: "report_store_failed" }, 503, origin);
  }

  console.error("Client runtime report", JSON.stringify({ severity: row.severity, event_type: row.event_type, fingerprint: row.fingerprint, route: row.route, status_code: row.status_code }));

  const alertUrl = Deno.env.get("DOODHWALA_ALERT_WEBHOOK_URL");
  if (!recent && alertUrl && severity !== "warning") {
    const message = "[Doodhwala " + severity.toUpperCase() + "] " + row.event_type + ": " + row.message + " | route: " + row.route + " | HTTP: " + (row.status_code ?? "n/a") + " | fingerprint: " + row.fingerprint;
    try {
      const alert = await fetch(alertUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: message,
          text: message,
          event: { severity: row.severity, event_type: row.event_type, fingerprint: row.fingerprint, message: row.message, route: row.route, resource: row.resource, status_code: row.status_code, created_at: new Date().toISOString() },
        }),
        signal: AbortSignal.timeout(3500),
      });
      if (!alert.ok) console.error("Developer alert webhook failed", alert.status);
    } catch (error) {
      console.error("Developer alert webhook failed", error);
    }
  } else if (severity !== "warning" && !alertUrl) {
    console.warn("DOODHWALA_ALERT_WEBHOOK_URL is not configured; report is saved for the Admin System Health panel.");
  }

  await pruneOldReports();
  return response({ ok: true }, 202, origin);
});
