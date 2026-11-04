# Stand

_Zuletzt aktualisiert: 04.11.2026_

## Fertig

- 1:1-Nachbau des community-scripts Outline-Skripts: `proxmox/brainbox.sh`, `install.sh`, `update.sh`, Quick-Start-Doku, README.
- Getestet in Debian 13 (Docker, systemctl-Stub): Installation mit Outline v1.12.0 komplett durchgelaufen,
  Weboberfläche antwortet auf Port 3000, `update --check`, `update --force` und Rollback bei kaputtem Download funktionieren.
- Nicht getestet: der Host-Teil auf einem echten Proxmox (pct/pveam/whiptail).
- Abweichungen vom Original: Namen `brainbox` statt `outline` (Pfad, Dienst, Hostname), `URL` mit `:3000`,
  Slack-Platzhalter aus der `.env` entfernt (dadurch erscheint beim ersten Aufruf „Create workspace“),
  DB-Sicherung und Rollback beim Update, deutsche Texte.

## Erkenntnisse zum Login (Outline v1.12.0, aus dem Quellcode)

- Ohne konfigurierten Anbieter zeigt Outline „Create workspace“ (Workspace + Admin), Admin ist danach sofort angemeldet.
  Sobald ein Anbieter (Google, Microsoft …) in der `.env` steht, verschwindet diese Seite – also erst Workspace anlegen.
- E-Mail-Login (Link oder 6-stelliger Code) braucht SMTP und geht nur für Leute, die schon im Workspace sind.
- Passkeys: Plugin ist dabei, Passkey wird nach dem Login in den Kontoeinstellungen angelegt; braucht HTTPS mit Domain.
- Google und Microsoft brauchen ebenfalls HTTPS mit Domain (Redirect-URI `<URL>/auth/google.callback` bzw. `/auth/azure.callback`).
  Private @gmail.com-Konten können keinen neuen Workspace anlegen, nur beitreten.

## Offen / nächste Schritte

- Philip will Login mit Google, Microsoft (Outlook) usw. statt Slack, und fragt nach Passkey/E-Mail.
  Idee: Befehl `login` im Container (Menü für Domain/HTTPS-URL, SMTP, Google, Microsoft, Discord, OIDC), schreibt die `.env` und startet neu.
- Klären: Domain (z. B. unter morncloud.de) und Reverse-Proxy für HTTPS, Mail-Anbieter für SMTP.
- Optional: Sprache auf Deutsch (`DEFAULT_LANGUAGE=de_DE`), Update-Timer.
