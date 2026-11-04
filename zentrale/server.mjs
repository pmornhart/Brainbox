#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Brainbox-Zentrale und Tor zum Wiki
//
// Lauscht auf Port 3000 (wo vorher Outline lief) und
//   • liefert unter /zentrale die Brainbox-Zentrale aus (nur für Admins),
//   • reicht alles andere an den Outline-Kern auf Port 3100 weiter
//     (inklusive Websockets für die Echtzeit-Bearbeitung).
// Aktionen ruft die Zentrale über die Brainbox-Befehle auf (brainbox-connect,
// brainbox-login, update) – dieselben Wege wie im Terminal.
// Lizenz: MIT, siehe LICENSE.
// -----------------------------------------------------------------------------
import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT = path.dirname(HERE);
const LISTEN = Number(process.env.BRAINBOX_LISTEN || 3000);
const CORE = Number(process.env.BRAINBOX_CORE_PORT || 3100);
const ENV_FILE = process.env.BRAINBOX_ENV_FILE || "/opt/brainbox/.env";
const CONF_DIR = process.env.BRAINBOX_CONF_DIR || "/etc/brainbox";
const STATE_FILE = process.env.BRAINBOX_CONNECT_STATE || "/var/lib/brainbox-connect/state.json";
const VERSION_FILE = process.env.BRAINBOX_VERSION_FILE || "/root/.brainbox";
const UPDATE_LOG = "/var/log/brainbox-update-zentrale.log";
// Woher neue Versionen kommen (wie bei update) und wo das Ergebnis der letzten Prüfung liegt
const REPO = process.env.BRAINBOX_REPO || "pmornhart/Brainbox";
const RAW = process.env.BRAINBOX_RAW || `https://raw.githubusercontent.com/${REPO}/${process.env.BRAINBOX_BRANCH || "main"}`;
const UPDATE_STATE = process.env.BRAINBOX_UPDATE_STATE || "/var/lib/brainbox/update.json";
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000; // alle 6 Stunden nach neuen Versionen sehen
const DEMO = process.env.BRAINBOX_ZENTRALE_DEMO === "1"; // nur für Tests: ohne Anmeldung

// --- kleine Helfer ---------------------------------------------------------------
function readEnv(file) {
  try { return parseEnv(fs.readFileSync(file, "utf8")); } catch { return {}; }
}
function parseEnv(text) {
  const out = {};
  for (const raw of String(text).split("\n")) {
    const m = raw.match(/^\s*([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
    else if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    out[m[1]] = v;
  }
  return out;
}
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } };
const stripAnsi = (s) => String(s || "").replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").replace(/\r/g, "");
const send = (res, code, body, type = "application/json; charset=utf-8") => {
  const data = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(data);
};
const cookies = (req) => Object.fromEntries(String(req.headers.cookie || "").split(/;\s*/).filter(Boolean).map((c) => {
  const i = c.indexOf("="); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))];
}));

function run(cmd, args, { timeout = 240000, input } = {}) {
  return new Promise((resolve) => {
    const child = execFile(cmd, args, { timeout, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, TERM: "dumb" } }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err ? (err.code ?? 1) : 0, output: stripAnsi(`${stdout}${stderr}`).trim() });
    });
    if (input) { child.stdin.write(input); }
    child.stdin?.end();
  });
}

function versionInfo() {
  const kit = readEnv(path.join(KIT, "brainbox.version"));
  const installed = readEnv(VERSION_FILE);
  let core = installed.OUTLINE_CORE || "";
  if (!core) { try { core = fs.readFileSync(VERSION_FILE, "utf8").trim().split("\n")[0]; } catch { /* unbekannt */ } }
  return { brainbox: installed.BRAINBOX_VERSION || kit.BRAINBOX_VERSION || "?", core: core || kit.OUTLINE_CORE || "?" };
}

// --- Gibt es eine neue Brainbox? ------------------------------------------------------------------
// Liest brainbox.version aus dem Brainbox-Repo (ein paar Bytes, kein Download des Bausatzes).
// Das Ergebnis zeigt die Zentrale an und das Wiki als „Update verfügbar“ oben in der Seitenleiste.
let lastCheck = readJson(UPDATE_STATE, null);
const newer = (a, b) => {
  const x = String(a).split(".").map((n) => parseInt(n, 10) || 0), y = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};
function updateState() {
  lastCheck = readJson(UPDATE_STATE, lastCheck); // update --check schreibt dieselbe Datei
  const cur = versionInfo(), u = lastCheck || {};
  const available = !!u.latest && (newer(u.latest, cur.brainbox) || (u.latest === cur.brainbox && !!u.latestCore && u.latestCore !== cur.core));
  return { current: cur.brainbox, currentCore: cur.core, latest: u.latest || null, latestCore: u.latestCore || null, available, checkedAt: u.checkedAt || null, error: u.error || null };
}
async function checkUpdate() {
  const next = { latest: lastCheck?.latest || null, latestCore: lastCheck?.latestCore || null, checkedAt: new Date().toISOString(), error: null };
  try {
    const r = await fetch(`${RAW}/brainbox.version`, { signal: AbortSignal.timeout(15000), headers: { "Cache-Control": "no-cache" } });
    if (!r.ok) throw new Error(`GitHub antwortet mit ${r.status}`);
    const v = parseEnv(await r.text());
    if (!/^\d+(\.\d+)*$/.test(v.BRAINBOX_VERSION || "")) throw new Error("keine gültige Versionsangabe");
    next.latest = v.BRAINBOX_VERSION; next.latestCore = v.OUTLINE_CORE || null;
  } catch (e) { next.error = String(e.message || e); }
  lastCheck = next;
  try { fs.mkdirSync(path.dirname(UPDATE_STATE), { recursive: true }); fs.writeFileSync(UPDATE_STATE, JSON.stringify(next)); } catch { /* nur Anzeige */ }
  return updateState();
}
function updateText(u) {
  if (u.available) return `Update verfügbar: Brainbox ${u.current} → ${u.latest}${u.latestCore && u.latestCore !== u.currentCore ? ` (Kern ${u.currentCore} → ${u.latestCore})` : ""}`;
  if (u.error) return `Prüfen hat nicht geklappt: ${u.error}`;
  return `Brainbox ${u.current} ist aktuell (Kern ${u.currentCore}).`;
}

// --- Outline-Kern fragen (mit der Sitzung des Nutzers) -------------------------------------------
function core(endpoint, req, body = {}) {
  return new Promise((resolve) => {
    const c = cookies(req);
    const data = Buffer.from(JSON.stringify(body));
    const r = http.request({
      host: "127.0.0.1", port: CORE, method: "POST", path: `/api/${endpoint}`,
      headers: {
        "Content-Type": "application/json", "Content-Length": data.length, Accept: "application/json",
        Cookie: req.headers.cookie || "", "x-csrf-token": c["__Host-csrfToken"] || c.csrfToken || "",
        Host: req.headers.host || `127.0.0.1:${LISTEN}`,
      },
      timeout: 15000,
    }, (res) => {
      const chunks = [];
      res.on("data", (x) => chunks.push(x));
      res.on("end", () => { let json = null; try { json = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { /* leer */ } resolve({ status: res.statusCode, json }); });
    });
    r.on("error", () => resolve({ status: 502, json: null }));
    r.on("timeout", () => r.destroy());
    r.end(data);
  });
}

async function whoami(req) {
  if (DEMO) return { user: { name: "Philip", role: "admin" }, team: { name: "Brainbox", inviteRequired: true } };
  if (!cookies(req).accessToken) return null;
  const r = await core("auth.info", req);
  return r.status === 200 ? r.json?.data : null;
}

// --- Übersicht ------------------------------------------------------------------------------------
async function status(req, me) {
  const env = readEnv(ENV_FILE);
  const conn = readEnv(path.join(CONF_DIR, "connect.env"));
  let servers = readJson(path.join(CONF_DIR, "proxmox.json"), null);
  if (!servers && conn.PVE_URL) servers = [{ name: "proxmox", url: conn.PVE_URL, tokenId: conn.PVE_TOKEN_ID, insecure: ["1", "yes"].includes(conn.PVE_INSECURE) }];
  const state = readJson(STATE_FILE, {});
  const docs = Object.keys(state.docs || {});
  const url = env.URL || "";
  const host = url.replace(/^https?:\/\//, "").replace(/[:/].*$/, "");
  const claudeMail = `claude@${/^[0-9.]+$/.test(host) || !host.includes(".") ? "brainbox.local" : host}`;
  let claude = false;
  if (!DEMO) {
    const u = await core("users.list", req, { query: "claude@", limit: 25 });
    claude = (u.json?.data || []).some((x) => (x.email || "").toLowerCase() === claudeMail);
  }
  const timer = await run("systemctl", ["is-active", "brainbox-sync.timer"], { timeout: 5000 });
  const areas = docs.filter((k) => k.startsWith("area:") && !["area:rules", "area:overview"].includes(k)).map((k) => k.slice(5));
  return {
    version: versionInfo(),
    update: updateState(),
    ctid: (() => { try { return fs.readFileSync(path.join(CONF_DIR, "ctid"), "utf8").trim(); } catch { return ""; } })(),
    wiki: { url, name: me?.team?.name || "Brainbox", inviteRequired: !!me?.team?.inviteRequired, language: env.DEFAULT_LANGUAGE || "" },
    user: { name: me?.user?.name || "" },
    proxmox: (servers || []).map((x) => ({ name: x.name, url: x.url, tokenId: x.tokenId, insecure: !!x.insecure })),
    netbird: conn.NETBIRD_URL ? { url: conn.NETBIRD_URL } : null,
    claude: { account: claude, email: claudeMail, mcpUrl: `${url}/mcp`, key: !!conn.CLAUDE_API_KEY },
    sync: {
      lastRun: state.lastRun || null, timer: timer.output.trim() === "active", bot: !!conn.OUTLINE_API_KEY,
      counts: {
        guests: docs.filter((k) => /^pve:[^:]+:\d+$/.test(k)).length,
        peers: docs.filter((k) => /^nb:/.test(k) && !["nb:overview", "nb:domains"].includes(k)).length,
        areas: areas.length,
      },
      areas,
      rulesUrl: state.docs?.["area:rules"]?.url || null,
      areasUrl: state.docs?.["area:overview"]?.url || null,
      overviewUrl: state.docs?.["pve:overview"]?.url || null,
      guideUrl: state.docs?.["start:anleitung"]?.url || null,
    },
    login: {
      email: env.SMTP_HOST || env.SMTP_SERVICE || "",
      passkeys: url.startsWith("https://"),
      google: !!env.GOOGLE_CLIENT_ID, microsoft: !!env.AZURE_CLIENT_ID, discord: !!env.DISCORD_CLIENT_ID,
      oidc: env.OIDC_CLIENT_ID ? (env.OIDC_DISPLAY_NAME || "OpenID Connect") : "",
    },
  };
}

// --- Für die Startseite des Wikis und Kurzlinks -------------------------------------------------------
// Kurzlinks wie /zentrale/go/anleitung führen zur passenden Wiki-Seite (vom Abgleich angelegt).
const GO = {
  anleitung: "start:anleitung", spickzettel: "start:spickzettel", proxmox: "pve:overview", netbird: "nb:overview",
  domains: "nb:domains", bereiche: "area:overview", regeln: "area:rules",
};
function goTo(res, key) {
  const docKey = GO[key];
  const docUrl = docKey ? readJson(STATE_FILE, {}).docs?.[docKey]?.url : null;
  res.writeHead(302, { Location: docUrl || "/home", "Cache-Control": "no-store" });
  res.end();
}
function summary(me) {
  const state = readJson(STATE_FILE, {});
  const docUrl = (k) => state.docs?.[k]?.url || null;
  const admin = me.user?.role === "admin";
  return {
    user: { name: me.user?.name || "", admin },
    wiki: { name: me.team?.name || "Brainbox" },
    version: versionInfo(),
    update: admin ? updateState() : null,
    lastRun: state.lastRun || null,
    homelab: state.summary || null,
    links: {
      anleitung: docUrl("start:anleitung"), spickzettel: docUrl("start:spickzettel"), proxmox: docUrl("pve:overview"),
      netbird: docUrl("nb:overview"), domains: docUrl("nb:domains"), bereiche: docUrl("area:overview"), regeln: docUrl("area:rules"),
    },
  };
}

// --- Aktionen ---------------------------------------------------------------------------------------
const LOGIN_KEYS = new Set(["URL", "DEFAULT_LANGUAGE", "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USERNAME", "SMTP_PASSWORD", "SMTP_FROM_EMAIL", "SMTP_SERVICE",
  "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET", "AZURE_TENANT_ID", "DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_SERVER_ID",
  "OIDC_DISPLAY_NAME", "OIDC_ISSUER_URL", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET"]);
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,30}$/;
const ONE_LINE = (v) => typeof v === "string" && !/[\r\n\0]/.test(v) && v.length < 2000;

const actions = {
  "proxmox/add": async (b) => {
    if (!NAME_RE.test(b.name || "")) return { ok: false, output: "Name: nur Kleinbuchstaben, Ziffern und Bindestrich, z. B. zuhause" };
    if (![b.url, b.tokenId, b.secret].every(ONE_LINE) || !b.url || !b.tokenId || !b.secret) return { ok: false, output: "Adresse, Token-ID und Secret ausfüllen." };
    return run("brainbox-connect", ["proxmox", "add", b.name, b.url, b.tokenId, b.secret, ...(b.insecure ? ["--insecure"] : [])]);
  },
  "proxmox/remove": async (b) => (NAME_RE.test(b.name || "") ? run("brainbox-connect", ["proxmox", "remove", b.name]) : { ok: false, output: "Unbekannter Server." }),
  "proxmox/test": async (b) => run("brainbox-connect", ["proxmox", "test", ...(NAME_RE.test(b.name || "") ? [b.name] : [])], { timeout: 60000 }),
  netbird: async (b) => ([b.url, b.token].every((x) => ONE_LINE(x) && x) ? run("brainbox-connect", ["netbird", b.url, b.token]) : { ok: false, output: "Adresse und Token ausfüllen." }),
  "netbird/remove": async () => run("brainbox-connect", ["netbird", "remove"]),
  claude: async () => {
    const r = await run("brainbox-connect", ["claude", "--json"]);
    const m = r.output.match(/\{[\s\S]*\}\s*$/);
    let data = null; try { data = m ? JSON.parse(m[0]) : null; } catch { /* kein JSON */ }
    return { ok: r.ok && !!data, output: data ? "" : r.output, data };
  },
  sync: async () => run("brainbox-connect", ["sync"]),
  link: async (b) => (ONE_LINE(b.email || "") ? run("brainbox-login", ["link", "--raw", ...(b.email ? [b.email] : [])], { timeout: 60000 }) : { ok: false, output: "E-Mail prüfen." }),
  login: async (b) => {
    const pairs = Object.entries(b.values || {}).filter(([k, v]) => LOGIN_KEYS.has(k) && (v === "" || ONE_LINE(v)));
    if (!pairs.length) return { ok: false, output: "Nichts zu speichern." };
    const set = pairs.filter(([, v]) => v !== "").map(([k, v]) => `${k}=${v}`);
    const unset = pairs.filter(([, v]) => v === "").map(([k]) => k);
    let out = "";
    if (unset.length) out += (await run("brainbox-login", ["unset", ...unset])).output + "\n";
    const r = set.length ? await run("brainbox-login", ["set", ...set]) : { ok: true, output: "" };
    return { ok: r.ok, output: (out + r.output).trim() };
  },
  testmail: async (b) => (ONE_LINE(b.to || "") && b.to ? run("brainbox-login", ["testmail", b.to], { timeout: 60000 }) : { ok: false, output: "Empfänger fehlt." }),
  "update/check": async () => { const u = await checkUpdate(); return { ok: !u.error, available: u.available, update: u, output: updateText(u) }; },
  "update/start": async () => {
    fs.writeFileSync(UPDATE_LOG, `Update gestartet ${new Date().toLocaleString("de-DE")}\n`);
    const out = fs.openSync(UPDATE_LOG, "a");
    spawn("update", [], { detached: true, stdio: ["ignore", out, out], env: { ...process.env, TERM: "dumb" } }).unref();
    return { ok: true, output: "Update läuft – das dauert 10 bis 20 Minuten. Das Wiki ist dabei kurz nicht erreichbar." };
  },
  "update/log": async () => { let t = ""; try { t = fs.readFileSync(UPDATE_LOG, "utf8"); } catch { /* noch keins */ } return { ok: true, output: stripAnsi(t).split("\n").slice(-60).join("\n") }; },
};

// --- Seiten der Zentrale -------------------------------------------------------------------------------
const STATIC = {
  "/zentrale": [path.join(HERE, "app.html"), "text/html; charset=utf-8"],
  "/zentrale/": [path.join(HERE, "app.html"), "text/html; charset=utf-8"],
  "/zentrale/logo.svg": [path.join(KIT, "brand/logo.svg"), "image/svg+xml"],
  "/zentrale/fonts/Geist.woff2": [path.join(KIT, "brand/fonts/Geist.woff2"), "font/woff2"],
  "/zentrale/fonts/GeistMono.woff2": [path.join(KIT, "brand/fonts/GeistMono.woff2"), "font/woff2"],
};

async function zentrale(req, res) {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/zentrale/health") return send(res, 200, { ok: true, version: versionInfo() });
  if (STATIC[url.pathname] && req.method === "GET") {
    const [file, type] = STATIC[url.pathname];
    try { return send(res, 200, fs.readFileSync(file), type); } catch { return send(res, 404, "fehlt", "text/plain"); }
  }
  if (url.pathname.startsWith("/zentrale/go/")) return goTo(res, url.pathname.slice("/zentrale/go/".length));
  if (!url.pathname.startsWith("/zentrale/api/")) return send(res, 404, { error: "Nicht gefunden" });

  const me = await whoami(req);
  if (!me) return send(res, 401, { error: "login" });
  const name = url.pathname.slice("/zentrale/api/".length);
  // Für alle Mitglieder: Zusammenfassung für die Startseite (ohne Geheimnisse)
  if (req.method === "GET" && name === "summary") return send(res, 200, summary(me));
  if (me.user?.role !== "admin") return send(res, 403, { error: "admin" });
  if (req.method === "GET" && name === "status") return send(res, 200, await status(req, me));
  if (req.method === "GET" && name === "update-info") return send(res, 200, updateState());
  if (req.method !== "POST" || !actions[name]) return send(res, 404, { error: "Nicht gefunden" });

  // Schutz gegen fremde Seiten: eigener Kopfzeilen-Eintrag und gleiche Herkunft
  const origin = req.headers.origin;
  if (req.headers["x-brainbox"] !== "1" || (origin && new URL(origin).host !== req.headers.host)) return send(res, 403, { error: "Herkunft" });
  const chunks = [];
  for await (const c of req) { chunks.push(c); if (chunks.reduce((n, x) => n + x.length, 0) > 64 * 1024) return send(res, 413, { error: "zu groß" }); }
  let body = {};
  try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}; } catch { return send(res, 400, { error: "JSON" }); }
  if (DEMO) return send(res, 200, { ok: true, output: `(Testmodus) ${name}` });
  return send(res, 200, await actions[name](body));
}

// --- Weiterleitung an den Outline-Kern --------------------------------------------------------------------
const STARTING = `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="5"><title>Brainbox startet</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0D1210;color:#E2EBE5;font:16px system-ui,sans-serif">
<div style="text-align:center"><img src="/zentrale/logo.svg" width="64" height="64" alt=""><h1 style="font-weight:600">Brainbox startet gerade</h1>
<p style="color:#8FA89A">Nach einem Update oder Neustart dauert das ein bis zwei Minuten. Die Seite lädt sich von selbst neu.</p></div></body>`;

function forwardHeaders(req) {
  const h = { ...req.headers };
  const ip = req.socket.remoteAddress || "";
  h["x-forwarded-for"] = h["x-forwarded-for"] ? `${h["x-forwarded-for"]}, ${ip}` : ip;
  h["x-forwarded-proto"] ||= "http";
  h["x-forwarded-host"] ||= h.host || "";
  return h;
}

function proxy(req, res) {
  const up = http.request({ host: "127.0.0.1", port: CORE, method: req.method, path: req.url, headers: forwardHeaders(req) }, (r) => {
    res.writeHead(r.statusCode || 502, r.headers);
    r.pipe(res);
  });
  up.on("error", () => {
    if (res.headersSent) return res.destroy();
    const wantsHtml = String(req.headers.accept || "").includes("text/html");
    send(res, 503, wantsHtml ? STARTING : { error: "Brainbox startet gerade" }, wantsHtml ? "text/html; charset=utf-8" : undefined);
  });
  req.pipe(up);
}

const server = http.createServer((req, res) => {
  if (req.url === "/zentrale" || req.url.startsWith("/zentrale/") || req.url.startsWith("/zentrale?")) {
    zentrale(req, res).catch((e) => send(res, 500, { error: String(e.message || e) }));
    return;
  }
  proxy(req, res);
});

server.on("upgrade", (req, socket, head) => {
  const up = net.connect(CORE, "127.0.0.1", () => {
    let raw = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
    const h = forwardHeaders(req);
    for (const [k, v] of Object.entries(h)) for (const x of Array.isArray(v) ? v : [v]) raw += `${k}: ${x}\r\n`;
    up.write(`${raw}\r\n`);
    if (head?.length) up.write(head);
    socket.pipe(up).pipe(socket);
  });
  up.on("error", () => socket.destroy());
  socket.on("error", () => up.destroy());
});

server.listen(LISTEN, "0.0.0.0", () => console.log(`Brainbox-Zentrale auf Port ${LISTEN}, Wiki-Kern auf Port ${CORE}`));

// Nach dem Start und dann alle 6 Stunden nach einer neuen Brainbox sehen (nicht im Testmodus)
if (!DEMO && process.env.BRAINBOX_UPDATE_CHECK !== "0") {
  setTimeout(() => checkUpdate().then((u) => console.log(updateText(u))), 20000).unref();
  setInterval(() => checkUpdate().then((u) => { if (u.available) console.log(updateText(u)); }), CHECK_EVERY_MS).unref();
}
