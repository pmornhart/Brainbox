// Brainbox: alle Einstellungsseiten im Stil der Brainbox-Zentrale.
// Die Zentrale (/zentrale) läuft im Einbett-Modus ohne eigene Seitenleiste,
// übernimmt das Farbschema des Wikis und meldet Seitenwechsel per postMessage.
import { observer } from "mobx-react";
import {
  DownloadIcon,
  EmailIcon,
  ExportIcon,
  GlobeIcon,
  HomeIcon,
  PadlockIcon,
  ProfileIcon,
  ServerRackIcon,
  SettingsIcon,
  ShapesIcon,
  ShieldIcon,
  SparklesIcon,
  TeamIcon,
  UserIcon,
} from "outline-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHistory } from "react-router-dom";
import styled from "styled-components";
import Heading from "~/components/Heading";
import Scene from "~/components/Scene";
import useStores from "~/hooks/useStores";
import { Theme } from "~/stores/UiStore";
import { settingsPath } from "~/utils/routeHelpers";

/** Wer eine Seite sieht: nur Admins, alle mit bestimmtem Recht oder alle */
export type PageAccess = "admin" | "listUsers" | "readTemplate" | "createExport" | "all";

export type ZentralePage = {
  /** Seite in der Zentrale (#hash) */
  page: string;
  /** Pfad unter /settings */
  path: string;
  name: string;
  group: "Brainbox" | "Wiki" | "Konto";
  access: PageAccess;
  icon: typeof ServerRackIcon;
};

export const zentralePages: ZentralePage[] = [
  { page: "uebersicht", path: settingsPath("brainbox"), name: "Übersicht", group: "Brainbox", access: "admin", icon: HomeIcon },
  { page: "proxmox", path: settingsPath("brainbox-proxmox"), name: "Proxmox-Server", group: "Brainbox", access: "admin", icon: ServerRackIcon },
  { page: "netbird", path: settingsPath("brainbox-netbird"), name: "NetBird", group: "Brainbox", access: "admin", icon: GlobeIcon },
  { page: "claude", path: settingsPath("brainbox-claude"), name: "Claude", group: "Brainbox", access: "admin", icon: SparklesIcon },
  { page: "anmeldung", path: settingsPath("brainbox-anmeldung"), name: "Anmeldung", group: "Brainbox", access: "admin", icon: PadlockIcon },
  { page: "update", path: settingsPath("brainbox-update"), name: "Version & Update", group: "Brainbox", access: "admin", icon: DownloadIcon },
  { page: "allgemein", path: settingsPath("details"), name: "Allgemein", group: "Wiki", access: "admin", icon: TeamIcon },
  { page: "mitglieder", path: settingsPath("users"), name: "Mitglieder", group: "Wiki", access: "listUsers", icon: UserIcon },
  { page: "sicherheit", path: settingsPath("security"), name: "Sicherheit", group: "Wiki", access: "admin", icon: ShieldIcon },
  { page: "vorlagen", path: settingsPath("templates"), name: "Vorlagen", group: "Wiki", access: "readTemplate", icon: ShapesIcon },
  { page: "export", path: settingsPath("export"), name: "Export", group: "Wiki", access: "createExport", icon: ExportIcon },
  { page: "profil", path: settingsPath(), name: "Profil", group: "Konto", access: "all", icon: ProfileIcon },
  { page: "darstellung", path: settingsPath("preferences"), name: "Darstellung", group: "Konto", access: "all", icon: SettingsIcon },
  { page: "benachrichtigungen", path: settingsPath("notifications"), name: "Benachrichtigungen", group: "Konto", access: "all", icon: EmailIcon },
];

/** Höhe, bis die Zentrale geladen ist, und kleinste Höhe danach (px) */
const INITIAL_HEIGHT = 640;
const MIN_HEIGHT = 320;
const THEMES: string[] = [Theme.Light, Theme.Dark, Theme.System];

function ZentraleFrame({ page }: { page: string }) {
  const { ui } = useStores();
  const history = useHistory();
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(INITIAL_HEIGHT);
  const theme = ui.resolvedTheme === "light" ? "light" : "dark";

  // Höhe an den Inhalt anpassen (gleiche Herkunft, daher direkt messbar)
  const watch = useCallback(() => {
    const doc = frame.current?.contentDocument;
    const app = doc?.getElementById("app");
    if (!app) {
      return;
    }
    const update = () => setHeight(Math.max(MIN_HEIGHT, app.scrollHeight));
    update();
    new ResizeObserver(update).observe(app);
  }, []);

  // Seitenwechsel, Links, Farbschema und Neuladen aus der Zentrale übernehmen
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin || !ev.data || typeof ev.data !== "object") {
        return;
      }
      const { type } = ev.data;
      if (type === "brainbox:go") {
        const target = zentralePages.find((p) => p.page === ev.data.page);
        if (target) {
          history.push(target.path);
        }
      } else if (type === "brainbox:open" && typeof ev.data.href === "string" && ev.data.href.startsWith("/")) {
        history.push(ev.data.href);
      } else if (type === "brainbox:theme" && THEMES.includes(ev.data.theme)) {
        ui.setTheme(ev.data.theme as Theme);
      } else if (type === "brainbox:reload") {
        window.location.reload();
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [history, ui]);

  return (
    <Frame
      ref={frame}
      key={`${page}-${theme}`}
      title="Brainbox-Zentrale"
      src={`/zentrale?embed=1&theme=${theme}#${page}`}
      style={{ height, colorScheme: theme }}
      onLoad={watch}
    />
  );
}

function createPage(def: ZentralePage) {
  function BrainboxSettingsPage() {
    const Icon = def.icon;
    return (
      <Scene title={def.name} icon={<Icon />}>
        <Heading>{def.name}</Heading>
        <ZentraleFrame page={def.page} />
      </Scene>
    );
  }
  return observer(BrainboxSettingsPage);
}

export const zentraleComponents = Object.fromEntries(
  zentralePages.map((p) => [p.page, createPage(p)])
);

const Frame = styled.iframe`
  display: block;
  width: 100%;
  border: 0;
  margin-top: 4px;
  background: transparent;
`;
