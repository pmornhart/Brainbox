# Stand

_Zuletzt aktualisiert: 05.11.2026_

## Fertig

- **Überarbeitung Schritt für Schritt** (Philips Wunsch: „genauso wie die Einstellungen mit Proxmox … alles von Outline überarbeiten“):
  - **Schritt 1 fertig: Wiki- und Konto-Einstellungen** im Stil der Zentrale (gehört noch zu 1.1.0, weil 1.1.0 nicht auf `main` ist).
    - Alle 14 Einstellungsseiten kommen jetzt aus `zentrale/app.html` (eingebettet per iframe). `Settings/Brainbox.tsx` hat die Liste `zentralePages` mit Gruppe und Recht (`admin`, `listUsers`, `readTemplate`, `createExport`, `all`).
    - Neue Seiten: Allgemein, Mitglieder, Sicherheit, Vorlagen, Export, Profil, Darstellung, Benachrichtigungen. Sie sprechen die Wiki-API direkt an (gleiche Herkunft, Cookie plus `x-csrf-token`).
    - Mitglieder sehen nur die Wiki- und Konto-Seiten; die Brainbox-Seiten zeigen ohne Admin die Sperre.
    - Getestet im Testwiki: alle Seiten ohne Fehler, Einladen, Rolle ändern, Freigaben, Beispiel-Vorlagen, Export mit Download, Benachrichtigungen. Demo zeigt die neuen Seiten.
  - **Konto unter dem Namen** (Philips Wunsch 05.11.: „die Kontoeinstellungen soll man sehen, wenn man auf seinen Namen unten geht“):
    - `brand/overrides/app/menus/AccountMenu.tsx` ersetzt das Menü unten links: Gruppe „Konto“ (Profil, Darstellung, Benachrichtigungen, Passkeys mit Symbol), dann Farbschema, Einstellungen (nur Admins), Anleitung, Tastaturkürzel, Neuigkeiten, Problem melden, Abmelden.
    - Die Konto-Gruppe bleibt zusätzlich in der Einstellungs-Liste, damit man dort sieht, wo man ist.
    - Demo: Klick auf den Namen öffnet dasselbe Menü (Desktop und Handy geprüft). Anleitung und Spickzettel erwähnen es.
    - Getestet im Testwiki: Menü zeigt die Gruppe „Konto“, Klick auf „Benachrichtigungen“ öffnet `/settings/notifications`, keine Seitenfehler.
  - **Nächste Schritte (Vorschlag):** Sammlungs-Seiten (Kopf mit Beschreibung und Kacheln), Suche, Dokument-Kopf und Teilen-Dialog, Archiv und Papierkorb, Passkeys-Seite.

- **Brainbox 1.1.0 – aufgeräumt** (Philips Wunsch 04.11. abends: „nicht mehr erkennen, dass es Outline ist“, Einstellungen ausmisten, Anleitung im Wiki):
  - Ganze Dateien kommen jetzt aus `brand/overrides/`. Ersetzt wird nur, wenn ein Kennzeichen der erwarteten Fassung drinsteht.
    Neu angelegt werden `BrainboxDashboard`, `Settings/Brainbox.tsx`, `BrainboxVersion`, `BrainboxUpdateLink` und `utils/brainbox.ts`.
  - **Einstellungen** (`useSettingsConfig.ts`) haben drei Gruppen:
    - *Brainbox*: Zentrale per iframe `/zentrale?embed=1&theme=…`, Navigation per `postMessage`
    - *Wiki*: Allgemein, Mitglieder, Sicherheit, Vorlagen, Export
    - *Konto*: Profil, Darstellung, Benachrichtigungen, Passkeys
    - Plugins: nur Passkeys. `/zentrale` ohne `embed` leitet nach `/settings/brainbox-…` weiter.
  - **Startseite** (`Home.tsx` und `BrainboxDashboard.tsx`) zeigt Begrüßung, Kacheln und Schnellzugriffe. Die Daten kommen von `/zentrale/api/summary` (für alle Mitglieder, ohne Geheimnisse).
  - **Anmeldeseite** (`Login/components/Background.tsx`): Markenleiste links, auf dem Handy oben.
  - **Seitenleiste**:
    - Überschriften in Konsole-Schrift, Markierung der aktiven Seite
    - „Einstellungen“ und „Update verfügbar“ oben
    - Adresse unter dem Wiki-Namen
    - kein Import-Hinweis
  - **Keine Outline-Spuren**:
    - UrlHelper, Hilfe-Menü (Anleitung, Neuigkeiten, Problem melden), App-Manifest, Willkommens-Mail, Freigabe-Seiten, Übersetzungen (de/en)
    - Seitentitel „Mitglieder“ und „Darstellung“
    - Terminal-Meldungen ohne „Outline“
    - Geprüft: kein „Outline“ im sichtbaren Text der Hauptseiten.
  - **Anleitung**:
    - `wiki/anleitung.md` und `wiki/spickzettel.md` landen in der Sammlung „Start“ (`connect/sync.mjs` → `ensureStart`).
    - Platzhalter `{{proxmox}}` usw. füllt der Abgleich mit den echten Links.
    - Selbst bearbeitete Seiten bleiben, erkannt am Hash nach dem Schreiben.
  - **`brainbox-connect start`** (rufen Installation und Update auf):
    - richtet Bot und Zeitplan ein, gleicht ab
    - sortiert die Sammlungen einmalig: Start, Bereiche, Proxmox, NetBird, Von Claude (Flag in `/var/lib/brainbox/sammlungen-sortiert`)
    - Der Abgleich läuft auch ohne Proxmox und NetBird; dann pflegt er nur die Anleitung.
  - Kurzlinks `/zentrale/go/anleitung|spickzettel|proxmox|netbird|bereiche|regeln|domains`.
  - Server-Karten in den Einstellungen zeigen, ob der Server erreichbar ist und wie viele VMs/Container er hat. Mit „Im Wiki“ geht es direkt zur Server-Seite, ebenso bei NetBird zur Übersicht.
  - Getestet am 05.11.: frische Installation ohne Proxmox. Die Anleitung liegt in „Start“, die Startseite zeigt den Hinweis „Bring dein Homelab ins Wiki“, und neue Nutzer landen zuerst in „Start“.
  - Getestet am 05.11.:
    - Update 1.0.0 → 1.1.0 im Testcontainer, zweimal `update --force`
    - Screenshots von Desktop, Handy und Login
    - kein Seitenfehler, Kurzlink geht, `/zentrale#proxmox` leitet weiter
    - Live-Demo neu aufgebaut: Einstellungen mit eingebetteter Zentrale, Startseite, Update zum Durchspielen

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
  - frische Installation direkt von GitHub `main` (Bausatz über codeload), Update-Prüfung gegen GitHub: „1.0.0 ist aktuell“
  - Umstieg alte Version (Stand fe2d1eb) → `update` → Brainbox 1.0.0: holt sich das neue Update-Skript selbst, Daten bleiben, neuer Look, Wiki-Bild wird zum Logo (wenn keins gewählt)
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

- **Brainbox 1.3.0** (Philip 05.11.: Proxmox am anderen Standort, Umbenennen, „Claude soll alles über MCP machen, ohne eigenes Konto, wie Künstliche Intelligenz in der ersten Fassung“):
  - **Agent:** `connect/pve-agent.sh` (auch unter `/zentrale/agent.sh`). Installiert per `curl … | bash -s -- install URL TOKEN` nach `/usr/local/bin/brainbox-agent`, Zeitplan `brainbox-agent.timer` (5 Min.), liest per `pvesh` (Perl/JSON::PP filtert VM-Konfig auf description, ostype, hostname, name, tags, net*), POST an `/zentrale/agent/push` mit `Authorization: Bearer`. Zentrale vergleicht sha256 mit `tokenHash` in `proxmox.json` (`mode: "agent"`), bereinigt nochmal (`cleanSnapshot`) und legt `/var/lib/brainbox/agent/<name>.json` ab (600). Erste Meldung startet sofort einen Abgleich. `sync.mjs` liest Agent-Server wie die API (`agentData`), älter als 15 Min. = „keine Meldung“, Einträge bleiben.
  - **Umbenennen:** `brainbox-connect proxmox rename ALT NEU` unter `flock` auf `/run/brainbox-sync.lock`: `proxmox.json`, Schlüssel `pvesrv:`/`pve:<name>:` in `state.json`, Agent-Datei. Seiten behalten ihre ID, bekommen neue Titel. Zentrale: Knopf „Umbenennen“ je Server.
  - **KI:** `brand/overrides/server/mcp/tools/brainbox.ts` (10 Werkzeuge `brainbox_*`, nur für `actor.isAdmin`) + Patch `server/mcp/index.ts` (Import, `brainboxTools`, `brainboxInstructions` an die Anweisungen). Werkzeuge rufen `POST /zentrale/intern/<aktion>` mit Kopfzeile `X-Brainbox-Intern` (Schlüssel `/etc/brainbox/intern.key`, von `teile-einrichten.sh`), nur von 127.0.0.1. Seite „Künstliche Intelligenz“ (früher „Claude“, Pfad bleibt `/settings/brainbox-claude`): Schalter `preferences.mcp`, Adresse, Anleitung, `guidanceMCP`. Kein Claude-Konto mehr; `brainbox-connect start` entfernt die alte Konto-Anweisung.
  - Getestet: Neubau im Testwiki (EXIT 0); MCP mit Admin-API-Schlüssel: 10 Brainbox-Werkzeuge, Anweisungen enthalten Brainbox-Teil, `brainbox_status`; Agent per `brainbox_proxmox_add_remote` auf echtem-systemd-Container mit nachgebautem `pvesh` eingerichtet (Timer aktiv, Meldung ohne Passwort/SSH-Schlüssel, Domain über NetBird-Ziel-IP zugeordnet); Umbenennen per `brainbox_proxmox_rename` (gleiche Seiten-IDs, neue Titel, nichts archiviert, Agent meldet weiter); Mitglied ohne Admin wird abgewiesen; interner Zugang ohne Schlüssel 403; falscher Agent-Token 401; Demo mit allen Prüfungen.
  - Nicht getestet: echter Proxmox-Host mit echtem `pvesh`, claude.ai-Connector mit OAuth (nur API-Schlüssel).

- **Brainbox 1.2.1** (Philip 05.11.: „die Update-Funktion geht nicht auf der Webseite“, Tab-Symbol bei „Brainbox startet“):
  - Ursache: `update/start` startete `update` per `spawn(detached)` – bleibt aber in der cgroup von `brainbox-zentrale.service`. `systemctl restart brainbox-zentrale` am Ende von `update.sh` beendete das Update vor dem Eintrag in `/root/.brainbox`. Sein Wiki lief danach schon mit 1.2.0-Code (18 Reverse-Proxy-Domains im Wiki), meldete aber weiter „Update verfügbar“.
  - Lösung: Zentrale startet per `systemd-run --collect` (eigene Einheit). `update.sh` hat `detach_from_zentrale`: läuft es in der cgroup der Zentrale, startet es sich per `systemd-run` neu (Ausgabe per `append:` ins selbe Protokoll). Greift schon bei alten Zentralen, weil `update` sich vorher selbst aus `main` holt.
  - Mit echtem systemd nachgestellt (Container `brainbox-systemd`, systemd als PID 1): vorher „Version eingetragen: NEIN“, nachher ja – über beide Wege.
  - Tab-Symbol: Seite „Brainbox startet“ mit `/zentrale/icon-32.png`; `/favicon.ico` und `/images/favicon-*.png` kommen bei gestopptem Kern aus der Zentrale.
  - Hinweis für Philip: Seine Domains heißen `mornihosting.de` (ohne g) – die Beispielregel `*.morninghosting.de` greift deshalb nicht; in den Zuordnungsregeln anpassen.

- **Brainbox 1.2.0 – Reverse-Proxy-Domains** (Philip 05.11.: „das Wiki sieht die Reverse Proxys, also die Domains nicht“):
  - Sein Wiki zeigte „3 Netzwerke · 0 Domains“: Seine Domains liegen im NetBird-Reverse-Proxy (Reverse Proxy → Services, ab NetBird 0.65), nicht in den Netzwerk-Ressourcen.
  - `connect/sync.mjs` liest `GET /api/reverse-proxies/services` (Felder: `domain`, `mode`, `listen_port`, `enabled`, `terminated`, `private`, `meta.status`, `auth.*.enabled`, `targets[]` mit `target_type`, `target_id`, `host`, `port`, `path`). Passwort/PIN/Header-Werte werden nie gelesen oder geschrieben.
  - Zuordnung über das Ziel: Peer → Gast (über `peerOf`) bzw. IP → Gast (LAN-IP) oder Peer-IP; erst wenn das nichts findet, über den Namen.
  - Domains-Seite: Domain | Quelle | Ziel | Status | Schutz | Gehört zu | Bereich. Geräte-Seiten und NetBird-Übersicht zeigen Domains. 404 → Hinweis „ab NetBird 0.65“, 403 → Hinweis „Rolle Admin“.
  - Getestet mit nachgebauter API (5 Dienste: Peer, LAN-IP, TCP 25565, privat, aus), ohne Netzwerk-Domains, mit 404 und 403; Suche nach den Test-Geheimnissen: 0 Treffer.

- Erledigt 05.11.2026: Brainbox 1.1.0 nach `main` übernommen (Philip: „bring mal das update raus“). Installationen zeigen innerhalb von 6 Std. „Update verfügbar · 1.1.0“, sofort mit `update` im Container.
- Behoben 05.11.: Philip sah „Nur für Admins“, obwohl sein Konto Admin ist (per MCP geprüft).
  - Ursache: Die Zentrale verglich bei Aktionen die Herkunft (`Origin`) nur mit der `Host`-Kopfzeile. Schreibt der Reverse-Proxy `Host` auf die interne IP um, kam 403, und die Seite zeigte jede 403 als „Nur für Admins“.
  - Lösung: `ownHosts()` nimmt auch den Host aus `URL=` der `.env` (Standard-Ports gleich). `app.html` zeigt „Nur für Admins“ nur bei `error: "admin"`, sonst die echte Meldung. Kaputt kodierte fremde Cookies werfen nicht mehr.
  - Nachgestellt im Testcontainer mit umgeschriebenem Host: vorher 403, nachher 200; fremde Herkunft weiter 403.
  - Für Philip: einmal `update` im Container (der Knopf in 1.0.0 hat denselben Fehler), danach geht alles im Browser.
- Der Tag `v1.0.0` ließ sich aus der Cloud nicht pushen (403). Philip kann ihn bei Bedarf auf GitHub als Release anlegen.
- Erledigt 04.11.2026: Brainbox 1.0.0 nach `main` übernommen, Tag `v1.0.0`. Ab jetzt zeigen Installationen „Update verfügbar“, sobald `brainbox.version` auf `main` hochgezählt wird.
- Für ein Update an Philips Installationen: Änderung auf `main`, `BRAINBOX_VERSION` erhöhen, `CHANGELOG.md` ergänzen, Tag setzen.
- Philip: Reverse-Proxy für `brainbox.morncloud.de` → `http://<IP>:3000` mit Websockets, Postfach für Login-Mails, Google-OAuth-Client und Microsoft-App-Registrierung anlegen.
- Klären: welcher Reverse-Proxy (Nginx Proxy Manager?), welches Postfach.
- Optional: automatisches Update nachts, eingebautes HTTPS (z. B. Caddy) falls kein Reverse-Proxy vorhanden.
- Ideen: Speicher und Backups/Snapshots je Gast, NetBird-Richtlinien.
