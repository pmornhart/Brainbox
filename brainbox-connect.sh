#!/usr/bin/env bash
# ------------------------------------------------------------------------------
# Brainbox – Verbindungen (im Container: brainbox-connect)
#
#   brainbox-connect                  Menü: Claude, Proxmox, NetBird, GitHub, Abgleich
#   brainbox-connect claude [--json]  Claude über MCP verbinden (mit deiner Anmeldung): Anleitung
#   brainbox-connect proxmox          Proxmox-Server verwalten (Menü)
#   brainbox-connect proxmox add NAME URL TOKEN-ID SECRET [--insecure]
#                                     weiteren Proxmox-Server verbinden (beliebig viele)
#   brainbox-connect proxmox agent NAME
#                                     Server an anderem Standort: meldet sich selbst (Befehl für dort)
#   brainbox-connect proxmox rename ALT NEU
#                                     Namen ändern – die Wiki-Seiten werden mit umbenannt
#   brainbox-connect proxmox remove NAME | list | test [NAME]
#   brainbox-connect netbird [URL TOKEN] | netbird remove
#                                     NetBird verbinden: Geräte, Netzwerke und Domains ins Wiki
#   brainbox-connect github [TOKEN] [--owners a,b] [--forks] [--archived] | github remove | github test
#                                     GitHub verbinden: je Repo eine Seite (was drin ist, installieren),
#                                     Herkunft bei jeder VM; ohne Token nur öffentliche Repos der Konten
#   brainbox-connect sync             jetzt abgleichen (läuft sonst alle 5 Minuten)
#   brainbox-connect status           zeigt, was verbunden ist
#   brainbox-connect start            Anleitung im Wiki und Abgleich einrichten
#                                     (ruft die Installation und update auf)
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
AGENT_DIR="/var/lib/brainbox/agent"
SYNC_LOCK="/run/brainbox-sync.lock"
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
  flock -n -E 75 "$SYNC_LOCK" env BRAINBOX_CONNECT_ENV="$CONF" BRAINBOX_CONNECT_STATE="$STATE" node "$SYNC" "$@" || rc=$?
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

# --- Start: Anleitung, Abgleich, Reihenfolge der Sammlungen ------------------------------
wait_core() { # wait_core – wartet bis zu 3 Minuten, bis das Wiki antwortet
  for _ in $(seq 1 90); do
    [[ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/_health" || true)" == "200" ]] && return 0
    sleep 2
  done
  return 1
}

order_collections() { # einmalig: Start, Bereiche, Proxmox, NetBird, Von Claude oben in dieser Reihenfolge
  local flag=/var/lib/brainbox/sammlungen-sortiert list name id idx=0
  [[ -f "$flag" ]] && return 0
  session "$(first_admin)"
  list="$(api collections.list '{"limit":100}')" || return 0
  for name in "Start" "Bereiche" "Proxmox" "NetBird" "$CLAUDE_COLLECTION"; do
    id="$(jq -r --arg n "$name" '.data[] | select(.name == $n) | .id' <<<"$list" | head -n1)"
    if [[ -n "$id" ]]; then api collections.move "$(jq -n --arg id "$id" --arg i "a${idx}" '{id: $id, index: $i}')" >/dev/null || true; fi
    idx=$((idx + 1))
  done
  mkdir -p "$(dirname "$flag")"
  : >"$flag"
}

cmd_start() {
  if ! wait_core; then
    warn "Das Wiki antwortet noch nicht – die Anleitung kommt beim nächsten Abgleich."
    return 0
  fi
  ensure_bot
  enable_timer
  run_sync "$@" || warn "Abgleich hat nicht geklappt – später: brainbox-connect sync"
  order_collections
  claude_workspace_setup >/dev/null 2>&1 || true
  ok "Anleitung im Wiki (Sammlung 'Start') und Abgleich alle 5 Minuten eingerichtet"
}

# --- Claude ------------------------------------------------------------------------
CLAUDE_COLLECTION="Von Claude"

claude_workspace_setup() { # gemeinsame Sammlung "Von Claude"; alte Konto-Anweisung entfernen (als Admin)
  local found current
  session "$(first_admin)"
  found="$(api collections.list '{"limit":100}' | jq -r --arg n "$CLAUDE_COLLECTION" '.data[] | select(.name == $n) | .id' | head -n1)"
  if [[ -z "$found" ]]; then
    api collections.create "$(jq -n --arg n "$CLAUDE_COLLECTION" '{name: $n, description: "Was Claude ins Wiki schreibt, wenn keine andere Sammlung passt.", icon: "lightbulb", color: "#8B5CF6", permission: "read_write", index: "a4"}')" >/dev/null &&
      ok "Gemeinsame Sammlung '${CLAUDE_COLLECTION}' angelegt"
  fi
  # Früher bekam Claude ein eigenes Konto und dazu eine Anweisung. Heute arbeitet Claude mit der Anmeldung
  # der Person, und die Beschreibung von Brainbox steckt im MCP-Anschluss selbst.
  current="$(api auth.info '{}' | jq -r '.data.team.guidanceMCP // empty')"
  if [[ "$current" == *"mit deinem eigenen Konto"* ]]; then
    api team.update '{"guidanceMCP": null}' >/dev/null && ok "Alte Anweisung für das Claude-Konto entfernt"
  fi
}

cmd_claude() { # Claude verbindet sich über MCP mit der eigenen Anmeldung – kein eigenes Konto mehr
  local url
  url="$(wiki_url)"; url="${url%/}"
  claude_workspace_setup >/dev/null 2>&1 || true
  if [[ "${1:-}" == "--json" ]]; then
    jq -n --arg m "${url}/mcp" '{mcpUrl: $m}'
    return 0
  fi
  cat <<EOF

  ${BOLD}Claude arbeitet mit deiner Anmeldung${CL} – ohne eigenes Konto.
  Claude sucht, liest und schreibt im Wiki und bedient Brainbox (nur für Admins):
  Proxmox-Server hinzufügen und umbenennen, NetBird, Abgleich, Update.
  Einstellungen dazu im Wiki: Einstellungen → Brainbox → Künstliche Intelligenz.

  ${BOLD}1. In der Claude-App (claude.ai, Desktop, Handy)${CL}
     Braucht die HTTPS-Adresse (${url}) aus dem Internet erreichbar.
     Einstellungen → Connectors → Benutzerdefinierten Connector hinzufügen
     Name: Brainbox · URL: ${BL}${url}/mcp${CL}
     'Verbinden' → im Brainbox-Fenster mit deinem Konto anmelden → 'Zulassen'

  ${BOLD}2. In Claude Code${CL}
     ${BL}claude mcp add --transport http brainbox ${url}/mcp${CL}
     danach in Claude Code: /mcp → brainbox → anmelden

EOF
  if user_exists "claude@$(wiki_host)"; then
    warn "Das alte Konto 'Claude' (claude@$(wiki_host)) braucht es nicht mehr – im Wiki unter Einstellungen → Wiki → Mitglieder sperren."
  fi
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
  name="$(pve_clean_name "$name")"
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
  rm -f "$(agent_file "$name")"
  ok "Proxmox-Server '${name}' entfernt – seine Einträge werden beim Abgleich archiviert (nicht gelöscht)."
  if [[ -n "$(conf_get OUTLINE_API_KEY)" ]]; then run_sync || true; fi
}

# Servernamen sind frei wählbar (Punkte, Leerzeichen, Großbuchstaben, Umlaute …): nur Steuerzeichen raus,
# Leerraum vorne und hinten weg, höchstens 100 Zeichen
pve_clean_name() {
  local n
  n="$(printf '%s' "${1:-}" | tr -d '\000-\037\177')"
  n="${n#"${n%%[![:space:]]*}"}"
  n="${n%"${n##*[![:space:]]}"}"
  printf '%s' "${n:0:100}"
}
# Datei der letzten Agent-Meldung – Name kodiert wie in Zentrale und Abgleich (jq @uri)
agent_file() { printf '%s/%s.json' "$AGENT_DIR" "$(jq -rn --arg n "$1" '$n | @uri')"; }
pve_has() { [[ "$(pve_json | jq --arg n "$1" 'map(select(.name == $n)) | length')" != "0" ]]; }

pve_agent() { # pve_agent NAME [--raw] – Server an anderem Standort: meldet sich selbst über den Brainbox-Agenten
  local name url token hash cmd public="yes" raw="${2:-}"
  name="$(pve_clean_name "${1:-}")"
  [[ -n "$name" ]] || fail "Beispiel: brainbox-connect proxmox agent standort-2"
  url="$(wiki_url)"; url="${url%/}"
  [[ -n "$url" ]] || fail "Wiki-Adresse fehlt (URL in ${ENV_FILE})."
  pve_migrate
  if pve_has "$name" && [[ "$(pve_json | jq -r --arg n "$name" '.[] | select(.name == $n) | .mode // "api"')" != "agent" ]]; then
    fail "'${name}' ist schon direkt verbunden – anderen Namen wählen oder den Server erst entfernen."
  fi
  token="$(od -An -tx1 -N24 /dev/urandom | tr -d ' \n')"
  hash="$(printf '%s' "$token" | sha256sum | awk '{print $1}')"
  pve_save "$(pve_json | jq --arg n "$name" --arg h "$hash" --arg d "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    'map(select(.name != $n)) + [{name: $n, mode: "agent", tokenHash: $h, createdAt: $d}]')"
  ensure_bot >/dev/null 2>&1 || true
  enable_timer >/dev/null 2>&1 || true
  cmd="curl -fsSL ${url}/zentrale/agent.sh | bash -s -- install ${url} ${token}"
  [[ "$url" =~ ^https?://(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|127\.|localhost) ]] && public="no"
  if [[ "$raw" == "--raw" ]]; then
    jq -nc --arg n "$name" --arg c "$cmd" --arg u "$url" --arg p "$public" '{name: $n, command: $c, url: $u, public: ($p == "yes")}'
    return 0
  fi
  ok "Server '${name}' angelegt. Jetzt auf dem Proxmox-Host am anderen Standort (Datacenter → Node → Shell) einmal ausführen:"
  echo -e "\n     ${BL}${cmd}${CL}\n"
  echo "  Der Agent liest dort alle 5 Minuten VMs und Container (nur lesend) und meldet sie an ${url}."
  [[ "$public" == "yes" ]] || warn "${url} ist nur im Heimnetz erreichbar – der andere Standort braucht eine Adresse, die er erreicht (z. B. über den Reverse-Proxy)."
  echo "  Neuer Befehl (alter Token wird ungültig): brainbox-connect proxmox agent ${name}"
}

pve_rename() { # pve_rename ALT NEU – Namen ändern; Wiki-Seiten werden mit umbenannt, nicht neu angelegt
  local old new tmp
  old="${1:-}"; new="$(pve_clean_name "${2:-}")"
  [[ -n "$old" && -n "$new" ]] || fail "Beispiel: brainbox-connect proxmox rename proxmox-2 zuhause"
  pve_migrate
  pve_has "$old" || fail "Kein Proxmox-Server '${old}'."
  if [[ "$old" == "$new" ]]; then ok "Der Server heißt schon '${new}'."; return 0; fi
  ! pve_has "$new" || fail "Es gibt schon einen Proxmox-Server '${new}'."
  # unter der Sperre des Abgleichs, damit ein gerade laufender Abgleich nichts zurückschreibt
  (
    flock -w 300 9 || exit 75
    pve_save "$(pve_json | jq --arg o "$old" --arg n "$new" 'map(if .name == $o then .name = $n else . end)')"
    if [[ -f "$STATE" ]]; then
      tmp="$(mktemp "${STATE}.XXXX")"
      jq --arg o "$old" --arg n "$new" '.docs |= with_entries(
        if .key == ("pvesrv:" + $o) then .key = ("pvesrv:" + $n)
        elif (.key | startswith("pve:" + $o + ":")) and (.key | ltrimstr("pve:" + $o + ":") | test("^[0-9]+$")) then .key = ("pve:" + $n + ":" + (.key | ltrimstr("pve:" + $o + ":")))
        else . end)' "$STATE" >"$tmp" && chmod --reference="$STATE" "$tmp" && mv "$tmp" "$STATE"
    fi
    if [[ -f "$(agent_file "$old")" ]]; then mv "$(agent_file "$old")" "$(agent_file "$new")"; fi
  ) 9>"$SYNC_LOCK" || fail "Der Abgleich läuft gerade – bitte gleich nochmal versuchen."
  ok "Proxmox-Server '${old}' heißt jetzt '${new}'."
  if [[ -n "$(conf_get OUTLINE_API_KEY)" ]]; then run_sync || true; fi
}

pve_list() {
  pve_migrate
  if [[ "$(pve_count)" == "0" ]]; then echo "  Noch kein Proxmox-Server verbunden – brainbox-connect proxmox add …"; return 0; fi
  pve_json | jq -r '.[] | if .mode == "agent" then "  \(.name)\tmeldet sich selbst (Brainbox-Agent)" else "  \(.name)\t\(.url)\t\(.tokenId)\(if .insecure then "\t(Zertifikat ungeprüft)" else "" end)" end' | awk -F'\t' '{ printf "%-18s", $1; for (i = 2; i <= NF; i++) printf "  %s", $i; print "" }'
}

pve_menu() {
  command -v whiptail >/dev/null 2>&1 || { pve_list; return 0; }
  local choice name url tid sec ins gw items=()
  pve_migrate
  while :; do
    items=(neu "+ Proxmox-Server im selben Netz" fern "+ Proxmox-Server an anderem Standort")
    while IFS=$'\t' read -r n u; do [[ -n "$n" ]] && items+=("$n" "$u"); done < <(pve_json | jq -r '.[] | "\(.name)\t\(if .mode == "agent" then "meldet sich selbst" else .url end)"')
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
    elif [[ "$choice" == "fern" ]]; then
      name="$(wt --title "PROXMOX AN ANDEREM STANDORT" --inputbox "Brainbox kommt an diesen Server nicht heran – er meldet sich selbst.\n\nKurzer Name (z. B. standort-2, hetzner)" 12 72)" || continue
      clear; (pve_agent "$name") || true; read -rp "  Weiter mit Enter … " _
    else
      local what
      what="$(wt --title "SERVER ${choice}" --cancel-button "Zurück" --menu "Was soll mit '${choice}' passieren?" 14 66 4 \
        pruefen "Verbindung prüfen" umbenennen "Namen ändern" befehl "Neuer Agent-Befehl (nur bei Standort-Servern)" entfernen "Entfernen")" || continue
      case "$what" in
      pruefen) clear; (run_sync --test pve "$choice") || true; read -rp "  Weiter mit Enter … " _ ;;
      umbenennen)
        name="$(wt --title "SERVER ${choice}" --inputbox "Neuer Name (frei wählbar, z. B. ph.morn.lan oder Zuhause Keller)" 9 66 "$choice")" || continue
        clear; (pve_rename "$choice" "$name") || true; read -rp "  Weiter mit Enter … " _ ;;
      befehl) clear; (pve_agent "$choice") || true; read -rp "  Weiter mit Enter … " _ ;;
      entfernen)
        if wt --title "SERVER ${choice}" --defaultno --yesno "'${choice}' wirklich entfernen? Seine Wiki-Einträge werden archiviert." 9 66; then
          clear; (pve_remove "$choice") || true; read -rp "  Weiter mit Enter … " _
        fi ;;
      esac
    fi
  done
}

cmd_proxmox() {
  case "${1:-}" in
  "") pve_menu ;;
  add) shift; pve_add "$@" ;;
  remove | entfernen) shift; pve_remove "$@" ;;
  agent | standort) shift; pve_agent "$@" ;;
  rename | umbenennen) shift; pve_rename "$@" ;;
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
  *) fail "Unbekannt: proxmox $1 (add, agent, rename, remove, list, test)" ;;
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
    wt --title "NETBIRD" --msgbox "Token anlegen: im NetBird-Dashboard unter Team → Service Users einen Nutzer mit Rolle 'Admin' anlegen und dort ein Access Token erstellen. ('User' reicht für Geräte, aber nicht für die Domains vom Reverse-Proxy. Brainbox liest nur.)\n\n(Alternativ: eigenes Profil → Personal Access Tokens.)" 12 72 || true
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

# --- GitHub -------------------------------------------------------------------------
# brainbox-connect github [TOKEN] [--owners a,b] [--forks|--no-forks] [--archived|--no-archived]
#   Ohne TOKEN bleibt ein schon eingetragener Token; nur --owners ohne Token = nur öffentliche Repos.
cmd_github() {
  local tok="" owners="" oset="no" forks="" archived="" keep="yes" a
  case "${1:-}" in
  remove | entfernen | trennen)
    conf_del GITHUB_TOKEN; conf_del GITHUB_OWNERS; conf_del GITHUB_FORKS; conf_del GITHUB_ARCHIVED
    ok "GitHub getrennt – die Repo-Seiten bleiben im Wiki stehen."
    return 0 ;;
  test | pruefen)
    run_sync --test github
    return $? ;;
  esac
  if [[ $# -eq 0 ]]; then
    command -v whiptail >/dev/null 2>&1 || fail "Beispiel: brainbox-connect github github_pat_… (Token nur lesend) oder brainbox-connect github --owners pmornhart"
    wt --title "GITHUB" --msgbox "Token anlegen (nur lesen): github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.\n\nRepository access: All repositories\nPermissions → Repository: Contents = Read-only (Metadata kommt automatisch)\n\nOhne Token holt Brainbox nur die öffentlichen Repos der Konten, die du gleich einträgst." 16 76 || true
    tok="$(wt --title "GITHUB" --passwordbox "Token (leer lassen = bisheriger bzw. ohne Token)" 9 76)" || return 0
    owners="$(wt --title "GITHUB" --inputbox "Nur diese Konten/Organisationen (mit Komma; leer = alle, die der Token sieht)" 10 76 "$(conf_get GITHUB_OWNERS || true)")" || return 0
    oset="yes"
  else
    while [[ $# -gt 0 ]]; do
      a="$1"; shift
      case "$a" in
      --owners | --konten) owners="${1:-}"; oset="yes"; shift || true ;;
      --forks) forks="1" ;;
      --no-forks) forks="0" ;;
      --archived | --archiviert) archived="1" ;;
      --no-archived) archived="0" ;;
      --no-token | --ohne-token) keep="no" ;;
      -*) fail "Unbekannte Option: ${a}" ;;
      *) tok="$a" ;;
      esac
    done
  fi
  owners="$(printf '%s' "$owners" | tr ' ;' ',,' | tr -s ',' | sed 's/^,//; s/,$//')"
  [[ -z "$tok" || "$tok" =~ ^[A-Za-z0-9_]{20,255}$ ]] || fail "Das sieht nicht wie ein GitHub-Token aus (ghp_… oder github_pat_…)."
  [[ -z "$owners" || "$owners" =~ ^[A-Za-z0-9-]+(,[A-Za-z0-9-]+)*$ ]] || fail "Konten bitte nur mit Komma trennen, z. B. pmornhart,Morni-Team"
  if [[ -n "$tok" ]]; then conf_set GITHUB_TOKEN "$tok"; elif [[ "$keep" == "no" ]]; then conf_del GITHUB_TOKEN; fi
  if [[ -n "$owners" ]]; then conf_set GITHUB_OWNERS "$owners"; elif [[ "$oset" == "yes" ]]; then conf_del GITHUB_OWNERS; fi
  [[ -n "$forks" ]] && conf_set GITHUB_FORKS "$forks"
  [[ -n "$archived" ]] && conf_set GITHUB_ARCHIVED "$archived"
  [[ -n "$(conf_get GITHUB_TOKEN)" || -n "$(conf_get GITHUB_OWNERS)" ]] || fail "Token oder Konto fehlt – z. B. brainbox-connect github --owners pmornhart"
  ensure_bot
  run_sync --test github || fail "GitHub antwortet nicht wie erwartet – Token bzw. Kontoname prüfen."
  enable_timer
  run_sync
  ok "GitHub verbunden – je Repo eine Seite in der Sammlung 'GitHub', die Herkunft steht bei jeder VM."
}

# --- Übersicht -------------------------------------------------------------------------
status() {
  local last t
  echo
  echo -e "  ${BOLD}Brainbox – Verbindungen${CL}"
  echo -e "  Claude:     über MCP mit deiner Anmeldung · $(wiki_url)/mcp (brainbox-connect claude)"
  pve_migrate
  if [[ "$(pve_count)" != "0" ]]; then echo -e "  Proxmox:    ${GN}$(pve_count) Server${CL} ($(pve_json | jq -r '[.[].name] | join(", ")'))"; else echo -e "  Proxmox:    ${YW}nicht verbunden${CL} – brainbox-connect proxmox add …"; fi
  if [[ -n "$(conf_get NETBIRD_URL)" ]]; then echo -e "  NetBird:    ${GN}verbunden${CL} ($(conf_get NETBIRD_URL))"; else echo -e "  NetBird:    ${YW}nicht verbunden${CL} – brainbox-connect netbird"; fi
  if [[ -n "$(conf_get GITHUB_TOKEN)" || -n "$(conf_get GITHUB_OWNERS)" ]]; then
    echo -e "  GitHub:     ${GN}verbunden${CL} ($([[ -n "$(conf_get GITHUB_TOKEN)" ]] && echo "Token, nur lesen" || echo "nur öffentliche Repos")$([[ -n "$(conf_get GITHUB_OWNERS)" ]] && echo " · $(conf_get GITHUB_OWNERS)"))"
  else echo -e "  GitHub:     ${YW}nicht verbunden${CL} – brainbox-connect github"; fi
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
    choice="$(wt --title "VERBINDUNGEN" --cancel-button "Fertig" --menu "Was möchtest du verbinden?" 18 72 6 \
      1 "Claude – über MCP mit deiner Anmeldung" \
      2 "Proxmox-Server – $(pve_count) verbunden" \
      3 "NetBird – $([[ -n "$(conf_get NETBIRD_URL)" ]] && echo verbunden || echo aus)" \
      4 "GitHub – $([[ -n "$(conf_get GITHUB_TOKEN)$(conf_get GITHUB_OWNERS)" ]] && echo verbunden || echo aus)" \
      5 "Jetzt abgleichen" \
      6 "Übersicht anzeigen")" || break
    clear
    case "$choice" in
    1) (cmd_claude) || true ;;
    2) pve_menu; continue ;;
    3) (cmd_netbird) || true ;;
    4) (cmd_github) || true ;;
    5) (run_sync) || true ;;
    6) status ;;
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
github) shift; cmd_github "$@" ;;
sync) shift; run_sync "$@" ;;
start) shift; cmd_start "$@" ;;
status) status ;;
-h | --help | help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//' ;;
*) fail "Unbekannter Befehl: $1 (siehe brainbox-connect --help)" ;;
esac
