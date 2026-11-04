#!/usr/bin/env bash
# ------------------------------------------------------------------------------
# Brainbox – Anmeldung einrichten (im Container: brainbox-login)
#
#   brainbox-login                 Menü: Adresse, E-Mail, Google, Microsoft,
#                                  Discord, OIDC, Passkeys, Sprache
#   brainbox-login status          zeigt, welche Anmeldewege eingerichtet sind
#   brainbox-login set KEY=WERT …  Werte direkt in die .env schreiben
#   brainbox-login unset KEY …     Werte leeren
#   brainbox-login testmail <an>   Test-Mail über die SMTP-Einstellungen senden
#   brainbox-login link [E-Mail]   einmaligen Login-Link erstellen (60 Min. gültig),
#                                  ohne E-Mail für den ersten Admin
#   brainbox-login workspace <Wiki-Name> <Admin-Name> <Admin-E-Mail>
#                                  Arbeitsbereich und Admin anlegen (nur einmal)
#
# Nach Änderungen wird Outline neu gestartet.
# Lizenz: MIT, siehe LICENSE.
# ------------------------------------------------------------------------------
set -Eeuo pipefail

APP="Brainbox"
APP_DIR="/opt/brainbox"
ENV_FILE="${BRAINBOX_ENV_FILE:-${APP_DIR}/.env}"
SERVICE="brainbox"
PORT="3000"
PG_DB_NAME="outline"
DEFAULT_DOMAIN="${BRAINBOX_DOMAIN:-brainbox.morncloud.de}"

YW=$'\033[33m'; GN=$'\033[1;92m'; RD=$'\033[01;31m'; BL=$'\033[36m'; CL=$'\033[m'; BOLD=$'\033[1m'
TAB="  "
CHANGED="no"

ok() { echo -e "${TAB}✔️${TAB}${GN}$1${CL}"; }
warn() { echo -e "${TAB}💡${TAB}${YW}$1${CL}"; }
fail() { echo -e "${TAB}✖️${TAB}${RD}$1${CL}" >&2; exit 1; }

[[ $EUID -eq 0 ]] || fail "Bitte als root ausführen."
[[ -f "$ENV_FILE" ]] || fail "Keine ${APP}-Installation gefunden (${ENV_FILE} fehlt)."

# --- .env lesen und schreiben ----------------------------------------------------
env_get() {
  local v
  v="$(awk -v k="$1" 'index($0, k "=") == 1 { print substr($0, length(k) + 2); exit }' "$ENV_FILE")"
  if [[ "$v" == \"*\" && ${#v} -ge 2 ]]; then v="${v:1:${#v}-2}"; v="${v//\\\"/\"}"; v="${v//\\\\/\\}"
  elif [[ "$v" == \'*\' && ${#v} -ge 2 ]]; then v="${v:1:${#v}-2}"; fi
  printf '%s' "$v"
}

quote_value() {
  local v="$1"
  if [[ -z "$v" || "$v" =~ ^[A-Za-z0-9_./:@,+-]*$ ]]; then printf '%s' "$v"
  elif [[ "$v" != *"'"* ]]; then printf "'%s'" "$v"
  else v="${v//\\/\\\\}"; v="${v//\"/\\\"}"; printf '"%s"' "$v"; fi
}

env_set() { # env_set KEY WERT
  local key="$1" line tmp
  [[ "$key" =~ ^[A-Z][A-Z0-9_]*$ ]] || fail "Ungültiger Name: ${key}"
  [[ "$2" != *$'\n'* ]] || fail "Zeilenumbrüche sind in ${key} nicht erlaubt."
  line="${key}=$(quote_value "$2")"
  [[ "$(env_get "$key")" == "$2" ]] && grep -q "^${key}=" "$ENV_FILE" && return 0
  tmp="$(mktemp "${ENV_FILE}.XXXX")"
  BB_KEY="$key" BB_LINE="$line" awk '
    BEGIN { k = ENVIRON["BB_KEY"]; l = ENVIRON["BB_LINE"]; done = 0 }
    index($0, k "=") == 1 { if (!done) { print l; done = 1 }; next }
    { print }
    END { if (!done) print l }' "$ENV_FILE" >"$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$ENV_FILE"
  CHANGED="yes"
}

is_set() { [[ -n "$(env_get "$1")" ]]; }

current_url() { env_get URL; }

workspace_exists() {
  local n
  n="$(cd /tmp && sudo -u postgres psql -d "$PG_DB_NAME" -tAc 'SELECT count(*) FROM teams' 2>/dev/null || echo 0)"
  [[ "${n//[[:space:]]/}" =~ ^[1-9] ]]
}

restart_service() {
  [[ "$CHANGED" == "yes" ]] || return 0
  echo -en "${TAB}⏳${TAB}${YW}Brainbox wird neu gestartet...${CL}"
  systemctl restart "$SERVICE"

  for _ in $(seq 1 90); do
    if curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/_health" 2>/dev/null || curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/" 2>/dev/null; then
      echo -e "\r\033[K${TAB}✔️${TAB}${GN}Brainbox läuft wieder${CL}"
      CHANGED="no"
      return 0
    fi
    sleep 2
  done
  echo -e "\r\033[K${TAB}✖️${TAB}${RD}Brainbox antwortet nicht – Log: journalctl -u ${SERVICE} -n 50${CL}"
  return 1
}

# --- Arbeitsbereich und Login-Link ----------------------------------------------
wait_ready() { # wait_ready <Sekunden> – wartet, bis Outline antwortet
  local max="${1:-600}" t=0
  until curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/_health" 2>/dev/null; do
    sleep 3
    t=$((t + 3))
    ((t < max)) || return 1
  done
}

create_workspace() { # create_workspace <Wiki-Name> <Admin-Name> <Admin-E-Mail>
  local name="$1" admin="$2" email="$3" jar csrf body code
  if workspace_exists; then
    warn "Es gibt schon einen Arbeitsbereich – nichts geändert. Ein weiteres Wiki = weiterer Container mit eigener Domain."
    return 0
  fi
  [[ -n "$name" && -n "$admin" && "$email" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] ||
    fail "Beispiel: brainbox-login workspace 'Brainbox' 'Philip' philip@example.com"
  wait_ready 900 || fail "Brainbox antwortet nicht – Log: journalctl -u ${SERVICE} -n 50"
  jar="$(mktemp)"
  curl -fsS -c "$jar" -b "$jar" -o /dev/null "http://127.0.0.1:${PORT}/"
  csrf="$(awk '$6 ~ /csrfToken$/ {print $7}' "$jar" | tail -n1)"
  body="$(jq -n --arg t "$name" --arg u "$admin" --arg e "$email" '{teamName: $t, userName: $u, userEmail: $e}')"
  code="$(curl -sS -c "$jar" -b "$jar" -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' \
    -H "x-csrf-token: ${csrf}" --data "$body" "http://127.0.0.1:${PORT}/api/installation.create" || true)"
  if ! [[ "$code" =~ ^(200|302)$ ]] || ! workspace_exists; then
    rm -f "$jar"
    fail "Arbeitsbereich konnte nicht angelegt werden (HTTP ${code:-?})."
  fi
  ok "Arbeitsbereich '${name}' angelegt, Admin: ${admin} <${email}>"
  # Sicherheit: nur eingeladene Personen dürfen rein (sonst könnte sich bei Google,
  # Microsoft oder Discord jedes Konto selbst als Mitglied anmelden).
  # Dazu das Brainbox-Logo als Bild des Wikis (änderbar unter Einstellungen → Details).
  code="$(curl -sS -c "$jar" -b "$jar" -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' \
    -H "x-csrf-token: ${csrf}" --data '{"inviteRequired":true,"avatarUrl":"/images/icon-192.png"}' "http://127.0.0.1:${PORT}/api/team.update" || true)"
  rm -f "$jar"
  if [[ "$code" == "200" ]]; then
    ok "Nur eingeladene Personen kommen rein (Einstellungen → Sicherheit → Einladungen erforderlich)"
  else
    warn "Bitte selbst einschalten: Einstellungen → Sicherheit → Einladungen erforderlich (HTTP ${code:-?})"
  fi
}

login_link() { # login_link [--raw] [E-Mail] – einmaliger Login-Link, 60 Minuten gültig
  local raw="no" email="" js out err who tok link
  if [[ "${1:-}" == "--raw" ]]; then raw="yes"; shift; fi
  email="${1:-}"
  workspace_exists || fail "Es gibt noch keinen Arbeitsbereich: brainbox-login workspace <Wiki-Name> <Admin-Name> <Admin-E-Mail>"
  js="${APP_DIR}/build/server/scripts/zz-brainbox-link.js"
  err="$(mktemp)"
  # Nutzt Outlines eigenen Übergabe-Token (wie /auth/redirect ihn erwartet): einmal benutzbar
  cat >"$js" <<'JS'
require("./bootstrap");
const JWT = require("jsonwebtoken");
const { User } = require("../models");
(async () => {
  const email = (process.env.BB_EMAIL || "").trim().toLowerCase();
  const minutes = parseInt(process.env.BB_MINUTES || "60", 10);
  const where = email ? { email } : { role: "admin" };
  const user = await User.findOne({ where, order: [["createdAt", "ASC"]] });
  if (!user) { console.error("Kein Nutzer gefunden"); process.exit(2); }
  const now = new Date();
  const token = JWT.sign({ id: user.id, createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + minutes * 60000).toISOString(), type: "transfer" }, user.jwtSecret);
  process.stdout.write(user.email + " " + token + "\n");
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
JS
  if ! out="$(cd "$APP_DIR" && BB_EMAIL="$email" BB_MINUTES=60 NODE_ENV=production node "$js" 2>"$err")"; then
    rm -f "$js"
    fail "Login-Link konnte nicht erstellt werden${email:+ (gibt es ${email} im Wiki?)}: $(grep -v Warning "$err" | tail -n1)"
  fi
  rm -f "$js" "$err"
  who="${out%% *}"
  tok="${out##* }"
  link="$(current_url)/auth/redirect?token=${tok}"
  if [[ "$raw" == "yes" ]]; then
    echo "$link"
  else
    echo -e "  Login-Link für ${BOLD}${who}${CL} (einmal benutzbar, 60 Minuten gültig):"
    echo -e "  ${BL}${link}${CL}"
  fi
}

# --- Status ------------------------------------------------------------------
mark() { if is_set "$1"; then echo -e "${GN}eingerichtet${CL}${2:+ (${2})}"; else echo -e "${YW}aus${CL}"; fi; }

status() {
  local url smtp
  url="$(current_url)"
  smtp="$(env_get SMTP_HOST)"; [[ -n "$smtp" ]] || smtp="$(env_get SMTP_SERVICE)"
  echo
  echo -e "  ${BOLD}Brainbox – Anmeldung${CL}"
  echo -e "  Adresse:     ${BL}${url}${CL}"
  if workspace_exists; then
    echo -e "  Workspace:   ${GN}angelegt${CL}"
    if [[ "$(cd /tmp && sudo -u postgres psql -d "$PG_DB_NAME" -tAc 'SELECT bool_and("inviteRequired") FROM teams' 2>/dev/null)" == "t" ]]; then
      echo -e "  Zugang:      ${GN}nur mit Einladung${CL}"
    else
      echo -e "  Zugang:      ${YW}offen – jedes Google/Microsoft/Discord-Konto kann sich anmelden (Einstellungen → Sicherheit)${CL}"
    fi
  else echo -e "  Workspace:   ${YW}noch nicht angelegt – brainbox-login workspace <Wiki-Name> <Admin-Name> <E-Mail>${CL}"; fi
  echo -e "  E-Mail:      $(if [[ -n "$smtp" ]]; then echo -e "${GN}eingerichtet${CL} (${smtp})"; else echo -e "${YW}aus${CL}"; fi)"
  if [[ "$url" == https://* ]]; then echo -e "  Passkeys:    ${GN}bereit${CL} (im Konto unter Einstellungen → Passkeys anlegen)"
  else echo -e "  Passkeys:    ${YW}brauchen HTTPS – Adresse auf https://… stellen${CL}"; fi
  echo -e "  Google:      $(mark GOOGLE_CLIENT_ID)"
  echo -e "  Microsoft:   $(mark AZURE_CLIENT_ID)"
  echo -e "  Discord:     $(mark DISCORD_CLIENT_ID)"
  echo -e "  OIDC:        $(mark OIDC_CLIENT_ID "$(env_get OIDC_DISPLAY_NAME)")"
  echo -e "  Sprache:     $(env_get DEFAULT_LANGUAGE)"
  echo
  echo -e "  ${BOLD}Weiterleitungs-Adressen (Redirect-URI) für die Anbieter${CL}"
  echo -e "  Google:      ${url}/auth/google.callback"
  echo -e "  Microsoft:   ${url}/auth/azure.callback"
  echo -e "  Discord:     ${url}/auth/discord.callback"
  echo -e "  OIDC:        ${url}/auth/oidc.callback"
  echo
}

# --- Test-Mail ------------------------------------------------------------------
testmail() {
  local to="$1" host port user pass from secure scheme netrc mail
  host="$(env_get SMTP_HOST)"; port="$(env_get SMTP_PORT)"; user="$(env_get SMTP_USERNAME)"
  pass="$(env_get SMTP_PASSWORD)"; from="$(env_get SMTP_FROM_EMAIL)"; secure="$(env_get SMTP_SECURE)"
  [[ -n "$host" && -n "$user" ]] || fail "SMTP ist nicht eingerichtet (SMTP_HOST/SMTP_USERNAME fehlen)."
  [[ -n "$to" ]] || fail "Empfänger fehlt: brainbox-login testmail du@beispiel.de"
  [[ -n "$port" ]] || port=587
  if [[ "$secure" == "true" ]]; then scheme="smtps"; else scheme="smtp"; fi
  netrc="$(mktemp)"; mail="$(mktemp)"; chmod 600 "$netrc"
  printf 'machine %s login %s password %s\n' "$host" "$user" "$pass" >"$netrc"
  printf 'From: Brainbox <%s>\r\nTo: <%s>\r\nSubject: Brainbox Test-Mail\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nDer E-Mail-Versand von Brainbox funktioniert.\r\n' "${from:-$user}" "$to" >"$mail"
  if curl -sS --ssl-reqd --netrc-file "$netrc" --url "${scheme}://${host}:${port}" \
    --mail-from "${from:-$user}" --mail-rcpt "$to" --upload-file "$mail" 2>&1; then
    ok "Test-Mail an ${to} verschickt"
  else
    rm -f "$netrc" "$mail"
    fail "Test-Mail fehlgeschlagen – Server, Port, Benutzer und (App-)Passwort prüfen."
  fi
  rm -f "$netrc" "$mail"
}

# --- Menü (whiptail) ------------------------------------------------------------------
wt() { whiptail --backtitle "${APP} · Anmeldung einrichten" "$@" 3>&1 1>&2 2>&3; }
input() { wt --title "$1" --inputbox "$2" 12 72 "$3"; }
secret() { wt --title "$1" --passwordbox "$2" 11 72; }

# Ohne Schlüssel startet Outline mit halber Konfiguration nicht – dann nichts ändern
need_secret() { # need_secret <Name> <KEY des Schlüssels> <eingegebener Wert>
  [[ -n "$3" || -n "$(env_get "$2")" ]] && return 0
  wt --title "$1" --msgbox "Ohne Schlüssel funktioniert die Anmeldung über $1 nicht.\nEs wurde nichts geändert." 9 64 || true
  return 1
}

confirm_provider() {
  workspace_exists && return 0
  wt --title "ERST DEN WORKSPACE ANLEGEN" --defaultno --yesno \
    "Es gibt noch keinen Workspace.\n\nSobald ein Anbieter wie $1 eingetragen ist, zeigt Brainbox die Seite zum Anlegen von Workspace und Admin nicht mehr.\n\nEmpfehlung: erst im Browser den Workspace anlegen, dann hier weitermachen.\n\nTrotzdem jetzt eintragen?" 16 72
}

menu_url() {
  local cur new ip
  cur="$(current_url)"; ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [[ "$cur" == https://* ]] || cur="https://${DEFAULT_DOMAIN}"
  new="$(input "ADRESSE" "Unter welcher Adresse ist Brainbox erreichbar?\n\nMit Domain (für Passkeys, Google, Microsoft nötig): https://${DEFAULT_DOMAIN}\nNur im Heimnetz: http://${ip}:${PORT}\n\nDer Reverse-Proxy (z. B. Nginx Proxy Manager) muss auf http://${ip}:${PORT} zeigen, mit Websockets an." "$cur")" || return 0
  new="${new%/}"
  [[ "$new" =~ ^https?://[^[:space:]/]+(:[0-9]+)?$ ]] || { wt --title "ADRESSE" --msgbox "Ungültig: ${new}\nBeispiel: https://${DEFAULT_DOMAIN}" 9 64; return 0; }
  env_set URL "$new"
}

menu_smtp() {
  local choice host port secure user pass from
  choice="$(wt --title "E-MAIL-VERSAND" --menu "Über welches Postfach sollen Login-Mails rausgehen?\n(Bei Gmail, GMX, web.de, Outlook meist ein App-Passwort nötig.)" 20 72 9 \
    gmail "Gmail (smtp.gmail.com)" \
    gmx "GMX (mail.gmx.net)" \
    webde "web.de (smtp.web.de)" \
    outlook "Outlook / Hotmail (smtp-mail.outlook.com)" \
    m365 "Microsoft 365 Firma (smtp.office365.com)" \
    ionos "IONOS (smtp.ionos.de)" \
    strato "Strato (smtp.strato.de)" \
    eigen "Eigener Mailserver" \
    aus "E-Mail-Login ausschalten")" || return 0
  case "$choice" in
  gmail) host="smtp.gmail.com"; port=465 ;;
  gmx) host="mail.gmx.net"; port=587 ;;
  webde) host="smtp.web.de"; port=587 ;;
  outlook) host="smtp-mail.outlook.com"; port=587 ;;
  m365) host="smtp.office365.com"; port=587 ;;
  ionos) host="smtp.ionos.de"; port=465 ;;
  strato) host="smtp.strato.de"; port=465 ;;
  eigen)
    host="$(input "SMTP-SERVER" "Adresse des Mailservers" "$(env_get SMTP_HOST)")" || return 0
    port="$(input "SMTP-PORT" "Port (465 = SSL, 587 = STARTTLS)" "$(env_get SMTP_PORT)")" || return 0
    ;;
  aus)
    for k in SMTP_SERVICE SMTP_HOST SMTP_PORT SMTP_USERNAME SMTP_PASSWORD SMTP_FROM_EMAIL; do env_set "$k" ""; done
    return 0
    ;;
  esac
  [[ "$port" =~ ^[0-9]+$ ]] || port=587
  if [[ "$port" == "465" ]]; then secure="true"; else secure="false"; fi
  user="$(input "BENUTZER" "E-Mail-Adresse bzw. Benutzername für ${host}" "$(env_get SMTP_USERNAME)")" || return 0
  pass="$(secret "PASSWORT" "Passwort bzw. App-Passwort für ${user}\n(leer lassen = altes Passwort behalten)")" || return 0
  from="$(input "ABSENDER" "Absender der Login-Mails" "${user}")" || return 0
  env_set SMTP_SERVICE ""
  env_set SMTP_HOST "$host"
  env_set SMTP_PORT "$port"
  env_set SMTP_SECURE "$secure"
  env_set SMTP_USERNAME "$user"
  [[ -n "$pass" ]] && env_set SMTP_PASSWORD "$pass"
  env_set SMTP_FROM_EMAIL "$from"
  if wt --title "TEST-MAIL" --yesno "Jetzt eine Test-Mail an ${user} schicken?" 8 64; then
    clear; (testmail "$user") || true; read -rp "  Weiter mit Enter … " _
  fi
}

menu_google() {
  local id sec url
  url="$(current_url)"
  confirm_provider "Google" || return 0
  wt --title "GOOGLE" --msgbox "So bekommst du die Schlüssel:\n\n1. console.cloud.google.com → APIs & Dienste → Anmeldedaten\n2. OAuth-Client-ID anlegen, Typ 'Webanwendung'\n3. Autorisierte Weiterleitungs-URI:\n   ${url}/auth/google.callback\n4. Client-ID und Clientschlüssel hier eintragen\n\nHinweis: Private @gmail.com-Konten können erst beitreten, wenn der Workspace schon existiert." 18 76 || true
  id="$(input "GOOGLE" "Client-ID (leer = Google ausschalten)" "$(env_get GOOGLE_CLIENT_ID)")" || return 0
  if [[ -z "$id" ]]; then env_set GOOGLE_CLIENT_ID ""; env_set GOOGLE_CLIENT_SECRET ""; return 0; fi
  sec="$(secret "GOOGLE" "Clientschlüssel (leer = alten behalten)")" || return 0
  need_secret "Google" GOOGLE_CLIENT_SECRET "$sec" || return 0
  env_set GOOGLE_CLIENT_ID "$id"
  [[ -n "$sec" ]] && env_set GOOGLE_CLIENT_SECRET "$sec"
  return 0
}

menu_microsoft() {
  local id sec tenant url
  url="$(current_url)"
  confirm_provider "Microsoft" || return 0
  wt --title "MICROSOFT" --msgbox "So bekommst du die Schlüssel:\n\n1. entra.microsoft.com → App-Registrierungen → Neue Registrierung\n2. Umleitungs-URI (Web):\n   ${url}/auth/azure.callback\n3. Zertifikate & Geheimnisse → Neuer geheimer Clientschlüssel\n4. Anwendungs-ID (Client-ID) und Geheimnis hier eintragen\n\nWichtig: Outline braucht ein Firmen- oder Schulkonto (Microsoft 365 / Entra ID). Private @outlook.com/@hotmail.com-Konten melden sich besser per E-Mail-Link oder Passkey an." 19 76 || true
  id="$(input "MICROSOFT" "Anwendungs-ID / Client-ID (leer = Microsoft ausschalten)" "$(env_get AZURE_CLIENT_ID)")" || return 0
  if [[ -z "$id" ]]; then env_set AZURE_CLIENT_ID ""; env_set AZURE_CLIENT_SECRET ""; env_set AZURE_TENANT_ID ""; return 0; fi
  sec="$(secret "MICROSOFT" "Geheimer Clientschlüssel (leer = alten behalten)")" || return 0
  need_secret "Microsoft" AZURE_CLIENT_SECRET "$sec" || return 0
  tenant="$(input "MICROSOFT" "Verzeichnis-ID (Tenant), leer = alle Organisationen" "$(env_get AZURE_TENANT_ID)")" || return 0
  env_set AZURE_CLIENT_ID "$id"
  [[ -n "$sec" ]] && env_set AZURE_CLIENT_SECRET "$sec"
  env_set AZURE_TENANT_ID "$tenant"
  return 0
}

menu_discord() {
  local id sec server url
  url="$(current_url)"
  confirm_provider "Discord" || return 0
  wt --title "DISCORD" --msgbox "So bekommst du die Schlüssel:\n\n1. discord.com/developers/applications → New Application\n2. OAuth2 → Redirects:\n   ${url}/auth/discord.callback\n3. Client ID und Client Secret hier eintragen\n\nOptional: Server-ID, dann dürfen nur Mitglieder dieses Servers rein." 16 76 || true
  id="$(input "DISCORD" "Client ID (leer = Discord ausschalten)" "$(env_get DISCORD_CLIENT_ID)")" || return 0
  if [[ -z "$id" ]]; then env_set DISCORD_CLIENT_ID ""; env_set DISCORD_CLIENT_SECRET ""; return 0; fi
  sec="$(secret "DISCORD" "Client Secret (leer = altes behalten)")" || return 0
  need_secret "Discord" DISCORD_CLIENT_SECRET "$sec" || return 0
  server="$(input "DISCORD" "Server-ID (leer = jeder Discord-Nutzer)" "$(env_get DISCORD_SERVER_ID)")" || return 0
  env_set DISCORD_CLIENT_ID "$id"
  [[ -n "$sec" ]] && env_set DISCORD_CLIENT_SECRET "$sec"
  env_set DISCORD_SERVER_ID "$server"
  return 0
}

menu_oidc() {
  local name issuer id sec url
  url="$(current_url)"
  confirm_provider "OIDC" || return 0
  wt --title "OIDC" --msgbox "Für eigene Login-Dienste wie Pocket ID, Authentik, Authelia, Keycloak oder Zitadel.\n\nIm Login-Dienst einen OIDC-Client anlegen mit Redirect-URI:\n   ${url}/auth/oidc.callback\n\nDann Name, Issuer-URL, Client-ID und Secret hier eintragen." 15 76 || true
  name="$(input "OIDC" "Name auf dem Knopf (z. B. Pocket ID)" "$(env_get OIDC_DISPLAY_NAME)")" || return 0
  issuer="$(input "OIDC" "Issuer-URL (z. B. https://id.${DEFAULT_DOMAIN#*.})" "$(env_get OIDC_ISSUER_URL)")" || return 0
  id="$(input "OIDC" "Client-ID (leer = OIDC ausschalten)" "$(env_get OIDC_CLIENT_ID)")" || return 0
  if [[ -z "$id" ]]; then env_set OIDC_CLIENT_ID ""; env_set OIDC_CLIENT_SECRET ""; return 0; fi
  sec="$(secret "OIDC" "Client-Secret (leer = altes behalten)")" || return 0
  need_secret "OIDC" OIDC_CLIENT_SECRET "$sec" || return 0
  env_set OIDC_DISPLAY_NAME "${name:-OpenID Connect}"
  env_set OIDC_ISSUER_URL "$issuer"
  env_set OIDC_CLIENT_ID "$id"
  [[ -n "$sec" ]] && env_set OIDC_CLIENT_SECRET "$sec"
  return 0
}

menu_passkeys() {
  local url
  url="$(current_url)"
  if [[ "$url" == https://* ]]; then
    wt --title "PASSKEYS" --msgbox "Passkeys sind an.\n\nSo legst du einen an:\n1. ${url} öffnen und anmelden\n2. Unten links auf dein Profil → Einstellungen → Passkeys\n3. 'Passkey hinzufügen' – Fingerabdruck, Gesicht oder PIN\n\nDanach auf der Login-Seite 'Mit Passkey anmelden'." 15 72 || true
  else
    wt --title "PASSKEYS" --msgbox "Passkeys funktionieren nur über HTTPS mit Domain – Browser erlauben sie nicht auf http://IP-Adressen.\n\nStell zuerst unter 'Adresse' https://${DEFAULT_DOMAIN} ein und richte den Reverse-Proxy ein." 12 72 || true
  fi
}

menu_language() {
  local lang
  lang="$(wt --title "SPRACHE" --radiolist "Standardsprache für neue Konten" 12 60 3 \
    de_DE "Deutsch" "$([[ "$(env_get DEFAULT_LANGUAGE)" == de_DE ]] && echo ON || echo OFF)" \
    en_US "Englisch" "$([[ "$(env_get DEFAULT_LANGUAGE)" == en_US ]] && echo ON || echo OFF)")" || return 0
  [[ -n "$lang" ]] && env_set DEFAULT_LANGUAGE "$lang"
  return 0
}

main_menu() {
  command -v whiptail >/dev/null 2>&1 || fail "whiptail fehlt (apt install whiptail)."
  local choice
  while :; do
    choice="$(wt --title "ANMELDUNG EINRICHTEN" --cancel-button "Fertig" --menu "Adresse: $(current_url)\nWas möchtest du einrichten?" 22 72 11 \
      1 "Adresse (Domain, HTTPS)" \
      2 "E-Mail-Login (Postfach für Login-Mails)" \
      3 "Passkeys" \
      4 "Google        – $(is_set GOOGLE_CLIENT_ID && echo an || echo aus)" \
      5 "Microsoft     – $(is_set AZURE_CLIENT_ID && echo an || echo aus)" \
      6 "Discord       – $(is_set DISCORD_CLIENT_ID && echo an || echo aus)" \
      7 "OIDC (Pocket ID, Authentik …) – $(is_set OIDC_CLIENT_ID && echo an || echo aus)" \
      8 "Sprache       – $(env_get DEFAULT_LANGUAGE)" \
      9 "Übersicht anzeigen" \
      10 "Login-Link für den Admin erstellen")" || break
    case "$choice" in
    1) menu_url ;;
    2) menu_smtp ;;
    3) menu_passkeys ;;
    4) menu_google ;;
    5) menu_microsoft ;;
    6) menu_discord ;;
    7) menu_oidc ;;
    8) menu_language ;;
    9) clear; status; read -rp "  Weiter mit Enter … " _ ;;
    10) clear; (login_link) || true; echo; read -rp "  Weiter mit Enter … " _ ;;
    esac
  done
  clear
  restart_service || true
  status
}

case "${1:-}" in
"") main_menu ;;
status) status ;;
set)
  shift
  (($# > 0)) || fail "Beispiel: brainbox-login set URL=https://${DEFAULT_DOMAIN}"
  for kv in "$@"; do
    [[ "$kv" == *=* ]] || fail "Erwartet KEY=WERT, bekommen: ${kv}"
    env_set "${kv%%=*}" "${kv#*=}"
  done
  restart_service
  ;;
unset)
  shift
  for k in "$@"; do env_set "$k" ""; done
  restart_service
  ;;
testmail) testmail "${2:-}" ;;
link) shift; login_link "$@" ;;
workspace) shift; create_workspace "${1:-}" "${2:-}" "${3:-}" ;;
-h | --help | help) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//' ;;
*) fail "Unbekannter Befehl: $1 (siehe brainbox-login --help)" ;;
esac
