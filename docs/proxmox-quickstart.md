# 🧠 Brainbox – Proxmox Quick-Start

Brainbox ist ein Wiki fürs Homelab als LXC-Container auf Proxmox VE. Ein Container ist ein Wiki. Dazu gehören Login-Link, sechs Anmeldewege, die **Brainbox-Zentrale** im Browser, beliebig viele Proxmox-Server, NetBird und Claude als Mitschreiber. Im Kern arbeitet [Outline](https://www.getoutline.com).

## Installieren

In der **Proxmox-Shell** ausführen, also auf dem Host und nicht im Container:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/pmornhart/Brainbox/main/proxmox/brainbox.sh)"
```

Zuerst erscheint ein Dialog:

- **Standard-Einstellungen** übernimmt die Werte unten.
- **Erweiterte Einstellungen** fragt zusätzlich ID, Hostname, Disk, CPU, RAM, Bridge, IP/Gateway, VLAN, Root-Passwort und Container-Typ ab.

In beiden Fällen fragt das Skript:

| Frage | Beispiel |
|---|---|
| Name des Wikis | `Brainbox` |
| Domain | `brainbox.morncloud.de` (leer = nur `http://IP:3000`) |
| Dein Name | `Philip` |
| Deine E-Mail | Admin des Wikis |
| Proxmox im Wiki? | Ja = dieser Server ist sofort verbunden, der Lesezugang wird angelegt |

Daraus legt es das Wiki samt Admin an. Am Ende zeigt es einen **Login-Link**, der einmal benutzbar und 60 Minuten gültig ist. Der Hostname ergibt sich aus der Domain (`brainbox.morncloud.de` → `brainbox`).

## Standardwerte

| Ressource | Wert |
|---|---|
| CPU | 2 Kerne |
| RAM | 4096 MB |
| Disk | 8 GB |
| Betriebssystem | Debian 13 |
| Container-Typ | unprivilegiert |
| Tags | documentation |
| Architektur | amd64, arm64 |

## Zugriff

| | |
|---|---|
| Weboberfläche | `http://<IP>:3000` |
| Brainbox-Zentrale | `http://<IP>:3000/zentrale`, unten in der Seitenleiste des Wikis (nur Admins) |
| Ports | `3000` Zentrale und Tor zum Wiki, `3100` Wiki-Kern (nur intern) |
| Dienste | `brainbox` (Wiki-Kern), `brainbox-zentrale`, `brainbox-sync.timer` (Abgleich) |
| Logs | `journalctl -u brainbox -f`, `journalctl -u brainbox-zentrale`, `journalctl -u brainbox-sync` |
| Wiki-Kern | `/opt/brainbox`, Einstellungen in `/opt/brainbox/.env` |
| Brainbox-Bausatz | `/opt/brainbox-kit` (Design, Zentrale, Befehle) |
| Version | `/root/.brainbox`, letzte Update-Prüfung in `/var/lib/brainbox/update.json` |
| Proxmox-Server | `/etc/brainbox/proxmox.json` (nur root) |
| Weitere Verbindungen | `/etc/brainbox/connect.env` (nur root) |
| Hochgeladene Dateien | `/var/lib/outline/data` |
| Datenbank-Zugang | `/root/brainbox.creds` |

## Hinweise

- **Wartezeit nach der Installation:** Der Wiki-Kern richtet zuerst die Datenbank ein. Solange zeigt die Adresse „Brainbox startet gerade“ – ein bis zwei Minuten.
- **Erster Login:** über den Login-Link vom Ende der Installation. Ist er abgelaufen oder schon benutzt, holst du einen neuen in der Zentrale (Übersicht → Login-Link) oder im Container mit `brainbox-login link`.
- **Ohne Admin-E-Mail** legt das Skript kein Wiki an. Dann zeigt der Browser beim ersten Aufruf „Arbeitsbereich erstellen“.
- **Mehrere Wikis:** Ein Container ist ein Wiki. Für ein weiteres das Skript erneut ausführen und eine andere Domain eintragen.
- **Neue IP:** Ändert sich die IP des Containers, trägst du sie in der Zentrale unter Anmeldung ein (oder `brainbox-login` → Adresse).

## HTTPS mit eigener Domain

Passkeys, Google, Microsoft und die Claude-App funktionieren nur über HTTPS mit Domain. Beispiel mit Nginx Proxy Manager:

1. DNS: `brainbox.morncloud.de` zeigt auf deinen Reverse-Proxy.
2. Proxy Host anlegen: Domain `brainbox.morncloud.de`, Schema `http`, Ziel `<IP des Containers>`, Port `3000`, **Websockets Support an**.
3. Reiter SSL: Let's-Encrypt-Zertifikat, „Force SSL“ an.
4. Hast du die Domain bei der Installation leer gelassen: im Container `brainbox-login` → **Adresse** → `https://brainbox.morncloud.de`.

## Brainbox-Zentrale

Alle Einstellungen gibt es im Browser. Unten in der Seitenleiste des Wikis findest du **Brainbox-Zentrale**. Jeder Bereich erklärt Schritt für Schritt, was zu tun ist:

| Bereich | Was du dort machst |
|---|---|
| Übersicht | Status aller Verbindungen, jetzt abgleichen, Login-Link erstellen |
| Proxmox-Server | Server hinzufügen, prüfen, entfernen – mit kopierbaren Befehlen für den Lesezugang |
| NetBird | API-Adresse und Token eintragen, trennen |
| Claude | Konto einrichten, Schlüssel und Anleitung für App und Code |
| Bereiche | Zuordnungsregeln erklärt, Link zur Regel-Seite |
| Anmeldung | E-Mail, Google, Microsoft, Discord, OIDC – mit Redirect-URIs zum Kopieren |
| Version & Update | installierte und neueste Version, Update starten, Protokoll |

Im Terminal geht dasselbe mit `brainbox-connect`, `brainbox-login` und `update`.

## Anmeldung einrichten

In der Zentrale unter **Anmeldung** oder im Container mit `brainbox-login`. Beides schreibt `/opt/brainbox/.env` und startet den Wiki-Kern neu.

| Weg | Was du brauchst | Weiterleitungs-Adresse (Redirect-URI) |
|---|---|---|
| E-Mail-Login | SMTP-Zugang. Vorlagen für Gmail, GMX, web.de, Outlook, Microsoft 365, IONOS, Strato und eigene Server; mit Test-Mail | – |
| Passkeys | nur HTTPS, sonst nichts – von Anfang an an | – |
| Google | Client-ID und Schlüssel | `<URL>/auth/google.callback` |
| Microsoft | Client-ID, Geheimnis, optional Tenant | `<URL>/auth/azure.callback` |
| Discord | Client-ID, Secret, optional Server-ID | `<URL>/auth/discord.callback` |
| OIDC | Name, Issuer-URL, Client-ID, Secret (Pocket ID, Authentik, Keycloak …) | `<URL>/auth/oidc.callback` |

Ohne Menü: `brainbox-login status`, `brainbox-login link [E-Mail]`, `brainbox-login set KEY=WERT …`, `brainbox-login unset KEY …`, `brainbox-login testmail du@beispiel.de`.

Gut zu wissen:

- **Nur mit Einladung:** Rein kommt nur, wer unter Einstellungen → Benutzer eingeladen ist, egal über welchen Weg.
- **Passkey** legt jeder selbst an: Profil → Einstellungen → Passkeys.
- **Microsoft** klappt nur mit Firmen- oder Schulkonten (Microsoft 365 / Entra ID). Private @outlook.com- und @hotmail.com-Konten nehmen E-Mail oder Passkey.
- **Google:** Private @gmail.com-Konten können beitreten, aber kein neues Wiki anlegen.

## Proxmox-Server

Du kannst beliebig viele Server oder Cluster verbinden. Hast du bei der Installation „Ja“ gewählt, ist der eigene Server schon drin: Der Installer legt auf dem Host den Nutzer `brainbox@pve` mit Rolle **PVEAuditor** (nur Lesen) und den Token `wiki<ID>` an.

**Weiteren Server hinzufügen** – in der Zentrale unter *Proxmox-Server*, oder so:

1. Auf dem neuen Proxmox-Host einen Lesezugang anlegen:

   ```bash
   pveum user add brainbox@pve
   pveum acl modify / --users brainbox@pve --roles PVEAuditor
   pveum user token add brainbox@pve wiki --privsep 0
   ```

2. Im Brainbox-Container mit Name, Adresse, `full-tokenid` und `value` verbinden:

   ```bash
   brainbox-connect proxmox add hetzner https://203.0.113.10:8006 'brainbox@pve!wiki' <value> --insecure
   ```

Brainbox testet den Zugang, bevor es ihn speichert. `--insecure` überspringt die Zertifikatsprüfung (Proxmox nutzt meist ein selbst ausgestelltes Zertifikat). Weitere Befehle:

- `brainbox-connect proxmox list` zeigt die Server.
- `brainbox-connect proxmox test [NAME]` prüft sie.
- `brainbox-connect proxmox remove NAME` entfernt einen Server; seine Einträge werden archiviert.

Was im Wiki entsteht (Sammlung **Proxmox**):

- **Proxmox – Übersicht**: alle Server und alle VMs und Container mit Server, Status, IP, NetBird-Gerät und Domains
- **je Server eine Seite** `<Name> (Proxmox-Server)`: Erreichbarkeit, Version, Nodes mit CPU, RAM und Laufzeit, alle Gäste
- **je VM und Container ein Eintrag** unter seinem Server: ID, Typ, Node, Status, CPU, RAM, Disk, Betriebssystem, IP-Adressen, Tags, NetBird, Domains, Bereich, Link zu Proxmox und die Beschreibung aus Proxmox
- Neue Gäste erscheinen nach spätestens 5 Minuten. Gelöschte werden archiviert und bei Rückkehr wiederhergestellt.
- Ist ein Server nicht erreichbar, bleiben seine Einträge stehen und die Server-Seite zeigt den Grund.
- Alles ab der Überschrift **Notizen** bleibt bei jedem Abgleich erhalten.

IP-Adressen von VMs kommen über den QEMU-Gast-Agenten, bei Containern direkt.

## NetBird

In der Zentrale unter *NetBird* oder mit `brainbox-connect netbird`. Du brauchst:

- **API-Adresse:** bei NetBird Cloud `https://api.netbird.io`, selbst gehostet die Adresse deines Management-Servers
- **Access Token:** Dashboard → Team → Service Users, oder eigenes Profil → Personal Access Tokens

Was im Wiki entsteht (Sammlung **NetBird**):

- **NetBird – Übersicht**: alle Geräte mit NetBird-IP, DNS-Name, online/offline und zugehörigem Proxmox-Gast
- **Domains**: alle Domains aus den NetBird-Netzwerken und wozu sie gehören
- **je Gerät ein Eintrag**: Hostname, IPs, DNS-Namen, Gruppen, Betriebssystem, zuletzt gesehen

**Zuordnung:**

- **NetBird-Gerät ↔ Proxmox-Gast:** über gleichen Namen, Hostnamen oder gleiche IP.
- **Domain ↔ Gast:** über den ersten Teil der Domain (`nextcloud.morncloud.de` → Gast `nextcloud`). Von Hand geht es mit einer Zeile `domain: cloud.morncloud.de` in den Proxmox-Notizen des Gasts.

## Bereiche: Zuordnungsregeln

Sobald Proxmox oder NetBird verbunden ist, legt der Abgleich die Sammlung **Bereiche** an, darin die Seite **Zuordnungsregeln**. Die Tabelle darin bestimmt, was wohin gehört. Änderungen gelten beim nächsten Abgleich: spätestens nach 5 Minuten, sofort mit `brainbox-connect sync`.

| Muster | trifft |
|---|---|
| `*.morninghosting.de` | alle Domains unter morninghosting.de, auch morninghosting.de selbst |
| `survival.morninghosting.de` | genau diese Domain |
| `name:mc-*` | VMs, Container und NetBird-Geräte, deren Name mit „mc-“ beginnt |
| `tag:minecraft` | VMs und Container mit dem Proxmox-Tag „minecraft“ |
| `gruppe:Server` | NetBird-Geräte in der Gruppe „Server“ |

So wirken die Regeln:

- Die erste passende Regel gewinnt.
- `Minecraft-Server/Survival` legt einen Unterbereich an.
- Eine VM erbt den Bereich ihrer Domain, ein NetBird-Gerät den seiner VM.
- Jeder Bereich bekommt einen Eintrag mit Domains, VMs, Containern und Geräten.
- Die **Bereiche – Übersicht** zeigt zusätzlich, was noch ohne Bereich ist.
- Die Seite „Zuordnungsregeln“ wird vom Abgleich nie überschrieben.

## Claude verbinden

In der Zentrale unter *Claude* auf „Claude einrichten“, oder `brainbox-connect claude`. Das legt im Wiki an:

- das Konto **Claude** (Rolle Mitglied)
- die gemeinsame Sammlung **Von Claude**
- einen API-Schlüssel
- eine Anweisung für Claude beim Verbinden

Claude verbindet sich über den eingebauten MCP-Anschluss `https://<deine-domain>/mcp`.

| Wo | Wie |
|---|---|
| Claude-App (claude.ai, Handy, Desktop) | Im Browser als Claude anmelden (Login-Link aus der Zentrale). Dann in Claude: Einstellungen → Connectors → Benutzerdefinierten Connector hinzufügen → `https://<deine-domain>/mcp` → Verbinden → Zulassen. Braucht HTTPS aus dem Internet. |
| Claude Code | `claude mcp add --transport http brainbox https://<deine-domain>/mcp --header "Authorization: Bearer <Schlüssel>"` |

Claude legt keine eigenen Sammlungen an, weil die privat wären. Es schreibt in bestehende Sammlungen oder in **Von Claude**. Abschalten: Einstellungen → Benutzer → Claude sperren.

## Update

Brainbox sieht alle 6 Stunden selbst nach, ob es eine neue Version gibt. Ist eine da, siehst du das an drei Stellen:

- **im Wiki:** unten in der Seitenleiste erscheint **„Update verfügbar · 1.1.0“** mit Download-Symbol (nur für Admins)
- **in der Zentrale:** ein Hinweis in der Übersicht und ein Symbol bei „Version & Update“, dort mit **Jetzt aktualisieren**
- **im Terminal:** die Begrüßung beim Öffnen der Konsole zeigt „Update verfügbar“

Aktualisieren geht per Knopf in der Zentrale oder im Container (Konsole in Proxmox oder `pct enter <ID>`):

```bash
update
```

Vom Proxmox-Host aus, ohne in den Container zu wechseln:

```bash
pct exec <ID> -- update
```

So läuft das Update ab:

1. Es sichert Datenbank und `.env` nach `/root/brainbox-backups/` (die letzten drei).
2. Es holt die neue Brainbox-Version samt dem dazu getesteten Kern, wendet das Brainbox-Design an und baut neu.
3. Es startet Wiki und Zentrale.

Schlägt der Build fehl, läuft automatisch wieder die alte Version. `brainbox-update` ist derselbe Befehl wie `update`.

Weitere Optionen:

- `update --check` prüft nur (Exit-Code 10 = Update verfügbar).
- `update --force` baut auch bei gleicher Version neu.

Was sich geändert hat, steht in den [Änderungen](../CHANGELOG.md).

## Erweiterte Optionen

Alle Werte lassen sich vorab setzen, dann läuft die Installation ohne Dialog:

```bash
var_mode=default var_wiki_name="Werkstatt" var_domain=werkstatt.morncloud.de \
  var_admin_name=Philip var_admin_email=du@example.de var_cpu=4 var_ram=6144 \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/pmornhart/Brainbox/main/proxmox/brainbox.sh)"
```

| Variable | Standard | Bedeutung |
|---|---|---|
| `var_mode` | fragen | `default` oder `advanced` (gesetzt = keine Dialoge) |
| `var_wiki_name` | `Brainbox` | Name des Wikis |
| `var_domain` | `brainbox.morncloud.de` | Domain, leer = nur `http://IP:3000` |
| `var_admin_name` / `var_admin_email` | – | Admin; ohne E-Mail kein automatisches Wiki |
| `var_pve_sync` | `yes` | `no` = diesen Proxmox-Server nicht verbinden |
| `var_ctid` | nächste freie | Container-ID |
| `var_hostname` | aus der Domain | Hostname |
| `var_cpu` / `var_ram` / `var_disk` / `var_swap` | 2 / 4096 / 8 / 512 | Kerne / MB / GB / MB |
| `var_bridge` | `vmbr0` | Netzwerk-Bridge |
| `var_net` / `var_gateway` / `var_vlan` | `dhcp` / – / – | Netzwerk |
| `var_storage` / `var_template_storage` | Auswahl | Speicher für Container und Vorlagen |
| `var_pw` | leer | Root-Passwort (leer = Auto-Login auf der Konsole) |
| `var_unprivileged` | `1` | `0` = privilegierter Container |
| `var_verbose` | `no` | `yes` = ausführliche Ausgabe |
| `BRAINBOX_BRANCH` | `main` | anderen Branch dieses Repos verwenden |
| `BRAINBOX_OUTLINE_VERSION` | passend zur Brainbox-Version | anderen Wiki-Kern erzwingen, z. B. `v1.12.0` (ungetestet) |
