// Brainbox: Version unten in den Einstellungen – mit Hinweis, wenn ein Update da ist.
import { useEffect, useState } from "react";
import styled from "styled-components";
import Badge from "~/components/Badge";
import { getBrainboxJson } from "~/utils/brainbox";
import { settingsPath } from "~/utils/routeHelpers";
import SidebarLink from "./SidebarLink";

type Health = { version?: { brainbox: string; core: string } };
type UpdateInfo = { available: boolean; latest: string | null };

/** „v1.12.0“ → „1.12.0“ */
const withoutV = (version: string): string =>
  version.startsWith("v") ? version.slice(1) : version;

export default function BrainboxVersion() {
  const [version, setVersion] = useState<Health["version"]>();
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async (): Promise<void> => {
      const health = await getBrainboxJson<Health>("/zentrale/health");
      const info = await getBrainboxJson<UpdateInfo>("/zentrale/api/update-info");
      if (alive) {
        setVersion(health?.version);
        setUpdate(info);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, []);

  if (!version) {
    return null;
  }

  return (
    <SidebarLink
      to={settingsPath("brainbox-update")}
      label={
        <>
          Brainbox {version.brainbox}
          <br />
          <Small>Kern {withoutV(version.core)}</Small>
          {update && (
            <>
              <br />
              <LilBadge>
                {update.available && update.latest
                  ? `Update auf ${update.latest} verfügbar`
                  : "Aktuell"}
              </LilBadge>
            </>
          )}
        </>
      }
    />
  );
}

const Small = styled.span`
  font-size: 12px;
  opacity: 0.7;
`;

const LilBadge = styled(Badge)`
  margin-inline-start: 0;
`;
