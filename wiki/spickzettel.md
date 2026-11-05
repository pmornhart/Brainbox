Alles Wichtige auf einen Blick. Die vollständige Liste der Tasten öffnest du jederzeit mit `?`. Wie Brainbox aufgebaut ist, steht in der [Anleitung]({{anleitung}}).

## Tasten

| Taste | Was passiert |
|---|---|
| `Strg`+`K` | Befehle und Suche |
| `/` | zur Suche springen |
| `n` | neues Dokument |
| `e` | aktuelles Dokument bearbeiten |
| `d` | zur Startseite |
| `m` | Dokument verschieben |
| `h` | Verlauf des Dokuments |
| `Strg`+`.` | Seitenleiste ein- und ausblenden |
| `Strg`+`Umschalt`+`L` | hell oder dunkel |
| `Strg`+`Alt`+`H` | Inhaltsverzeichnis |
| `?` | alle Tasten anzeigen |

Auf dem Mac statt `Strg` die Taste `⌘`.

## Beim Schreiben

| Tippen | Ergebnis |
|---|---|
| `#` Leertaste | große Überschrift (`##`, `###` kleiner) |
| `-` Leertaste | Liste |
| `1.` Leertaste | nummerierte Liste |
| `[ ]` Leertaste | Checkliste |
| `>` Leertaste | Zitat |
| ` ``` ` Leertaste | Code-Block |
| `:::` | Hinweis-Kasten |
| `---` | Trennlinie |
| `\|--` | Tabelle |
| `/` | Menü: Tabelle, Bild, Hinweis, Code … |
| `@` | Seite oder Person verlinken |
| `:` | Emoji |

## Wo was ist

| Ich will … | Dort |
|---|---|
| einen Proxmox-Server verbinden | [Einstellungen → Brainbox → Proxmox-Server](/settings/brainbox-proxmox) |
| NetBird verbinden | [Einstellungen → Brainbox → NetBird](/settings/brainbox-netbird) |
| GitHub verbinden | [Einstellungen → Brainbox → GitHub](/settings/brainbox-github) |
| festlegen, woher eine VM stammt | [Zuordnungsregeln]({{regeln}}) → Tabelle „Herkunft“ |
| Claude verbinden | [Einstellungen → Brainbox → Künstliche Intelligenz](/settings/brainbox-claude) |
| einen Proxmox an einem anderen Standort verbinden | [Proxmox-Server](/settings/brainbox-proxmox) → „Server an einem anderen Standort“ |
| einen Server umbenennen | [Proxmox-Server](/settings/brainbox-proxmox) → „Umbenennen“ |
| meinen Namen, mein Bild, hell/dunkel, E-Mails ändern | Klick auf **deinen Namen unten links** → Konto |
| jemanden einladen | [Einstellungen → Wiki → Mitglieder](/settings/users) |
| Anmeldung per E-Mail, Google … | [Einstellungen → Brainbox → Anmeldung](/settings/brainbox-anmeldung) |
| aktualisieren | [Einstellungen → Brainbox → Version & Update](/settings/brainbox-update) |
| alles sichern | [Einstellungen → Wiki → Export](/settings/export) |
| Bereiche festlegen | [Zuordnungsregeln]({{regeln}}) |

## Im Terminal des Containers

| Befehl | Wofür |
|---|---|
| `update` | Brainbox aktualisieren (vom Proxmox-Host: `pct exec <ID> -- update`) |
| `update --check` | nur nachsehen, ob es ein Update gibt |
| `brainbox-login link` | einmaliger Login-Link, 60 Minuten gültig |
| `brainbox-login` | Anmeldewege einrichten |
| `brainbox-connect` | Proxmox, NetBird, GitHub und Claude verbinden |
| `brainbox-connect github TOKEN` | GitHub verbinden (Token nur lesen; `--owners name` für nur öffentliche Repos) |
| `brainbox-connect proxmox agent NAME` | Server an einem anderen Standort: Befehl für dort |
| `brainbox-connect proxmox rename ALT NEU` | Server umbenennen |
| `brainbox-connect sync` | sofort abgleichen |
| `brainbox-connect status` | was verbunden ist |
