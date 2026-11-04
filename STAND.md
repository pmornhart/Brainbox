# Stand

_Zuletzt aktualisiert: 04.11.2026_

## Fertig

- 1:1-Nachbau des community-scripts Outline-Skripts: `proxmox/brainbox.sh`, `install.sh`, `update.sh`, Quick-Start-Doku, README.
- Neu: `brainbox-login.sh` (im Container `/usr/bin/brainbox-login`): Menü für Adresse/HTTPS, E-Mail (SMTP mit Vorlagen + Test-Mail),
  Passkeys, Google, Microsoft, Discord, OIDC, Sprache; dazu `status`, `set KEY=WERT`, `unset`, `testmail`.
  Wird von `install.sh` installiert, vom Host mitgeschickt und von `update` aktuell gehalten.
- Oberfläche standardmäßig Deutsch (`DEFAULT_LANGUAGE=de_DE`), Slack-Platzhalter entfernt.
- **Ein Container = ein Wiki** (Philips Wunsch): Das Proxmox-Skript fragt Wiki-Name, Domain, Admin-Name, Admin-E-Mail
  (auch per `var_wiki_name`, `var_domain`, `var_admin_name`, `var_admin_email`). `install.sh` setzt `URL=https://<domain>`,
  legt Wiki + Admin über `/api/installation.create` an (`brainbox-login workspace`), schaltet „Einladungen erforderlich“ ein
  (`/api/team.update`) und am Ende gibt es einen einmaligen Login-Link (`brainbox-login link`, 60 Min., Outline-Transfer-Token
  über `/auth/redirect`). Hostname kommt aus der Domain. Weiteres Wiki = Skript erneut mit anderer Domain.
- Domain: `brainbox.morncloud.de` (Vorgabe im Menü „Adresse“).
- Getestet in Debian 13 (Docker, systemctl-Stub): Installation mit Outline v1.12.0, `update --check/--force`, Rollback,
  `brainbox-login set/unset/status` (Sonderzeichen in Passwörtern, Rest der .env unverändert, Rechte 600),
  Arbeitsbereich anlegen, Passkey anlegen (virtueller Authenticator), Login-Seite zeigt alle 6 Wege.
- Demo-Seite mit echten Screenshots: https://claude.ai/artifact/NBEWig8DPG5DABtL2PcB96
- Nicht getestet: Host-Teil auf echtem Proxmox (nur mit nachgebauten pct/pveam), das whiptail-Menü interaktiv,
  echte Logins bei Google/Microsoft (dafür fehlen Schlüssel und HTTPS-Domain), Test-Mail gegen echten SMTP-Server.

## Erkenntnisse zum Login (Outline v1.12.0, aus dem Quellcode)

- Ohne konfigurierten Anbieter zeigt Outline „Create workspace“ (Workspace + Admin), Admin ist danach sofort angemeldet.
  Sobald ein Anbieter in der `.env` steht, verschwindet diese Seite – also erst Workspace anlegen.
- Self-hosted: Anbieter erscheinen auf der Login-Seite, sobald ID und Secret gesetzt sind (außer im Workspace ausdrücklich abgeschaltet).
- E-Mail-Login (Link oder 6-stelliger Code) braucht SMTP und geht nur für Leute, die schon im Workspace sind.
- Passkeys: standardmäßig an; Knopf erscheint, sobald ein Passkey existiert. Braucht HTTPS mit Domain.
- Microsoft (Azure-Plugin) liest die Organisation über Graph → nur Firmen-/Schulkonten, keine privaten @outlook.com.
- Google: private @gmail.com können keinen Workspace anlegen, nur beitreten.
- API-Aufrufe mit Cookie brauchen den Header `x-csrf-token` (Cookie `csrfToken`).
- Ohne „Einladungen erforderlich“ (Standard: aus) kann sich bei Google/Microsoft/Discord jedes Konto selbst als Mitglied anmelden.
- `/auth/redirect?token=` nimmt Transfer-Tokens (JWT mit `user.jwtSecret`, `type: transfer`); einmal benutzbar, Ablauf über `expiresAt`.

## Offen / nächste Schritte

- Philip: Branch nach `main` mergen (sonst geht der Einzeiler nicht), Reverse-Proxy für `brainbox.morncloud.de` → `http://<IP>:3000`
  mit Websockets, Postfach für Login-Mails, Google-OAuth-Client und Microsoft-App-Registrierung anlegen.
- Klären: welcher Reverse-Proxy (Nginx Proxy Manager?), welches Postfach.
- Optional: Update-Timer, eingebautes HTTPS (z. B. Caddy) falls kein Reverse-Proxy vorhanden.
