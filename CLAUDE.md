# Brainbox

@STAND.md

## Projekt

Brainbox – eigenständiges Wiki fürs Homelab als Proxmox-LXC. Der Kern ist Outline (fest getestete Version je Brainbox-Version),
alles drumherum ist Brainbox: Name, Logo, Design, Zentrale, Versionen, Verbindungen. Entstanden als Nachbau des
community-scripts Outline-Skripts (https://community-scripts.org/scripts/outline), ohne Abhängigkeit vom Framework.

- `brainbox.version` – Brainbox-Version und dazu getesteter Outline-Kern. Bei jeder Änderung für Nutzer hochzählen und `CHANGELOG.md` ergänzen;
  laufende Installationen zeigen dann „Update verfügbar“.
- `proxmox/brainbox.sh` – läuft auf dem Proxmox-Host, legt den Container an, schickt den Bausatz mit (aus einem Klon) und startet `install.sh`.
  Im Container aufgerufen startet es das Update.
- `install.sh` – Installation im Container (Node 26 + corepack, PostgreSQL 16 aus PGDG, Redis, Outline-Kern nach `/opt/brainbox`,
  Bausatz nach `/opt/brainbox-kit`, Branding, Build, Dienste `brainbox` (Kern, Port 3100) und `brainbox-zentrale` (Port 3000)).
- `teile-einrichten.sh` – installiert Befehle, Abgleich und Zentrale aus dem Bausatz (von install und update aufgerufen).
- `update.sh` – wird zu `/usr/bin/update` (auch `brainbox-update`); aktualisiert sich selbst aus `main`, sichert DB und `.env`, Rollback bei Fehler.
- `brand/apply.mjs` – Branding-Patch auf den Outline-Quellcode vor dem Bauen (Farben, Schrift, Logo, Name, Zentrale-Link, Update-Symbol). Muss idempotent bleiben.
- `zentrale/server.mjs` + `zentrale/app.html` – Brainbox-Zentrale und Tor zum Wiki (Node ohne Abhängigkeiten), Update-Prüfung alle 6 Std.
  `app.html` ist auch in die Live-Demo einbettbar (`BRAINBOX_ROOT`, `BRAINBOX_MOCK`, `BRAINBOX_LOGO`).
- `brainbox-login.sh` – wird zu `/usr/bin/brainbox-login`; Adresse, E-Mail, Passkeys, Google, Microsoft, Discord, OIDC, Sprache.
  Nie `login` nennen (würde `/bin/login` verdecken). Dazu `brainbox-login workspace` (Wiki anlegen) und `brainbox-login link` (Login-Link).
- Ein Container = ein Wiki mit eigener Domain; Wiki und Admin legt die Installation automatisch an.
- `brainbox-connect.sh` – wird zu `/usr/bin/brainbox-connect`; Claude-Konto, Proxmox-Server (mehrere, `proxmox add|remove|list|test`), NetBird, Abgleich (`sync`), `status`.
- `connect/sync.mjs` – Node-Skript ohne Abhängigkeiten, gleicht Proxmox/NetBird ins Wiki ab (Timer alle 5 Min.).
  Testen mit nachgebauten APIs (Proxmox https mit selbstsigniertem Zertifikat, NetBird http), siehe STAND.md.
- `docs/proxmox-quickstart.md` – Quick-Start im Stil von community-scripts.org.

## Regeln

- Repo ist öffentlich: Chat-Sicherung aus (`.claude/hooks/chat-sichern-aus`), keine Geheimnisse committen.
- „Verfasst mit Claude 🤖“: ja – als letzte Zeile in Commit-Messages, PRs, Issues, Release-Notes und einmal als Fußzeile im README.
- Update-Funktion: ja (`update` im Container, Update-Symbol im Wiki). Proxmox-Quick-Start: ja.
- Texte für Nutzer auf Deutsch. Skripte mit `shellcheck -S warning` prüfen, `.mjs` mit `node --check`.
- Proxmox-Zugang nur lesend (PVEAuditor).
- Testen ohne Proxmox: `install.sh` in einem `debian:13`-Docker-Container mit systemctl-Stub laufen lassen
  (`BRAINBOX_KIT_DIR` = Repo-Ordner, `BRAINBOX_GITHUB` = lokaler Spiegel des Outline-Tarballs, `BRAINBOX_RAW` = Quelle für die Update-Prüfung).
