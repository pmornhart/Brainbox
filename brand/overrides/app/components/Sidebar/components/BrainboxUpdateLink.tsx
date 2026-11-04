// Brainbox: „Update verfügbar“ oben in der Seitenleiste (nur für Admins).
// Fragt die Zentrale beim Laden und dann stündlich; führt zu
// Einstellungen → Brainbox → Version & Update.
import { DownloadIcon } from "outline-icons";
import { useEffect, useState } from "react";
import { getBrainboxJson } from "~/utils/brainbox";
import { settingsPath } from "~/utils/routeHelpers";
import SidebarLink from "./SidebarLink";

type UpdateInfo = { available: boolean; latest: string | null };

/** Wie oft nachgesehen wird, solange das Wiki offen ist: einmal pro Stunde */
const ONE_HOUR_MS = 3_600_000;
const CHECK_EVERY_MS = ONE_HOUR_MS;

export default function BrainboxUpdateLink() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async (): Promise<void> => {
      const data = await getBrainboxJson<UpdateInfo>("/zentrale/api/update-info");
      if (alive) {
        setInfo(data);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), CHECK_EVERY_MS);
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
      to={settingsPath("brainbox-update")}
      icon={<DownloadIcon />}
      label={`Update verfügbar · ${info.latest}`}
      unreadBadge
    />
  );
}
