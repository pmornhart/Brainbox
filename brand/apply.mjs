#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Brainbox-Branding: macht aus dem Outline-Kern Brainbox
//
//   node brand/apply.mjs /opt/brainbox
//
// Läuft nach dem Entpacken des Outline-Kerns und vor dem Bauen. Tauscht Name,
// Logo, Icons, Schrift und Farben (Stil „Homelab-Konsole“, dunkel als Standard)
// und hängt „Brainbox-Zentrale“ samt Update-Symbol oben in die Seitenleiste. Jeder Schritt meldet,
// ob er gegriffen hat; fehlt ein Muster (anderer Kern), baut Outline trotzdem.
// Lizenz: MIT, siehe LICENSE.
// -----------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KIT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CORE = path.resolve(process.argv[2] || "/opt/brainbox");
const quiet = process.argv.includes("--quiet");
let ok = 0, miss = 0;
const say = (s) => { if (!quiet) console.log(s); };

function patch(rel, steps) {
  const file = path.join(CORE, rel);
  if (!fs.existsSync(file)) { console.log(`  ⚠ Datei fehlt: ${rel}`); miss += steps.length; return; }
  let s = fs.readFileSync(file, "utf8");
  for (const [label, from, to, all] of steps) {
    if (s.includes(to)) { ok++; continue; } // schon angewendet
    const hit = typeof from === "string" ? s.includes(from) : from.test(s);
    if (!hit) { console.log(`  ⚠ ${rel}: ${label} nicht gefunden`); miss++; continue; }
    s = typeof from === "string" ? (all ? s.split(from).join(to) : s.replace(from, to)) : s.replace(from, to);
    ok++;
  }
  fs.writeFileSync(file, s);
}

function copy(src, dst) {
  const from = path.join(KIT, src), to = path.join(CORE, dst);
  if (!fs.existsSync(from)) { console.log(`  ⚠ Brainbox-Datei fehlt: ${src}`); miss++; return; }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  ok++;
}

// --- Farben: Homelab-Konsole ----------------------------------------------------
const C = {
  bg: "#0D1210", sidebar: "#080C0A", panel: "#131A16", panel2: "#1A231E", modal: "#111814",
  text: "#E2EBE5", slate: "#6F8679", slateLight: "#D5E1DA", slateDark: "#34423B",
  accent: "#118656", linkDark: "#4CD596", lightBlack: "#26302B",
};

patch("shared/styles/theme.ts", [
  ["Hintergrund dunkel", 'almostBlack: "#111319"', `almostBlack: "${C.bg}"`],
  ["Schwarz hell", 'lightBlack: "#2F3336"', `lightBlack: "${C.lightBlack}"`],
  ["Text dunkel", 'almostWhite: "#E6E6E6"', `almostWhite: "${C.text}"`],
  ["Seitenleiste dunkel", 'veryDarkBlue: "#08090C"', `veryDarkBlue: "${C.sidebar}"`],
  ["Grau", 'slate: "#66778F"', `slate: "${C.slate}"`],
  ["Grau hell", 'slateLight: "#DAE1E9"', `slateLight: "${C.slateLight}"`],
  ["Grau dunkel", 'slateDark: "#394351"', `slateDark: "${C.slateDark}"`],
  ["Rauch", 'smoke: "#F4F7FA"', 'smoke: "#F2F6F3"'],
  ["Rauch hell", 'smokeLight: "#F9FBFC"', 'smokeLight: "#F8FBF9"'],
  ["Rauch dunkel", 'smokeDark: "#E8EBED"', 'smokeDark: "#E3EAE6"'],
  ["Akzent", 'accent: "#0366d6"', `accent: "${C.accent}"`],
  ["Grautöne hell (Seitenleiste)", "hsl(212 31%", "hsl(146 16%", true],
  ["Fläche 2 dunkel", '"#1f232e"', `"${C.panel}"`, true],
  ["Fläche 3 dunkel", '"#2a2f3e"', `"${C.panel2}"`, true],
  ["Dialoge dunkel", '"#181c25"', `"${C.modal}"`, true],
  ["Links dunkel", 'link: "#137FFB"', `link: "${C.linkDark}"`],
  ["Schrift", /fontFamily:\s*\n\s*"-apple-system, BlinkMacSystemFont, Inter,/, 'fontFamily:\n      "Geist, -apple-system, BlinkMacSystemFont, Inter,'],
  ["Schrift Code", /fontFamilyMono:\s*\n\s*"'SFMono-Regular',/, "fontFamilyMono:\n      \"'Geist Mono', 'SFMono-Regular',"],
]);

// --- Dunkel als Standard (umstellbar unter Einstellungen) ---------------------------
patch("app/stores/UiStore.ts", [
  ["Standard-Theme", "theme: Theme = Theme.System;", "theme: Theme = Theme.Dark;"],
  ["Gespeichertes Theme", "this.theme = data.theme || Theme.System;", "this.theme = data.theme || Theme.Dark;"],
]);

// --- Seite: Schrift, Farben, Standard dunkel ---------------------------------------------
const FONTS = `
      @font-face {
        font-family: "Geist";
        font-display: swap;
        font-weight: 100 900;
        src: url("{cdn-url}/fonts/Geist.woff2") format("woff2");
        unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
      }
      @font-face {
        font-family: "Geist";
        font-display: swap;
        font-weight: 100 900;
        src: url("{cdn-url}/fonts/Geist-ext.woff2") format("woff2");
        unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
      }
      @font-face {
        font-family: "Geist Mono";
        font-display: swap;
        font-weight: 100 900;
        src: url("{cdn-url}/fonts/GeistMono.woff2") format("woff2");
      }
`;
patch("server/static/index.html", [
  ["Theme-Farbe dunkel", 'content="#111319"', `content="${C.bg}"`, true],
  ["Theme-Farbe Skript", 'isDark ? "#111319"', `isDark ? "${C.bg}"`, true],
  ["Standard dunkel", 'var theme = "system";', 'var theme = "dark";'],
  ["Schriften", "    <style>\n      @font-face {", `    <style>${FONTS}      @font-face {`],
]);

// --- Name -------------------------------------------------------------------------------------
patch("server/env.ts", [["App-Name", 'public APP_NAME = "Outline";', 'public APP_NAME = "Brainbox";']]);
// So meldet sich das Wiki bei Claude (MCP) und in der Browser-Suche
patch("server/mcp/index.ts", [["MCP-Name", 'name: "outline",\n      title: "Outline",', 'name: "brainbox",\n      title: "Brainbox",']]);
patch("server/routes/app.ts", [["Such-Titel", 'href="/opensearch.xml"\n      title="Outline"', 'href="/opensearch.xml"\n      title="Brainbox"']]);

// --- Logo ---------------------------------------------------------------------------------------
const mark = fs.readFileSync(path.join(KIT, "brand/mark-path.txt"), "utf8").trim();
patch("app/components/Icons/OutlineIcon.tsx", [
  ["Logo", /<path d="M14\.6667[^"]*" \/>/, `<path fillRule="evenodd" d="${mark}" />`],
]);

// --- Update-Symbol: erscheint in der Seitenleiste, sobald es eine neue Brainbox gibt ------------------
// Fragt die Zentrale (/zentrale/api/update-info, nur für Admins) beim Laden und dann stündlich.
const UPDATE_LINK = `import { DownloadIcon } from "outline-icons";
import { useEffect, useState } from "react";
import SidebarLink from "./SidebarLink";

type UpdateInfo = { available: boolean; latest: string | null };

/** Brainbox: „Update verfügbar“ unten in der Seitenleiste, führt zur Zentrale. */
export default function BrainboxUpdateLink() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/zentrale/api/update-info", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: UpdateInfo | null) => {
          if (alive) {
            setInfo(data);
          }
        })
        .catch(() => undefined);
    void load();
    const timer = window.setInterval(load, 60 * 60 * 1000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  if (!info?.available || !info.latest) {
    return null;
  }
  return (
    <SidebarLink
      href="/zentrale#update"
      icon={<DownloadIcon />}
      label={\`Update verfügbar · \${info.latest}\`}
      unreadBadge
    />
  );
}
`;
fs.writeFileSync(path.join(CORE, "app/components/Sidebar/components/BrainboxUpdateLink.tsx"), UPDATE_LINK);
ok++;

// --- Brainbox-Zentrale und Update-Symbol oben in der Seitenleiste (nur Admins) ----------------------
patch("app/components/Sidebar/App.tsx", [
  ["Icon-Import", 'import { SearchIcon, HomeIcon, SidebarIcon } from "outline-icons";', 'import { SearchIcon, HomeIcon, SidebarIcon, SettingsIcon } from "outline-icons";'],
  ["Update-Import", 'import ArchiveLink from "./components/ArchiveLink";', 'import ArchiveLink from "./components/ArchiveLink";\nimport BrainboxUpdateLink from "./components/BrainboxUpdateLink";'],
  // oben unter „Entwürfe“: scrollt nie weg, auch wenn die Seitenleiste lang wird
  ["Zentrale-Eintrag", "            {can.createDocument && <DraftsLink />}",
    `            {can.createDocument && <DraftsLink />}
            {can.update && (
              <SidebarLink
                href="/zentrale"
                icon={<SettingsIcon />}
                label="Brainbox-Zentrale"
              />
            )}
            {can.update && <BrainboxUpdateLink />}`],
]);

// --- Schriften und Icons --------------------------------------------------------------------------
copy("brand/fonts/Geist.woff2", "public/fonts/Geist.woff2");
copy("brand/fonts/Geist-ext.woff2", "public/fonts/Geist-ext.woff2");
copy("brand/fonts/GeistMono.woff2", "public/fonts/GeistMono.woff2");
for (const [src, dst] of [
  ["app-16.png", "favicon-16.png"], ["app-32.png", "favicon-32.png"], ["app-192.png", "icon-192.png"],
  ["app-512.png", "icon-512.png"], ["app-1024.png", "Icon-1024.png"],
  ["app-192.png", "icon-maskable-192.png"], ["app-512.png", "icon-maskable-512.png"], ["app-1024.png", "icon-maskable-1024.png"],
]) copy(`brand/icons/${src}`, `public/images/${dst}`);

fs.writeFileSync(path.join(CORE, ".brainbox-branded"), `${new Date().toISOString()}\n`);
say(`Brainbox-Branding: ${ok} Änderungen angewendet${miss ? `, ${miss} nicht gefunden` : ""}`);
process.exit(0);
