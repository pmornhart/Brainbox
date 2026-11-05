// Brainbox: Werkzeuge für Claude (MCP) – Brainbox selbst bedienen.
// Claude verbindet sich mit der Anmeldung der Person, die ihn verbunden hat. Die Werkzeuge rufen die
// Brainbox-Zentrale auf demselben Rechner auf (interner Schlüssel) – nur für Admins des Wikis und auf
// denselben Wegen wie die Einstellungen und das Terminal.
import { readFileSync } from "node:fs";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import AuthenticationHelper from "@shared/helpers/AuthenticationHelper";
import { error, getActorFromContext, success, withTracing } from "../util";

const ZENTRALE_URL =
  process.env.BRAINBOX_ZENTRALE_URL || "http://127.0.0.1:3000";
const KEY_FILE = "/etc/brainbox/intern.key";
/** Länger als der längste Befehl (Proxmox prüfen und abgleichen) */
const REQUEST_TIMEOUT_MS = 300_000;
const NAME_MAX_LENGTH = 100;
/**
 * Name eines Proxmox-Servers: frei wählbar (Punkte, Leerzeichen, Großbuchstaben, Umlaute …),
 * nur ohne Steuerzeichen wie Zeilenumbrüche.
 * Passt: "ph.morn.lan", "Zuhause Keller" · passt nicht: "zeile\nzwei"
 * Ausprobieren: https://regex101.com/?regex=%5E%5B%5E%5Cx00-%5Cx1f%5Cx7f%5D%2B%24&testString=ph.morn.lan
 */
const NAME_PATTERN = /^[^\x00-\x1f\x7f]+$/;

/** Wie Brainbox aufgebaut ist und wie Claude es bedient – kommt zu den Anweisungen des MCP-Servers */
export const brainboxInstructions = `Brainbox ist ein Wiki fürs Homelab. Du arbeitest mit der Anmeldung der Person, die dich verbunden hat, und mit ihren Rechten. Schreibe auf Deutsch, klar und knapp.

Aufbau des Wikis:
- Sammlung „Start“: Anleitung und Spickzettel. Wenn du wissen willst, wie etwas in Brainbox geht, lies zuerst die Seite „Anleitung“.
- Sammlung „Proxmox“: je Proxmox-Server eine Seite „<Name> (Proxmox-Server)“, darunter je VM und Container eine Seite mit Status, IPs, Domains und Bereich.
- Sammlung „NetBird“: Geräte, Netzwerke und die Seite „Domains“ (auch Domains vom NetBird-Reverse-Proxy mit Ziel, Status und Schutz).
- Sammlung „Bereiche“: alles nach Themen. Die Seite „Zuordnungsregeln“ legt in einer Tabelle (Muster → Bereich) fest, was wohin gehört, z. B. *.example.de → Minecraft-Server. Die erste passende Regel gewinnt.
- Seiten in „Proxmox“, „NetBird“ und „Bereiche“ schreibt der Abgleich alle 5 Minuten neu. Ändere dort nur den Teil unter der Überschrift „Notizen“ (außer an den Zuordnungsregeln).
- Sammlung „Von Claude“: für Seiten, die in keine andere Sammlung passen. Suche vor dem Anlegen, ob es schon eine passende Seite gibt, und ergänze lieber diese. Lege keine neuen Sammlungen an, ohne zu fragen.

Brainbox bedienen (Werkzeuge brainbox_*, nur für Admins):
- brainbox_status zeigt, was verbunden ist, die Version und den letzten Abgleich. Rufe es auf, bevor du etwas änderst.
- Proxmox-Server hinzufügen: Frage zuerst, ob Brainbox den Server direkt erreicht (gleiches Netz oder VPN) oder ob er an einem anderen Standort steht.
  - Direkt: Die Person führt in der Shell des Proxmox-Hosts einmal aus: „pveum user add brainbox@pve“, „pveum acl modify / --users brainbox@pve --roles PVEAuditor“, „pveum user token add brainbox@pve wiki --privsep 0“. Mit Adresse (https://IP:8006), Token-ID (brainbox@pve!wiki) und Secret (value) rufst du dann brainbox_proxmox_add auf.
  - Anderer Standort: brainbox_proxmox_add_remote erzeugt einen Befehl. Die Person führt ihn in der Shell des entfernten Proxmox-Hosts aus, danach meldet sich der Server alle 5 Minuten selbst.
- brainbox_proxmox_rename gibt einem Server einen neuen Namen (die Wiki-Seiten werden mit umbenannt). brainbox_proxmox_remove entfernt einen Server (seine Seiten werden archiviert) – vorher nachfragen.
- brainbox_netbird_connect verbindet NetBird (API-Adresse und Access Token eines Service Users mit Rolle Admin).
- brainbox_sync gleicht sofort ab. brainbox_update_check prüft auf eine neue Version, brainbox_update_start startet das Update (das Wiki ist dabei einige Minuten nicht erreichbar – vorher nachfragen).
- Brainbox liest Proxmox und NetBird nur, es ändert dort nichts.
Schreibe nie Passwörter, Tokens oder Schlüssel ins Wiki und wiederhole Secrets nicht unnötig.`;

type ZentraleResult = { ok?: boolean; output?: string; error?: string };

/**
 * Ruft eine Aktion der Brainbox-Zentrale auf demselben Rechner auf.
 *
 * @param action - Name der Aktion, z. B. „proxmox/add“.
 * @param body - Werte für die Aktion.
 * @returns die Antwort der Zentrale.
 */
async function zentrale(
  action: string,
  body: Record<string, unknown>
): Promise<ZentraleResult> {
  const key = readFileSync(KEY_FILE, "utf8").trim();
  const res = await fetch(`${ZENTRALE_URL}/zentrale/intern/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Brainbox-Intern": key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = (await res.json()) as ZentraleResult;
  if (!res.ok) {
    throw new Error(data.error || `Brainbox-Zentrale: HTTP ${res.status}`);
  }
  return data;
}

const serverName = () =>
  z
    .string()
    .max(NAME_MAX_LENGTH)
    .regex(NAME_PATTERN)
    .describe(
      "Name des Proxmox-Servers, frei wählbar, z. B. zuhause, ph.morn.lan oder Zuhause Keller"
    );

type ToolDef = {
  name: string;
  title: string;
  description: string;
  write: boolean;
  destructive?: boolean;
  action: string;
  input: z.ZodRawShape;
};

const tools: ToolDef[] = [
  {
    name: "brainbox_status",
    title: "Brainbox-Status",
    description:
      "Zeigt, was in Brainbox verbunden ist: Version und Update, Proxmox-Server (Name, Art, erreichbar, Anzahl VMs/Container, letzte Meldung), NetBird und den letzten Abgleich.",
    write: false,
    action: "status",
    input: {},
  },
  {
    name: "brainbox_proxmox_add",
    title: "Proxmox-Server verbinden (im selben Netz)",
    description:
      "Verbindet einen Proxmox-Server, den Brainbox direkt erreicht. Braucht einen Lesezugang (Rolle PVEAuditor): auf dem Proxmox-Host „pveum user add brainbox@pve“, „pveum acl modify / --users brainbox@pve --roles PVEAuditor“, „pveum user token add brainbox@pve wiki --privsep 0“. Brainbox prüft den Zugang, bevor es speichert.",
    write: true,
    action: "proxmox/add",
    input: {
      name: serverName(),
      url: z
        .string()
        .describe("Adresse des Proxmox-Servers, z. B. https://192.168.1.2:8006"),
      tokenId: z
        .string()
        .describe("Token-ID (full-tokenid), meist brainbox@pve!wiki"),
      secret: z.string().describe("Token-Secret (value)"),
      insecure: z
        .boolean()
        .optional()
        .describe(
          "Zertifikat nicht prüfen (bei selbst ausgestellten Zertifikaten im Heimnetz üblich, Standard: ja)"
        ),
    },
  },
  {
    name: "brainbox_proxmox_add_remote",
    title: "Proxmox-Server an anderem Standort verbinden",
    description:
      "Für einen Proxmox-Server, an den Brainbox nicht herankommt (anderer Standort, andere Firewall). Erzeugt einen Befehl, den die Person einmal in der Shell dieses Proxmox-Hosts ausführt. Danach meldet sich der Server alle 5 Minuten selbst. Ein neuer Befehl macht den alten ungültig.",
    write: true,
    action: "proxmox/agent",
    input: { name: serverName() },
  },
  {
    name: "brainbox_proxmox_rename",
    title: "Proxmox-Server umbenennen",
    description:
      "Gibt einem verbundenen Proxmox-Server einen neuen Namen. Die Wiki-Seiten werden mit umbenannt, Notizen bleiben.",
    write: true,
    action: "proxmox/rename",
    input: {
      name: serverName().describe("Bisheriger Name"),
      newName: serverName().describe("Neuer Name"),
    },
  },
  {
    name: "brainbox_proxmox_remove",
    title: "Proxmox-Server entfernen",
    description:
      "Entfernt einen Proxmox-Server aus Brainbox. Seine Wiki-Seiten werden archiviert, nicht gelöscht. Vorher nachfragen.",
    write: true,
    destructive: true,
    action: "proxmox/remove",
    input: { name: serverName() },
  },
  {
    name: "brainbox_proxmox_test",
    title: "Proxmox-Server prüfen",
    description:
      "Prüft, ob Brainbox einen (oder alle) Proxmox-Server erreicht bzw. ob er sich meldet, und wie viele VMs/Container sichtbar sind.",
    write: false,
    action: "proxmox/test",
    input: { name: serverName().optional() },
  },
  {
    name: "brainbox_netbird_connect",
    title: "NetBird verbinden",
    description:
      "Verbindet NetBird: Geräte, Netzwerke und Domains (auch vom Reverse-Proxy) kommen ins Wiki. Braucht die API-Adresse (NetBird Cloud: https://api.netbird.io) und das Access Token eines Service Users mit Rolle Admin. Brainbox liest NetBird nur.",
    write: true,
    action: "netbird",
    input: {
      url: z.string().describe("API-Adresse, z. B. https://api.netbird.io"),
      token: z.string().describe("Access Token"),
    },
  },
  {
    name: "brainbox_sync",
    title: "Jetzt abgleichen",
    description:
      "Gleicht Proxmox, NetBird und Bereiche sofort mit dem Wiki ab (läuft sonst alle 5 Minuten).",
    write: true,
    action: "sync",
    input: {},
  },
  {
    name: "brainbox_update_check",
    title: "Nach Update suchen",
    description: "Prüft, ob es eine neue Brainbox-Version gibt.",
    write: false,
    action: "update/check",
    input: {},
  },
  {
    name: "brainbox_update_start",
    title: "Update starten",
    description:
      "Startet das Brainbox-Update. Datenbank und Einstellungen werden vorher gesichert; das Wiki ist einige Minuten nicht erreichbar. Vorher nachfragen.",
    write: true,
    destructive: true,
    action: "update/start",
    input: {},
  },
];

/**
 * Registriert die Brainbox-Werkzeuge am MCP-Server.
 *
 * @param server - der MCP-Server.
 * @param scopes - die OAuth-Bereiche des Zugangs.
 * @returns die Namen der angemeldeten Werkzeuge.
 */
export function brainboxTools(server: McpServer, scopes: string[]): string[] {
  const canRead = AuthenticationHelper.canAccess("users.info", scopes);
  const canWrite = AuthenticationHelper.canAccess("documents.create", scopes);

  return tools
    .filter((tool) => (tool.write ? canWrite : canRead))
    .map((tool) => registerTool(server, tool));
}

/**
 * Registriert ein Brainbox-Werkzeug: prüft, ob der Nutzer Admin ist, und beauftragt dann die Zentrale.
 *
 * @param server - der MCP-Server.
 * @param tool - das Werkzeug.
 * @returns den Namen des Werkzeugs.
 */
function registerTool(server: McpServer, tool: ToolDef): string {
  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      annotations: {
        readOnlyHint: !tool.write,
        destructiveHint: !!tool.destructive,
      },
      inputSchema: z.object(tool.input),
    },
    withTracing(tool.name, async (args: Record<string, unknown>, extra) => {
      try {
        const actor = getActorFromContext(extra);
        if (!actor.isAdmin) {
          return error(
            "Brainbox bedienen dürfen nur Admins des Wikis. Lesen und Schreiben im Wiki geht trotzdem."
          );
        }
        const body =
          tool.action === "proxmox/add"
            ? { ...args, insecure: args.insecure !== false }
            : args;
        return success(await zentrale(tool.action, body));
      } catch (err) {
        return error(err);
      }
    })
  );
  return tool.name;
}
