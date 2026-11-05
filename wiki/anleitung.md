Brainbox ist dein Wiki fürs Homelab. Hier steht in fünf Minuten, wie du dich zurechtfindest. Alles Weitere zum Nachschlagen steht im [Spickzettel]({{spickzettel}}).

## So ist Brainbox aufgebaut

Links ist die **Seitenleiste**. Oben stehen Startseite, Suche, Entwürfe und **Einstellungen**, darunter deine **Sammlungen**. Eine Sammlung ist ein großer Ordner, in dem Seiten und Unterseiten liegen. Ganz unten steht **dein Name**: Ein Klick darauf öffnet dein Konto (Profil, Darstellung, Benachrichtigungen, Passkeys), dazu Farbschema, Anleitung und Abmelden.

| Sammlung | Was drin ist |
|---|---|
| **Start** | Diese Anleitung und der Spickzettel |
| **Bereiche** | Alles nach Themen sortiert, z. B. „Minecraft-Server“ oder „Homelab“ |
| **Proxmox** | Jede VM und jeder Container – automatisch, alle 5 Minuten |
| **NetBird** | Geräte, Netzwerke und Domains (auch vom Reverse-Proxy) – automatisch |
| **Von Claude** | Was Claude schreibt, wenn nichts anderes passt |

Eigene Sammlungen legst du mit **„+ Neue Sammlung“** in der Seitenleiste an.

## Schreiben

1. **„+ Neues Dokument“** oben rechts (oder Taste `n`).
2. Titel eintippen, mit `Enter` in den Text springen.
3. Lostippen – Brainbox speichert von selbst.

Formatieren geht mit Kürzeln: `#` und Leertaste für eine Überschrift, `-` für eine Liste, `[ ]` für eine Checkliste. Mit `/` öffnest du ein Menü für Tabellen, Bilder, Hinweise und Code. Bilder ziehst du einfach in die Seite.

**Verknüpfen:** Tippe `@` und den Namen einer Seite oder Person. So entsteht ein Netz aus Seiten, das du später schnell wiederfindest.

**Ordnen:** Seiten lassen sich in der Seitenleiste per Ziehen verschieben – auch in eine andere Seite, dann wird sie zur Unterseite.

## Finden

Die **Suche** (`Strg`+`K` oder `/`) durchsucht alle Seiten, auch Tabellen. Gute Suchbegriffe sind Namen, IPs oder Domains, z. B. `mc-survival`, `192.168.1.50` oder `morninghosting`.

## Dein Homelab im Wiki

Sobald ein Proxmox-Server verbunden ist, legt Brainbox für jede VM und jeden Container eine eigene Seite an – mit Status, IP-Adressen, Domains, NetBird-Gerät und Bereich. Neue VMs erscheinen nach spätestens 5 Minuten, gelöschte wandern ins Archiv.

- **Alles ab der Überschrift „Notizen“ gehört dir.** Der Abgleich überschreibt nur den Teil darüber. Dort ist Platz für Passwort-Hinweise (nicht die Passwörter selbst), Anleitungen und Besonderheiten.
- **Übersichten:** [Proxmox]({{proxmox}}) · [NetBird]({{netbird}}) · [Bereiche]({{bereiche}})
- **Weiteren Server verbinden:** [Einstellungen → Brainbox → Proxmox-Server](/settings/brainbox-proxmox) – im selben Netz oder an einem anderen Standort (dann meldet sich der Server selbst). Dort kannst du Server auch jederzeit umbenennen.

## Bereiche: was wohin gehört

Bereiche sortieren Domains, VMs und Geräte nach Themen. Welche Regel gilt, legst du auf der Seite [Zuordnungsregeln]({{regeln}}) fest – eine Tabelle mit **Muster** und **Bereich**:

| Muster | Bereich |
|---|---|
| `*.morninghosting.de` | Minecraft-Server |
| `tag:minecraft` | Minecraft-Server |
| `name:mc-*` | Minecraft-Server |

Die erste passende Regel gewinnt. `Minecraft-Server/Survival` legt einen Unterbereich an. Eine VM erbt den Bereich ihrer Domain, ein NetBird-Gerät den seiner VM.

## Claude hilft mit

Claude arbeitet mit deiner Anmeldung direkt in Brainbox. Wie du Claude verbindest, steht unter [Einstellungen → Brainbox → Künstliche Intelligenz](/settings/brainbox-claude). Danach sagst du Claude einfach, was du willst – in der Claude-App oder in Claude Code:

- „Such mir alles zum Minecraft-Server zusammen.“
- „Schreib eine Anleitung zum Neustart und häng sie an die VM.“
- „Füg meinen Proxmox in Frankfurt hinzu, an den kommt Brainbox nicht direkt ran.“
- „Benenn proxmox-2 in zuhause um.“

Brainbox bedienen darf Claude nur für Admins, und vor dem Entfernen oder einem Update fragt Claude nach. Was Claude schreibt, steht mit deinem Namen da.

## Leute einladen und anmelden

- **Einladen:** [Einstellungen → Wiki → Mitglieder](/settings/users) → „Einladen“. Rein kommt nur, wer eingeladen ist.
- **Anmeldewege** (E-Mail, Passkey, Google, Microsoft, Discord, eigener Login-Dienst): [Einstellungen → Brainbox → Anmeldung](/settings/brainbox-anmeldung).
- **Login-Link** für ein neues Gerät: [Einstellungen → Brainbox → Übersicht](/settings/brainbox).

## Updates und Sicherung

Gibt es eine neue Brainbox, erscheint oben in der Seitenleiste **„Update verfügbar“**. Ein Klick führt zu **Version & Update**, dort startest du es. Vorher sichert Brainbox Datenbank und Einstellungen; geht etwas schief, läuft die alte Version weiter.

Eine eigene Sicherung aller Seiten machst du unter [Einstellungen → Wiki → Export](/settings/export).

## Wenn etwas hakt

- **Nach einem Update sieht alles alt aus:** alle Brainbox-Tabs schließen und neu öffnen.
- **„Brainbox startet gerade“:** nach Update oder Neustart 1–2 Minuten warten.
- **Eine VM fehlt:** [Einstellungen → Brainbox → Übersicht](/settings/brainbox) → „Jetzt abgleichen“.
- **Im Terminal des Containers** geht alles auch: `brainbox-connect`, `brainbox-login`, `update`.
