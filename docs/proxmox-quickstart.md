# 🧠 Brainbox – Proxmox Quick-Start

Die Wissensdatenbank [Outline](https://www.getoutline.com) als LXC-Container auf Proxmox VE: schnell, kollaborativ, Echtzeit-Bearbeitung und Markdown.

## Installieren

In der **Proxmox-Shell** (Host, nicht im Container) ausführen:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/pmornhart/Brainbox/main/proxmox/brainbox.sh)"
```

Es erscheint ein Dialog: **Standard-Einstellungen** übernimmt die Werte unten, **Erweiterte Einstellungen** fragt ID, Hostname, Disk, CPU, RAM, Bridge, IP/Gateway, VLAN, Root-Passwort und Container-Typ ab.

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

## Hinweise

- Nach der Installation migriert Outline die Datenbank. Die Weboberfläche ist deshalb ein bis zwei Minuten nicht erreichbar.
- **Erster Aufruf:** Outline zeigt „Create workspace“. Workspace-Name, deinen Namen und deine E-Mail eingeben, danach bist du direkt als Admin angemeldet. Google, Microsoft oder Slack sind dafür nicht nötig. Die Slack-Platzhalter aus der Beispielkonfiguration entfernt Brainbox (anders als das Original), sonst erscheint statt dieser Seite ein nicht funktionierender Slack-Knopf.
- **Spätere Anmeldungen** richtest du mit `brainbox-login` ein, siehe unten. Anbieter erst eintragen, **nachdem** der Workspace angelegt ist, sonst verschwindet die Einrichtungsseite.
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

Ohne Menü: `brainbox-login status`, `brainbox-login set KEY=WERT …`, `brainbox-login unset KEY …`, `brainbox-login testmail du@beispiel.de`.

Gut zu wissen:

- **E-Mail-Login** gilt für alle, die im Workspace sind. Neue Leute lädst du unter Einstellungen → Benutzer ein.
- **Passkey** legt jeder selbst an: Profil → Einstellungen → Passkeys. Der Knopf „Mit Passkey fortfahren“ erscheint, sobald es mindestens einen gibt.
- **Microsoft** klappt nur mit Firmen- oder Schulkonten (Microsoft 365 / Entra ID). Private @outlook.com- und @hotmail.com-Konten nehmen E-Mail oder Passkey.
- **Google**: Private @gmail.com-Konten können einem bestehenden Workspace beitreten, aber keinen neuen anlegen.

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
var_mode=default var_cpu=4 var_ram=6144 var_disk=12 var_net=192.168.1.50/24 var_gateway=192.168.1.1 \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/pmornhart/Brainbox/main/proxmox/brainbox.sh)"
```

| Variable | Standard | Bedeutung |
|---|---|---|
| `var_mode` | fragen | `default` oder `advanced` |
| `var_ctid` | nächste freie | Container-ID |
| `var_hostname` | `brainbox` | Hostname |
| `var_cpu` / `var_ram` / `var_disk` / `var_swap` | 2 / 4096 / 8 / 512 | Kerne / MB / GB / MB |
| `var_bridge` | `vmbr0` | Netzwerk-Bridge |
| `var_net` / `var_gateway` / `var_vlan` | `dhcp` / – / – | Netzwerk |
| `var_storage` / `var_template_storage` | Auswahl | Speicher für Container und Vorlagen |
| `var_pw` | leer | Root-Passwort (leer = Auto-Login auf der Konsole) |
| `var_unprivileged` | `1` | `0` = privilegierter Container |
| `var_verbose` | `no` | `yes` = ausführliche Ausgabe |
| `BRAINBOX_OUTLINE_VERSION` | neueste | feste Outline-Version, z. B. `v1.12.0` |
| `BRAINBOX_BRANCH` | `main` | anderen Branch dieses Repos verwenden |
