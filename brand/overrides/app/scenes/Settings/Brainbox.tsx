// Brainbox: Einstellungsseiten, die die Brainbox-Zentrale im Wiki zeigen.
// Die Zentrale (/zentrale) läuft im Einbett-Modus ohne eigene Seitenleiste und
// übernimmt Farbschema und Navigation des Wikis.
import { observer } from "mobx-react";
import {
  DownloadIcon,
  GlobeIcon,
  PadlockIcon,
  ServerRackIcon,
  SparklesIcon,
  HomeIcon,
} from "outline-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHistory } from "react-router-dom";
import styled from "styled-components";
import Heading from "~/components/Heading";
import Scene from "~/components/Scene";
import useStores from "~/hooks/useStores";
import { settingsPath } from "~/utils/routeHelpers";

export type BrainboxPage = {
  /** Seite in der Zentrale (#hash) */
  page: string;
  /** Pfad unter /settings */
  path: string;
  name: string;
  icon: typeof ServerRackIcon;
};

export const brainboxPages: BrainboxPage[] = [
  { page: "uebersicht", path: settingsPath("brainbox"), name: "Übersicht", icon: HomeIcon },
  { page: "proxmox", path: settingsPath("brainbox-proxmox"), name: "Proxmox-Server", icon: ServerRackIcon },
  { page: "netbird", path: settingsPath("brainbox-netbird"), name: "NetBird", icon: GlobeIcon },
  { page: "claude", path: settingsPath("brainbox-claude"), name: "Claude", icon: SparklesIcon },
  { page: "anmeldung", path: settingsPath("brainbox-anmeldung"), name: "Anmeldung", icon: PadlockIcon },
  { page: "update", path: settingsPath("brainbox-update"), name: "Version & Update", icon: DownloadIcon },
];

/** Höhe, bis die Zentrale geladen ist, und kleinste Höhe danach (px) */
const INITIAL_HEIGHT = 640;
const MIN_HEIGHT = 320;

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

  // Klicks in der Zentrale, die eine andere Seite meinen, im Wiki öffnen
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin || !ev.data || typeof ev.data !== "object") {
        return;
      }
      if (ev.data.type === "brainbox:go") {
        const target = brainboxPages.find((p) => p.page === ev.data.page);
        if (target) {
          history.push(target.path);
        }
      }
      if (ev.data.type === "brainbox:open" && typeof ev.data.href === "string" && ev.data.href.startsWith("/")) {
        history.push(ev.data.href);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [history]);

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

function createPage(def: BrainboxPage) {
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

export const brainboxComponents = Object.fromEntries(
  brainboxPages.map((p) => [p.page, createPage(p)])
);

const Frame = styled.iframe`
  display: block;
  width: 100%;
  border: 0;
  margin-top: 4px;
  background: transparent;
`;
