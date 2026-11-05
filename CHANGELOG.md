# Änderungen

Brainbox hat eigene Versionen. Der Kern (Outline) ist je Version fest getestet und steht dabei.

## 1.4.1 – 05.11.2026 · Kern: Outline v1.12.0

- **Wiki-Bild unter neuem Namen:** Das Brainbox-Logo als Wiki-Bild (Seitenleiste, Anmeldeseite, *Einstellungen → Allgemein*) liegt jetzt unter `/images/brainbox-192.png`. Unter dem alten Namen zeigten Browser oft noch das Outline-Bild aus dem Zwischenspeicher. Das Update stellt ein gesetztes Brainbox-Logo automatisch um; eigene Bilder bleiben

## 1.4.0 – 05.11.2026 · Kern: Outline v1.12.0

Eigene Symbole – von Outline ist nichts mehr zu sehen.

- **Neuer Symbolsatz:** Alle Symbole im Wiki – Seitenleiste, Menüs, Knöpfe, Editor und die Symbole für Sammlungen – kommen jetzt aus Brainbox: feine Linien im Stil der Zentrale (Formen aus Phosphor Icons, MIT). Das alte Outline-Paket wird nicht mehr angezeigt
- **App-Symbole mit neuem Namen:** Browser und Handys merken sich Symbole lange. Unter neuem Dateinamen holen sie jetzt sicher das Brainbox-Symbol – im Tab, auf dem Startbildschirm (Android und iPhone) und bei Claude
- **Handy-Symbol in einer Farbe:** Bei Android mit farbig angepassten Symbolen erscheint jetzt das Brainbox-Logo statt des alten Outline-Zeichens
- **E-Mails** zeigen oben das Brainbox-Logo
- `/favicon.ico` liefert immer das Brainbox-Symbol (vorher kam dort die Wiki-Seite)

## 1.3.0 – 05.11.2026 · Kern: Outline v1.12.0

Proxmox an jedem Standort, Claude packt mit an.

- **Proxmox-Server an anderen Standorten:** Kommt Brainbox nicht an einen Server heran (andere Firewall, kein VPN), meldet er sich selbst. Ein Befehl aus *Einstellungen → Proxmox-Server* richtet dort den Brainbox-Agent ein; er liest alle 5 Minuten Nodes, VMs und Container (nur lesend) und schickt sie an Brainbox. Ohne Passwörter oder SSH-Schlüssel aus den VM-Einstellungen
- **Server umbenennen** – jederzeit, auch wenn er schon verbunden ist. Die Wiki-Seiten bekommen den neuen Namen, Notizen und Links bleiben (`brainbox-connect proxmox rename ALT NEU`)
- **Künstliche Intelligenz statt Claude-Konto:** Claude verbindet sich über den MCP-Anschluss mit deiner eigenen Anmeldung – ohne eigenes Konto. Neue Seite *Einstellungen → Brainbox → Künstliche Intelligenz* mit Schalter, Adresse, Anleitung für Claude-App und Claude Code und eigenen Anweisungen
- **Claude bedient Brainbox:** neue Werkzeuge im MCP-Anschluss – Status, Proxmox-Server hinzufügen (auch an anderen Standorten), umbenennen, prüfen, entfernen, NetBird verbinden, abgleichen, Update prüfen und starten. Nur für Admins
- **Claude kennt Brainbox:** Beim Verbinden bekommt Claude eine Beschreibung des Wikis – Sammlungen, was der Abgleich überschreibt, wie man Server hinzufügt
- `brainbox-connect proxmox list` braucht kein `column` mehr

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
