// Brainbox: Kopf der Startseite – Begrüßung, Homelab auf einen Blick, Schnellzugriffe.
// Die Zahlen kommen vom Abgleich (Zentrale: /zentrale/api/summary).
import { observer } from "mobx-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import styled, { css } from "styled-components";
import { s } from "@shared/styles";
import useCurrentUser from "~/hooks/useCurrentUser";
import { getBrainboxJson } from "~/utils/brainbox";
import { settingsPath } from "~/utils/routeHelpers";

type Server = {
  name: string;
  ok: boolean;
  guests: number;
  running: number;
  url: string | null;
};
type Area = { name: string; url: string | null; domains: number; guests: number; peers: number };
type Summary = {
  user: { name: string; admin: boolean };
  version: { brainbox: string; core: string };
  update: { available: boolean; latest: string | null } | null;
  lastRun: string | null;
  homelab: {
    proxmox: { servers: Server[]; guests: number; running: number } | null;
    netbird: { peers: number; online: number; domains: number } | null;
    areas: Area[];
    loose: number;
  } | null;
  links: Record<string, string | null>;
};

type DotState = "ok" | "warn" | "off";

/** Farbe des Statuspunkts je Zustand (Schlüssel im Farbschema) */
const DOT_COLOR = { ok: "link", warn: "warning", off: "textTertiary" } as const;

/** Tageszeiten für die Begrüßung (Stunde, ab der sie gilt) */
const MORNING_FROM = 5;
const DAY_FROM = 11;
const EVENING_FROM = 17;
const NIGHT_FROM = 22;
/** Wie viele Bereiche als Abkürzung auf der Kachel stehen */
const MAX_AREA_CHIPS = 4;
const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;

function greeting(date: Date): string {
  const hour = date.getHours();
  if (hour >= NIGHT_FROM || hour < MORNING_FROM) {
    return "Gute Nacht";
  }
  if (hour < DAY_FROM) {
    return "Guten Morgen";
  }
  return hour < EVENING_FROM ? "Hallo" : "Guten Abend";
}

function ago(iso: string | null): string {
  if (!iso) {
    return "noch nie";
  }
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / MS_PER_MINUTE);
  if (minutes < 1) {
    return "gerade eben";
  }
  if (minutes < MINUTES_PER_HOUR) {
    return `vor ${minutes} Min.`;
  }
  if (minutes < MINUTES_PER_DAY) {
    return `vor ${Math.round(minutes / MINUTES_PER_HOUR)} Std.`;
  }
  return new Date(iso).toLocaleDateString("de-DE");
}

function Tile({ to, children }: { to: string | null; children: React.ReactNode }) {
  return to ? <TileLink to={to}>{children}</TileLink> : <TileBox>{children}</TileBox>;
}

function BrainboxDashboard() {
  const user = useCurrentUser();
  const [data, setData] = useState<Summary | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async (): Promise<void> => {
      const summary = await getBrainboxJson<Summary>("/zentrale/api/summary");
      if (alive) {
        setData(summary);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, []);

  const now = new Date();
  const firstName = user.name.split(" ")[0];
  const admin = !!data?.user.admin;
  const lab = data?.homelab;
  const pve = lab?.proxmox;
  const nb = lab?.netbird;
  const links = data?.links ?? {};
  const down = pve ? pve.servers.filter((x) => !x.ok).length : 0;

  return (
    <Wrap>
      <Kicker>
        {now.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}
      </Kicker>
      <Title>
        {greeting(now)}, {firstName}
      </Title>

      <Quick>
        {links.anleitung && <QuickLink to={links.anleitung}>Anleitung</QuickLink>}
        {links.spickzettel && <QuickLink to={links.spickzettel}>Spickzettel</QuickLink>}
        {links.regeln && <QuickLink to={links.regeln}>Zuordnungsregeln</QuickLink>}
        {admin && <QuickLink to={settingsPath("brainbox")}>Einstellungen</QuickLink>}
      </Quick>

      {data && (pve || nb) && (
        <Grid>
          {pve && (
            <Tile to={links.proxmox}>
              <Label>
                <Dot $state={down ? "warn" : "ok"} />
                Proxmox
              </Label>
              <Big>
                {pve.running}
                <Unit> / {pve.guests} laufen</Unit>
              </Big>
              <Small>
                {pve.servers.length} Server
                {down ? ` · ${down} nicht erreichbar` : ""}
              </Small>
              <Chips>
                {pve.servers.map((x) => (
                  <Chip key={x.name} $off={!x.ok}>
                    <Dot $state={x.ok ? "ok" : "warn"} />
                    {x.name} · {x.guests}
                  </Chip>
                ))}
              </Chips>
            </Tile>
          )}
          {nb && (
            <Tile to={links.netbird}>
              <Label>
                <Dot $state={nb.online ? "ok" : "off"} />
                NetBird
              </Label>
              <Big>
                {nb.online}
                <Unit> / {nb.peers} online</Unit>
              </Big>
              <Small>{nb.domains} Domains</Small>
            </Tile>
          )}
          <Tile to={links.bereiche}>
            <Label>
              <Dot $state={lab?.areas.length ? "ok" : "off"} />
              Bereiche
            </Label>
            <Big>
              {lab?.areas.length ?? 0}
              <Unit> Bereiche</Unit>
            </Big>
            <Small>{lab?.loose ? `${lab.loose} noch ohne Bereich` : "alles zugeordnet"}</Small>
            <Chips>
              {lab?.areas.slice(0, MAX_AREA_CHIPS).map((a) => (
                <Chip key={a.name}>{a.name}</Chip>
              ))}
            </Chips>
          </Tile>
          <Tile to={admin ? settingsPath(data.update?.available ? "brainbox-update" : "brainbox") : null}>
            <Label>
              <Dot $state={data.update?.available ? "warn" : "ok"} />
              Brainbox {data.version.brainbox}
            </Label>
            <Big>
              {data.update?.available ? "Update" : "Aktuell"}
              <Unit>{data.update?.available ? ` auf ${data.update.latest}` : ""}</Unit>
            </Big>
            <Small>Abgleich {ago(data.lastRun)}</Small>
          </Tile>
        </Grid>
      )}

      {data && !pve && !nb && admin && (
        <Hint>
          <div>
            <strong>Bring dein Homelab ins Wiki.</strong> Verbinde einen Proxmox-Server, dann bekommt
            jede VM und jeder Container automatisch eine eigene Seite.
          </div>
          <HintLink to={settingsPath("brainbox-proxmox")}>Proxmox verbinden</HintLink>
        </Hint>
      )}
    </Wrap>
  );
}

const Wrap = styled.div`
  margin: 8px 0 28px;
`;

const Kicker = styled.div`
  font-family: ${s("fontFamilyMono")};
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${s("link")};
`;

const Title = styled.h1`
  font-size: 2.25em;
  line-height: 1.15;
  letter-spacing: -0.02em;
  margin: 6px 0 14px;
  text-wrap: balance;
`;

const Quick = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
`;

const QuickLink = styled(Link)`
  font-size: 14px;
  color: ${s("text")};
  border: 1px solid ${s("divider")};
  border-radius: 999px;
  padding: 4px 12px;
  text-decoration: none;

  &:hover {
    border-color: ${s("link")};
    color: ${s("link")};
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 12px;
`;

const tileStyle = css`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 14px 16px;
  border: 1px solid ${s("divider")};
  border-radius: 12px;
  background: ${s("backgroundSecondary")};
  color: ${s("text")};
  text-decoration: none;
`;

const TileLink = styled(Link)`
  ${tileStyle}
  transition: border-color 100ms ease;

  &:hover {
    border-color: ${s("link")};
  }
`;

const TileBox = styled.div`
  ${tileStyle}
`;

const Label = styled.span`
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: ${s("fontFamilyMono")};
  font-size: 11.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${s("textSecondary")};
`;

const Dot = styled.span<{ $state: DotState }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
  background: ${(props) => props.theme[DOT_COLOR[props.$state]]};
  ${(props) =>
    props.$state === "ok" &&
    css`
      box-shadow: 0 0 0 3px ${props.theme.link}33;
    `}
`;

const Big = styled.span`
  font-size: 1.6em;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
`;

const Unit = styled.span`
  font-size: 0.55em;
  font-weight: 400;
  color: ${s("textSecondary")};
`;

const Small = styled.span`
  font-size: 13px;
  color: ${s("textSecondary")};
`;

const Chips = styled.span`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
`;

const Chip = styled.span<{ $off?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: ${s("fontFamilyMono")};
  font-size: 11.5px;
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid ${s("divider")};
  color: ${(props) => (props.$off ? props.theme.textTertiary : props.theme.textSecondary)};

  ${Dot} {
    width: 6px;
    height: 6px;
    box-shadow: none;
  }
`;

const Hint = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
  padding: 14px 16px;
  border: 1px dashed ${s("divider")};
  border-radius: 12px;
  color: ${s("textSecondary")};

  div {
    flex: 1 1 280px;
  }

  strong {
    color: ${s("text")};
  }
`;

const HintLink = styled(Link)`
  background: ${s("accent")};
  color: ${s("accentText")};
  border-radius: 8px;
  padding: 6px 14px;
  font-weight: 500;
  text-decoration: none;
`;

export default observer(BrainboxDashboard);
