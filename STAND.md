# Stand

_Zuletzt aktualisiert: 04.11.2026_

## Fertig

- **Brainbox 1.0.0 – eigenständig** (Philips Wunsch: „Kern von Outline, alles drumherum von mir“):
  - Eigene Versionen in `brainbox.version` (`BRAINBOX_VERSION=1.0.0`, `OUTLINE_CORE=v1.12.0`, fest getesteter Kern), `CHANGELOG.md`.
  - Eigenes Logo (`brand/logo.svg`, Icons, `mark-path.txt`) und Schrift Geist.
  - Stil „Homelab-Konsole“: dunkel als Standard, Brainbox-Grün `#118656` / `#4CD596`.
  - `brand/apply.mjs` patcht den Outline-Quellcode vor dem Bauen. Es ändert Farben, Schrift, Standard dunkel, `APP_NAME`, Logo, Favicons/PWA-Icons, MCP-Name „Brainbox“ und den Such-Titel. Dazu kommen „Brainbox-Zentrale“ und das Update-Symbol oben in der Seitenleiste.
  - Jeder Schritt meldet, ob er gegriffen hat. Fehlt ein Muster, baut Outline trotzdem.
  - Das Wiki-Bild (Team-Avatar) ist das Brainbox-Logo (`/images/icon-192.png`, gesetzt bei `brainbox-login workspace`).
- **Brainbox-Zentrale** (`zentrale/server.mjs` + `zentrale/app.html`, Node ohne Abhängigkeiten):
  - Lauscht auf Port 3000, der Outline-Kern auf 3100. Alles außer `/zentrale` geht an den Kern weiter, Websockets inklusive. Läuft der Kern nicht, zeigt sie „Brainbox startet gerade“.
  - Nur Admins (Prüfung über `auth.info` mit der Wiki-Sitzung). POST nur mit Kopfzeile `X-Brainbox: 1` und gleicher Herkunft.
  - Bereiche: Übersicht, Proxmox-Server (hinzufügen/prüfen/entfernen), NetBird, Claude, Bereiche, Anmeldung (alle Anbieter mit Redirect-URIs), Version & Update.
  - Aktionen laufen über dieselben Befehle wie im Terminal.
  - Farbschema wie im Wiki: localStorage `theme`, Standard dunkel.
- **Update-Symbol und -Befehl** (Philips Wunsch 04.11.):
  - Die Zentrale liest alle 6 Std. `brainbox.version` aus `main` und speichert das Ergebnis in `/var/lib/brainbox/update.json`. `update` schreibt dieselbe Datei.
  - Ist eine neue Version da, erscheint im Wiki oben in der Seitenleiste „Update verfügbar · X“ mit Download-Symbol und Punkt (`BrainboxUpdateLink.tsx`, fragt `/zentrale/api/update-info`).
  - In der Zentrale gibt es dann ein Banner mit „Jetzt aktualisieren“ und ein Symbol bei „Version & Update“. Auch die Terminal-Begrüßung meldet es.
  - Befehle: `update` = `brainbox-update` (Symlink) und vom Host `pct exec <CTID> -- update`. Der Host schickt `BRAINBOX_CTID` mit, gespeichert in `/etc/brainbox/ctid`.
- **Mehrere Proxmox-Server**:
  - Gespeichert in `/etc/brainbox/proxmox.json` (`[{name,url,tokenId,secret,insecure,caFile}]`). Bedienung mit `brainbox-connect proxmox add|remove|list|test`.
  - Ein altes Einzel-Format (`PVE_*` in connect.env) wird übernommen.
  - Je Server eine Seite „`<name>` (Proxmox-Server)“ mit Nodes. Die Gäste hängen darunter; Schlüssel `pve:<server>:<vmid>`, alte `pve:<vmid>` werden migriert.
  - Ein offline-Server behält seine Einträge, ein entfernter wird archiviert.
- **Grundfunktionen (seit dem Nachbau)**:
  - `proxmox/brainbox.sh` packt aus einem Klon den Bausatz selbst und schickt ihn mit, sonst lädt `install.sh` ihn von GitHub (codeload).
  - `install.sh` und `update.sh` mit Backup und Rollback.
  - `brainbox-login`: Adresse, E-Mail, Passkeys, Google, Microsoft, Discord, OIDC, Sprache, Login-Link, Wiki anlegen.
  - `brainbox-connect`: Claude-Konto plus MCP, NetBird, Abgleich alle 5 Min., Bereiche per Zuordnungsregeln.
- README neu: Logo/Banner, Zentrale, mehrere Proxmox-Server, Update-Symbol, Versionen. Quick-Start in `docs/proxmox-quickstart.md`.
- **Getestet 04.11.** in Debian 13 (Docker, systemctl-Stub, nachgebaute Proxmox-/NetBird-APIs):
  - frische Installation mit Branding (43 Änderungen), danach zweimal `update --force` (EXIT 0)
  - Zentrale mit echtem Admin-Login: zwei Proxmox-Server, NetBird und Claude über die Formulare, Abgleich (2 Server, 9 Gäste, 6 Geräte, 7 Domains)
  - MCP über die Zentrale: Claude schreibt in „Von Claude“
  - Update-Symbol mit nachgestellter Version 1.1.0, Login-Seite „Bei Brainbox anmelden“ mit allen Anbietern
- Live-Demo im Brainbox-Look: https://claude.ai/artifact/TzQ1ou6hZu56fowZwjvbSm. Enthalten sind das Wiki mit 2 Servern und 6 Bereichen und die echte `zentrale/app.html` in einem Shadow-Root (Server hinzufügen legt Einträge an, Update lässt sich durchspielen), dazu Login und Terminal.
- Nicht getestet: echter Proxmox-Host, echte Proxmox-/NetBird-API, claude.ai-Connector (braucht öffentliche HTTPS-Domain), echte Logins bei Google/Microsoft, echter SMTP-Server, Update von GitHub (nur lokaler Spiegel).

## Erkenntnisse (Outline v1.12.0, aus dem Quellcode)

- Ohne konfigurierten Anbieter zeigt Outline „Create workspace“. Sobald ein Anbieter in der `.env` steht, verschwindet diese Seite – also erst das Wiki anlegen.
- API-Aufrufe mit Cookie brauchen die Kopfzeile `x-csrf-token` (Cookie `csrfToken`).
- `/auth/redirect?token=` nimmt Transfer-Tokens (JWT mit `user.jwtSecret`, `type: transfer`, einmal benutzbar).
- Ohne „Einladungen erforderlich“ kann sich bei Google, Microsoft oder Discord jedes Konto anmelden. Die Installation schaltet es ein.
- MCP `create_collection` legt **private** Sammlungen an, deshalb gibt es „Von Claude“ und `guidanceMCP`.
- Microsoft (Azure-Plugin) nur mit Firmen- und Schulkonten. Passkeys brauchen HTTPS.
- Team-`avatarUrl` darf ein relativer Pfad sein.
- Sidebar-Links mit `href` werden beim ersten Hover neu gezeichnet (ContextMenu). Ein Klick ohne Hover (nur Playwright) verpufft. Echte Maus und Tippen gehen.
- In dieser Sandbox geht der Browser-Websocket nur ohne `HTTPS_PROXY` (sonst steht „Offline“ unten rechts).

## Offen / nächste Schritte

- Philip fragen: nach `main` übernehmen und `v1.0.0` taggen?
- Philip: Reverse-Proxy für `brainbox.morncloud.de` → `http://<IP>:3000` mit Websockets, Postfach für Login-Mails, Google-OAuth-Client und Microsoft-App-Registrierung anlegen.
- Klären: welcher Reverse-Proxy (Nginx Proxy Manager?), welches Postfach.
- Optional: automatisches Update nachts, eingebautes HTTPS (z. B. Caddy) falls kein Reverse-Proxy vorhanden.
- Ideen: Speicher und Backups/Snapshots je Gast, NetBird-Richtlinien.
