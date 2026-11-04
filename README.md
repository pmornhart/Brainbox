<p align="center"><img src="docs/banner.svg" alt="Brainbox – Wiki fürs Homelab" width="760"></p>

<p align="center">
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/Brainbox-1.1.0-4CD596?labelColor=0B1410" alt="Brainbox 1.1.0"></a>
  <img src="https://img.shields.io/badge/Kern-1.12.0-5E7468?labelColor=0B1410" alt="Kern 1.12.0">
  <img src="https://img.shields.io/badge/Proxmox%20VE-8%20%7C%209-e57000?labelColor=0B1410&logo=proxmox&logoColor=white" alt="Proxmox VE 8 | 9">
  <img src="https://img.shields.io/badge/Debian-13-a81d33?labelColor=0B1410&logo=debian&logoColor=white" alt="Debian 13">
  <a href="LICENSE"><img src="https://img.shields.io/badge/Lizenz-MIT-2f7a5b?labelColor=0B1410" alt="Lizenz: MIT"></a>
</p>

<p align="center"><b>Dein Wiki fürs Homelab.</b> Ein Befehl in der Proxmox-Shell, und es steht – mit eigenem Gesicht, Login-Link,<br>allen Proxmox-Servern und NetBird automatisch drin, nach Bereichen sortiert, und Claude schreibt mit.</p>

<p align="center">
  <a href="#-schnellstart">Schnellstart</a> ·
  <a href="#%EF%B8%8F-einstellungen">Einstellungen</a> ·
  <a href="#%EF%B8%8F-proxmox-server">Proxmox</a> ·
  <a href="#-netbird">NetBird</a> ·
  <a href="#%EF%B8%8F-bereiche">Bereiche</a> ·
  <a href="#-claude">Claude</a> ·
  <a href="#-anmelden">Anmelden</a> ·
  <a href="docs/proxmox-quickstart.md">Quick-Start-Guide</a>
</p>

<p align="center"><img src="docs/screenshots/hero.png" alt="Startseite von Brainbox mit Proxmox, NetBird, Bereichen und Version auf einen Blick – am Rechner und auf dem Handy" width="900"></p>

---

## ✨ Was Brainbox ist

Brainbox ist ein eigenständiges Wiki für dein Homelab: Editor mit Echtzeit-Bearbeitung und Suche, dazu Startseite, Einstellungen, Versionen und die Verbindungen zu Proxmox, NetBird und Claude. Für neue Leute liegt im Wiki gleich eine Anleitung bereit.

| | |
|---|---|
| 🎨 **Eigenes Gesicht** | Brainbox-Logo, eigener Name, Schrift Geist und das Farbschema „Homelab-Konsole“ – dunkel als Standard, hell auf Wunsch. |
| 🏠 **Startseite** | Begrüßung und dein Homelab auf einen Blick: laufende VMs je Server, NetBird-Geräte online, Bereiche, Version – mit Schnellzugriffen. |
| ⚙️ **Aufgeräumte Einstellungen** | Drei Gruppen statt zwanzig Punkten: *Brainbox* (Proxmox-Server, NetBird, Claude, Anmeldung, Update), *Wiki* und *Konto*. Jede Seite erklärt Schritt für Schritt, was zu tun ist. |
| 📖 **Anleitung im Wiki** | Sammlung „Start“ mit Anleitung und Spickzettel – liegt nach der Installation bereit und wird bei Updates aufgefrischt. |
| 🖥️ **Beliebig viele Proxmox-Server** | Jeder Server bekommt eine eigene Seite mit Nodes und Auslastung, darunter je VM und Container ein Eintrag. Neue erscheinen nach spätestens 5 Minuten. |
| 🌐 **NetBird** | Geräte, Netzwerke und Domains, automatisch mit den passenden VMs verknüpft. |
| 🗂️ **Bereiche** | Regeln wie `*.morninghosting.de → Minecraft-Server` sortieren Domains, VMs und Geräte, mit Unterbereichen. |
| 🤖 **Claude schreibt mit** | Eigenes Konto „Claude“ über den MCP-Anschluss, in der Claude-App wie in Claude Code. |
| 📚 **Ein Container = ein Wiki** | Wiki und Admin legt die Installation an, am Ende gibt es einen Login-Link. Weiteres Wiki: Befehl nochmal, andere Domain. |
| 🔑 **Sechs Wege zum Anmelden** | E-Mail-Link, Passkey, Google, Microsoft, Discord, eigener Login-Dienst. Rein kommt nur, wer eingeladen ist. |
| 🏷️ **Eigene Versionen** | Brainbox 1.1.0 mit fest getestetem Kern. Neue Versionen zeigt ein Update-Symbol im Wiki an. `update` sichert vorher alles und kehrt bei Fehlern zur alten Version zurück. |
| 🇩🇪 **Auf Deutsch** | Oberfläche, Einstellungen, Befehle und Anleitungen. |

## 🚀 Schnellstart

### 1. Installieren

In der **Proxmox-Shell** (auf dem Host, nicht in einem Container):

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/pmornhart/Brainbox/main/proxmox/brainbox.sh)"
```

Das Skript fragt nacheinander:

| Frage | Beispiel |
|---|---|
| Standard oder Erweitert | Standard: 2 Kerne, 4 GB RAM, 8 GB Disk, Debian 13 |
| Name des Wikis | `Brainbox` |
| Domain | `brainbox.morncloud.de` (leer = nur im Heimnetz über `http://IP:3000`) |
| Dein Name und deine E-Mail | du wirst Admin |
| Proxmox im Wiki? | Ja: Lesezugang wird angelegt, dieser Server ist sofort verbunden |

Nach 10 bis 20 Minuten steht am Ende:

```text
  ✔️  Brainbox 1.1.0 ist installiert!
  💡  Adresse: https://brainbox.morncloud.de   (im Heimnetz: http://192.168.1.77:3000)
  💡  Einstellungen: https://brainbox.morncloud.de/settings/brainbox (oben in der Seitenleiste)
  💡  Anleitung: im Wiki in der Sammlung 'Start'
  💡  Reverse-Proxy einrichten: brainbox.morncloud.de → http://192.168.1.77:3000  (Websockets an, SSL-Zertifikat)
  💡  Dein Login-Link (einmal benutzbar, 60 Minuten gültig):
        https://brainbox.morncloud.de/auth/redirect?token=eyJhbGci…
```

### 2. Domain freischalten

Im Reverse-Proxy (z. B. Nginx Proxy Manager): `brainbox.morncloud.de` → `http://<IP des Containers>:3000`, **Websockets an**, SSL-Zertifikat von Let's Encrypt.

### 3. Login-Link anklicken

Du bist als Admin drin. Die Startseite zeigt dein Homelab, die Sammlung **Start** erklärt alles Wichtige, und unter **Einstellungen** (oben in der Seitenleiste) verbindest du weitere Proxmox-Server, NetBird und Claude.

> Ausführlich, mit allen Optionen: **[Proxmox Quick-Start-Guide](docs/proxmox-quickstart.md)**

## ⚙️ Einstellungen

Oben in der Seitenleiste unter **Einstellungen**. Statt einer langen Liste gibt es drei Gruppen:

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/einstellungen.png" alt="Einstellungen: Gruppen Brainbox, Wiki und Konto, rechts die Übersicht mit Kacheln für Proxmox, NetBird, Claude und Version"></td>
    <td width="50%"><img src="docs/screenshots/einstellungen-proxmox.png" alt="Einstellungen → Proxmox-Server: verbundene Server und Formular zum Hinzufügen"></td>
  </tr>
  <tr>
    <td align="center"><sub>Übersicht: alles auf einen Blick, Abgleich, Login-Link</sub></td>
    <td align="center"><sub>Proxmox-Server: prüfen, entfernen, neuen hinzufügen</sub></td>
  </tr>
</table>

| Gruppe | Darin |
|---|---|
| **Brainbox** (nur Admins) | Übersicht · Proxmox-Server · NetBird · Claude · Anmeldung · Version & Update |
| **Wiki** | Allgemein · Mitglieder · Sicherheit · Vorlagen · Export |
| **Konto** | Profil · Darstellung · Benachrichtigungen · Passkeys |

Slack, Zapier, Webhooks, GitHub, Analytics, Gruppen, Emojis, API-Schlüssel und Integrationen sind ausgeblendet – ein Homelab-Wiki braucht sie nicht. Alles aus der Gruppe *Brainbox* geht auch im Terminal des Containers: `brainbox-connect`, `brainbox-login`, `update`.

## 📖 Anleitung im Wiki

Nach der Installation liegt in der Sammlung **Start** eine kurze **Anleitung** (Aufbau, Schreiben, Finden, Homelab, Bereiche, Claude, Einladen, Update) und ein **Spickzettel** mit Tasten, Schreib-Kürzeln, „Wo was ist“ und den Befehlen im Container. Bei jedem Update frischt Brainbox beide auf – hast du sie selbst bearbeitet, bleiben sie, wie sie sind.

<p align="center"><img src="docs/screenshots/anleitung.png" alt="Die Anleitung im Wiki, Sammlung Start" width="760"></p>

## 🖥️ Proxmox-Server

Beliebig viele Server oder Cluster – zu Hause, im Keller, bei Hetzner. Jeder bekommt im Wiki eine eigene Seite mit Nodes, CPU, RAM und Laufzeit, darunter je VM und Container ein Eintrag mit Status, Ressourcen, IP-Adressen, Tags, NetBird-Gerät, Domains, Bereich und Link zurück zu Proxmox.

**Neuen Server verbinden** – unter *Einstellungen → Brainbox → Proxmox-Server* oder im Terminal:

```bash
# 1. auf dem neuen Proxmox-Host: Lesezugang anlegen (Rolle PVEAuditor)
pveum user add brainbox@pve
pveum acl modify / --users brainbox@pve --roles PVEAuditor
pveum user token add brainbox@pve wiki --privsep 0

# 2. im Brainbox-Container: verbinden
brainbox-connect proxmox add hetzner https://203.0.113.10:8006 'brainbox@pve!wiki' <value> --insecure
```

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/proxmox-server.png" alt="Wiki-Seite eines Proxmox-Servers mit Nodes und VMs"></td>
    <td width="50%"><img src="docs/screenshots/proxmox-gast.png" alt="Eintrag eines Containers mit NetBird, Domain und Bereich"></td>
  </tr>
  <tr>
    <td align="center"><sub>Server-Seite: Nodes, Auslastung, alle VMs und Container</sub></td>
    <td align="center"><sub>Ein Container mit NetBird-Gerät, Domain und Bereich</sub></td>
  </tr>
</table>

- **Neue VM:** steht nach spätestens 5 Minuten im Wiki (sofort mit `brainbox-connect sync`).
- **Gelöschte VM:** wird archiviert, nicht gelöscht. Kommt sie zurück, wird sie wiederhergestellt.
- **Server nicht erreichbar:** seine Einträge bleiben stehen, die Server-Seite zeigt den Grund.
- **Deine Notizen:** Alles ab der Überschrift „Notizen“ bleibt bei jedem Abgleich erhalten.

## 🌐 NetBird

Unter *Einstellungen → Brainbox → NetBird* (oder `brainbox-connect netbird`) API-Adresse und Access Token eintragen. Danach stehen alle Geräte im Wiki – online/offline, NetBird-IP, DNS-Name, Gruppen – plus eine Liste aller **Domains** aus deinen NetBird-Netzwerken. Gerät und VM werden über gleichen Namen oder gleiche IP verknüpft.

## 🗂️ Bereiche

Die Seite **Zuordnungsregeln** in der Sammlung „Bereiche“ bearbeitest du direkt im Wiki:

| Muster | Bereich |
|---|---|
| `survival.morninghosting.de` | `Minecraft-Server/Survival` |
| `*.morninghosting.de` | `Minecraft-Server` |
| `tag:minecraft` | `Minecraft-Server` |
| `*.morncloud.de` | `Homelab` |
| `gruppe:Geräte` | `Geräte` |

Muster: Domains mit `*`, `name:mc-*` für Namen, `tag:` für Proxmox-Tags, `gruppe:` für NetBird-Gruppen. Die erste passende Regel gewinnt. `A/B` legt Unterbereiche an. Eine VM erbt den Bereich ihrer Domain, ein Gerät den seiner VM.

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/regeln.png" alt="Zuordnungsregeln im Wiki"></td>
    <td width="50%"><img src="docs/screenshots/bereich-minecraft.png" alt="Bereich Minecraft-Server mit Domains, Containern und Unterbereichen"></td>
  </tr>
</table>

## 🤖 Claude

Unter *Einstellungen → Brainbox → Claude* auf „Claude einrichten“ (oder `brainbox-connect claude`). Brainbox legt das Konto „Claude“ und die gemeinsame Sammlung „Von Claude“ an, erstellt einen Schlüssel und gibt Claude beim Verbinden eine Anweisung mit: auf Deutsch, erst suchen, dann ergänzen, keine Passwörter.

- **Claude-App:** Einstellungen → Connectors → `https://brainbox.morncloud.de/mcp`, im Anmeldefenster als Claude zulassen
- **Claude Code:** `claude mcp add --transport http brainbox https://brainbox.morncloud.de/mcp --header "Authorization: Bearer …"`

<p align="center"><img src="docs/screenshots/claude-eintrag.png" alt="Eintrag, den Claude geschrieben hat" width="640"></p>

## 🔑 Anmelden

Unter *Einstellungen → Brainbox → Anmeldung* oder mit `brainbox-login`.

| Weg | Braucht |
|---|---|
| Login-Link | nichts – aus der Installation oder den Einstellungen |
| E-Mail | Postfach mit App-Passwort (Gmail, GMX, web.de …) |
| Passkey | HTTPS mit Domain |
| Google | OAuth-Client bei Google |
| Microsoft | App bei Microsoft Entra (Firmen- und Schulkonten) |
| Discord | App bei Discord |
| OIDC | eigener Login-Dienst (Pocket ID, Authentik …) |

Rein kommt nur, wer unter *Einstellungen → Wiki → Mitglieder* eingeladen ist – egal über welchen Weg.

<p align="center"><img src="docs/screenshots/login.png" alt="Anmeldeseite von Brainbox mit Markenleiste und allen Anmeldewegen" width="760"></p>

## 🏷️ Versionen und Update

Brainbox hat eigene Versionen ([Änderungen](CHANGELOG.md)). Zu jeder gehört ein fest getesteter Wiki-Kern – in der Datei [`brainbox.version`](brainbox.version).

**Update-Symbol:** Brainbox sieht alle 6 Stunden selbst nach. Gibt es eine neue Version, erscheint oben in der Seitenleiste **„Update verfügbar“** und auf der Startseite ein Hinweis. Ein Klick führt zu *Einstellungen → Brainbox → Version & Update*, dort startet **Jetzt aktualisieren** das Update. Auch die Begrüßung im Terminal sagt Bescheid.

<p align="center"><img src="docs/screenshots/update-symbol.png" alt="Update-Symbol oben in der Seitenleiste und die Seite Version & Update in den Einstellungen" width="900"></p>

**Update-Befehl** – im Container oder vom Proxmox-Host aus:

```bash
update                     # im Container: neueste Brainbox holen, Design anwenden, bauen, neu starten
pct exec <ID> -- update    # dasselbe vom Proxmox-Host aus
update --check             # nur nachsehen
```

Vorher sichert `update` Datenbank und Einstellungen nach `/root/brainbox-backups/`. Geht beim Bauen etwas schief, läuft automatisch wieder die alte Version. `brainbox-update` ist derselbe Befehl.

## 🧭 So hängt alles zusammen

```mermaid
flowchart LR
  U["Du im Browser<br/>oder auf dem Handy"] -- HTTPS --> RP["Reverse-Proxy<br/>brainbox.morncloud.de"]
  C["Claude<br/>App und Code"] -- "MCP, eigenes Konto" --> RP
  RP --> Z
  subgraph CT["LXC-Container 'brainbox'"]
    direction TB
    Z["Zentrale und Tor<br/>Port 3000"] --> K["Wiki-Kern<br/>mit Brainbox-Design · Port 3100"]
    K --- DB[("PostgreSQL 16 · Redis")]
    S["Abgleich<br/>alle 5 Minuten"] --> K
  end
  P1["Proxmox zuhause"] -- "nur lesen" --> S
  P2["Proxmox hetzner"] -- "nur lesen" --> S
  NB["NetBird<br/>Geräte, Domains"] --> S
```

## 🧰 Befehle im Container

| Befehl | Wofür |
|---|---|
| `brainbox-connect` | Menü: Claude, Proxmox-Server, NetBird, Abgleich |
| `brainbox-connect proxmox add NAME URL TOKEN-ID SECRET [--insecure]` | weiteren Proxmox-Server verbinden |
| `brainbox-connect proxmox list` / `remove NAME` / `test` | Server anzeigen, entfernen, prüfen |
| `brainbox-connect sync` | sofort abgleichen |
| `brainbox-connect start` | Anleitung im Wiki und Abgleich einrichten (machen Installation und Update von selbst) |
| `brainbox-login` | Anmeldewege einrichten |
| `brainbox-login link [E-Mail]` | einmaliger Login-Link, 60 Minuten |
| `update` (oder `brainbox-update`) | Brainbox aktualisieren, `--check` nur nachsehen |
| `pct exec <ID> -- update` | dasselbe vom Proxmox-Host aus |

<details>
<summary><b>Pfade und Ports</b></summary>

| Was | Wo |
|---|---|
| Zentrale und Tor zum Wiki | Port `3000` (Dienst `brainbox-zentrale`) |
| Wiki-Kern | Port `3100` (Dienst `brainbox`), `/opt/brainbox` |
| Brainbox-Bausatz (Design, Zentrale, Anleitung, Befehle) | `/opt/brainbox-kit` |
| Version | `/root/.brainbox`, letzte Update-Prüfung `/var/lib/brainbox/update.json` |
| Einstellungen des Kerns | `/opt/brainbox/.env` |
| Proxmox-Server | `/etc/brainbox/proxmox.json` (nur root) |
| Weitere Verbindungen und Schlüssel | `/etc/brainbox/connect.env` (nur root) |
| Hochgeladene Dateien | `/var/lib/outline/data` |
| Sicherungen | `/root/brainbox-backups/` |
| Logs | `journalctl -u brainbox`, `-u brainbox-zentrale`, `-u brainbox-sync` |

</details>

## 🔒 Sicherheit

- **Nur mit Einladung:** Die Installation schaltet „Einladungen erforderlich“ ein.
- **Brainbox-Einstellungen nur für Admins:** Die Zentrale prüft die Anmeldung im Wiki und nimmt Änderungen nur von der eigenen Seite an.
- **Proxmox nur lesen:** Zugang `brainbox@pve` mit Rolle PVEAuditor, eigener Token je Wiki.
- **Geheimnisse bleiben im Container:** Tokens und Schlüssel liegen nur für root lesbar in `/etc/brainbox/`, nie im Wiki.
- **Login-Links** gelten einmal und 60 Minuten.

## ❓ Häufige Fragen

<details><summary>Worauf baut Brainbox auf?</summary>

Der Wiki-Kern ist [Outline](https://github.com/outline/outline). Brainbox baut ihn bei jeder Installation und jedem Update aus dem Original-Release und legt sein eigenes Gesicht darüber: Name, Logo, Farben, Schrift, Startseite, Einstellungen, Anmeldeseite. Der Kern bleibt dabei aktualisierbar. Brainbox ist kein offizielles Outline-Produkt.
</details>

<details><summary>Kann ich mich mit einem privaten Outlook-Konto anmelden?</summary>

Über Microsoft nicht – das geht nur mit Firmen- und Schulkonten. Private Konten nehmen den E-Mail-Link oder einen Passkey.
</details>

<details><summary>Ich habe keinen Reverse-Proxy.</summary>

Domain bei der Installation leer lassen, dann läuft Brainbox im Heimnetz unter `http://IP:3000`. Passkeys, Google, Microsoft und die Claude-App brauchen später eine Domain mit HTTPS.
</details>

<details><summary>Geht es ohne Proxmox?</summary>

Ja, auf einem frischen Debian 13 als root. Dort fehlt meist `curl`, also zuerst:

```bash
apt-get update && apt-get install -y curl
```

Dann:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/pmornhart/Brainbox/main/install.sh)"
```
</details>

## 🙏 Herkunft

Angefangen als Nachbau von [`ct/outline.sh`](https://github.com/community-scripts/ProxmoxVE/blob/main/ct/outline.sh) aus den [Proxmox VE Helper-Scripts](https://community-scripts.org/scripts/outline) (MIT, Autor: tremor021). Wiki-Kern: [outline/outline](https://github.com/outline/outline) (BSL 1.1). Schrift: [Geist](https://github.com/vercel/geist-font) (SIL OFL 1.1).

---

<sub>Verfasst mit Claude 🤖</sub>
