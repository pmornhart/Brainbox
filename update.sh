#!/usr/bin/env bash
# ------------------------------------------------------------------------------
# Brainbox – Update (im Container einfach "update" oder "brainbox-update" eingeben,
# vom Proxmox-Host aus: pct exec <CTID> -- update)
# Holt die neueste Brainbox-Version (Bausatz + dazu getesteter Outline-Kern),
# wendet das Brainbox-Design an, baut neu und startet Wiki und Zentrale.
# Vorher wird die Datenbank gesichert; schlägt der Build fehl, wird die alte
# Version zurückgespielt (wenn genug Speicher frei ist).
#
#   update            aktualisieren, falls es eine neue Version gibt
#   update --check    nur prüfen (Exit 0 = aktuell, 10 = Update verfügbar)
#   update --force    auch bei gleicher Version neu bauen
#
# Nachbau der update_script()-Funktion aus community-scripts/ProxmoxVE
# ct/outline.sh (MIT). Lizenz: MIT, siehe LICENSE.
# ------------------------------------------------------------------------------
set -Eeuo pipefail

APP="Brainbox"
REPO="pmornhart/Brainbox"
BRANCH="${BRAINBOX_BRANCH:-main}"
RAW="${BRAINBOX_RAW:-https://raw.githubusercontent.com/${REPO}/${BRANCH}}"

APP_DIR="/opt/brainbox"
OLD_DIR="/opt/brainbox.old"
KIT_DIR="/opt/brainbox-kit"
NEW_KIT="/opt/brainbox-kit.new"
KIT_URL="${BRAINBOX_KIT_URL:-https://codeload.github.com/${REPO}/tar.gz/refs/heads/${BRANCH}}"
SERVICE="brainbox"
VERSION_FILE="/root/.brainbox"
BACKUP_DIR="/root/brainbox-backups"
LOG="/root/brainbox-update.log"

NODE_MAJOR="26"
PG_DB_NAME="outline"
MIN_RAM_MB="4096"
ROLLBACK_MIN_FREE_MB="4500"
OUTLINE_REPO="${BRAINBOX_OUTLINE_REPO:-outline/outline}"
GITHUB="${BRAINBOX_GITHUB:-https://github.com}"
OUTLINE_VERSION="${BRAINBOX_OUTLINE_VERSION:-}" # leer = der zur Brainbox-Version passende Kern

VERBOSE="${BRAINBOX_VERBOSE:-no}"
FORCE="no"
CHECK_ONLY="no"
for arg in "$@"; do
  case "$arg" in
  --force) FORCE="yes" ;;
  --check) CHECK_ONLY="yes" ;;
  --verbose | -v) VERBOSE="yes" ;;
  -h | --help) sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) echo "Unbekannte Option: $arg (siehe update --help)"; exit 1 ;;
  esac
done

# --- Ausgabe ------------------------------------------------------------------
YW=$'\033[33m'; GN=$'\033[1;92m'; RD=$'\033[01;31m'; CL=$'\033[m'
TAB="  "; CM="${TAB}✔️${TAB}"; CROSS="${TAB}✖️${TAB}"; INFO="${TAB}💡${TAB}"; HOLD="${TAB}⏳${TAB}"
CURRENT_MSG=""
ROLLBACK_READY="no"
SERVICE_STOPPED="no"
APP_REPLACED="no"

msg_info() {
  CURRENT_MSG="$1"
  if [[ "$VERBOSE" == "yes" ]]; then echo -e "${HOLD}${YW}$1${CL}"; else printf '%s%s%s...%s' "$HOLD" "$YW" "$1" "$CL"; fi
}
msg_ok() { printf '\r\033[K%s%s%s%s\n' "$CM" "$GN" "$1" "$CL"; CURRENT_MSG=""; }
msg_warn() { printf '\r\033[K%s%s%s%s\n' "$INFO" "$YW" "$1" "$CL"; }
msg_error() { printf '\r\033[K%s%s%s%s\n' "$CROSS" "$RD" "$1" "$CL"; }

silent() { "$@" >>"$LOG" 2>&1; }
if [[ "$VERBOSE" == "yes" ]]; then STD=""; else STD="silent"; fi

rollback() {
  msg_info "Alte Version wird zurückgespielt"
  rm -rf "$APP_DIR" "$NEW_KIT"
  mv "$OLD_DIR" "$APP_DIR"
  systemctl start "$SERVICE" || true
  msg_ok "Alte Version läuft wieder (Brainbox ${CUR_BB:-?})"
}

error_handler() {
  local code=$? line=$1 cmd=$2
  trap - ERR
  msg_error "Fehler (Code ${code}) in Zeile ${line}: ${cmd}"
  [[ -n "$CURRENT_MSG" ]] && echo -e "${TAB}${TAB}bei: ${CURRENT_MSG}"
  if [[ -s "$LOG" && "$VERBOSE" != "yes" ]]; then
    echo -e "${TAB}${TAB}Letzte Zeilen aus ${LOG}:"
    tail -n 20 "$LOG" | sed "s/^/${TAB}${TAB}  /"
  fi
  if [[ "$ROLLBACK_READY" == "yes" && -d "$OLD_DIR" ]]; then
    rollback
  elif [[ "$APP_REPLACED" == "no" && "$SERVICE_STOPPED" == "yes" ]]; then
    # Alte Installation ist noch unverändert – einfach wieder starten
    systemctl start "$SERVICE" || true
    echo -e "${INFO}${YW}Nichts geändert, ${APP} läuft weiter mit Version ${CUR_BB:-?}.${CL}"
  elif [[ -n "${NEW_BB:-}" ]]; then
    echo -e "${INFO}${YW}Kein Rollback möglich. Erneut versuchen mit: update --force${CL}"
    echo -e "${INFO}${YW}Datenbank-Sicherung liegt in ${BACKUP_DIR}${CL}"
  fi
  exit "$code"
}
trap 'error_handler $LINENO "$BASH_COMMAND"' ERR

latest_outline_tag() {
  local tag=""
  tag="$(curl -fsSL "https://api.github.com/repos/${OUTLINE_REPO}/releases/latest" 2>/dev/null | jq -r '.tag_name // empty' 2>/dev/null || true)"
  if [[ -z "$tag" ]]; then
    tag="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "${GITHUB}/${OUTLINE_REPO}/releases/latest" 2>/dev/null | sed -n 's#.*/tag/##p' || true)"
  fi
  [[ -n "$tag" ]] || return 1
  echo "$tag"
}

deploy_outline() {
  local target="$1" tag="$2" tmp
  tmp="$(mktemp -d)"
  curl -fsSL --retry 3 "${GITHUB}/${OUTLINE_REPO}/archive/refs/tags/${tag}.tar.gz" -o "${tmp}/outline.tar.gz"
  rm -rf "$target"
  mkdir -p "$target"
  tar -xzf "${tmp}/outline.tar.gz" -C "$target" --strip-components=1
  rm -rf "$tmp"
}

ensure_nodejs() {
  local current
  current="$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || true)"
  if [[ "$current" != "$NODE_MAJOR" ]]; then
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" >/etc/apt/sources.list.d/nodesource.list
    $STD apt-get update
    $STD env DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
  else
    $STD apt-get update
    $STD env DEBIAN_FRONTEND=noninteractive apt-get install -y --only-upgrade nodejs || true
  fi
  $STD npm install -g corepack@latest
  $STD corepack enable
}

# --- Selbst-Update: immer mit der neuesten Version dieses Skripts arbeiten -----
self_update() {
  [[ -n "${BRAINBOX_SELF_UPDATED:-}" ]] && return 0
  local tmp
  tmp="$(mktemp)"
  if curl -fsSL "${RAW}/update.sh" -o "$tmp" 2>/dev/null && bash -n "$tmp" 2>/dev/null && [[ -s "$tmp" ]]; then
    if ! cmp -s "$tmp" /usr/bin/update; then
      install -m 755 "$tmp" /usr/bin/update
      rm -f "$tmp"
      msg_ok "Update-Skript aktualisiert"
      BRAINBOX_SELF_UPDATED=1 exec /usr/bin/update "$@"
    fi
  fi
  rm -f "$tmp"
}

# --- Von der Webseite gestartet? Dann als eigener Dienst weiterlaufen -----------------
# Die Zentrale startet „update“ als ihren Unterprozess. Startet das Update am Ende die Zentrale neu,
# beendet systemd alle ihre Prozesse – auch dieses Update, kurz bevor es die neue Version einträgt.
# Deshalb zieht es hier in eine eigene systemd-Einheit um; die Ausgabe landet im selben Protokoll.
detach_from_zentrale() {
  [[ -z "${BRAINBOX_DETACHED:-}" ]] || return 0
  grep -q "brainbox-zentrale.service" /proc/self/cgroup 2>/dev/null || return 0
  command -v systemd-run >/dev/null 2>&1 && [[ -d /run/systemd/system ]] || return 0
  local out var envs=()
  out="$(readlink -f "/proc/$$/fd/1" 2>/dev/null || true)"
  [[ -f "$out" ]] || out="/var/log/brainbox-update-zentrale.log"
  while IFS= read -r var; do envs+=("--setenv=${var}=${!var}"); done < <(compgen -e | grep '^BRAINBOX_' || true)
  if systemd-run --quiet --collect --unit "brainbox-update-$(date +%s)" \
    -p "StandardOutput=append:${out}" -p "StandardError=append:${out}" \
    --setenv=BRAINBOX_DETACHED=1 --setenv=BRAINBOX_SELF_UPDATED=1 --setenv=TERM=dumb "${envs[@]}" \
    /usr/bin/update "$@"; then
    echo "Update läuft als eigener Dienst weiter."
    exit 0
  fi
}

# --- Brainbox-Bausatz und Versionen ---------------------------------------------------
fetch_kit() { # fetch_kit <Zielordner>
  local dst="$1" tmp
  rm -rf "$dst"
  mkdir -p "$dst"
  if [[ -n "${BRAINBOX_KIT_DIR:-}" && -d "${BRAINBOX_KIT_DIR}" ]]; then
    cp -a "${BRAINBOX_KIT_DIR}/." "$dst/"
  else
    tmp="$(mktemp)"
    curl -fsSL --retry 3 "$KIT_URL" -o "$tmp"
    tar -xzf "$tmp" -C "$dst" --strip-components=1
    rm -f "$tmp"
  fi
  rm -rf "$dst/.git"
  [[ -f "$dst/brainbox.version" ]]
}
kit_value() { sed -n "s/^$2=//p" "$1/brainbox.version" | head -n1; }
installed_value() { # früher stand in /root/.brainbox nur die Outline-Version
  if grep -q "=" "$VERSION_FILE" 2>/dev/null; then sed -n "s/^$1=//p" "$VERSION_FILE" | head -n1
  elif [[ "$1" == "OUTLINE_CORE" ]]; then head -n1 "$VERSION_FILE" 2>/dev/null || true; fi
}
install_kit() { # neuen Bausatz übernehmen und Befehle, Abgleich, Zentrale einrichten
  rm -rf "${KIT_DIR}.old"
  [[ -d "$KIT_DIR" ]] && mv "$KIT_DIR" "${KIT_DIR}.old"
  mv "$NEW_KIT" "$KIT_DIR"
  rm -rf "${KIT_DIR}.old"
  $STD bash "${KIT_DIR}/teile-einrichten.sh"
}

# --- Ablauf -----------------------------------------------------------------------
[[ $EUID -eq 0 ]] || { msg_error "Bitte als root ausführen."; exit 1; }
if [[ ! -d "$APP_DIR" ]]; then
  msg_error "Keine ${APP}-Installation gefunden (${APP_DIR} fehlt)."
  exit 1
fi
: >"$LOG"

self_update "$@"
[[ "$CHECK_ONLY" == "yes" ]] || detach_from_zentrale "$@"

msg_info "Neueste Brainbox-Version wird geholt"
fetch_kit "$NEW_KIT" || { msg_error "Brainbox-Bausatz nicht ladbar (GitHub erreichbar?)"; rm -rf "$NEW_KIT"; exit 1; }
NEW_BB="$(kit_value "$NEW_KIT" BRAINBOX_VERSION)"
NEW_CORE="${OUTLINE_VERSION:-$(kit_value "$NEW_KIT" OUTLINE_CORE)}"
if [[ -z "$NEW_CORE" ]]; then NEW_CORE="$(latest_outline_tag)" || { msg_error "Version des Wiki-Kerns nicht ermittelbar"; exit 1; }; fi
msg_ok "Neueste Version: Brainbox ${NEW_BB} (Kern ${NEW_CORE#v})"
# für Zentrale, Wiki-Seitenleiste und Begrüßung im Terminal
mkdir -p /var/lib/brainbox
printf '{"latest":"%s","latestCore":"%s","checkedAt":"%s","error":null}\n' "$NEW_BB" "$NEW_CORE" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >/var/lib/brainbox/update.json
CUR_BB="$(installed_value BRAINBOX_VERSION)"; CUR_BB="${CUR_BB:-vor 1.0}"
CUR_CORE="$(installed_value OUTLINE_CORE)"; CUR_CORE="${CUR_CORE:-unbekannt}"
CURRENT="$CUR_CORE"
UP_TO_DATE="no"
[[ "$CUR_BB" == "$NEW_BB" && "$CUR_CORE" == "$NEW_CORE" ]] && UP_TO_DATE="yes"

if [[ "$CHECK_ONLY" == "yes" ]]; then
  rm -rf "$NEW_KIT"
  if [[ "$UP_TO_DATE" == "yes" ]]; then
    msg_ok "${APP} ist aktuell: ${CUR_BB} (Kern ${CUR_CORE#v})"
    exit 0
  fi
  msg_warn "Update verfügbar: Brainbox ${CUR_BB} → ${NEW_BB} (Kern ${CUR_CORE#v} → ${NEW_CORE#v})"
  exit 10
fi

if [[ "$UP_TO_DATE" == "yes" && "$FORCE" != "yes" ]]; then
  # Gleiche Version: nur Befehle, Abgleich und Zentrale auffrischen
  install_kit
  systemctl restart brainbox-zentrale >/dev/null 2>&1 || true
  $STD brainbox-connect start --quiet || true
  msg_ok "${APP} ist aktuell: ${CUR_BB} (Kern ${CUR_CORE#v})"
  exit 0
fi

echo -e "${INFO}${YW}Brainbox ${CUR_BB} → ${NEW_BB} (Kern ${CUR_CORE#v} → ${NEW_CORE#v})${CL}"

# Ressourcen prüfen (wie check_container_resources/-storage beim Original)
RAM_MB="$(free -m | awk '/^Mem:/ {print $2}')"
if ((RAM_MB < MIN_RAM_MB - 256)); then
  msg_warn "Nur ${RAM_MB} MB RAM – für den Build werden ${MIN_RAM_MB} MB empfohlen."
fi
FREE_MB="$(df -Pm /opt | awk 'NR==2 {print $4}')"

msg_info "Node.js ${NODE_MAJOR} wird geprüft"
ensure_nodejs
msg_ok "Node.js $(node -v) bereit"

msg_info "Dienst wird gestoppt"
systemctl stop "$SERVICE"
SERVICE_STOPPED="yes"
msg_ok "Dienst gestoppt"

msg_info "Datenbank und Einstellungen werden gesichert"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
cp "${APP_DIR}/.env" "${BACKUP_DIR}/env-${STAMP}"
(cd /tmp && sudo -u postgres pg_dump "$PG_DB_NAME" 2>>"$LOG") | gzip >"${BACKUP_DIR}/db-${CURRENT}-${STAMP}.sql.gz"
chmod 600 "${BACKUP_DIR}/env-${STAMP}" "${BACKUP_DIR}/db-${CURRENT}-${STAMP}.sql.gz"
# nur die letzten 3 Sicherungen behalten
ls -1t "${BACKUP_DIR}"/db-*.sql.gz 2>/dev/null | tail -n +4 | xargs -r rm -f
ls -1t "${BACKUP_DIR}"/env-* 2>/dev/null | tail -n +4 | xargs -r rm -f
msg_ok "Gesichert nach ${BACKUP_DIR}"

rm -rf "$OLD_DIR"
if ((FREE_MB >= ROLLBACK_MIN_FREE_MB)); then
  mv "$APP_DIR" "$OLD_DIR"
  ROLLBACK_READY="yes"
else
  msg_warn "Wenig Speicher frei (${FREE_MB} MB) – alte Version wird nicht aufgehoben, kein automatisches Rollback."
fi

msg_info "Wiki-Kern ${NEW_CORE#v} wird geladen"
APP_REPLACED="yes"
deploy_outline "$APP_DIR" "$NEW_CORE"
cp "${BACKUP_DIR}/env-${STAMP}" "${APP_DIR}/.env"
chmod 600 "${APP_DIR}/.env"
msg_ok "Wiki-Kern geladen"

msg_info "Brainbox-Design wird angewendet"
$STD node "${NEW_KIT}/brand/apply.mjs" "$APP_DIR"
msg_ok "Brainbox-Design angewendet"

msg_info "Brainbox wird gebaut (dauert 5–15 Minuten)"
cd "$APP_DIR"
export NODE_ENV=development
export NODE_OPTIONS="--max-old-space-size=3584"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
$STD yarn install --immutable
export NODE_ENV=production
$STD yarn build
msg_ok "Brainbox gebaut"

msg_info "Zentrale und Befehle werden eingerichtet"
install_kit
msg_ok "Zentrale und Befehle eingerichtet"

msg_info "Wiki und Zentrale werden gestartet"
systemctl start "$SERVICE"
systemctl restart brainbox-zentrale
msg_ok "Wiki und Zentrale gestartet"

msg_info "Anleitung und Abgleich werden aufgefrischt"
if $STD brainbox-connect start --quiet; then msg_ok "Anleitung und Abgleich aufgefrischt"; else msg_warn "Anleitung kommt beim nächsten Abgleich"; fi

printf 'BRAINBOX_VERSION=%s\nOUTLINE_CORE=%s\n' "$NEW_BB" "$NEW_CORE" >"$VERSION_FILE"
ROLLBACK_READY="no"
rm -rf "$OLD_DIR"

msg_info "Aufräumen"
$STD yarn cache clean --all || true
$STD npm cache clean --force || true
msg_ok "Aufgeräumt"

msg_ok "Update fertig – Brainbox ${NEW_BB} (Kern ${NEW_CORE#v})"
echo -e "${INFO}${YW}Nach einem Update richtet Brainbox die Datenbank ein – die Seite kann 1–2 Minuten brauchen.${CL}"
