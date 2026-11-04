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
// So meldet sich das Wiki bei Claude (MCP), in der Browser-Suche und als App auf dem Handy
patch("server/mcp/index.ts", [["MCP-Name", 'name: "outline",\n      title: "Outline",', 'name: "brainbox",\n      title: "Brainbox",']]);
patch("server/routes/app.ts", [["Such-Titel", 'href="/opensearch.xml"\n      title="Outline"', 'href="/opensearch.xml"\n      title="Brainbox"']]);
patch("vite.config.mts", [["App-Manifest", 'name: "Outline",\n          short_name: "Outline",\n          theme_color: "#fff",\n          background_color: "#fff",',
  `name: "Brainbox",\n          short_name: "Brainbox",\n          theme_color: "${C.bg}",\n          background_color: "${C.bg}",`]]);

// --- Logo ---------------------------------------------------------------------------------------
const mark = fs.readFileSync(path.join(KIT, "brand/mark-path.txt"), "utf8").trim();
patch("app/components/Icons/OutlineIcon.tsx", [
  ["Logo", /<path d="M14\.6667[^"]*" \/>/, `<path fillRule="evenodd" d="${mark}" />`],
]);

// --- Ganze Dateien von Brainbox (brand/overrides) ------------------------------------------------------
// Ersetzt werden nur Dateien, die wie erwartet aussehen (Kennzeichen); bei einem anderen Kern bleibt das Original.
function override(rel, marker) {
  const from = path.join(KIT, "brand/overrides", rel), to = path.join(CORE, rel);
  if (!fs.existsSync(from)) { console.log(`  ⚠ Brainbox-Datei fehlt: overrides/${rel}`); miss++; return; }
  const ours = fs.readFileSync(from, "utf8");
  if (marker && fs.existsSync(to)) {
    const current = fs.readFileSync(to, "utf8");
    if (current !== ours && !current.includes(marker)) { console.log(`  ⚠ ${rel}: unbekannte Fassung, Original bleibt`); miss++; return; }
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, ours);
  ok++;
}
// neu
override("app/utils/brainbox.ts");
override("app/components/BrainboxDashboard.tsx");
override("app/components/Sidebar/components/BrainboxUpdateLink.tsx");
override("app/components/Sidebar/components/BrainboxVersion.tsx");
override("app/scenes/Settings/Brainbox.tsx");
// ersetzt: Einstellungen, Startseite, Anmeldeseite
override("app/hooks/useSettingsConfig.ts", "const useSettingsConfig = () => {");
override("app/components/Sidebar/Settings.tsx", "function SettingsSidebar()");
override("app/scenes/Home.tsx", "function Home()");
override("app/scenes/Login/components/Background.tsx", "export const Background = styled(Fade)");

// --- Seitenleiste: Einstellungen und Update-Symbol oben, Konsole-Optik ------------------------------------
patch("app/components/Sidebar/App.tsx", [
  ["Icon-Import", 'import { SearchIcon, HomeIcon, SidebarIcon } from "outline-icons";', 'import { SearchIcon, HomeIcon, SidebarIcon, SettingsIcon } from "outline-icons";'],
  ["Pfad-Import", 'import { homePath, searchPath } from "~/utils/routeHelpers";', 'import { homePath, searchPath, settingsPath } from "~/utils/routeHelpers";'],
  ["Update-Import", 'import ArchiveLink from "./components/ArchiveLink";', 'import ArchiveLink from "./components/ArchiveLink";\nimport BrainboxUpdateLink from "./components/BrainboxUpdateLink";'],
  // oben unter „Entwürfe“: scrollt nie weg, auch wenn die Seitenleiste lang wird
  ["Einstellungen", "            {can.createDocument && <DraftsLink />}",
    `            {can.createDocument && <DraftsLink />}
            <SidebarLink
              to={can.update ? settingsPath("brainbox") : settingsPath()}
              icon={<SettingsIcon />}
              label="Einstellungen"
              exact={false}
            />
            {can.update && <BrainboxUpdateLink />}`],
  // Kopf: Name des Wikis und darunter seine Adresse
  ["Kopf mit Adresse", "            title={team.name}\n            image={<TeamLogo model={team} size={24} alt={t(\"Logo\")} />}",
    "            title={\n              <span style={{ display: \"grid\", lineHeight: 1.15 }}>\n                {team.name}\n                <span style={{ fontFamily: \"'Geist Mono', ui-monospace, monospace\", fontSize: 11, fontWeight: 400, opacity: 0.55 }}>\n                  {window.location.host}\n                </span>\n              </span>\n            }\n            image={<TeamLogo model={team} size={24} alt={t(\"Logo\")} />}"],
  // „Dokumente importieren“ gibt es in Brainbox nicht
  ["Import-Hinweis", /\n\s*<DismissableSidebarAction\n\s*id="sidebar-import-hidden"\n\s*action=\{navigateToImport\}\n\s*\/>/, "\n              {/* Brainbox: kein Import-Hinweis */}"],
]);
patch("app/components/Sidebar/components/Header.tsx", [
  ["Abschnittsköpfe", 'font-size: 13px;\n  font-weight: 600;\n  user-select: none;\n  color: ${s("sidebarText")};\n  position: relative;\n  letter-spacing: 0.03em;',
    'font-family: ${s("fontFamilyMono")};\n  font-size: 11px;\n  font-weight: 500;\n  text-transform: uppercase;\n  user-select: none;\n  color: ${s("textTertiary")};\n  position: relative;\n  letter-spacing: 0.12em;'],
]);
patch("app/components/Sidebar/components/SidebarLink.tsx", [
  ["Markierung aktiv", '  &[aria-current="page"] ${SidebarActions} {\n    --background: ${s("sidebarActiveBackground")};\n  }',
    '  &[aria-current="page"] ${SidebarActions} {\n    --background: ${s("sidebarActiveBackground")};\n  }\n\n  &[aria-current="page"]::before {\n    content: "";\n    position: absolute;\n    inset-inline-start: 0;\n    top: 7px;\n    bottom: 7px;\n    width: 3px;\n    border-radius: 2px;\n    background: ${s("link")};\n  }'],
]);

// --- Menü unten links und Hilfe: alles führt zu Brainbox ----------------------------------------------
patch("shared/utils/UrlHelper.ts", [
  ["Fehler melden", 'public static github = "https://www.github.com/outline/outline/issues";', 'public static github = "https://github.com/pmornhart/Brainbox/issues";'],
  ["Kontakt", 'public static contact = "https://www.getoutline.com/contact";', 'public static contact = "https://github.com/pmornhart/Brainbox";'],
  ["Neuigkeiten", 'public static changelog = "https://www.getoutline.com/changelog";', 'public static changelog = "https://github.com/pmornhart/Brainbox/blob/main/CHANGELOG.md";'],
  ["Anleitung", 'public static guide = "https://docs.getoutline.com/s/guide";', 'public static guide = "/zentrale/go/anleitung";'],
]);
patch("app/actions/definitions/navigation.tsx", [
  ["Einstellungen öffnen", '  visible: () => stores.policies.abilities(stores.auth.team?.id || "").update,\n  to: settingsPath(),\n});',
    '  visible: () => stores.policies.abilities(stores.auth.team?.id || "").update,\n  to: settingsPath("brainbox"),\n});'],
  ["Anleitung", 'name: ({ t }) => t("Documentation"),\n  analyticsName: "Open documentation",\n  section: NavigationSection,\n  iconInContextMenu: false,\n  icon: <OpenIcon />,\n  url: UrlHelper.guide,\n  target: "_blank",',
    'name: () => "Anleitung",\n  analyticsName: "Open documentation",\n  section: NavigationSection,\n  iconInContextMenu: false,\n  icon: <OpenIcon />,\n  url: UrlHelper.guide,\n  target: "_self",'],
  ["Neuigkeiten", 'name: ({ t }) => t("Changelog"),', 'name: () => "Neuigkeiten",'],
  ["Problem melden", 'name: ({ t }) => t("Report a bug"),', 'name: () => "Problem melden",'],
]);
patch("app/menus/AccountMenu.tsx", [
  ["Menüeinträge", `      openKeyboardShortcuts,
      openDocumentation,
      openAPIDocumentation,
      ActionSeparator,
      openChangelog,
      openFeedbackUrl,
      openBugReportUrl,
      changeTheme,
      navigateToProfileSettings,
      navigateToAccountPreferences,
      ActionSeparator,
      logout,`, `      openDocumentation,
      openKeyboardShortcuts,
      ActionSeparator,
      navigateToSettings,
      navigateToProfileSettings,
      changeTheme,
      ActionSeparator,
      openChangelog,
      openBugReportUrl,
      ActionSeparator,
      logout,`],
  ["Import Einstellungen", "  navigateToProfileSettings,\n  navigateToAccountPreferences,", "  navigateToProfileSettings,\n  navigateToAccountPreferences,\n  navigateToSettings,"],
]);
// Überschriften passend zu den Namen in den Einstellungen
patch("app/scenes/Settings/Users.tsx", [
  ["Titel Mitglieder", 'title={t("Users")}', 'title="Mitglieder"'],
  ["Überschrift Mitglieder", "<Heading>{t(\"Users\")}</Heading>", "<Heading>Mitglieder</Heading>"],
]);
patch("app/scenes/Settings/Preferences.tsx", [
  ["Titel Darstellung", '<Scene title={t("Preferences")}', '<Scene title="Darstellung"'],
  ["Überschrift Darstellung", "<Heading>{t(\"Preferences\")}</Heading>", "<Heading>Darstellung</Heading>"],
]);
patch("app/scenes/Shared/Document.tsx", [["Freigabe-Link", '<Branding href="//www.getoutline.com?ref=sharelink" />', "<Branding />"]]);
patch("app/scenes/Settings/Preferences.tsx", [
  ["Übersetzungs-Portal", /<Trans>\s*Choose the interface language\.[\s\S]*?<\/Trans>/, "<>Sprache der Oberfläche.</>"],
]);
patch("app/scenes/Document/components/PresentationMode.tsx", [
  ["Hilfe Präsentation", 'href="https://docs.getoutline.com/s/guide/doc/present-mode-yMGzaY7A9L"', 'href="/zentrale/go/anleitung"'],
]);
patch("server/emails/templates/WelcomeEmail.tsx", [
  ["Willkommens-Mail Text", "\nhttps://docs.getoutline.com/s/guide\n", "\n${teamUrl}/zentrale/go/anleitung\n"],
  ["Willkommens-Mail Link", '<a href="https://docs.getoutline.com/s/guide">', "<a href={`${teamUrl}/zentrale/go/anleitung`}>"],
]);

// --- Texte: „Outline“ → „Brainbox“ in den Übersetzungen (Deutsch, Englisch) --------------------------------
for (const lang of ["de_DE", "en_US"]) {
  const rel = `shared/i18n/locales/${lang}/translation.json`, file = path.join(CORE, rel);
  if (!fs.existsSync(file)) { console.log(`  ⚠ Datei fehlt: ${rel}`); miss++; continue; }
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  let n = 0;
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === "string" && /\bOutline\b/.test(v)) { data[k] = v.replace(/\bOutline\b/g, "Brainbox"); n++; }
  }
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  ok++;
  if (!quiet) say(`  ${lang}: ${n} Texte angepasst`);
}

// --- Feinschliff für Seiten (Tabellen, Auswahl, Bildlaufleisten) ----------------------------------------
const css = fs.readFileSync(path.join(KIT, "brand/brainbox.css"), "utf8").trim();
patch("server/static/index.html", [["Brainbox-Stil", /\n  <\/head>/, `\n    <style id="brainbox">\n${css}\n    </style>\n  </head>`]]);

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
