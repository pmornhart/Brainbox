#!/usr/bin/env bash
# ------------------------------------------------------------------------------
# Brainbox – Verbindungen (im Container: brainbox-connect)
#
#   brainbox-connect                  Menü: Claude, Proxmox, NetBird, Abgleich
#   brainbox-connect claude [--json]  eigenes Konto "Claude" anlegen, Schlüssel und Anleitung
#   brainbox-connect proxmox          Proxmox-Server verwalten (Menü)
#   brainbox-connect proxmox add NAME URL TOKEN-ID SECRET [--insecure]
#                                     weiteren Proxmox-Server verbinden (beliebig viele)
#   brainbox-connect proxmox remove NAME | list | test [NAME]
#   brainbox-connect netbird [URL TOKEN] | netbird remove
#                                     NetBird verbinden: Geräte, Netzwerke und Domains ins Wiki
#   brainbox-connect sync             jetzt abgleichen (läuft sonst alle 5 Minuten)
#   brainbox-connect status           zeigt, was verbunden ist
#
# Lizenz: MIT, siehe LICENSE.
# ------------------------------------------------------------------------------
set -Eeuo pipefail

APP="Brainbox"
APP_DIR="/opt/brainbox"
ENV_FILE="${APP_DIR}/.env"
CONF_DIR="/etc/brainbox"
CONF="${BRAINBOX_CONNECT_ENV:-${CONF_DIR}/connect.env}"
SYNC="/opt/brainbox-connect/sync.mjs"
PVE_FILE="${BRAINBOX_PROXMOX_FILE:-${CONF_DIR}/proxmox.json}"
STATE="/var/lib/brainbox-connect/state.json"
PORT="3000"
PG_DB_NAME="outline"

YW=$'\033[33m'; GN=$'\033[1;92m'; RD=$'\033[01;31m'; BL=$'\033[36m'; CL=$'\033[m'; BOLD=$'\033[1m'
TAB="  "

ok() { echo -e "${TAB}✔️${TAB}${GN}$1${CL}"; }
warn() { echo -e "${TAB}💡${TAB}${YW}$1${CL}"; }
fail() { echo -e "${TAB}✖️${TAB}${RD}$1${CL}" >&2; exit 1; }

[[ $EUID -eq 0 ]] || fail "Bitte als root ausführen."
[[ -f "$ENV_FILE" ]] || fail "Keine ${APP}-Installation gefunden (${ENV_FILE} fehlt)."
mkdir -p "$CONF_DIR"
chmod 700 "$CONF_DIR"
[[ -f "$CONF" ]] || { : >"$CONF"; chmod 600 "$CONF"; }

# --- Einstellungen (connect.env) ------------------------------------------------
file_get() { # file_get <Datei> <KEY>
  local v
  v="$(awk -v k="$2" 'index($0, k "=") == 1 { print substr($0, length(k) + 2); exit }' "$1")"
  if [[ "$v" == \'*\' && ${#v} -ge 2 ]]; then v="${v:1:${#v}-2}"
  elif [[ "$v" == \"*\" && ${#v} -ge 2 ]]; then v="${v:1:${#v}-2}"; fi
  printf '%s' "$v"
}
conf_get() { file_get "$CONF" "$1"; }
conf_set() { # conf_set KEY WERT
  local key="$1" val="$2" tmp line
  [[ "$key" =~ ^[A-Z][A-Z0-9_]*$ ]] || fail "Ungültiger Name: ${key}"
  [[ "$val" != *$'\n'* && "$val" != *"'"* ]] || fail "Ungültiges Zeichen in ${key}."
  line="${key}='${val}'"
  tmp="$(mktemp "${CONF}.XXXX")"
  BB_KEY="$key" BB_LINE="$line" awk '
    BEGIN { k = ENVIRON["BB_KEY"]; l = ENVIRON["BB_LINE"]; done = 0 }
    index($0, k "=") == 1 { if (!done) { print l; done = 1 }; next }
    { print }
    END { if (!done) print l }' "$CONF" >"$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$CONF"
}

conf_del() { # conf_del KEY
  local tmp
  tmp="$(mktemp "${CONF}.XXXX")"
  BB_KEY="$1" awk 'BEGIN { k = ENVIRON["BB_KEY"] } index($0, k "=") != 1 { print }' "$CONF" >"$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$CONF"
}

wiki_url() { file_get "$ENV_FILE" URL; }
wiki_host() { # Domain des Wikis für die Konto-E-Mails, sonst brainbox.local
  local h
  h="$(wiki_url | sed -E 's#^https?://##; s#[:/].*$##')"
  if [[ "$h" =~ ^[0-9.]+$ || "$h" == "localhost" || "$h" != *.* ]]; then echo "brainbox.local"; else echo "$h"; fi
}

sql() { (cd /tmp && sudo -u postgres psql -d "$PG_DB_NAME" -tAc "$1" 2>/dev/null) || true; }
user_exists() { [[ "$(sql "SELECT count(*) FROM users WHERE lower(email) = lower('${1//\'/}') AND \"deletedAt\" IS NULL")" =~ ^[1-9] ]]; }
first_admin() { sql "SELECT email FROM users WHERE role = 'admin' AND \"deletedAt\" IS NULL ORDER BY \"createdAt\" LIMIT 1"; }

# --- Wiki-API mit Sitzung eines Nutzers ----------------------------------------------
JAR=""
CSRF=""
cleanup() { [[ -n "$JAR" && -f "$JAR" ]] && rm -f "$JAR"; return 0; }
trap cleanup EXIT

session() { # session <E-Mail> – meldet sich über einen einmaligen Login-Link an
  local link token
  cleanup
  JAR="$(mktemp)"
  link="$(brainbox-login link --raw "$1")" || fail "Kein Login-Link für $1 möglich."
  token="${link##*token=}"
  curl -sS -c "$JAR" -b "$JAR" -o /dev/null "http://127.0.0.1:${PORT}/auth/redirect?token=${token}"
  curl -sS -c "$JAR" -b "$JAR" -o /dev/null "http://127.0.0.1:${PORT}/"
  CSRF="$(awk '$6 ~ /csrfToken$/ {print $7}' "$JAR" | tail -n1)"
  grep -q accessToken "$JAR" || fail "Anmeldung als $1 hat nicht geklappt."
}

api() { # api <Endpunkt> <JSON> – gibt die Antwort aus, Fehler bei HTTP ≠ 2xx
  local out code
  out="$(mktemp)"
  code="$(curl -sS -c "$JAR" -b "$JAR" -o "$out" -w '%{http_code}' -H 'Content-Type: application/json' \
    -H "x-csrf-token: ${CSRF}" --data "$2" "http://127.0.0.1:${PORT}/api/$1" || true)"
  if [[ "$code" =~ ^2 ]]; then cat "$out"; rm -f "$out"; return 0; fi
  echo -e "${TAB}✖️${TAB}${RD}Wiki $1: HTTP ${code} $(jq -r '.message // empty' "$out" 2>/dev/null)${CL}" >&2
  rm -f "$out"
  return 1
}

create_user() { # create_user <Name> <E-Mail> <Rolle>
  user_exists "$2" && return 0
  session "$(first_admin)"
  api users.invite "$(jq -n --arg n "$1" --arg e "$2" --arg r "$3" '{invites: [{name: $n, email: $e, role: $r}], suppressEmail: true}')" >/dev/null ||
    fail "Konto $1 <$2> konnte nicht angelegt werden."
  ok "Konto '$1' angelegt (${2})"
}

create_api_key() { # create_api_key <E-Mail> <Name des Schlüssels> – gibt den Schlüssel aus
  session "$1"
  api apiKeys.create "$(jq -n --arg n "$2" '{name: $n}')" | jq -r '.data.value // empty'
}

key_works() { # key_works <Schlüssel>
  [[ -n "$1" ]] && [[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $1" -H 'Content-Type: application/json' \
    --data '{}' "http://127.0.0.1:${PORT}/api/auth.info")" == "200" ]]
}

ensure_bot() { # Konto "Brainbox-Automatik" mit Schlüssel für den Abgleich
  local email key
  key="$(conf_get OUTLINE_API_KEY)"
  key_works "$key" && return 0
  email="automatik@$(wiki_host)"
  create_user "Brainbox-Automatik" "$email" member
  key="$(create_api_key "$email" "Abgleich Proxmox und NetBird")"
  [[ -n "$key" ]] || fail "Schlüssel für den Abgleich konnte nicht erstellt werden."
  conf_set OUTLINE_API_KEY "$key"
  conf_set OUTLINE_URL "http://127.0.0.1:${PORT}"
  ok "Konto 'Brainbox-Automatik' für den Abgleich eingerichtet"
}

run_sync() { # run_sync [--quiet]
  [[ -f "$SYNC" ]] || fail "Abgleich-Programm fehlt (${SYNC}) – update ausführen."
  local rc=0
  flock -n -E 75 /run/brainbox-sync.lock env BRAINBOX_CONNECT_ENV="$CONF" BRAINBOX_CONNECT_STATE="$STATE" node "$SYNC" "$@" || rc=$?
  if [[ $rc -eq 75 ]]; then warn "Abgleich läuft gerade schon."; return 0; fi
  return "$rc"
}

enable_timer() { # Zeitplan anlegen (falls nötig) und einschalten: alle 5 Minuten abgleichen
  if [[ ! -f /etc/systemd/system/brainbox-sync.timer ]]; then
    cat >/etc/systemd/system/brainbox-sync.service <<'UNIT'
[Unit]
Description=Brainbox-Abgleich (Proxmox, NetBird)
After=network-online.target brainbox.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/bin/brainbox-connect sync --quiet
UNIT
    cat >/etc/systemd/system/brainbox-sync.timer <<'UNIT'
[Unit]
Description=Brainbox-Abgleich alle 5 Minuten

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
Persistent=true

[Install]
WantedBy=timers.target
UNIT
    systemctl daemon-reload >/dev/null 2>&1 || true
  fi
  systemctl enable --now brainbox-sync.timer >/dev/null 2>&1 || warn "Zeitplan konnte nicht gestartet werden (systemctl status brainbox-sync.timer)."
}

# --- Claude ------------------------------------------------------------------------
CLAUDE_COLLECTION="Von Claude"

claude_guidance() { # Anweisung, die Claude beim Verbinden vom Wiki bekommt
  cat <<EOF
Du schreibst in diesem Wiki mit deinem eigenen Konto "Claude". Schreibe auf Deutsch, klar und knapp.
- Suche vor dem Anlegen, ob es schon ein passendes Dokument gibt, und ergänze lieber dieses.
- Lege neue Dokumente in einer bestehenden Sammlung an. Passt keine, nimm die Sammlung "${CLAUDE_COLLECTION}".
- Lege keine neuen Sammlungen an: Sie wären nur für dich sichtbar.
- In den Sammlungen "Proxmox" und "NetBird" wird alles oberhalb der Überschrift "Notizen" automatisch überschrieben. Schreibe dort nur unter "Notizen".
- Schreibe keine Passwörter, Tokens oder Schlüssel ins Wiki.
EOF
}

claude_workspace_setup() { # gemeinsame Sammlung "Von Claude" und Anweisung für Claude (als Admin)
  local found current
  session "$(first_admin)"
  found="$(api collections.list '{"limit":100}' | jq -r --arg n "$CLAUDE_COLLECTION" '.data[] | select(.name == $n) | .id' | head -n1)"
  if [[ -z "$found" ]]; then
    api collections.create "$(jq -n --arg n "$CLAUDE_COLLECTION" '{name: $n, description: "Was Claude ins Wiki schreibt, wenn keine andere Sammlung passt.", icon: "lightbulb", color: "#8B5CF6", permission: "read_write"}')" >/dev/null &&
      ok "Gemeinsame Sammlung '${CLAUDE_COLLECTION}' angelegt"
  fi
  current="$(api auth.info '{}' | jq -r '.data.team.guidanceMCP // empty')"
  if [[ -z "$current" || "$current" == *"mit deinem eigenen Konto"* ]]; then
    api team.update "$(jq -n --arg g "$(claude_guidance)" '{guidanceMCP: $g}')" >/dev/null &&
      ok "Anweisung für Claude im Wiki hinterlegt (Einstellungen → Künstliche Intelligenz)"
  else
    warn "Im Wiki steht schon eine eigene Anweisung für KI-Assistenten – nicht überschrieben."
  fi
}

cmd_claude() {
  local email key url link json="no"
  [[ "${1:-}" == "--json" ]] && json="yes"
  email="claude@$(wiki_host)"
  url="$(wiki_url)"
  create_user "Claude" "$email" member
  claude_workspace_setup
  key="$(conf_get CLAUDE_API_KEY)"
  if ! key_works "$key"; then
    key="$(create_api_key "$email" "Claude")"
    [[ -n "$key" ]] || fail "Schlüssel für Claude konnte nicht erstellt werden."
    conf_set CLAUDE_API_KEY "$key"
    ok "Schlüssel für Claude erstellt"
  fi
  link="$(brainbox-login link --raw "$email" 2>/dev/null || true)"
  if [[ "$json" == "yes" ]]; then
    jq -n --arg e "$email" --arg m "${url}/mcp" --arg k "$key" --arg l "$link" '{email: $e, mcpUrl: $m, apiKey: $k, loginLink: $l}'
    return 0
  fi
  cat <<EOF

  ${BOLD}Claude hat jetzt ein eigenes Konto im Wiki${CL}
  Name: Claude · E-Mail: ${email} · Rolle: Mitglied
  Alles, was Claude schreibt, steht unter 'Claude' – du siehst immer, was von wem ist.

  ${BOLD}1. In der Claude-App (claude.ai, Handy, Desktop)${CL}
     Braucht die HTTPS-Adresse (${url}) aus dem Internet erreichbar.
     a) Im Browser abmelden (oder privates Fenster) und als Claude anmelden:
        ${BL}${link:-brainbox-login link ${email}}${CL}
     b) In Claude: Einstellungen → Connectors → Benutzerdefinierten Connector hinzufügen
        Name: Brainbox · URL: ${BL}${url}/mcp${CL}
     c) 'Verbinden' → im Anmeldefenster 'Zulassen' (du bist dort als Claude angemeldet)

  ${BOLD}2. In Claude Code${CL}
     ${BL}claude mcp add --transport http brainbox ${url}/mcp --header "Authorization: Bearer ${key}"${CL}

  Den Schlüssel geheim halten. Neu anzeigen: brainbox-connect claude
  Abschalten: im Wiki unter Einstellungen → Benutzer → Claude sperren.

EOF
}

# --- Proxmox -----------------------------------------------------------------------
wt() { whiptail --backtitle "${APP} · Verbindungen" "$@" 3>&1 1>&2 2>&3; }

pve_json() { if [[ -f "$PVE_FILE" ]]; then cat "$PVE_FILE"; else echo "[]"; fi; }
pve_count() { pve_json | jq 'length'; }
pve_save() { # pve_save <JSON> – schreibt die Server-Liste (nur für root lesbar)
  local tmp
  tmp="$(mktemp "${PVE_FILE}.XXXX")"
  echo "$1" | jq '.' >"$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$PVE_FILE"
}
pve_name_from_url() { # https://pve.example.de:8006 → pve, https://192.168.1.2:8006 → proxmox-2
  local h
  h="$(echo "$1" | sed -E 's#^https?://##; s#[:/].*$##')"
  if [[ "$h" =~ ^[0-9.]+$ ]]; then echo "proxmox-${h##*.}"; else echo "${h%%.*}" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-'; fi
}
pve_migrate() { # früher gab es nur einen Server in connect.env – in die Liste übernehmen
  local url name
  url="$(conf_get PVE_URL)"
  [[ -n "$url" ]] || return 0
  name="$(conf_get PVE_NAME)"; [[ -n "$name" ]] || name="$(pve_name_from_url "$url")"
  if [[ "$(pve_json | jq --arg n "$name" 'map(select(.name == $n)) | length')" == "0" ]]; then
    pve_save "$(pve_json | jq --arg n "$name" --arg u "$url" --arg t "$(conf_get PVE_TOKEN_ID)" --arg s "$(conf_get PVE_TOKEN_SECRET)" \
      --arg c "$(conf_get PVE_CA_FILE)" --arg i "$(conf_get PVE_INSECURE)" '. + [{name: $n, url: $u, tokenId: $t, secret: $s, caFile: $c, insecure: ($i == "1" or $i == "yes")}]')"
  fi
  for k in PVE_URL PVE_TOKEN_ID PVE_TOKEN_SECRET PVE_CA_FILE PVE_INSECURE PVE_NAME; do conf_del "$k"; done
}

pve_add() { # pve_add NAME URL TOKEN-ID SECRET [--insecure]
  local name="${1:-}" url="${2:-}" tid="${3:-}" sec="${4:-}" insecure="false" ca="" before
  [[ "${5:-}" == "--insecure" ]] && insecure="true"
  name="$(echo "$name" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-')"
  [[ -n "$name" && -n "$url" && -n "$tid" && -n "$sec" ]] || fail "Beispiel: brainbox-connect proxmox add zuhause https://192.168.1.2:8006 'brainbox@pve!wiki' <secret>"
  [[ "$url" =~ ^https?:// ]] || url="https://${url}"
  [[ "$url" =~ :[0-9]+/?$ ]] || url="${url%/}:8006"
  [[ -f "${CONF_DIR}/pve-root-ca.pem" && "$insecure" == "false" ]] && ca="${CONF_DIR}/pve-root-ca.pem"
  pve_migrate
  before="$(pve_json)"
  pve_save "$(pve_json | jq --arg n "$name" --arg u "${url%/}" --arg t "$tid" --arg s "$sec" --arg c "$ca" --argjson i "$insecure" \
    'map(select(.name != $n)) + [{name: $n, url: $u, tokenId: $t, secret: $s, caFile: $c, insecure: $i}]')"
  if ! run_sync --test pve "$name"; then
    pve_save "$before"
    fail "Proxmox-Server '${name}' antwortet nicht wie erwartet – Adresse, Token und Zertifikat prüfen. Nichts gespeichert."
  fi
  ensure_bot
  enable_timer
  run_sync
  ok "Proxmox-Server '${name}' verbunden – seine VMs und Container stehen im Wiki (Sammlung 'Proxmox' → ${name})."
}

pve_remove() { # pve_remove NAME
  local name="${1:-}"
  [[ -n "$name" ]] || fail "Beispiel: brainbox-connect proxmox remove zuhause"
  pve_migrate
  [[ "$(pve_json | jq --arg n "$name" 'map(select(.name == $n)) | length')" != "0" ]] || fail "Kein Proxmox-Server '${name}'."
  pve_save "$(pve_json | jq --arg n "$name" 'map(select(.name != $n))')"
  ok "Proxmox-Server '${name}' entfernt – seine Einträge werden beim Abgleich archiviert (nicht gelöscht)."
  if [[ -n "$(conf_get OUTLINE_API_KEY)" ]]; then run_sync || true; fi
}

pve_list() {
  pve_migrate
  if [[ "$(pve_count)" == "0" ]]; then echo "  Noch kein Proxmox-Server verbunden – brainbox-connect proxmox add …"; return 0; fi
  pve_json | jq -r '.[] | "  \(.name)\t\(.url)\t\(.tokenId)\(if .insecure then "\t(Zertifikat ungeprüft)" else "" end)"' | column -t -s $'\t'
}

pve_menu() {
  command -v whiptail >/dev/null 2>&1 || { pve_list; return 0; }
  local choice name url tid sec ins gw items=()
  pve_migrate
  while :; do
    items=(neu "+ Proxmox-Server hinzufügen")
    while IFS=$'\t' read -r n u; do [[ -n "$n" ]] && items+=("$n" "$u"); done < <(pve_json | jq -r '.[] | "\(.name)\t\(.url)"')
    choice="$(wt --title "PROXMOX-SERVER" --cancel-button "Zurück" --menu "Verbundene Server – jeder bekommt im Wiki eine eigene Seite, seine VMs und Container hängen darunter.\nServer wählen zum Prüfen oder Entfernen." 20 76 10 "${items[@]}")" || return 0
    if [[ "$choice" == "neu" ]]; then
      gw="$(ip route 2>/dev/null | awk '/^default/ {print $3; exit}')"
      wt --title "NEUER PROXMOX-SERVER" --msgbox "Brainbox liest Proxmox nur (Rolle PVEAuditor).\n\nAuf dem neuen Proxmox-Host einmal ausführen:\n\n  pveum user add brainbox@pve\n  pveum acl modify / --users brainbox@pve --roles PVEAuditor\n  pveum user token add brainbox@pve wiki --privsep 0\n\nDie Ausgabe zeigt 'full-tokenid' und 'value' – die brauchst du gleich." 18 76 || true
      name="$(wt --title "NEUER PROXMOX-SERVER" --inputbox "Kurzer Name (z. B. zuhause, keller, hetzner)" 9 72)" || continue
      url="$(wt --title "NEUER PROXMOX-SERVER" --inputbox "Adresse" 9 72 "https://${gw:-192.168.1.2}:8006")" || continue
      tid="$(wt --title "NEUER PROXMOX-SERVER" --inputbox "Token-ID (full-tokenid)" 9 72 "brainbox@pve!wiki")" || continue
      sec="$(wt --title "NEUER PROXMOX-SERVER" --passwordbox "Token-Secret (value)" 9 72)" || continue
      ins=""
      wt --title "NEUER PROXMOX-SERVER" --yesno "Proxmox nutzt meist ein selbst ausgestelltes Zertifikat.\n\nZertifikat nicht prüfen? (Im Heimnetz üblich.)" 11 72 && ins="--insecure"
      clear; (pve_add "$name" "$url" "$tid" "$sec" $ins) || true; read -rp "  Weiter mit Enter … " _
    else
      if wt --title "SERVER ${choice}" --yes-button "Prüfen" --no-button "Entfernen" --yesno "Was soll mit '${choice}' passieren?" 9 60; then
        clear; (run_sync --test pve "$choice") || true; read -rp "  Weiter mit Enter … " _
      elif wt --title "SERVER ${choice}" --defaultno --yesno "'${choice}' wirklich entfernen? Seine Wiki-Einträge werden archiviert." 9 66; then
        clear; (pve_remove "$choice") || true; read -rp "  Weiter mit Enter … " _
      fi
    fi
  done
}

cmd_proxmox() {
  case "${1:-}" in
  "") pve_menu ;;
  add) shift; pve_add "$@" ;;
  remove | entfernen) shift; pve_remove "$@" ;;
  list | liste) pve_list ;;
  test) shift; pve_migrate; run_sync --test pve "$@" ;;
  --from-install)
    pve_migrate
    run_sync --test pve || fail "Proxmox antwortet nicht wie erwartet – Adresse, Token und Zertifikat prüfen."
    ensure_bot
    enable_timer
    run_sync
    ok "Proxmox verbunden – neue VMs und Container landen alle 5 Minuten automatisch im Wiki (Sammlung 'Proxmox')."
    ;;
  http* | *:*) pve_add "$(pve_name_from_url "$1")" "$@" ;; # alte Form: proxmox URL TOKEN-ID SECRET [--insecure]
  *) fail "Unbekannt: proxmox $1 (add, remove, list, test)" ;;
  esac
}

# --- NetBird -------------------------------------------------------------------------
cmd_netbird() {
  local url="${1:-}" tok="${2:-}"
  if [[ "$url" == "remove" || "$url" == "entfernen" ]]; then
    conf_del NETBIRD_URL; conf_del NETBIRD_TOKEN
    ok "NetBird getrennt – die NetBird-Einträge bleiben im Wiki stehen."
    return 0
  fi
  if [[ -z "$url" ]]; then
    command -v whiptail >/dev/null 2>&1 || fail "Beispiel: brainbox-connect netbird https://api.netbird.io <token>"
    url="$(wt --title "NETBIRD" --inputbox "Adresse der NetBird-API\n(NetBird Cloud: https://api.netbird.io, selbst gehostet: die Adresse deines NetBird-Servers)" 11 72 "$(conf_get NETBIRD_URL || true)")" || return 0
    [[ -n "$url" ]] || url="https://api.netbird.io"
    wt --title "NETBIRD" --msgbox "Token anlegen: im NetBird-Dashboard unter Team → Service Users einen Nutzer mit Rolle 'Admin' oder 'User' anlegen und dort ein Access Token erstellen.\n\n(Alternativ: eigenes Profil → Personal Access Tokens.)" 12 72 || true
    tok="$(wt --title "NETBIRD" --passwordbox "Access Token" 9 72)" || return 0
    [[ -n "$tok" ]] || tok="$(conf_get NETBIRD_TOKEN)"
  fi
  [[ "$url" =~ ^https?:// ]] || url="https://${url}"
  [[ -n "$tok" ]] || fail "Token fehlt."
  conf_set NETBIRD_URL "${url%/}"
  conf_set NETBIRD_TOKEN "$tok"
  ensure_bot
  run_sync --test netbird || fail "NetBird antwortet nicht wie erwartet – Adresse und Token prüfen."
  enable_timer
  run_sync
  ok "NetBird verbunden – Geräte, Netzwerke und Domains landen automatisch im Wiki (Sammlung 'NetBird')."
}

# --- Übersicht -------------------------------------------------------------------------
status() {
  local last t
  echo
  echo -e "  ${BOLD}Brainbox – Verbindungen${CL}"
  if user_exists "claude@$(wiki_host)"; then echo -e "  Claude:     ${GN}eigenes Konto${CL} (claude@$(wiki_host)) · MCP: $(wiki_url)/mcp"; else echo -e "  Claude:     ${YW}nicht eingerichtet${CL} – brainbox-connect claude"; fi
  pve_migrate
  if [[ "$(pve_count)" != "0" ]]; then echo -e "  Proxmox:    ${GN}$(pve_count) Server${CL} ($(pve_json | jq -r '[.[].name] | join(", ")'))"; else echo -e "  Proxmox:    ${YW}nicht verbunden${CL} – brainbox-connect proxmox add …"; fi
  if [[ -n "$(conf_get NETBIRD_URL)" ]]; then echo -e "  NetBird:    ${GN}verbunden${CL} ($(conf_get NETBIRD_URL))"; else echo -e "  NetBird:    ${YW}nicht verbunden${CL} – brainbox-connect netbird"; fi
  last="$(jq -r '.lastRun // empty' "$STATE" 2>/dev/null || true)"
  [[ -n "$last" ]] && echo -e "  Abgleich:   zuletzt $(date -d "$last" '+%d.%m.%Y %H:%M' 2>/dev/null || echo "$last")"
  t="$(systemctl is-active brainbox-sync.timer 2>/dev/null || true)"
  echo -e "  Zeitplan:   $([[ "$t" == "active" ]] && echo -e "${GN}alle 5 Minuten${CL}" || echo -e "${YW}aus${CL}")"
  echo
}

main_menu() {
  command -v whiptail >/dev/null 2>&1 || fail "whiptail fehlt (apt install whiptail)."
  local choice
  while :; do
    choice="$(wt --title "VERBINDUNGEN" --cancel-button "Fertig" --menu "Was möchtest du verbinden?" 17 72 5 \
      1 "Claude – eigenes Konto, schreibt mit ins Wiki" \
      2 "Proxmox-Server – $(pve_count) verbunden" \
      3 "NetBird – $([[ -n "$(conf_get NETBIRD_URL)" ]] && echo verbunden || echo aus)" \
      4 "Jetzt abgleichen" \
      5 "Übersicht anzeigen")" || break
    clear
    case "$choice" in
    1) (cmd_claude) || true ;;
    2) pve_menu; continue ;;
    3) (cmd_netbird) || true ;;
    4) (run_sync) || true ;;
    5) status ;;
    esac
    read -rp "  Weiter mit Enter … " _
  done
  clear
  status
}

case "${1:-}" in
"") main_menu ;;
claude) shift; cmd_claude "$@" ;;
proxmox) shift; cmd_proxmox "$@" ;;
netbird) shift; cmd_netbird "$@" ;;
sync) shift; run_sync "$@" ;;
status) status ;;
-h | --help | help) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//' ;;
*) fail "Unbekannter Befehl: $1 (siehe brainbox-connect --help)" ;;
esac
