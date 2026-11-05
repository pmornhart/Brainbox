#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Brainbox-Abgleich: Proxmox und NetBird → Wiki
//
// Legt für jede VM, jeden Container, jedes NetBird-Gerät und jede Domain einen
// Wiki-Eintrag an, hält ihn aktuell und verknüpft, was zusammengehört.
// Über die Wiki-Seite „Zuordnungsregeln“ (Sammlung „Bereiche“) ordnest du
// Domains, VMs und Geräte Bereichen zu, z. B. *.morninghosting.de → Minecraft-Server.
// Alles ab der Überschrift „Notizen“ gehört dir und bleibt erhalten.
// Dazu pflegt er die Sammlung „Start“ mit Anleitung und Spickzettel und
// schreibt eine Zusammenfassung für die Startseite des Wikis.
//
//   node sync.mjs              abgleichen
//   node sync.mjs --test pve [NAME]  Verbindung zu Proxmox prüfen (alle oder einen Server)
//   node sync.mjs --test netbird
//   node sync.mjs --quiet      nur Fehler und Änderungen ausgeben
//
// Einstellungen: /etc/brainbox/connect.env, Proxmox-Server: /etc/brainbox/proxmox.json
// Zustand: /var/lib/brainbox-connect/state.json
// Lizenz: MIT, siehe LICENSE.
// -----------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import crypto from "node:crypto";

const CONF_FILE = process.env.BRAINBOX_CONNECT_ENV || "/etc/brainbox/connect.env";
const STATE_FILE = process.env.BRAINBOX_CONNECT_STATE || "/var/lib/brainbox-connect/state.json";
const args = process.argv.slice(2);
const QUIET = args.includes("--quiet");
const TEST = args.includes("--test") ? args[args.indexOf("--test") + 1] : null;

const log = (...a) => { if (!QUIET) console.log(...a); };
const say = (...a) => console.log(...a);

// --- Einstellungen -------------------------------------------------------------
function readEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    const m = raw.match(/^\s*([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
    else if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    out[m[1]] = v;
  }
  return out;
}
const cfg = readEnv(CONF_FILE);
const OUTLINE_URL = (cfg.OUTLINE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const PVE_FILE = process.env.BRAINBOX_PROXMOX_FILE || "/etc/brainbox/proxmox.json";
// Mehrere Proxmox-Server: [{ name, url, tokenId, secret, insecure, caFile }]
// oder an anderen Standorten: [{ name, mode: "agent", tokenHash }] – die melden sich selbst (connect/pve-agent.sh)
function loadServers() {
  try {
    const list = JSON.parse(fs.readFileSync(PVE_FILE, "utf8"));
    if (Array.isArray(list)) return list.filter((x) => x && x.name && (x.mode === "agent" || (x.url && x.tokenId && x.secret)));
  } catch { /* noch keine Liste */ }
  if (cfg.PVE_URL && cfg.PVE_TOKEN_ID && cfg.PVE_TOKEN_SECRET) {
    return [{ name: "proxmox", url: cfg.PVE_URL, tokenId: cfg.PVE_TOKEN_ID, secret: cfg.PVE_TOKEN_SECRET, insecure: ["1", "yes"].includes(cfg.PVE_INSECURE), caFile: cfg.PVE_CA_FILE || "" }];
  }
  return [];
}
const SERVERS = loadServers().map((x) => ({ ...x, url: String(x.url || "").replace(/\/$/, "") }));
const NB_URL = (cfg.NETBIRD_URL || "").replace(/\/$/, "");
const KIT_DIR = process.env.BRAINBOX_KIT_DIR || "/opt/brainbox-kit";
// Feste Reihenfolge der Brainbox-Sammlungen in der Seitenleiste (Fractional Index)
const COLLECTION_INDEX = { start: "a0", areas: "a1", proxmox: "a2", netbird: "a3" };

// --- HTTP ----------------------------------------------------------------------
function request(url, { method = "GET", headers = {}, body, ca, insecure = false, timeout = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const data = body === undefined ? undefined : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
    const opts = {
      method,
      headers: { Accept: "application/json", ...headers, ...(data ? { "Content-Type": "application/json", "Content-Length": data.length } : {}) },
      timeout,
    };
    if (u.protocol === "https:") {
      if (ca) opts.ca = ca;
      if (insecure) opts.rejectUnauthorized = false;
    }
    const req = lib.request(u, opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { /* kein JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, json, text });
      });
    });
    req.on("timeout", () => req.destroy(new Error(`Zeitüberschreitung bei ${u.host}`)));
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Outline-API ------------------------------------------------------------------
async function outline(endpoint, body = {}) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await request(`${OUTLINE_URL}/api/${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.OUTLINE_API_KEY}` },
      body,
    });
    if (res.status === 429) {
      const wait = Number(res.headers["retry-after"] || 0) * 1000 || 5000 * (attempt + 1);
      await sleep(Math.min(wait, 60000));
      continue;
    }
    if (res.status >= 200 && res.status < 300) return res.json;
    const err = new Error(`Wiki ${endpoint}: HTTP ${res.status} ${res.json?.message || res.text.slice(0, 120)}`);
    err.status = res.status;
    throw err;
  }
  throw new Error(`Wiki ${endpoint}: zu viele Anfragen, später erneut versuchen`);
}

// --- Proxmox-API ---------------------------------------------------------------------
function pveTls(srv) {
  const ca = srv.caFile && fs.existsSync(srv.caFile) ? fs.readFileSync(srv.caFile) : undefined;
  return { ca, insecure: !!srv.insecure };
}
// Server an anderen Standorten: Daten aus ihrer letzten Meldung statt aus der API
const AGENT_DIR = process.env.BRAINBOX_AGENT_DIR || "/var/lib/brainbox/agent";
const AGENT_MAX_AGE_MIN = 15;
// Servernamen sind frei wählbar – der Dateiname ist kodiert wie jq @uri (gleich in Zentrale und brainbox-connect)
const agentFileName = (name) => `${encodeURIComponent(name).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}.json`;
const MS_PER_MIN = 60000;
function agentSnapshot(srv) {
  if (srv.snap === undefined) {
    try { srv.snap = JSON.parse(fs.readFileSync(path.join(AGENT_DIR, agentFileName(srv.name)), "utf8")); } catch { srv.snap = null; }
    if (srv.snap?.url) srv.url = srv.snap.url;
  }
  return srv.snap;
}
const agentAge = (snap) => Math.round((Date.now() - new Date(snap?.receivedAt || 0).getTime()) / MS_PER_MIN);
function agentData(srv, p) {
  const snap = agentSnapshot(srv);
  if (!snap) throw new Error(`Proxmox „${srv.name}“ hat sich noch nicht gemeldet – den Agent-Befehl auf dem Server ausführen (Einstellungen → Brainbox → Proxmox-Server).`);
  const age = agentAge(snap);
  if (!(age <= AGENT_MAX_AGE_MIN)) throw new Error(`Proxmox „${srv.name}“ meldet sich nicht mehr (zuletzt vor ${age} Min.) – läuft der Brainbox-Agent dort noch?`);
  if (p === "/version") return snap.version;
  if (p === "/nodes") return snap.nodes;
  if (p.startsWith("/cluster/resources")) return snap.resources;
  const m = p.match(/^\/nodes\/([^/]+)\/(lxc|qemu)\/(\d+)\/(config|interfaces|agent\/network-get-interfaces)$/);
  const found = m && (m[4] === "config" ? snap.configs : snap.interfaces)?.[`${m[1]}/${m[2]}/${m[3]}`];
  if (found) return found;
  throw new Error(`Proxmox „${srv.name}“ ${p}: nicht in der Meldung`);
}
async function pve(srv, p) {
  if (srv.mode === "agent") return agentData(srv, p);
  const res = await request(`${srv.url}/api2/json${p}`, {
    headers: { Authorization: `PVEAPIToken=${srv.tokenId}=${srv.secret}` },
    ...pveTls(srv),
  });
  if (res.status !== 200) {
    const err = new Error(`Proxmox „${srv.name}“ ${p}: HTTP ${res.status} ${(res.json?.message || res.text || "").toString().slice(0, 120)}`);
    err.status = res.status;
    throw err;
  }
  return res.json?.data;
}

// --- NetBird-API ----------------------------------------------------------------------
async function netbird(p) {
  const res = await request(`${NB_URL}${p}`, { headers: { Authorization: `Token ${cfg.NETBIRD_TOKEN}` } });
  if (res.status !== 200) throw new Error(`NetBird ${p}: HTTP ${res.status} ${(res.json?.message || res.text || "").toString().slice(0, 120)}`);
  return res.json;
}

// --- Zustand ---------------------------------------------------------------------------
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return { collections: {}, docs: {} }; }
}
function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const tmp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

// --- Wiki-Bausteine -----------------------------------------------------------------------
const NOTES_RE = /^#{1,3}\s*Notizen\s*$/m;
const NOTES_DEFAULT = "## Notizen\n\nHier ist Platz für eigene Notizen. Alles ab dieser Überschrift bleibt bei jedem Abgleich erhalten.\n";
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
const now = () => new Date().toLocaleString("de-DE", { timeZone: process.env.TZ || "Europe/Berlin", dateStyle: "medium", timeStyle: "short" });

async function ensureCollection(state, key, { name, description, color, icon }) {
  const known = state.collections[key];
  if (known) {
    try {
      const info = await outline("collections.info", { id: known });
      if (info?.data && !info.data.archivedAt && !info.data.deletedAt) return known;
    } catch (e) { if (e.status !== 404 && e.status !== 403 && e.status !== 400) throw e; }
  }
  // Gleichnamige Sammlung wiederverwenden
  let offset = 0;
  for (;;) {
    const list = await outline("collections.list", { limit: 100, offset });
    const hit = (list?.data || []).find((c) => c.name === name);
    if (hit) { state.collections[key] = hit.id; return hit.id; }
    if (!list?.data || list.data.length < 100) break;
    offset += 100;
  }
  const index = COLLECTION_INDEX[key];
  const created = await outline("collections.create", { name, description, color, icon, permission: "read_write", ...(index ? { index } : {}) });
  state.collections[key] = created.data.id;
  say(`  + Sammlung „${name}“ angelegt`);
  return created.data.id;
}

// Legt einen Eintrag an, falls er fehlt (für Verknüpfungen), und gibt { id, url } zurück
async function ensureDoc(state, key, title, collectionId, { parentDocumentId, text } = {}) {
  const known = state.docs[key];
  if (known?.id) {
    try {
      const info = await outline("documents.info", { id: known.id });
      const d = info?.data;
      if (d && !d.deletedAt) {
        if (d.archivedAt) { await outline("documents.restore", { id: d.id }); say(`  ↺ „${title}“ wiederhergestellt`); }
        if (parentDocumentId && d.parentDocumentId !== parentDocumentId) {
          await outline("documents.move", { id: d.id, collectionId, parentDocumentId });
        }
        known.url = d.url;
        return known;
      }
    } catch (e) { if (![400, 403, 404].includes(e.status)) throw e; }
  }
  const created = await outline("documents.create", { title, text: text || NOTES_DEFAULT, collectionId, publish: true, ...(parentDocumentId ? { parentDocumentId } : {}) });
  state.docs[key] = { id: created.data.id, url: created.data.url, hash: null };
  state.stats.created++;
  say(`  + ${title}`);
  return state.docs[key];
}

// Schreibt den automatischen Teil neu, behält alles ab „Notizen“
async function writeDoc(state, key, title, autoText) {
  const doc = state.docs[key];
  const h = hash(title + "\n" + autoText);
  doc.seen = true;
  doc.title = title;
  if (doc.hash === h) return;
  const info = await outline("documents.info", { id: doc.id });
  const current = info?.data?.text || "";
  const m = current.match(NOTES_RE);
  const notes = m ? current.slice(m.index) : NOTES_DEFAULT;
  const text = `${autoText.trim()}\n\n> Automatisch aus Brainbox abgeglichen · Stand ${now()} · Änderungen oberhalb von „Notizen“ werden überschrieben.\n\n${notes.trim()}\n`;
  await outline("documents.update", { id: doc.id, title, text, publish: true });
  if (doc.hash) { state.stats.updated++; log(`  ~ ${title}`); }
  doc.hash = h;
}

// Anleitung und Spickzettel: von Brainbox geschrieben und bei neuen Fassungen aufgefrischt –
// außer jemand hat die Seite selbst geändert, dann bleibt sie, wie sie ist.
async function writeGuide(state, key, title, text) {
  const doc = state.docs[key];
  const h = hash(title + "\n" + text);
  doc.seen = true;
  doc.title = title;
  if (doc.hash === h) return;
  if (doc.written) {
    const current = (await outline("documents.info", { id: doc.id }))?.data?.text || "";
    if (hash(current) !== doc.written) {
      if (!doc.kept) say(`  · „${title}“ wurde selbst bearbeitet – Brainbox lässt die Seite, wie sie ist`);
      doc.kept = true;
      doc.hash = h;
      return;
    }
  }
  const res = await outline("documents.update", { id: doc.id, title, text, publish: true });
  doc.written = hash(res?.data?.text || text);
  if (doc.hash) { state.stats.updated++; log(`  ~ ${title}`); }
  doc.hash = h;
}

async function ensureStart(state) {
  const read = (name) => { try { return fs.readFileSync(path.join(KIT_DIR, "wiki", name), "utf8"); } catch { return ""; } };
  const pages = [["start:spickzettel", "Spickzettel", read("spickzettel.md")], ["start:anleitung", "Anleitung", read("anleitung.md")]];
  if (!pages.every(([, , text]) => text)) { log("  ! Anleitung fehlt im Bausatz – übersprungen"); return; }
  const col = await ensureCollection(state, "start", { name: "Start", description: "So funktioniert Brainbox: Anleitung und Spickzettel.", color: "#118656", icon: "bookmark" });
  // Spickzettel zuerst anlegen, damit die Anleitung oben steht
  for (const [key, title] of pages) await ensureDoc(state, key, title, col);
  const url = (key, fallback) => state.docs[key]?.url || fallback;
  const links = {
    anleitung: url("start:anleitung", "/home"), spickzettel: url("start:spickzettel", "/home"),
    proxmox: url("pve:overview", "/settings/brainbox-proxmox"), netbird: url("nb:overview", "/settings/brainbox-netbird"),
    bereiche: url("area:overview", "/settings/brainbox"), regeln: url("area:rules", "/settings/brainbox"),
  };
  for (const [key, title, text] of pages) {
    await writeGuide(state, key, title, text.replace(/\{\{(\w+)\}\}/g, (m, k) => links[k] || m).trim() + "\n");
  }
}

async function archiveMissing(state, prefix) {
  for (const [key, doc] of Object.entries(state.docs)) {
    if (!key.startsWith(prefix) || doc.seen) continue;
    try { await outline("documents.archive", { id: doc.id }); say(`  − archiviert: ${doc.title || key}`); state.stats.archived++; } catch (e) {
      if (![400, 403, 404].includes(e.status)) throw e;
    }
    delete state.docs[key];
  }
}

// --- Hilfen ----------------------------------------------------------------------------------
const gb = (bytes) => (bytes ? `${Math.round((bytes / 1024 ** 3) * 10) / 10} GB` : "–");
const uptime = (s) => { if (!s) return "–"; const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600); return d ? `${d} T ${h} Std` : `${h} Std ${Math.floor((s % 3600) / 60)} Min`; };
const norm = (s) => String(s || "").toLowerCase().trim();
const isDomain = (a) => /[a-z]/i.test(a || "") && /\./.test(a || "") && !/\//.test(a || "");
const link = (doc, label) => (doc?.url ? `[${esc(label).replace(/[[\]]/g, "\\$&")}](${doc.url})` : esc(label));
const statusDe = (s) => ({ running: "🟢 läuft", stopped: "⚪ gestoppt", paused: "🟡 pausiert", suspended: "🟡 angehalten" }[s] || s || "–");

async function pveGuests(srv) {
  const res = await pve(srv, "/cluster/resources?type=vm");
  const guests = [];
  for (const r of res || []) {
    const g = {
      vmid: r.vmid, uid: `${srv.name}:${r.vmid}`, server: srv.name, pveUrl: srv.url,
      name: r.name || `${r.type}-${r.vmid}`, node: r.node, type: r.type, status: r.status,
      template: !!r.template, cpus: r.maxcpu, mem: r.maxmem, disk: r.maxdisk, uptime: r.uptime,
      tags: (r.tags || "").split(/[;,]/).map((t) => t.trim()).filter(Boolean), ips: [], notes: "", os: "",
    };
    try {
      const conf = await pve(srv, `/nodes/${g.node}/${g.type}/${g.vmid}/config`);
      g.notes = (conf?.description || "").trim();
      g.os = conf?.ostype || "";
      for (const [k, v] of Object.entries(conf || {})) {
        if (/^net\d+$/.test(k)) { const ip = /ip=([0-9.]+)/.exec(String(v)); if (ip) g.ips.push(ip[1]); }
      }
    } catch { /* ohne Rechte oder Gast weg */ }
    if (g.status === "running") {
      try {
        if (g.type === "lxc") {
          const ifs = await pve(srv, `/nodes/${g.node}/lxc/${g.vmid}/interfaces`);
          for (const i of ifs || []) if (i.name !== "lo" && i.inet) g.ips.push(i.inet.split("/")[0]);
        } else {
          const ag = await pve(srv, `/nodes/${g.node}/qemu/${g.vmid}/agent/network-get-interfaces`);
          for (const i of ag?.result || []) {
            if (i.name === "lo") continue;
            for (const a of i["ip-addresses"] || []) if (a["ip-address-type"] === "ipv4" && !a["ip-address"].startsWith("127.")) g.ips.push(a["ip-address"]);
          }
        }
      } catch { /* kein Gast-Agent oder keine Berechtigung */ }
    }
    g.ips = [...new Set(g.ips)];
    // Zuordnung von Hand: in den Proxmox-Notizen „domain: x.example.de“
    g.manualDomains = [...g.notes.matchAll(/^\s*domains?\s*[:=]\s*(.+)$/gim)].flatMap((m) => m[1].split(/[\s,]+/)).filter(isDomain);
    guests.push(g);
  }
  guests.sort((a, b) => a.vmid - b.vmid);
  return guests;
}

// Schutz eines Reverse-Proxy-Dienstes – nur die Art, nie Passwort, PIN oder Header-Werte
function protection(s) {
  if (s.private) return "nur NetBird";
  const a = s.auth || {};
  const kinds = [];
  if (a.bearer_auth?.enabled) kinds.push("Anmeldung (SSO)");
  if (a.password_auth?.enabled) kinds.push("Passwort");
  if (a.pin_auth?.enabled) kinds.push("PIN");
  if (a.link_auth?.enabled) kinds.push("Link");
  if ((a.header_auths || []).some((h) => h?.enabled)) kinds.push("Header");
  return kinds.join(" + ") || "offen";
}

async function netbirdData() {
  const peers = (await netbird("/api/peers")) || [];
  const networks = (await netbird("/api/networks")) || [];
  const domains = [];
  const resById = new Map();
  for (const n of networks) {
    let resources = [];
    try { resources = (await netbird(`/api/networks/${n.id}/resources`)) || []; } catch { /* ältere NetBird-Version */ }
    for (const r of resources) {
      resById.set(r.id, r);
      if (isDomain(r.address)) domains.push({ address: norm(r.address), source: "network", name: r.name, description: r.description, enabled: r.enabled !== false, network: n.name, groups: (r.groups || []).map((g) => g.name), targets: [] });
    }
  }
  // Reverse-Proxy (NetBird ab 0.65): Dienste mit eigener Domain, die auf ein Gerät oder eine Adresse zeigen
  let services = [];
  let proxyError = null;
  let proxyMissing = false;
  try { services = (await netbird("/api/reverse-proxies/services")) || []; } catch (e) { if (/HTTP 404/.test(e.message)) proxyMissing = true; else proxyError = e.message; }
  for (const s of Array.isArray(services) ? services : []) {
    const address = norm(s.domain || s.name);
    if (!isDomain(address)) continue;
    const targets = (s.targets || []).map((t) => {
      const peer = t.target_type === "peer" ? peers.find((p) => p.id === t.target_id) : null;
      const res = resById.get(t.target_id);
      const resIp = res && !String(res.address || "").includes("/") ? res.address : "";
      return { type: t.target_type, peerId: peer?.id || null, host: String(t.host || peer?.ip || resIp || ""), port: t.port || null, path: t.path || "", enabled: t.enabled !== false };
    });
    const entry = { address, source: "proxy", name: s.name, enabled: s.enabled !== false && !s.terminated, mode: s.mode || "http", listenPort: s.listen_port || null, status: s.meta?.status || "", protection: protection(s), targets };
    const i = domains.findIndex((d) => d.address === address);
    if (i >= 0) { entry.network = domains[i].network; domains[i] = entry; } else domains.push(entry);
  }
  domains.sort((a, b) => (a.source === b.source ? a.address.localeCompare(b.address) : a.source === "proxy" ? -1 : 1));
  return { peers, networks, domains, proxyError, proxyMissing };
}

// Was gehört zusammen? Gast ↔ NetBird-Gerät ↔ Domain
function match(guests, nb) {
  const peerOf = new Map();
  for (const g of guests) {
    const name = norm(g.name);
    const p = nb.peers.find((p) => [p.hostname, p.name].map(norm).includes(name) || norm(p.dns_label).split(".")[0] === name ||
      (p.network_addresses || []).some((a) => g.ips.includes(String(a.net_ip || "").split("/")[0])));
    if (p) peerOf.set(g.uid, p);
  }
  const domainsOf = new Map();
  const add = (vmid, d) => { if (!domainsOf.has(vmid)) domainsOf.set(vmid, new Set()); domainsOf.get(vmid).add(d); };
  for (const g of guests) for (const d of g.manualDomains) add(g.uid, d.toLowerCase());
  // Reverse-Proxy: Das Ziel (NetBird-Gerät oder IP) zeigt, wohin die Domain gehört
  const guestOfPeerId = new Map([...peerOf.entries()].map(([uid, p]) => [p.id, uid]));
  const peerDomains = new Map();
  const viaTarget = new Set();
  for (const d of nb.domains) {
    for (const t of d.targets || []) {
      if (!t.enabled) continue;
      const peer = t.peerId ? nb.peers.find((p) => p.id === t.peerId) : nb.peers.find((p) => t.host && p.ip === t.host);
      if (peer) { if (!peerDomains.has(peer.id)) peerDomains.set(peer.id, new Set()); peerDomains.get(peer.id).add(d.address); viaTarget.add(d.address); }
      const uid = (peer && guestOfPeerId.get(peer.id)) || guests.find((g) => t.host && g.ips.includes(t.host))?.uid;
      if (uid) { add(uid, d.address); viaTarget.add(d.address); }
    }
  }
  // sonst über den Namen: brainbox.example.de → Gast „brainbox“
  for (const d of nb.domains) {
    if (viaTarget.has(d.address)) continue;
    const label = norm(d.address.replace(/^\*\./, "").split(".")[0]);
    for (const g of guests) {
      const n = norm(g.name);
      if (n === label || n.endsWith(`-${label}`) || n.startsWith(`${label}-`)) add(g.uid, d.address);
    }
  }
  return { peerOf, domainsOf, peerDomains };
}

// --- Bereiche: Zuordnungsregeln aus dem Wiki --------------------------------------------------
const RULES_DEFAULT = `Hier legst du fest, was in welchen **Bereich** gehört. Eine Zeile pro Regel, **die erste passende gewinnt** – also Genaues nach oben, Allgemeines nach unten. Änderungen gelten beim nächsten Abgleich (spätestens nach 5 Minuten).

| Muster | Bereich |
|---|---|
| *.morninghosting.de | Minecraft-Server |
| tag:minecraft | Minecraft-Server |
| name:mc-* | Minecraft-Server |

### So funktionieren Muster

- \`*.morninghosting.de\` – alle Domains unter morninghosting.de (auch morninghosting.de selbst)
- \`survival.morninghosting.de\` – genau diese eine Domain
- \`name:mc-*\` – VMs, Container und NetBird-Geräte, deren Name mit „mc-“ beginnt
- \`tag:minecraft\` – VMs und Container mit dem Proxmox-Tag „minecraft“
- \`gruppe:Server\` – NetBird-Geräte in der Gruppe „Server“
- \`*\` steht für beliebig viele Zeichen

### Unterteilen

Mit \`/\` legst du Unterbereiche an, z. B. \`Minecraft-Server/Survival\`. Jeder Bereich bekommt einen eigenen Eintrag in der Sammlung „Bereiche“, Unterbereiche hängen darunter.

### Wer erbt was

Eine VM gehört zum Bereich ihrer Domain, ein NetBird-Gerät zum Bereich seiner VM – außer eine eigene Regel passt vorher.
`;

const unmd = (s) => String(s || "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\\(.)/g, "$1").replace(/[`*]{2}/g, "").replace(/`/g, "").trim();

function parseRules(text) {
  const rules = [];
  for (const line of String(text || "").split("\n")) {
    const m = line.match(/^\s*\|([^|]*)\|([^|]*)\|\s*$/);
    if (!m) continue;
    let pat = unmd(m[1]);
    const area = unmd(m[2]).split("/").map((x) => x.trim()).filter(Boolean).join("/");
    if (!pat || !area || /^[-:\s]+$/.test(pat) || /^muster$/i.test(pat)) continue;
    let type = "domain";
    const t = pat.match(/^(name|tag|gruppe|group)\s*:\s*(.+)$/i);
    if (t) { type = t[1].toLowerCase() === "group" ? "gruppe" : t[1].toLowerCase(); pat = t[2].trim(); }
    const re = new RegExp(`^${pat.split("*").map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`, "i");
    rules.push({ type, pat, re, apex: type === "domain" && pat.startsWith("*.") ? pat.slice(2).toLowerCase() : null, area });
  }
  return rules;
}

function classify(rules, guests, nb, peerOf, domainsOf, peerDomains = new Map()) {
  // Treffer = { idx, area }: Position der Regel in der Liste – die weiter oben gewinnt, egal auf welchem Weg
  const NONE = { idx: Infinity, area: null };
  const hit = (type, values) => {
    const vals = values.filter(Boolean).map(norm);
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      if (r.type === type && vals.some((v) => r.re.test(v) || (r.apex && r.apex === v))) return { idx: i, area: r.area };
    }
    return NONE;
  };
  const best = (...hits) => hits.reduce((a, b) => (b.idx < a.idx ? b : a), NONE);
  const domainVariants = (d) => { const bare = d.replace(/^\*\./, ""); return [d, bare, `x.${bare}`]; };
  const domains = new Map(); // Domain → { source, vmids:Set }
  for (const d of nb.domains) domains.set(d.address.toLowerCase(), { source: d.source === "proxy" ? "NetBird · Reverse-Proxy" : `NetBird · ${d.network}`, vmids: new Set() });
  for (const [vmid, set] of domainsOf) for (const d of set) {
    const k = d.toLowerCase();
    if (!domains.has(k)) domains.set(k, { source: "Proxmox-Notizen", vmids: new Set() });
    domains.get(k).vmids.add(vmid);
  }
  const domainHit = new Map();
  for (const d of domains.keys()) domainHit.set(d, hit("domain", domainVariants(d)));
  const guestHit = new Map();
  for (const g of guests) {
    const viaDomains = [...(domainsOf.get(g.uid) || [])].map((d) => domainHit.get(d.toLowerCase()) || NONE);
    guestHit.set(g.uid, best(hit("name", [g.name]), hit("tag", g.tags), ...viaDomains));
  }
  const peerHit = new Map();
  const guestOfPeerId = new Map([...peerOf.entries()].map(([vmid, p]) => [p.id, vmid]));
  for (const p of nb.peers) {
    const vmid = guestOfPeerId.get(p.id);
    peerHit.set(p.id, best(hit("name", [p.name, p.hostname]), hit("gruppe", (p.groups || []).map((x) => x.name)),
      vmid !== undefined ? guestHit.get(vmid) : NONE, hit("domain", [p.dns_label, ...(p.extra_dns_labels || [])]),
      ...[...(peerDomains.get(p.id) || [])].map((d) => domainHit.get(d) || NONE)));
  }
  const areaOf = (m) => new Map([...m.entries()].map(([k, v]) => [k, v.area]));
  // Alle Bereiche aus den Regeln, inklusive Oberbereichen
  const areas = new Set();
  for (const r of rules) { const parts = r.area.split("/"); for (let i = 1; i <= parts.length; i++) areas.add(parts.slice(0, i).join("/")); }
  return {
    domains, domainArea: areaOf(domainHit), guestArea: areaOf(guestHit), peerArea: areaOf(peerHit),
    // Baumreihenfolge: Oberbereich, dann seine Unterbereiche (Eltern stehen immer vor Kindern)
    areas: [...areas].sort((a, b) => { const x = a.split("/"), y = b.split("/"); for (let i = 0; i < Math.min(x.length, y.length); i++) { const c = x[i].localeCompare(y[i], "de"); if (c) return c; } return x.length - y.length; }),
  };
}

// --- Abgleich ---------------------------------------------------------------------------------
async function main() {
  if (TEST === "pve" || TEST === "proxmox") {
    const only = args[args.indexOf("--test") + 2];
    const list = SERVERS.filter((x) => !only || only.startsWith("--") || x.name === only);
    if (!list.length) throw new Error(only ? `Kein Proxmox-Server „${only}“` : "Kein Proxmox-Server eingetragen");
    let bad = 0;
    for (const srv of list) {
      try {
        const v = await pve(srv, "/version");
        const guests = await pve(srv, "/cluster/resources?type=vm");
        say(`ok Proxmox „${srv.name}“ ${v?.version || "?"} · ${guests?.length ?? 0} VMs/Container sichtbar`);
      } catch (e) { bad++; say(`Fehler: ${e.message}`); }
    }
    if (bad) process.exit(1);
    return;
  }
  if (TEST === "netbird") {
    const peers = await netbird("/api/peers");
    say(`ok NetBird · ${peers?.length ?? 0} Geräte sichtbar`);
    return;
  }
  if (TEST === "wiki") {
    const me = await outline("auth.info", {});
    say(`ok Wiki · angemeldet als ${me?.data?.user?.name}`);
    return;
  }

  const usePve = SERVERS.length > 0;
  const useNb = !!(NB_URL && cfg.NETBIRD_TOKEN);
  if (!cfg.OUTLINE_API_KEY) { log("Noch nicht eingerichtet: brainbox-connect proxmox bzw. brainbox-connect netbird"); return; }
  const state = loadState();
  state.collections ||= {};
  state.docs ||= {};
  state.stats = { created: 0, updated: 0, archived: 0 };
  if (!usePve && !useNb) {
    // Noch nichts verbunden: nur Anleitung und Spickzettel pflegen
    await ensureStart(state);
    for (const d of Object.values(state.docs)) delete d.seen;
    delete state.stats;
    state.summary = { at: new Date().toISOString(), proxmox: null, netbird: null, areas: [], loose: 0 };
    state.lastRun = new Date().toISOString();
    saveState(state);
    log("Weder Proxmox noch NetBird verbunden – Anleitung ist aktuell.");
    return;
  }
  for (const d of Object.values(state.docs)) d.seen = false;
  // Alte Einträge aus der Zeit mit nur einem Server (pve:<VMID>) dem ersten Server zuordnen
  if (usePve) {
    for (const k of Object.keys(state.docs)) {
      const m = k.match(/^pve:(\d+)$/);
      if (m && !state.docs[`pve:${SERVERS[0].name}:${m[1]}`]) { state.docs[`pve:${SERVERS[0].name}:${m[1]}`] = state.docs[k]; delete state.docs[k]; }
    }
  }

  // Proxmox: jeder Server einzeln – fällt einer aus, bleiben seine Einträge stehen
  const servers = [];
  const guests = [];
  for (const srv of SERVERS) {
    const info = { srv, ok: false, error: "", version: "", nodes: [], guests: [] };
    if (srv.mode === "agent") agentSnapshot(srv);
    try {
      info.version = (await pve(srv, "/version"))?.version || "";
      info.nodes = (await pve(srv, "/nodes")) || [];
      info.guests = await pveGuests(srv);
      info.ok = true;
      guests.push(...info.guests);
    } catch (e) {
      info.error = e.message;
      say(`  ! ${e.message}`);
      for (const [k, d] of Object.entries(state.docs)) if (k === `pvesrv:${srv.name}` || (k.startsWith(`pve:${srv.name}:`) && /^\d+$/.test(k.slice(`pve:${srv.name}:`.length)))) d.seen = true;
    }
    servers.push(info);
  }
  const nb = useNb ? await netbirdData() : { peers: [], networks: [], domains: [] };
  const { peerOf, domainsOf, peerDomains } = match(guests, nb);
  const pveLink = (g) => `${g.pveUrl}/#v1:0:=${g.type === "lxc" ? "lxc" : "qemu"}%2F${g.vmid}`;
  const srvTitle = (name) => `${name} (Proxmox-Server)`;

  // 1. Sammlungen und alle Einträge sicherstellen (damit Verknüpfungen stimmen)
  let colPve, colNb;
  if (usePve) {
    colPve = await ensureCollection(state, "proxmox", { name: "Proxmox", description: "Alle VMs und Container – automatisch aus Proxmox. Eigene Notizen unter „Notizen“ bleiben erhalten.", color: "#E57000", icon: "server" });
    await ensureDoc(state, "pve:overview", "Proxmox – Übersicht", colPve);
    for (const info of servers) {
      const sdoc = await ensureDoc(state, `pvesrv:${info.srv.name}`, srvTitle(info.srv.name), colPve);
      for (const g of info.guests) await ensureDoc(state, `pve:${g.uid}`, `${g.name} (${g.vmid})`, colPve, { parentDocumentId: sdoc.id });
    }
  }
  if (useNb) {
    colNb = await ensureCollection(state, "netbird", { name: "NetBird", description: "Geräte, Netzwerke und Domains aus NetBird – automatisch abgeglichen.", color: "#F68330", icon: "globe" });
    await ensureDoc(state, "nb:overview", "NetBird – Übersicht", colNb);
    await ensureDoc(state, "nb:domains", "Domains", colNb);
    for (const p of nb.peers) await ensureDoc(state, `nb:${p.id}`, p.name, colNb);
  }
  const guestOfPeer = new Map([...peerOf.entries()].map(([vmid, p]) => [p.id, guests.find((g) => g.uid === vmid)]));

  const colAreas = await ensureCollection(state, "areas", { name: "Bereiche", description: "Alles nach Bereichen sortiert – Regeln in „Zuordnungsregeln“, z. B. *.morninghosting.de → Minecraft-Server.", color: "#2F7A5B", icon: "shapes" });
  const rulesDoc = await ensureDoc(state, "area:rules", "Zuordnungsregeln", colAreas, { text: RULES_DEFAULT });
  rulesDoc.seen = true;
  rulesDoc.title = "Zuordnungsregeln";
  rulesDoc.hash = "regeln-gehoeren-dir";
  const rulesText = (await outline("documents.info", { id: rulesDoc.id }))?.data?.text || "";
  const rules = parseRules(rulesText);
  const cls = classify(rules, guests, nb, peerOf, domainsOf, peerDomains);
  // Domain als Link (Web) oder mit Port (TCP/UDP/TLS über den Reverse-Proxy)
  const domInfo = new Map(nb.domains.map((d) => [d.address, d]));
  const domLink = (addr) => {
    const d = domInfo.get(addr);
    if (d?.source === "proxy" && d.mode !== "http") return esc(`${addr}${d.listenPort ? `:${d.listenPort}` : ""}`);
    return `[${esc(addr)}](https://${addr.replace(/^\*\./, "")})`;
  };
  await ensureDoc(state, "area:overview", "Bereiche – Übersicht", colAreas);
  for (const a of cls.areas) {
    const parent = a.includes("/") ? state.docs[`area:${a.slice(0, a.lastIndexOf("/"))}`]?.id : undefined;
    await ensureDoc(state, `area:${a}`, a.split("/").pop(), colAreas, { parentDocumentId: parent });
  }
  const areaLink = (a) => (a ? link(state.docs[`area:${a}`], a.replace(/\//g, " › ")) : "–");

  // 2. Inhalte schreiben
  if (usePve) {
    for (const g of guests) {
      const p = peerOf.get(g.uid);
      const doms = [...(domainsOf.get(g.uid) || [])];
      const rows = [
        ["ID", g.vmid], ["Server", link(state.docs[`pvesrv:${g.server}`], g.server)], ["Typ", g.type === "lxc" ? "LXC-Container" : "VM"], ["Node", g.node], ["Status", g.template ? "📄 Vorlage" : statusDe(g.status)],
        ["CPU", g.cpus ? `${g.cpus} Kerne` : "–"], ["RAM", gb(g.mem)], ["Disk", gb(g.disk)], ["Betriebssystem", g.os || "–"],
        ["IP-Adressen", g.ips.join(", ") || "–"], ["Tags", g.tags.join(", ") || "–"],
        ["NetBird", p ? `${link(state.docs[`nb:${p.id}`], p.dns_label || p.name)} · ${p.ip} · ${p.connected ? "🟢 online" : "⚪ offline"}` : "–"],
        ["Domains", doms.map(domLink).join(", ") || "–"],
        ["Bereich", areaLink(cls.guestArea.get(g.uid))],
        ["Proxmox", `[In Proxmox öffnen](${pveLink(g)})`],
      ];
      const table = ["| Eigenschaft | Wert |", "|---|---|", ...rows.map(([k, v]) => `| **${k}** | ${["Proxmox", "Domains", "NetBird", "Bereich", "Server"].includes(k) ? v : esc(v)} |`)].join("\n");
      const notes = g.notes ? `\n\n### Beschreibung aus Proxmox\n\n${g.notes.replace(/\r/g, "").split(/\n+/).join("\n\n")}` : "";
      await writeDoc(state, `pve:${g.uid}`, `${g.name} (${g.vmid})`, `${table}${notes}`);
    }
    const header = "| Server | ID | Name | Status | IP | NetBird | Domains | Bereich |\n|---|---|---|---|---|---|---|---|";
    const row = (g, withServer = true) => {
      const p = peerOf.get(g.uid);
      return `|${withServer ? ` ${link(state.docs[`pvesrv:${g.server}`], g.server)} |` : ""} ${g.vmid} | ${link(state.docs[`pve:${g.uid}`], g.name)} | ${g.template ? "📄 Vorlage" : statusDe(g.status)} | ${esc(g.ips[0] || "–")} | ${p ? (p.connected ? "🟢 " : "⚪ ") + esc(p.dns_label || p.name) : "–"} | ${esc([...(domainsOf.get(g.uid) || [])].join(", ") || "–")} | ${areaLink(cls.guestArea.get(g.uid))} |`;
    };
    const pct = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : "–");
    for (const info of servers) {
      const name = info.srv.name;
      const head = info.ok
        ? `🟢 **${info.srv.mode === "agent" ? "meldet sich" : "erreichbar"}** · Proxmox VE ${esc(info.version)} · **${info.guests.length}** VMs und Container, davon **${info.guests.filter((g) => g.status === "running").length}** an`
        : `🔴 **${info.srv.mode === "agent" ? "keine Meldung" : "nicht erreichbar"}** – ${esc(info.error)}\n\nDie Einträge bleiben stehen, bis der Server wieder antwortet.`;
      const nodes = info.nodes.length
        ? `\n\n### Nodes\n\n| Node | Status | CPU | RAM | Läuft seit |\n|---|---|---|---|---|\n${info.nodes.map((n) => `| ${esc(n.node)} | ${n.status === "online" ? "🟢 online" : "⚪ " + esc(n.status || "offline")} | ${pct((n.cpu || 0) * (n.maxcpu || 0), n.maxcpu)} von ${n.maxcpu || "–"} Kernen | ${gb(n.mem)} von ${gb(n.maxmem)} | ${uptime(n.uptime)} |`).join("\n")}`
        : "";
      const list = info.guests.length
        ? `\n\n### VMs und Container\n\n| ID | Name | Status | IP | NetBird | Domains | Bereich |\n|---|---|---|---|---|---|---|\n${info.guests.map((g) => row(g, false)).join("\n")}`
        : "";
      const addr = info.srv.url ? `| **Adresse** | [${esc(info.srv.url)}](${info.srv.url}) |` : "| **Adresse** | – |";
      const access = info.srv.mode === "agent"
        ? `| **Verbindung** | meldet sich selbst (Brainbox-Agent, alle 5 Minuten)${info.srv.snap ? ` · zuletzt ${new Date(info.srv.snap.receivedAt).toLocaleString("de-DE", { timeZone: process.env.TZ || "Europe/Berlin" })}` : " · noch keine Meldung"} |`
        : `| **Zugang** | ${esc(info.srv.tokenId)} (nur lesen) |`;
      await writeDoc(state, `pvesrv:${name}`, srvTitle(name),
        `${head}\n\n| Eigenschaft | Wert |\n|---|---|\n${addr}\n${access}${nodes}${list}`);
    }
    const running = guests.filter((g) => g.status === "running").length;
    const srvRows = servers.map((i) => `| ${link(state.docs[`pvesrv:${i.srv.name}`], i.srv.name)} | ${i.ok ? (i.srv.mode === "agent" ? "🟢 meldet sich" : "🟢 erreichbar") : "🔴 nicht erreichbar"} | ${esc(i.version || "–")} | ${i.nodes.length || "–"} | ${i.guests.length} |`);
    await writeDoc(state, "pve:overview", "Proxmox – Übersicht",
      `**${servers.length}** Proxmox-Server · **${guests.length}** VMs und Container, davon **${running}** gerade an. Weitere Server verbindest du unter [Einstellungen → Brainbox → Proxmox-Server](/settings/brainbox-proxmox).\n\n| Server | Status | Version | Nodes | VMs/Container |\n|---|---|---|---|---|\n${srvRows.join("\n")}\n\n### Alle VMs und Container\n\n${header}\n${guests.map((g) => row(g)).join("\n")}`);
  }

  if (useNb) {
    for (const p of nb.peers) {
      const g = guestOfPeer.get(p.id);
      const rows = [
        ["Name", p.name], ["Hostname", p.hostname], ["NetBird-IP", p.ip], ["DNS-Name", p.dns_label],
        ["Weitere DNS-Namen", (p.extra_dns_labels || []).join(", ") || "–"], ["Status", p.connected ? "🟢 online" : "⚪ offline"],
        ["Zuletzt gesehen", p.last_seen ? new Date(p.last_seen).toLocaleString("de-DE", { timeZone: process.env.TZ || "Europe/Berlin" }) : "–"],
        ["Betriebssystem", p.os], ["NetBird-Version", p.version], ["Gruppen", (p.groups || []).map((x) => x.name).join(", ") || "–"],
        ["Proxmox", g ? link(state.docs[`pve:${g.uid}`], `${g.name} (${g.vmid})`) : "–"],
        ["Domains", [...(peerDomains.get(p.id) || [])].sort().map(domLink).join(", ") || "–"],
        ["Bereich", areaLink(cls.peerArea.get(p.id))],
      ];
      const table = ["| Eigenschaft | Wert |", "|---|---|", ...rows.map(([k, v]) => `| **${k}** | ${["Proxmox", "Domains", "Bereich"].includes(k) ? v : esc(v || "–")} |`)].join("\n");
      await writeDoc(state, `nb:${p.id}`, p.name, table);
    }
    const online = nb.peers.filter((p) => p.connected).length;
    const proxyN = nb.domains.filter((d) => d.source === "proxy").length;
    const proxyNote = nb.proxyError
      ? `\n\n⚠️ Den Reverse-Proxy konnte Brainbox nicht lesen (${esc(nb.proxyError)}). Der NetBird-Zugang braucht dafür die Rolle **Admin** – neuen Token unter [Einstellungen → Brainbox → NetBird](/settings/brainbox-netbird) eintragen.`
      : nb.proxyMissing ? "\n\nℹ️ Dein NetBird hat noch keinen Reverse-Proxy (gibt es ab NetBird 0.65). Nach einem NetBird-Update erscheinen dessen Domains hier von selbst." : "";
    await writeDoc(state, "nb:overview", "NetBird – Übersicht",
      `**${nb.peers.length}** Geräte, davon **${online}** online · **${nb.networks.length}** Netzwerke · **${nb.domains.length}** Domains, davon **${proxyN}** über den Reverse-Proxy ([Liste](${state.docs["nb:domains"].url}))${proxyNote}\n\n| Gerät | NetBird-IP | DNS-Name | Status | Proxmox | Domains |\n|---|---|---|---|---|---|\n${nb.peers.map((p) => {
        const g = guestOfPeer.get(p.id);
        return `| ${link(state.docs[`nb:${p.id}`], p.name)} | ${esc(p.ip)} | ${esc(p.dns_label || "–")} | ${p.connected ? "🟢 online" : "⚪ offline"} | ${g ? link(state.docs[`pve:${g.uid}`], `${g.name} (${g.vmid})`) : "–"} | ${[...(peerDomains.get(p.id) || [])].sort().map(domLink).join(", ") || "–"} |`;
      }).join("\n")}`);
    const PROXY_STATUS = { active: "🟢 aktiv", pending: "🟡 wird eingerichtet", certificate_pending: "🟡 Zertifikat kommt", tunnel_not_created: "🟠 kein Tunnel", certificate_failed: "🔴 Zertifikat fehlgeschlagen", error: "🔴 Fehler" };
    const domStatus = (d) => (!d.enabled ? "⚪ aus" : d.source === "proxy" ? PROXY_STATUS[d.status] || esc(d.status || "–") : "🟢 an");
    const domSource = (d) => (d.source === "proxy" ? `Reverse-Proxy · ${d.mode === "http" ? "Web" : esc(d.mode.toUpperCase())}` : `Netzwerk · ${esc(d.network)}`);
    const domTarget = (d) => (d.targets || []).filter((t) => t.enabled).map((t) => {
      const p = t.peerId ? nb.peers.find((x) => x.id === t.peerId) : null;
      return `${p ? link(state.docs[`nb:${p.id}`], p.name) : esc(t.host || "?")}${t.port ? `:${t.port}` : ""}${t.path && t.path !== "/" ? esc(t.path) : ""}`;
    }).join(", ") || "–";
    const domOwners = (d) => {
      const gs = [...domainsOf.entries()].filter(([, set]) => set.has(d.address)).map(([v]) => guests.find((g) => g.uid === v)).filter(Boolean);
      if (gs.length) return gs.map((g) => link(state.docs[`pve:${g.uid}`], `${g.name} (${g.vmid})`)).join(", ");
      const ps = nb.peers.filter((p) => peerDomains.get(p.id)?.has(d.address));
      return ps.map((p) => link(state.docs[`nb:${p.id}`], p.name)).join(", ") || "–";
    };
    const domRows = nb.domains.map((d) => `| ${domLink(d.address)} | ${domSource(d)} | ${domTarget(d)} | ${domStatus(d)} | ${esc(d.protection || "–")} | ${domOwners(d)} | ${areaLink(cls.domainArea.get(d.address))} |`);
    await writeDoc(state, "nb:domains", "Domains",
      `Alle Domains aus NetBird und wohin sie zeigen – vom **Reverse-Proxy** (im NetBird-Dashboard unter Reverse Proxy → Services) und aus den **Netzwerken**. Zugeordnet wird über das Ziel des Dienstes (NetBird-Gerät oder IP der VM), sonst über den Namen (z. B. **brainbox**.morncloud.de → Gast „brainbox“) oder von Hand mit einer Zeile \`domain: name.example.de\` in den Proxmox-Notizen des Gasts.${proxyNote}\n\n| Domain | Quelle | Ziel | Status | Schutz | Gehört zu | Bereich |\n|---|---|---|---|---|---|---|\n${domRows.join("\n") || "| – | – | – | – | – | – | – |"}`);
  }

  // Bereiche: je Bereich ein Eintrag mit Domains, VMs/Containern und Geräten
  const inArea = (map, a) => [...map.entries()].filter(([, v]) => v === a).map(([k]) => k);
  const guestRow = (g) => `| ${link(state.docs[`pve:${g.uid}`], `${g.name} (${g.vmid})`)} | ${g.template ? "📄 Vorlage" : statusDe(g.status)} | ${esc(g.ips[0] || "–")} | ${esc([...(domainsOf.get(g.uid) || [])].join(", ") || "–")} |`;
  const peerRow = (p) => `| ${link(state.docs[`nb:${p.id}`], p.name)} | ${esc(p.ip)} | ${p.connected ? "🟢 online" : "⚪ offline"} |`;
  const domainRow = (d) => {
    const info = cls.domains.get(d);
    const owners = [...(info?.vmids || [])].map((v) => guests.find((g) => g.uid === v)).filter(Boolean);
    return `| [${esc(d)}](https://${d.replace(/^\*\./, "")}) | ${esc(info?.source || "–")} | ${owners.map((g) => link(state.docs[`pve:${g.uid}`], `${g.name} (${g.vmid})`)).join(", ") || "–"} |`;
  };
  const section = (title, head, rows) => (rows.length ? `\n\n### ${title}\n\n${head}\n${rows.join("\n")}` : "");
  const summary = [];
  for (const a of cls.areas) {
    const ds = inArea(cls.domainArea, a).sort();
    const gs = inArea(cls.guestArea, a).map((v) => guests.find((g) => g.uid === v)).filter(Boolean);
    const ps = inArea(cls.peerArea, a).map((id) => nb.peers.find((p) => p.id === id)).filter(Boolean);
    const subs = cls.areas.filter((x) => x.startsWith(`${a}/`) && x.split("/").length === a.split("/").length + 1);
    summary.push({ a, ds, gs, ps });
    const head = `**${ds.length}** Domains · **${gs.length}** VMs und Container · **${ps.length}** NetBird-Geräte` +
      (subs.length ? `\n\nUnterbereiche: ${subs.map((x) => areaLink(x)).join(" · ")}` : "") +
      `\n\nZugeordnet über die [Zuordnungsregeln](${rulesDoc.url}).`;
    const body = head +
      section("Domains", "| Domain | Quelle | Gehört zu |\n|---|---|---|", ds.map(domainRow)) +
      section("VMs und Container", "| Name | Status | IP | Domains |\n|---|---|---|---|", gs.map(guestRow)) +
      section("NetBird-Geräte", "| Gerät | NetBird-IP | Status |\n|---|---|---|", ps.map(peerRow)) +
      (!ds.length && !gs.length && !ps.length ? "\n\n_Noch nichts zugeordnet._" : "");
    await writeDoc(state, `area:${a}`, a.split("/").pop(), body);
  }
  const loose = {
    ds: [...cls.domainArea.entries()].filter(([, v]) => !v).map(([k]) => k).sort(),
    gs: guests.filter((g) => !cls.guestArea.get(g.uid)),
    ps: nb.peers.filter((p) => !cls.peerArea.get(p.id)),
  };
  const overRows = summary.map(({ a, ds, gs, ps }) => `| ${"  ".repeat(a.split("/").length - 1)}${areaLink(a)} | ${ds.length} | ${gs.length} | ${ps.length} |`);
  await writeDoc(state, "area:overview", "Bereiche – Übersicht",
    `Alles nach Bereichen sortiert. Bereiche und Muster legst du in den [Zuordnungsregeln](${rulesDoc.url}) fest.\n\n| Bereich | Domains | VMs/Container | NetBird-Geräte |\n|---|---|---|---|\n${overRows.join("\n") || "| – | – | – | – |"}` +
    `\n\n### Noch ohne Bereich\n\n${[
      loose.ds.length ? `**Domains:** ${loose.ds.map(esc).join(", ")}` : "",
      loose.gs.length ? `**VMs und Container:** ${loose.gs.map((g) => link(state.docs[`pve:${g.uid}`], g.name)).join(", ")}` : "",
      loose.ps.length ? `**NetBird-Geräte:** ${loose.ps.map((p) => link(state.docs[`nb:${p.id}`], p.name)).join(", ")}` : "",
    ].filter(Boolean).join("\n\n") || "Alles ist einem Bereich zugeordnet. 🎉"}`);

  // 3. Anleitung und Spickzettel (mit Links auf die Übersichten)
  await ensureStart(state);

  // 4. Zusammenfassung für die Startseite des Wikis (/zentrale/api/summary)
  state.summary = {
    at: new Date().toISOString(),
    proxmox: usePve ? {
      servers: servers.map((i) => ({
        name: i.srv.name, ok: i.ok, version: i.version, nodes: i.nodes.length, agent: i.srv.mode === "agent",
        guests: i.guests.length, running: i.guests.filter((g) => g.status === "running").length,
        url: state.docs[`pvesrv:${i.srv.name}`]?.url || null,
      })),
      guests: guests.length,
      running: guests.filter((g) => g.status === "running").length,
    } : null,
    netbird: useNb ? { peers: nb.peers.length, online: nb.peers.filter((p) => p.connected).length, domains: nb.domains.length, proxies: nb.domains.filter((d) => d.source === "proxy").length, networks: nb.networks.length } : null,
    areas: summary.filter(({ a }) => !a.includes("/")).map(({ a, ds, gs, ps }) => ({ name: a, url: state.docs[`area:${a}`]?.url || null, domains: ds.length, guests: gs.length, peers: ps.length })),
    loose: loose.ds.length + loose.gs.length + loose.ps.length,
  };

  // 5. Verschwundene Einträge archivieren (nicht löschen)
  if (usePve) { await archiveMissing(state, "pve:"); await archiveMissing(state, "pvesrv:"); }
  if (useNb) await archiveMissing(state, "nb:");
  await archiveMissing(state, "area:");
  for (const d of Object.values(state.docs)) delete d.seen;

  const { created, updated, archived } = state.stats;
  delete state.stats;
  state.lastRun = new Date().toISOString();
  saveState(state);
  const parts = [];
  if (usePve) parts.push(`Proxmox: ${servers.length} Server, ${guests.length} Gäste${servers.some((i) => !i.ok) ? ` (${servers.filter((i) => !i.ok).length} nicht erreichbar)` : ""}`);
  if (useNb) parts.push(`NetBird: ${nb.peers.length} Geräte, ${nb.domains.length} Domains (${nb.domains.filter((d) => d.source === "proxy").length} Reverse-Proxy)${nb.proxyError ? " – Reverse-Proxy nicht lesbar" : ""}`);
  parts.push(`Bereiche: ${cls.areas.length}`);
  const changes = `${created} neu, ${updated} geändert, ${archived} archiviert`;
  if (!QUIET || created || updated || archived) say(`Abgleich fertig · ${parts.join(" · ")} · ${changes}`);
}

main().catch((e) => { console.error(`Fehler: ${e.message}`); process.exit(1); });
