# Änderungen

Brainbox hat eigene Versionen. Der Kern (Outline) ist je Version fest getestet und steht dabei.

## 1.2.1 – 05.11.2026 · Kern: Outline v1.12.0

- **Behoben: „Jetzt aktualisieren“ auf der Webseite.** Das Update lief als Unterprozess der Zentrale. Am Ende startete es die Zentrale neu, dabei beendete systemd auch das Update selbst – kurz bevor es die neue Version eintrug. Der neue Stand lief zwar, aber Brainbox meldete weiter „Update verfügbar“. Jetzt läuft das Update als eigener Dienst und wird fertig
- **Symbol im Browser-Tab** auch auf der Seite „Brainbox startet gerade“ (während Update oder Neustart)

## 1.2.0 – 05.11.2026 · Kern: Outline v1.12.0

Domains vom NetBird-Reverse-Proxy im Wiki.

- **Reverse-Proxy-Domains:** Brainbox liest die Dienste aus NetBird → Reverse Proxy → Services (ab NetBird 0.65). Jede Domain steht mit Ziel (Gerät bzw. IP und Port), Status (aktiv, Zertifikat kommt, Fehler …) und Schutz (SSO, Passwort, PIN, nur NetBird) auf der Seite *Domains*
- **Richtig zugeordnet:** Über das Ziel landet jede Domain bei ihrer VM bzw. ihrem Container und ihrem NetBird-Gerät – und damit auch im passenden Bereich, z. B. `*.morninghosting.de → Minecraft-Server`
- **TCP/UDP-Dienste** (z. B. ein Minecraft-Server auf Port 25565) erscheinen mit Port
- **Sicher:** Passwörter, PINs und Header-Werte der Dienste kommen nie ins Wiki
- **Klare Hinweise:** Fehlt dem NetBird-Token das Recht (Rolle *Admin* nötig) oder kennt NetBird noch keinen Reverse-Proxy, sagt die NetBird-Übersicht, was zu tun ist

## 1.1.0 – 05.11.2026 · Kern: Outline v1.12.0

Aufgeräumt und neu sortiert: weniger Einstellungen, mehr Überblick.

- **Einstellungen neu:** drei Gruppen – *Brainbox* (Übersicht, Proxmox-Server, NetBird, Claude, Anmeldung, Version & Update), *Wiki* (Allgemein, Mitglieder, Sicherheit, Vorlagen, Export) und *Konto*. Slack, Zapier, Webhooks, GitHub, Analytics, Gruppen, Emojis, API-Schlüssel und Integrationen sind weg.
- **Wiki- und Konto-Einstellungen im Brainbox-Stil:** Allgemein, Mitglieder, Sicherheit, Vorlagen, Export, Profil, Darstellung und Benachrichtigungen sind neu gebaut – Karten mit Erklärung, Schalter mit einem Satz dazu, Einladen und Rollen auf einer Seite, Beispiel-Vorlagen auf Knopfdruck, Export mit Download
- **Konto unter deinem Namen:** Ein Klick auf deinen Namen unten links zeigt Profil, Darstellung, Benachrichtigungen und Passkeys, dazu Farbschema, Einstellungen, Anleitung und Abmelden
- **Behoben: „Nur für Admins“ hinter Reverse-Proxy.** Schreibt der Proxy die Adresse auf die interne IP um, lehnte die Zentrale jede Aktion ab und meldete fälschlich „Nur für Admins“. Jetzt zählt auch die Wiki-Adresse, und eine Ablehnung nennt den echten Grund
- **Zentrale im Wiki:** die Brainbox-Zentrale steckt jetzt direkt in den Einstellungen, im Farbschema des Wikis. `/zentrale` führt dorthin.
- **Startseite neu:** Begrüßung, dein Homelab auf einen Blick (Proxmox, NetBird, Bereiche, Version) und Schnellzugriffe
- **Anleitung im Wiki:** neue Sammlung *Start* mit „Anleitung“ und „Spickzettel“, bei Updates aufgefrischt – eigene Änderungen bleiben
- **Anmeldeseite** mit Brainbox-Leiste, Seitenleiste mit Konsole-Überschriften und Markierung der aktiven Seite
- **Keine Outline-Spuren mehr:** Hilfe-Menü, Neuigkeiten, Fehler melden, App-Name, Willkommens-Mail und Freigabe-Seiten zeigen auf Brainbox
- **Sammlungen sortiert:** Start, Bereiche, Proxmox, NetBird, Von Claude
- **Ohne Proxmox und NetBird** läuft der Abgleich trotzdem und hält die Anleitung aktuell

## 1.0.0 – 04.11.2026 · Kern: Outline v1.12.0

Erste eigenständige Brainbox.

- **Eigenes Gesicht:** Logo, Name, Icons, Schrift (Geist) und Farbschema „Homelab-Konsole“, dunkel als Standard
- **Brainbox-Zentrale** im Browser (`/zentrale`, oben in der Seitenleiste): Übersicht, Proxmox-Server, NetBird, Claude, Bereiche, Anmeldung, Update
- **Mehrere Proxmox-Server**, jeder mit eigenem Eintrag und seinen VMs/Containern darunter
- **Ein Container = ein Wiki:** Wiki und Admin werden bei der Installation angelegt, Login-Link am Ende
- **Sechs Anmeldewege:** E-Mail, Passkey, Google, Microsoft, Discord, OIDC (`brainbox-login`)
- **Claude** mit eigenem Konto über den MCP-Anschluss (`brainbox-connect claude`)
- **Proxmox und NetBird** automatisch im Wiki, alle 5 Minuten abgeglichen
- **Bereiche** per Zuordnungsregeln, z. B. `*.morninghosting.de → Minecraft-Server`
- **Update mit Rückweg:** sichert Datenbank und Einstellungen, spielt bei Fehlern die alte Version zurück
- **Update-Symbol:** Brainbox sieht alle 6 Stunden nach neuen Versionen; im Wiki erscheint dann „Update verfügbar“ in der Seitenleiste, in der Zentrale „Jetzt aktualisieren“
- **Update-Befehl:** `update` (auch `brainbox-update`) im Container, `pct exec <ID> -- update` vom Proxmox-Host

Verfasst mit Claude 🤖
