# 🧠 Brainbox – Proxmox Quick-Start

Die Wissensdatenbank [Outline](https://www.getoutline.com) als LXC-Container auf Proxmox VE: ein Wiki pro Container, mit Login-Link, sechs Anmeldewegen, Claude als Mitschreiber und automatischen Einträgen aus Proxmox und NetBird.

## Installieren

In der **Proxmox-Shell** (Host, nicht im Container) ausführen:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/pmornhart/Brainbox/main/proxmox/brainbox.sh)"
```

Es erscheint ein Dialog: **Standard-Einstellungen** übernimmt die Werte unten, **Erweiterte Einstellungen** fragt zusätzlich ID, Hostname, Disk, CPU, RAM, Bridge, IP/Gateway, VLAN, Root-Passwort und Container-Typ ab.

In beiden Fällen fragt das Skript:

| Frage | Beispiel |
|---|---|
| Name des Wikis | `Brainbox` |
| Domain | `brainbox.morncloud.de` (leer = nur `http://IP:3000`) |
| Dein Name | `Philip` |
| Deine E-Mail | Admin des Wikis |
| Proxmox im Wiki? | Ja = jede VM und jeder Container bekommt einen Eintrag (Lesezugang wird angelegt) |

Daraus legt es das Wiki samt Admin an und zeigt am Ende einen **Login-Link** (einmal benutzbar, 60 Minuten gültig). Der Hostname ergibt sich aus der Domain (`brainbox.morncloud.de` → `brainbox`).

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
| Port | 3000 |
| Konfiguration | `/opt/brainbox/.env` |
| Programm | `/opt/brainbox` |
| Hochgeladene Dateien | `/var/lib/outline/data` |
| Datenbank-Zugang | `/root/brainbox.creds` |
| Anmeldung einrichten | `brainbox-login` |
| Installierte Version | `/root/.brainbox` |
| Dienst | `systemctl status brainbox` |
| Logs | `journalctl -u brainbox -f` |
| Verbindungen (Claude, Proxmox, NetBird) | `brainbox-connect`, Einstellungen in `/etc/brainbox/connect.env` |
| Abgleich-Log | `journalctl -u brainbox-sync` |

## Hinweise

- Nach der Installation migriert Outline die Datenbank. Die Weboberfläche ist deshalb ein bis zwei Minuten nicht erreichbar.
- **Erster Login:** über den Login-Link vom Ende der Installation. Abgelaufen oder schon benutzt? Im Container `brainbox-login link` für einen neuen. Google, Microsoft oder Slack sind dafür nicht nötig.
- Ohne Admin-E-Mail legt das Skript kein Wiki an. Dann zeigt Outline beim ersten Aufruf „Arbeitsbereich erstellen“ im Browser.
- **Weitere Anmeldewege** richtest du mit `brainbox-login` ein, siehe unten.
- **Mehrere Wikis:** Ein Container ist ein Wiki. Für ein weiteres das Skript erneut ausführen und eine andere Domain eintragen.
- Die Oberfläche ist auf Deutsch eingestellt (`DEFAULT_LANGUAGE=de_DE`).
- Ändert sich die IP des Containers, mit `brainbox-login` → Adresse die neue Adresse eintragen.

## HTTPS mit eigener Domain

Passkeys, Google und Microsoft funktionieren nur über HTTPS mit Domain. Beispiel mit Nginx Proxy Manager:

1. DNS: `brainbox.morncloud.de` zeigt auf deinen Reverse-Proxy.
2. Proxy Host anlegen: Domain `brainbox.morncloud.de`, Schema `http`, Ziel `<IP des Containers>`, Port `3000`, **Websockets Support an**.
3. Reiter SSL: Let's-Encrypt-Zertifikat, „Force SSL“ an.
4. Im Container `brainbox-login` → **Adresse** → `https://brainbox.morncloud.de`.

## Anmeldung einrichten: `brainbox-login`

Im Container `brainbox-login` eingeben. Das Menü fragt alles Nötige ab, schreibt `/opt/brainbox/.env` und startet Brainbox neu.

| Menüpunkt | Was passiert | Weiterleitungs-Adresse (Redirect-URI) |
|---|---|---|
| Adresse | `URL=` setzen, z. B. `https://brainbox.morncloud.de` | – |
| E-Mail-Login | SMTP für Login-Mails, Vorlagen für Gmail, GMX, web.de, Outlook, Microsoft 365, IONOS, Strato, eigener Server; Test-Mail | – |
| Passkeys | Erklärung; Passkeys sind von Anfang an an und brauchen HTTPS | – |
| Google | Client-ID und Schlüssel | `<URL>/auth/google.callback` |
| Microsoft | Client-ID, Geheimnis, optional Tenant | `<URL>/auth/azure.callback` |
| Discord | Client-ID, Secret, optional Server-ID | `<URL>/auth/discord.callback` |
| OIDC | Name, Issuer-URL, Client-ID, Secret (Pocket ID, Authentik, Keycloak …) | `<URL>/auth/oidc.callback` |
| Sprache | Deutsch oder Englisch | – |

Ohne Menü: `brainbox-login status`, `brainbox-login link [E-Mail]`, `brainbox-login set KEY=WERT …`, `brainbox-login unset KEY …`, `brainbox-login testmail du@beispiel.de`, `brainbox-login workspace <Wiki-Name> <Admin-Name> <E-Mail>` (nur wenn noch keins existiert).

Gut zu wissen:

- **E-Mail-Login** gilt für alle, die im Workspace sind. Neue Leute lädst du unter Einstellungen → Benutzer ein.
- **Passkey** legt jeder selbst an: Profil → Einstellungen → Passkeys. Der Knopf „Mit Passkey fortfahren“ erscheint, sobald es mindestens einen gibt.
- **Microsoft** klappt nur mit Firmen- oder Schulkonten (Microsoft 365 / Entra ID). Private @outlook.com- und @hotmail.com-Konten nehmen E-Mail oder Passkey.
- **Google**: Private @gmail.com-Konten können einem bestehenden Workspace beitreten, aber keinen neuen anlegen.

## Claude verbinden: `brainbox-connect claude`

Legt im Wiki das Konto **Claude** (Rolle Mitglied) und die gemeinsame Sammlung **Von Claude** an, erstellt einen API-Schlüssel und hinterlegt unter Einstellungen → Künstliche Intelligenz eine Anweisung für Claude. Outline bringt dafür einen eigenen MCP-Anschluss mit: `https://<deine-domain>/mcp`.

| Wo | Wie |
|---|---|
| Claude-App (claude.ai, Handy, Desktop) | Im Browser als Claude anmelden (Login-Link aus der Ausgabe), dann in Claude: Einstellungen → Connectors → Benutzerdefinierten Connector hinzufügen → `https://<deine-domain>/mcp` → Verbinden → Zulassen. Braucht HTTPS aus dem Internet. |
| Claude Code | `claude mcp add --transport http brainbox https://<deine-domain>/mcp --header "Authorization: Bearer <Schlüssel>"` |

Claude legt keine eigenen Sammlungen an (die wären privat), sondern schreibt in bestehende oder in **Von Claude**. Abschalten: Einstellungen → Benutzer → Claude sperren.

## Proxmox im Wiki: `brainbox-connect proxmox`

Bei der Installation mit „Ja“ beantwortet, ist alles schon eingerichtet: Der Installer legt auf dem Host den Nutzer `brainbox@pve` mit Rolle **PVEAuditor** (nur Lesen) und einen Token `wiki<ID>` an.

Von Hand, auf dem Proxmox-Host:

```bash
pveum user add brainbox@pve
pveum acl modify / --users brainbox@pve --roles PVEAuditor
pveum user token add brainbox@pve wiki --privsep 0
```

Dann im Container `brainbox-connect proxmox` und Adresse, `full-tokenid` und `value` eintragen. Ohne Menü:

```bash
brainbox-connect proxmox https://192.168.1.2:8006 'brainbox@pve!wiki' <value> --insecure
```

`--insecure` überspringt die Zertifikatsprüfung. Sicherer: `/etc/pve/pve-root-ca.pem` vom Host nach `/etc/brainbox/pve-root-ca.pem` im Container kopieren.

Was im Wiki entsteht (Sammlung **Proxmox**):

- **Proxmox – Übersicht**: alle VMs und Container mit Status, IP, NetBird-Gerät und Domains
- **je VM/Container ein Eintrag**: ID, Typ, Node, Status, CPU, RAM, Disk, Betriebssystem, IP-Adressen, Tags, NetBird, Domains, Link zu Proxmox und die Beschreibung aus Proxmox
- neue Gäste nach spätestens 5 Minuten, gelöschte werden archiviert (und bei Rückkehr wiederhergestellt)
- alles ab der Überschrift **Notizen** bleibt bei jedem Abgleich erhalten

IP-Adressen von VMs kommen über den QEMU-Gast-Agenten, bei Containern direkt.

## NetBird im Wiki: `brainbox-connect netbird`

Braucht die API-Adresse (NetBird Cloud: `https://api.netbird.io`, selbst gehostet: die Adresse deines Management-Servers) und ein Access Token (Dashboard → Team → Service Users, oder eigenes Profil → Personal Access Tokens).

Was im Wiki entsteht (Sammlung **NetBird**):

- **NetBird – Übersicht**: alle Geräte mit NetBird-IP, DNS-Name, online/offline und zugehörigem Proxmox-Gast
- **Domains**: alle Domains aus den NetBird-Netzwerken und wozu sie gehören
- **je Gerät ein Eintrag**: Hostname, IPs, DNS-Namen, Gruppen, Betriebssystem, zuletzt gesehen

**Zuordnung:** NetBird-Gerät ↔ Proxmox-Gast über gleichen Namen, Hostnamen oder gleiche IP. Domain ↔ Gast über den ersten Teil der Domain (`nextcloud.morncloud.de` → Gast `nextcloud`) oder von Hand mit einer Zeile `domain: cloud.morncloud.de` in den Proxmox-Notizen des Gasts.

## Bereiche: Zuordnungsregeln

Sobald Proxmox oder NetBird verbunden ist, legt der Abgleich die Sammlung **Bereiche** mit der Seite **Zuordnungsregeln** an. Die Tabelle darin bestimmt, was wohin gehört; Änderungen gelten beim nächsten Abgleich (spätestens nach 5 Minuten, sofort mit `brainbox-connect sync`).

| Muster | trifft |
|---|---|
| `*.morninghosting.de` | alle Domains unter morninghosting.de, auch morninghosting.de selbst |
| `survival.morninghosting.de` | genau diese Domain |
| `name:mc-*` | VMs, Container und NetBird-Geräte, deren Name mit „mc-“ beginnt |
| `tag:minecraft` | VMs und Container mit dem Proxmox-Tag „minecraft“ |
| `gruppe:Server` | NetBird-Geräte in der Gruppe „Server“ |

Die erste passende Regel gewinnt. `Minecraft-Server/Survival` legt einen Unterbereich an. Eine VM erbt den Bereich ihrer Domain, ein NetBird-Gerät den seiner VM. Jeder Bereich bekommt einen Eintrag mit Domains, VMs/Containern und Geräten; die **Bereiche – Übersicht** zeigt zusätzlich, was noch ohne Bereich ist. Die Seite „Zuordnungsregeln“ wird vom Abgleich nie überschrieben.

## Update

Im Container (Konsole in Proxmox oder `pct enter <ID>`):

```bash
update
```

Holt das neueste Outline-Release, sichert vorher Datenbank und `.env` nach `/root/brainbox-backups/` (die letzten drei), baut neu und startet den Dienst. Schlägt der Build fehl, läuft automatisch wieder die alte Version.

- `update --check` prüft nur (Exit-Code 10 = Update verfügbar)
- `update --force` baut auch bei gleicher Version neu

Das Install-Skript im Container aufgerufen startet ebenfalls das Update, genau wie bei den community-scripts.

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
| `var_pve_sync` | `yes` | `no` = kein Proxmox-Zugang, keine Proxmox-Einträge im Wiki |
| `var_ctid` | nächste freie | Container-ID |
| `var_hostname` | aus der Domain | Hostname |
| `var_cpu` / `var_ram` / `var_disk` / `var_swap` | 2 / 4096 / 8 / 512 | Kerne / MB / GB / MB |
| `var_bridge` | `vmbr0` | Netzwerk-Bridge |
| `var_net` / `var_gateway` / `var_vlan` | `dhcp` / – / – | Netzwerk |
| `var_storage` / `var_template_storage` | Auswahl | Speicher für Container und Vorlagen |
| `var_pw` | leer | Root-Passwort (leer = Auto-Login auf der Konsole) |
| `var_unprivileged` | `1` | `0` = privilegierter Container |
| `var_verbose` | `no` | `yes` = ausführliche Ausgabe |
| `BRAINBOX_OUTLINE_VERSION` | neueste | feste Outline-Version, z. B. `v1.12.0` |
| `BRAINBOX_BRANCH` | `main` | anderen Branch dieses Repos verwenden |
