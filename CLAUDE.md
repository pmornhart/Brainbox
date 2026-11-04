# Brainbox

@STAND.md

## Projekt

Outline-Wissensdatenbank als Proxmox-LXC, Nachbau des community-scripts Outline-Skripts
(https://community-scripts.org/scripts/outline), ohne Abhängigkeit vom community-scripts-Framework.

- `proxmox/brainbox.sh` – läuft auf dem Proxmox-Host, legt den Container an, startet `install.sh` darin.
  Im Container aufgerufen startet es das Update.
- `install.sh` – Installation im Container (Node 26 + corepack, PostgreSQL 16 aus PGDG, Redis, Outline-Release nach `/opt/brainbox`, Dienst `brainbox`).
- `update.sh` – wird zu `/usr/bin/update`; aktualisiert sich selbst aus `main`, sichert DB und `.env`, Rollback bei Fehler.
- `brainbox-login.sh` – wird zu `/usr/bin/brainbox-login`; Menü für Adresse, E-Mail, Passkeys, Google, Microsoft, Discord, OIDC, Sprache.
  Nie `login` nennen (würde `/bin/login` verdecken). Dazu `brainbox-login workspace` (Wiki anlegen) und `brainbox-login link` (Login-Link).
- Ein Container = ein Wiki mit eigener Domain; Wiki und Admin legt die Installation automatisch an.
- `docs/proxmox-quickstart.md` – Quick-Start im Stil von community-scripts.org.

## Regeln

- Repo ist öffentlich: Chat-Sicherung aus (`.claude/hooks/chat-sichern-aus`), keine Geheimnisse committen.
- „Verfasst mit Claude 🤖“: ja – als letzte Zeile in Commit-Messages, PRs, Issues, Release-Notes und einmal als Fußzeile im README.
- Update-Funktion: ja (`update` im Container). Proxmox-Quick-Start: ja.
- Texte für Nutzer auf Deutsch. Skripte mit `shellcheck -S warning` prüfen.
- Testen ohne Proxmox: `install.sh` in einem `debian:13`-Docker-Container mit systemctl-Stub laufen lassen
  (`BRAINBOX_OUTLINE_VERSION` und `BRAINBOX_GITHUB` erlauben einen lokalen Spiegel des Release-Tarballs).
