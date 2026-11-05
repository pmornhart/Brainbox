// -----------------------------------------------------------------------------
// Brainbox-Abgleich: GitHub-Teil
//
// Liest die Repos eines GitHub-Kontos (Token nur lesend oder öffentliche Repos
// eines Kontos), fasst das README zusammen („Was drin ist“, „Installieren“) und
// erkennt, woher VMs und Container stammen (community-scripts, eigenes Repo, Regel).
// Wird von sync.mjs benutzt; ohne Abhängigkeiten.
// Lizenz: MIT, siehe LICENSE.
// -----------------------------------------------------------------------------

// --- README lesen ------------------------------------------------------------------
const ENTITIES = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'" };

/** HTML im README zu Text: Bilder weg, Links zu ihrem Text, Zeilenumbrüche zu Leerzeichen */
export function stripHtml(s) {
  return String(s || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<img[^>]*>/gi, "")
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&(nbsp|amp|lt|gt|quot|#39|apos);/g, (m) => ENTITIES[m] || m);
}

/** Inline-Markdown aufräumen: Bilder und Abzeichen weg, relative Links zu Text, HTML weg */
function cleanInline(s) {
  return stripHtml(s)
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, "") // verlinkte Abzeichen
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // Bilder
    .replace(/\[([^\]]+)\]\((?!https?:)[^)]*\)/g, "$1") // relative Links → Text
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** README in Blöcke teilen: Überschriften, Code, Absätze (Code bleibt am Stück) */
export function mdBlocks(md) {
  const blocks = [];
  let cur = [];
  let fence = null;
  const flush = () => { if (cur.length) blocks.push(cur.join("\n")); cur = []; };
  for (const line of String(md || "").replace(/\r/g, "").split("\n")) {
    if (fence) { cur.push(line); if (line.trim().startsWith(fence)) { flush(); fence = null; } continue; }
    const f = line.match(/^\s*(```+|~~~+)/);
    if (f) { flush(); fence = f[1]; cur.push(line); continue; }
    if (/^#{1,6}\s/.test(line)) { flush(); blocks.push(line); continue; }
    if (!line.trim()) { flush(); continue; }
    cur.push(line);
  }
  flush();
  return blocks;
}

const kindOf = (b) => {
  if (/^#{1,6}\s/.test(b)) return "heading";
  if (/^\s*(```|~~~)/.test(b)) return "code";
  if (/^\s*\|/.test(b)) return "table";
  if (/^\s*([-*+]|\d+[.)])\s/.test(b)) return "list";
  if (/^\s*>/.test(b)) return "quote";
  return "text";
};
const headingLevel = (b) => b.match(/^(#{1,6})\s/)[1].length;
const headingText = (b) => cleanInline(b.replace(/^#{1,6}\s+/, "")).replace(/^[^\p{L}\p{N}]+/u, "").trim();

// Navigation („Schnellstart · Einstellungen · …“) und Abzeichen sind keine Beschreibung
function isProse(text) {
  const letters = (text.match(/\p{L}/gu) || []).length;
  if (letters < 30) return false;
  const parts = text.split(/\s[·|•]\s/);
  if (parts.length >= 3 && parts.every((p) => p.length < 30)) return false;
  return true;
}

function clip(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return `${(end > max / 2 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, ""))} …`;
}

const INSTALL_HEADINGS = [
  /install|einricht/i,
  /schnellstart|quick\s*-?start|getting started|loslegen|erste schritte|setup|so startest/i,
  /deploy|usage|nutzung|benutzung|verwendung|starten|^start/i,
];
const SUMMARY_MAX = 700;
const INSTALL_MAX = 1400;
const INSTALL_MAX_CODE = 2;

/** Was steht im README? → { summary, install } (Markdown, ohne eigene Überschriften) */
export function readmeParts(md) {
  const blocks = mdBlocks(md);
  const heads = blocks.map((b, i) => ({ b, i })).filter(({ b }) => kindOf(b) === "heading");
  // Installieren: erste Überschrift nach Wichtigkeit (Installieren vor Schnellstart vor Nutzung)
  let pick = null;
  for (const re of INSTALL_HEADINGS) { pick = heads.find(({ b }) => re.test(headingText(b))); if (pick) break; }
  // Beschreibung: die ersten echten Absätze vor dem Installieren-Teil
  const prose = [];
  for (const [i, b] of blocks.entries()) {
    if (pick && i >= pick.i) break;
    if (kindOf(b) !== "text") continue;
    const t = cleanInline(b.replace(/\n/g, " "));
    if (isProse(t)) prose.push(t);
    if (prose.length >= 2) break;
  }
  let install = "";
  if (pick) {
    const level = headingLevel(pick.b);
    const out = [];
    let codes = 0;
    let size = 0;
    for (const b of blocks.slice(pick.i + 1)) {
      const k = kindOf(b);
      if (k === "heading" && headingLevel(b) <= level) break;
      if (k === "table") {
        if (out.length && out[out.length - 1].endsWith(":")) out[out.length - 1] += " _(Tabelle im README)_";
        continue;
      }
      let piece;
      if (k === "code") { piece = b.trim(); codes++; }
      else if (k === "heading") piece = `**${headingText(b)}**`;
      else if (k === "list") piece = b.split("\n").map((l) => cleanInline(l)).filter(Boolean).map((l) => (/^([-*+]|\d+[.)])\s/.test(l) ? l : `- ${l}`)).join("\n");
      else piece = cleanInline(b.replace(/\n/g, " "));
      if (!piece) continue;
      if (/^#{1,6}\s/m.test(piece) && k !== "code") piece = piece.replace(/^#{1,6}\s*/gm, "");
      out.push(piece);
      size += piece.length;
      if (codes >= INSTALL_MAX_CODE || size >= INSTALL_MAX) break;
    }
    install = out.join("\n\n").trim();
  }
  return { summary: clip(prose.join("\n\n"), SUMMARY_MAX), install, installHeading: pick ? headingText(pick.b) : "" };
}

// --- Was für ein Projekt ist es? --------------------------------------------------------------
const KINDS = [
  [(n) => n.has("proxmox") || n.has("ct") || [...n].some((x) => /^(pve|proxmox).*\.sh$/.test(x)), "Proxmox-Skript"],
  [(n) => n.has("dockerfile") || ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"].some((x) => n.has(x)), "Docker"],
  [(n) => n.has("package.json"), "Node.js"],
  [(n) => ["requirements.txt", "pyproject.toml", "setup.py"].some((x) => n.has(x)), "Python"],
  [(n) => n.has("go.mod"), "Go"],
  [(n) => n.has("cargo.toml"), "Rust"],
  [(n) => [...n].some((x) => /\.(sln|csproj)$/.test(x)), ".NET"],
  [(n) => ["build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts"].some((x) => n.has(x)), "Gradle (Android/Java)"],
  [(n) => n.has("pom.xml"), "Maven (Java)"],
  [(n) => n.has("hacs.json") || n.has("custom_components"), "Home Assistant"],
  [(n) => [...n].some((x) => /\.ps1$/.test(x)), "PowerShell"],
  [(n) => n.has("install.sh"), "Installationsskript"],
  [(n) => n.has("index.html"), "Webseite"],
];

/** Dateien oben im Repo → Art des Projekts und wichtige Dateien */
export function repoFiles(entries) {
  const list = (entries || []).filter((e) => e && e.name);
  const names = new Set(list.map((e) => e.name.toLowerCase()));
  const kinds = KINDS.filter(([test]) => test(names)).map(([, label]) => label);
  const shown = list
    .filter((e) => !e.name.startsWith(".") && !/^(license|licence|readme)(\.|$)/i.test(e.name))
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1))
    .map((e) => (e.type === "dir" ? `${e.name}/` : e.name));
  return { kinds, files: shown };
}

/** Befehl, falls das README nichts zum Installieren sagt */
export function fallbackInstall(repo, files, scripts) {
  const clone = `git clone ${repo.clone_url || `https://github.com/${repo.full_name}.git`}`;
  const dir = `cd ${repo.name}`;
  const has = (n) => files.some((f) => f.toLowerCase() === n);
  const raw = (p) => `https://raw.githubusercontent.com/${repo.full_name}/${repo.default_branch || "main"}/${p}`;
  const priv = repo.private ? "\n\nDas Repo ist privat – zum Klonen bei GitHub anmelden (oder einen Token verwenden)." : "";
  if (scripts.length && !repo.private) {
    return `In der **Proxmox-Shell** (auf dem Host):\n\n\`\`\`bash\nbash -c "$(curl -fsSL ${raw(scripts[0])})"\n\`\`\``;
  }
  if (["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"].some(has)) return `\`\`\`bash\n${clone}\n${dir}\ndocker compose up -d\n\`\`\`${priv}`;
  if (has("install.sh")) return `\`\`\`bash\n${clone}\n${dir}\nbash install.sh\n\`\`\`${priv}`;
  if (has("package.json")) return `\`\`\`bash\n${clone}\n${dir}\nnpm install\n\`\`\`${priv}`;
  if (has("requirements.txt")) return `\`\`\`bash\n${clone}\n${dir}\npip install -r requirements.txt\n\`\`\`${priv}`;
  return `\`\`\`bash\n${clone}\n\`\`\`${priv}`;
}

// --- Herkunft von VMs und Containern -------------------------------------------------------------
const COMMUNITY_RE = /community-scripts|helper-scripts\.com|tteck/i;
const GITHUB_URL_RE = /github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)/g;
const FULL_RE = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/;
const squash = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Kurzname eines community-scripts-Skripts für den Link, wie dort üblich: „Pi-Hole“ → pihole, „Home Assistant“ → homeassistant */
export const communitySlug = (app) => squash(app);

/** „besitzer/repo“, „community-scripts[: App]“, Adresse oder Text → Herkunft */
export function parseOrigin(value) {
  const v = String(value || "").trim().replace(/\.git$/, "");
  if (!v) return null;
  const cs = v.match(/^community-scripts\s*(?:[:·/-]\s*(.+))?$/i);
  if (cs) return { kind: "community", app: (cs[1] || "").trim() };
  const url = v.match(/^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)/i);
  if (url) return { kind: "repo", full: `${url[1]}/${url[2].replace(/\.git$/, "")}` };
  const full = v.match(FULL_RE);
  if (full) return { kind: "repo", full: v };
  return { kind: "text", text: v };
}

/** Regeln aus der Tabelle „Muster | Herkunft“ der Zuordnungsregeln */
export function originRule(pattern, value) {
  let type = "name";
  let pat = pattern;
  const t = pat.match(/^(name|tag)\s*:\s*(.+)$/i);
  if (t) { type = t[1].toLowerCase(); pat = t[2].trim(); }
  const re = new RegExp(`^${pat.split("*").map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`, "i");
  const origin = parseOrigin(value);
  return origin ? { type, pat, re, origin } : null;
}

/**
 * Woher stammt ein Gast? Reihenfolge: Regel, Zeile in den Proxmox-Notizen, community-scripts,
 * GitHub-Link in der Beschreibung, gleicher Name wie ein eigenes Repo.
 * → { kind: "repo"|"community"|"text", full?, app?, text?, via } oder null
 */
export function originOf(g, rules, repos) {
  for (const r of rules) {
    const vals = r.type === "tag" ? g.tags : [g.name];
    if (vals.some((v) => r.re.test(String(v || "")))) return { ...r.origin, via: "Zuordnungsregel" };
  }
  const notes = String(g.notes || "");
  const line = notes.match(/^\s*(?:repo|github|quelle|herkunft)\s*[:=]\s*(.+?)\s*$/im);
  if (line) { const o = parseOrigin(stripHtml(line[1])); if (o) return { ...o, via: "Proxmox-Notizen" }; }
  const csTag = (g.tags || []).some((t) => /^community-scripts?$/i.test(t));
  if (csTag || COMMUNITY_RE.test(notes)) {
    const h2 = notes.match(/<h2[^>]*>\s*([^<]+?)\s*<\/h2>/i);
    const app = (h2 ? stripHtml(h2[1]) : g.name).replace(/\s+(LXC|VM|CT)\s*$/i, "").trim();
    return { kind: "community", app, via: csTag ? "Proxmox-Tag" : "Beschreibung" };
  }
  const links = [...notes.matchAll(GITHUB_URL_RE)].map((m) => `${m[1]}/${m[2].replace(/\.git$/, "")}`);
  const known = links.find((f) => repos.some((r) => r.full_name.toLowerCase() === f.toLowerCase())) || links[0];
  if (known) return { kind: "repo", full: known, via: "Link in der Beschreibung" };
  const byName = repos.find((r) => squash(r.name) && squash(r.name) === squash(g.name));
  if (byName) return { kind: "repo", full: byName.full_name, via: "gleicher Name (vermutet)" };
  const byTag = repos.find((r) => (g.tags || []).some((t) => squash(t) && squash(t) === squash(r.name)));
  if (byTag) return { kind: "repo", full: byTag.full_name, via: "Proxmox-Tag (vermutet)" };
  return null;
}
