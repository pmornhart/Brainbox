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
| Installierte Version | `/root/.brainbox` |
| Dienst | `systemctl status brainbox` |
| Logs | `journalctl -u brainbox -f` |

## Hinweise

- Nach der Installation migriert Outline die Datenbank. Die Weboberfläche ist deshalb ein bis zwei Minuten nicht erreichbar.
- **Erster Aufruf:** Outline zeigt „Create workspace“. Workspace-Name, deinen Namen und deine E-Mail eingeben, danach bist du direkt als Admin angemeldet. Google, Microsoft oder Slack sind dafür nicht nötig. Die Slack-Platzhalter aus der Beispielkonfiguration entfernt Brainbox (anders als das Original), sonst erscheint statt dieser Seite ein nicht funktionierender Slack-Knopf.
- **Spätere Anmeldungen:** per E-Mail-Link/Code (braucht SMTP in der `.env`), per Passkey (in den Kontoeinstellungen anlegen; geht nur über HTTPS mit eigener Domain) oder über Google, Microsoft, Discord bzw. OIDC (Schlüssel in die `.env`, ebenfalls nur über HTTPS mit Domain). Solche Anbieter erst eintragen, **nachdem** der Workspace angelegt ist, sonst verschwindet die Einrichtungsseite. Anleitung: [Outline-Hosting-Doku](https://docs.getoutline.com/s/hosting/).
- **HTTPS** ist aus (`FORCE_HTTPS=false`). Für den Zugriff von außen einen Reverse-Proxy (z. B. Nginx Proxy Manager, Caddy, Traefik) davorsetzen und `URL=` in der `.env` auf die öffentliche Adresse ändern.
- Ändert sich die IP des Containers, `URL=` in `/opt/brainbox/.env` anpassen und den Dienst neu starten.

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
