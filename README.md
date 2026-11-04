<p align="center"><img src="docs/banner.svg" alt="Brainbox" width="720"></p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/Lizenz-MIT-2f7a5b" alt="Lizenz: MIT"></a>
  <img src="https://img.shields.io/badge/Proxmox%20VE-8%20%7C%209-e57000?logo=proxmox&logoColor=white" alt="Proxmox VE 8 | 9">
  <img src="https://img.shields.io/badge/Debian-13-a81d33?logo=debian&logoColor=white" alt="Debian 13">
  <a href="https://github.com/outline/outline/releases"><img src="https://img.shields.io/github/v/release/outline/outline?label=Outline&color=444" alt="Outline-Version"></a>
</p>

# 🧠 Brainbox

Die Wissensdatenbank [Outline](https://www.getoutline.com) mit einem Befehl als LXC-Container auf Proxmox VE: Nachbau des [community-scripts Outline-Skripts](https://community-scripts.org/scripts/outline).

<p align="center"><img src="docs/erster-start.png" alt="Brainbox beim ersten Aufruf: Workspace anlegen" width="640"></p>

## Funktionen

- 🚀 **Ein Einzeiler** in der Proxmox-Shell legt den Container an und installiert alles
- ⚙️ **Standard oder Erweitert**: Dialog für ID, Hostname, CPU, RAM, Disk, Netzwerk, VLAN, Passwort
- 📚 **Outline** aus dem neuesten offiziellen Release, mit Node.js 26, PostgreSQL 16 und Redis
- 🔐 **Erster Start ohne Fremd-Login**: Workspace und Admin direkt im Browser anlegen
- 🔑 **Sechs Anmeldewege**: E-Mail-Link, Passkey, Google, Microsoft, Discord, OIDC (z. B. Pocket ID), alles per Menü mit `brainbox-login`
- 🇩🇪 **Oberfläche auf Deutsch**
- 🔄 **`update`-Befehl** im Container: sichert vorher Datenbank und Einstellungen, spielt bei Fehlern die alte Version zurück
- 🧩 Läuft unprivilegiert, startet mit Proxmox, Notizen mit Link in der Proxmox-Oberfläche

## Installation

In der **Proxmox-Shell** (Host):

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/pmornhart/Brainbox/main/proxmox/brainbox.sh)"
```

| CPU | RAM | Disk | System | Port |
|---|---|---|---|---|
| 2 Kerne | 4096 MB | 8 GB | Debian 13 | 3000 |

Danach im Browser `http://<IP>:3000` öffnen, Workspace-Name, Name und E-Mail eingeben, fertig. Beim allerersten Start migriert Outline die Datenbank, das dauert ein bis zwei Minuten.

Alle Details, Pfade und Optionen: **[Proxmox Quick-Start](docs/proxmox-quickstart.md)**.

## Anmeldung einrichten

<p align="center"><img src="docs/login.png" alt="Login-Seite mit Microsoft, Discord, Pocket ID, Google, Passkey und E-Mail" width="560"></p>

Im Container `brainbox-login` eingeben. Ein Menü richtet Adresse (Domain/HTTPS), E-Mail-Versand, Passkeys, Google, Microsoft, Discord, OIDC und Sprache ein und startet Brainbox danach neu.

| Weg | Wer | Braucht |
|---|---|---|
| E-Mail-Link / Code | alle Eingeladenen | Postfach zum Versenden (SMTP), z. B. Gmail mit App-Passwort |
| Passkey | wer in den Einstellungen einen angelegt hat | HTTPS mit Domain |
| Google | Google-Konten (private @gmail.com nur zum Beitreten) | HTTPS mit Domain, OAuth-Client in der Google Cloud Console |
| Microsoft | Firmen- und Schulkonten (Microsoft 365 / Entra ID) | HTTPS mit Domain, App-Registrierung in Microsoft Entra |
| Discord | Discord-Konten, optional nur Mitglieder eines Servers | HTTPS mit Domain, App im Discord Developer Portal |
| OIDC | Konten im eigenen Login-Dienst (Pocket ID, Authentik, Keycloak …) | den Login-Dienst |

Erst den Arbeitsbereich im Browser anlegen, dann die Anbieter eintragen. Sonst verschwindet die Einrichtungsseite.

## Bedienung

| Was | Wo |
|---|---|
| Anmeldung einrichten | `brainbox-login` (Übersicht: `brainbox-login status`) |
| Einstellungen | `/opt/brainbox/.env` (danach `systemctl restart brainbox`) |
| Logs | `journalctl -u brainbox -f` |
| Datenbank-Zugang | `/root/brainbox.creds` |
| Sicherungen vom Update | `/root/brainbox-backups/` |

## Update

Im Container:

```bash
update
```

`update --check` prüft nur, `update --force` baut auch bei gleicher Version neu. Das Skript holt sich vorher selbst in der neuesten Version aus diesem Repo.

## Ohne Proxmox

Auf einem frischen Debian 13 (LXC, VM oder Server) als root:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/pmornhart/Brainbox/main/install.sh)"
```

## Herkunft

Nachbau von [`ct/outline.sh`](https://github.com/community-scripts/ProxmoxVE/blob/main/ct/outline.sh) und [`install/outline-install.sh`](https://github.com/community-scripts/ProxmoxVE/blob/main/install/outline-install.sh) aus den Proxmox VE Helper-Scripts (MIT, Autor: tremor021), ohne Abhängigkeit vom community-scripts-Framework. Outline selbst: [outline/outline](https://github.com/outline/outline) (BSL 1.1).

---

<sub>Verfasst mit Claude 🤖</sub>
