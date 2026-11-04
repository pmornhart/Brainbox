#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Brainbox-Abgleich: Proxmox und NetBird → Wiki
//
// Legt für jede VM, jeden Container, jedes NetBird-Gerät und jede Domain einen
// Wiki-Eintrag an, hält ihn aktuell und verknüpft, was zusammengehört.
// Alles ab der Überschrift „Notizen“ gehört dir und bleibt erhalten.
//
//   node sync.mjs              abgleichen
//   node sync.mjs --test pve   nur Verbindung zu Proxmox prüfen
//   node sync.mjs --test netbird
//   node sync.mjs --quiet      nur Fehler und Änderungen ausgeben
//
// Einstellungen: /etc/brainbox/connect.env  ·  Zustand: /var/lib/brainbox-connect/state.json
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
const PVE_URL = (cfg.PVE_URL || "").replace(/\/$/, "");
const NB_URL = (cfg.NETBIRD_URL || "").replace(/\/$/, "");

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
function pveTls() {
  const ca = cfg.PVE_CA_FILE && fs.existsSync(cfg.PVE_CA_FILE) ? fs.readFileSync(cfg.PVE_CA_FILE) : undefined;
  return { ca, insecure: cfg.PVE_INSECURE === "1" || cfg.PVE_INSECURE === "yes" };
}
async function pve(p) {
  const res = await request(`${PVE_URL}/api2/json${p}`, {
    headers: { Authorization: `PVEAPIToken=${cfg.PVE_TOKEN_ID}=${cfg.PVE_TOKEN_SECRET}` },
    ...pveTls(),
  });
  if (res.status !== 200) {
    const err = new Error(`Proxmox ${p}: HTTP ${res.status} ${(res.json?.message || res.text || "").toString().slice(0, 120)}`);
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
  const created = await outline("collections.create", { name, description, color, icon, permission: "read_write" });
  state.collections[key] = created.data.id;
  say(`  + Sammlung „${name}“ angelegt`);
  return created.data.id;
}

// Legt einen Eintrag an, falls er fehlt (für Verknüpfungen), und gibt { id, url } zurück
async function ensureDoc(state, key, title, collectionId) {
  const known = state.docs[key];
  if (known?.id) {
    try {
      const info = await outline("documents.info", { id: known.id });
      const d = info?.data;
      if (d && !d.deletedAt) {
        if (d.archivedAt) { await outline("documents.restore", { id: d.id }); say(`  ↺ „${title}“ wiederhergestellt`); }
        known.url = d.url;
        return known;
      }
    } catch (e) { if (![400, 403, 404].includes(e.status)) throw e; }
  }
  const created = await outline("documents.create", { title, text: NOTES_DEFAULT, collectionId, publish: true });
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
const link = (doc, label) => (doc?.url ? `[${esc(label)}](${doc.url})` : esc(label));
const statusDe = (s) => ({ running: "🟢 läuft", stopped: "⚪ gestoppt", paused: "🟡 pausiert", suspended: "🟡 angehalten" }[s] || s || "–");

async function pveGuests() {
  const res = await pve("/cluster/resources?type=vm");
  const guests = [];
  for (const r of res || []) {
    const g = {
      vmid: r.vmid, name: r.name || `${r.type}-${r.vmid}`, node: r.node, type: r.type, status: r.status,
      template: !!r.template, cpus: r.maxcpu, mem: r.maxmem, disk: r.maxdisk, uptime: r.uptime,
      tags: (r.tags || "").split(/[;,]/).map((t) => t.trim()).filter(Boolean), ips: [], notes: "", os: "",
    };
    try {
      const conf = await pve(`/nodes/${g.node}/${g.type}/${g.vmid}/config`);
      g.notes = (conf?.description || "").trim();
      g.os = conf?.ostype || "";
      for (const [k, v] of Object.entries(conf || {})) {
        if (/^net\d+$/.test(k)) { const ip = /ip=([0-9.]+)/.exec(String(v)); if (ip) g.ips.push(ip[1]); }
      }
    } catch { /* ohne Rechte oder Gast weg */ }
    if (g.status === "running") {
      try {
        if (g.type === "lxc") {
          const ifs = await pve(`/nodes/${g.node}/lxc/${g.vmid}/interfaces`);
          for (const i of ifs || []) if (i.name !== "lo" && i.inet) g.ips.push(i.inet.split("/")[0]);
        } else {
          const ag = await pve(`/nodes/${g.node}/qemu/${g.vmid}/agent/network-get-interfaces`);
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

async function netbirdData() {
  const peers = (await netbird("/api/peers")) || [];
  const networks = (await netbird("/api/networks")) || [];
  const domains = [];
  for (const n of networks) {
    let resources = [];
    try { resources = (await netbird(`/api/networks/${n.id}/resources`)) || []; } catch { /* ältere NetBird-Version */ }
    for (const r of resources) {
      if (isDomain(r.address)) domains.push({ address: r.address, name: r.name, description: r.description, enabled: r.enabled !== false, network: n.name, groups: (r.groups || []).map((g) => g.name) });
    }
  }
  return { peers, networks, domains };
}

// Was gehört zusammen? Gast ↔ NetBird-Gerät ↔ Domain
function match(guests, nb) {
  const peerOf = new Map();
  for (const g of guests) {
    const name = norm(g.name);
    const p = nb.peers.find((p) => [p.hostname, p.name].map(norm).includes(name) || norm(p.dns_label).split(".")[0] === name ||
      (p.network_addresses || []).some((a) => g.ips.includes(String(a.net_ip || "").split("/")[0])));
    if (p) peerOf.set(g.vmid, p);
  }
  const domainsOf = new Map();
  const add = (vmid, d) => { if (!domainsOf.has(vmid)) domainsOf.set(vmid, new Set()); domainsOf.get(vmid).add(d); };
  for (const g of guests) for (const d of g.manualDomains) add(g.vmid, d.toLowerCase());
  for (const d of nb.domains) {
    const label = norm(d.address.replace(/^\*\./, "").split(".")[0]);
    for (const g of guests) if (norm(g.name) === label) add(g.vmid, d.address);
  }
  return { peerOf, domainsOf };
}

// --- Abgleich ---------------------------------------------------------------------------------
async function main() {
  if (TEST === "pve" || TEST === "proxmox") {
    const v = await pve("/version");
    const guests = await pve("/cluster/resources?type=vm");
    say(`ok Proxmox ${v?.version || "?"} · ${guests?.length ?? 0} VMs/Container sichtbar`);
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

  const usePve = !!(PVE_URL && cfg.PVE_TOKEN_ID && cfg.PVE_TOKEN_SECRET);
  const useNb = !!(NB_URL && cfg.NETBIRD_TOKEN);
  if (!cfg.OUTLINE_API_KEY) { log("Noch nicht eingerichtet: brainbox-connect proxmox bzw. brainbox-connect netbird"); return; }
  if (!usePve && !useNb) { log("Weder Proxmox noch NetBird verbunden – nichts zu tun."); return; }

  const state = loadState();
  state.collections ||= {};
  state.docs ||= {};
  state.stats = { created: 0, updated: 0, archived: 0 };
  for (const d of Object.values(state.docs)) d.seen = false;

  const guests = usePve ? await pveGuests() : [];
  const nb = useNb ? await netbirdData() : { peers: [], networks: [], domains: [] };
  const { peerOf, domainsOf } = match(guests, nb);
  const pveLink = (g) => `${PVE_URL}/#v1:0:=${g.type === "lxc" ? "lxc" : "qemu"}%2F${g.vmid}`;

  // 1. Sammlungen und alle Einträge sicherstellen (damit Verknüpfungen stimmen)
  let colPve, colNb;
  if (usePve) {
    colPve = await ensureCollection(state, "proxmox", { name: "Proxmox", description: "Alle VMs und Container – automatisch aus Proxmox. Eigene Notizen unter „Notizen“ bleiben erhalten.", color: "#E57000", icon: "server" });
    await ensureDoc(state, "pve:overview", "Proxmox – Übersicht", colPve);
    for (const g of guests) await ensureDoc(state, `pve:${g.vmid}`, `${g.name} (${g.vmid})`, colPve);
  }
  if (useNb) {
    colNb = await ensureCollection(state, "netbird", { name: "NetBird", description: "Geräte, Netzwerke und Domains aus NetBird – automatisch abgeglichen.", color: "#F68330", icon: "globe" });
    await ensureDoc(state, "nb:overview", "NetBird – Übersicht", colNb);
    await ensureDoc(state, "nb:domains", "Domains", colNb);
    for (const p of nb.peers) await ensureDoc(state, `nb:${p.id}`, p.name, colNb);
  }
  const guestOfPeer = new Map([...peerOf.entries()].map(([vmid, p]) => [p.id, guests.find((g) => g.vmid === vmid)]));

  // 2. Inhalte schreiben
  if (usePve) {
    for (const g of guests) {
      const p = peerOf.get(g.vmid);
      const doms = [...(domainsOf.get(g.vmid) || [])];
      const rows = [
        ["ID", g.vmid], ["Typ", g.type === "lxc" ? "LXC-Container" : "VM"] , ["Node", g.node], ["Status", g.template ? "📄 Vorlage" : statusDe(g.status)],
        ["CPU", g.cpus ? `${g.cpus} Kerne` : "–"], ["RAM", gb(g.mem)], ["Disk", gb(g.disk)], ["Betriebssystem", g.os || "–"],
        ["IP-Adressen", g.ips.join(", ") || "–"], ["Tags", g.tags.join(", ") || "–"],
        ["NetBird", p ? `${link(state.docs[`nb:${p.id}`], p.dns_label || p.name)} · ${p.ip} · ${p.connected ? "🟢 online" : "⚪ offline"}` : "–"],
        ["Domains", doms.map((d) => `[${d}](https://${d.replace(/^\*\./, "")})`).join(", ") || "–"],
        ["Proxmox", `[In Proxmox öffnen](${pveLink(g)})`],
      ];
      const table = ["| Eigenschaft | Wert |", "|---|---|", ...rows.map(([k, v]) => `| **${k}** | ${k === "Proxmox" || k === "Domains" || k === "NetBird" ? v : esc(v)} |`)].join("\n");
      const notes = g.notes ? `\n\n### Beschreibung aus Proxmox\n\n${g.notes.replace(/\r/g, "").split(/\n+/).join("\n\n")}` : "";
      await writeDoc(state, `pve:${g.vmid}`, `${g.name} (${g.vmid})`, `${table}${notes}`);
    }
    const header = "| ID | Name | Typ | Node | Status | IP | NetBird | Domains |\n|---|---|---|---|---|---|---|---|";
    const lines = guests.map((g) => {
      const p = peerOf.get(g.vmid);
      return `| ${g.vmid} | ${link(state.docs[`pve:${g.vmid}`], g.name)} | ${g.type === "lxc" ? "LXC" : "VM"} | ${esc(g.node)} | ${g.template ? "📄 Vorlage" : statusDe(g.status)} | ${esc(g.ips[0] || "–")} | ${p ? (p.connected ? "🟢 " : "⚪ ") + esc(p.dns_label || p.name) : "–"} | ${esc([...(domainsOf.get(g.vmid) || [])].join(", ") || "–")} |`;
    });
    const running = guests.filter((g) => g.status === "running").length;
    await writeDoc(state, "pve:overview", "Proxmox – Übersicht",
      `**${guests.length}** VMs und Container, davon **${running}** gerade an.\n\n${header}\n${lines.join("\n")}`);
  }

  if (useNb) {
    for (const p of nb.peers) {
      const g = guestOfPeer.get(p.id);
      const rows = [
        ["Name", p.name], ["Hostname", p.hostname], ["NetBird-IP", p.ip], ["DNS-Name", p.dns_label],
        ["Weitere DNS-Namen", (p.extra_dns_labels || []).join(", ") || "–"], ["Status", p.connected ? "🟢 online" : "⚪ offline"],
        ["Zuletzt gesehen", p.last_seen ? new Date(p.last_seen).toLocaleString("de-DE", { timeZone: process.env.TZ || "Europe/Berlin" }) : "–"],
        ["Betriebssystem", p.os], ["NetBird-Version", p.version], ["Gruppen", (p.groups || []).map((x) => x.name).join(", ") || "–"],
        ["Proxmox", g ? link(state.docs[`pve:${g.vmid}`], `${g.name} (${g.vmid})`) : "–"],
      ];
      const table = ["| Eigenschaft | Wert |", "|---|---|", ...rows.map(([k, v]) => `| **${k}** | ${k === "Proxmox" ? v : esc(v || "–")} |`)].join("\n");
      await writeDoc(state, `nb:${p.id}`, p.name, table);
    }
    const online = nb.peers.filter((p) => p.connected).length;
    const peerRows = nb.peers.map((p) => {
      const g = guestOfPeer.get(p.id);
      return `| ${link(state.docs[`nb:${p.id}`], p.name)} | ${esc(p.ip)} | ${esc(p.dns_label || "–")} | ${p.connected ? "🟢 online" : "⚪ offline"} | ${g ? link(state.docs[`pve:${g.vmid}`], `${g.name} (${g.vmid})`) : "–"} |`;
    });
    await writeDoc(state, "nb:overview", "NetBird – Übersicht",
      `**${nb.peers.length}** Geräte, davon **${online}** online · **${nb.networks.length}** Netzwerke · **${nb.domains.length}** Domains ([Liste](${state.docs["nb:domains"].url}))\n\n| Gerät | NetBird-IP | DNS-Name | Status | Proxmox |\n|---|---|---|---|---|\n${peerRows.join("\n")}`);
    const domRows = nb.domains.map((d) => {
      const vmids = [...domainsOf.entries()].filter(([, set]) => set.has(d.address)).map(([v]) => guests.find((g) => g.vmid === v)).filter(Boolean);
      return `| ${esc(d.address)} | ${esc(d.network)} | ${d.enabled ? "an" : "aus"} | ${esc(d.groups.join(", ") || "–")} | ${vmids.map((g) => link(state.docs[`pve:${g.vmid}`], `${g.name} (${g.vmid})`)).join(", ") || "–"} |`;
    });
    await writeDoc(state, "nb:domains", "Domains",
      `Alle Domains aus den NetBird-Netzwerken und wozu sie gehören. Zuordnung automatisch über den Namen (z. B. **brainbox**.morncloud.de → Gast „brainbox“) oder von Hand mit einer Zeile \`domain: name.example.de\` in den Proxmox-Notizen des Gasts.\n\n| Domain | Netzwerk | Aktiv | Gruppen | Gehört zu |\n|---|---|---|---|---|\n${domRows.join("\n") || "| – | – | – | – | – |"}`);
  }

  // 3. Verschwundene Einträge archivieren (nicht löschen)
  if (usePve) await archiveMissing(state, "pve:");
  if (useNb) await archiveMissing(state, "nb:");
  for (const d of Object.values(state.docs)) delete d.seen;

  const { created, updated, archived } = state.stats;
  delete state.stats;
  state.lastRun = new Date().toISOString();
  saveState(state);
  const parts = [];
  if (usePve) parts.push(`Proxmox: ${guests.length} Gäste`);
  if (useNb) parts.push(`NetBird: ${nb.peers.length} Geräte, ${nb.domains.length} Domains`);
  const changes = `${created} neu, ${updated} geändert, ${archived} archiviert`;
  if (!QUIET || created || updated || archived) say(`Abgleich fertig · ${parts.join(" · ")} · ${changes}`);
}

main().catch((e) => { console.error(`Fehler: ${e.message}`); process.exit(1); });
