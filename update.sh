#!/usr/bin/env bash
# ------------------------------------------------------------------------------
# Brainbox – Update (im Container einfach "update" eingeben)
# Holt das neueste Outline-Release, baut es neu und startet den Dienst.
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
OUTLINE_VERSION="${BRAINBOX_OUTLINE_VERSION:-}" # leer = neuestes Release

VERBOSE="${BRAINBOX_VERBOSE:-no}"
FORCE="no"
CHECK_ONLY="no"
for arg in "$@"; do
  case "$arg" in
  --force) FORCE="yes" ;;
  --check) CHECK_ONLY="yes" ;;
  --verbose | -v) VERBOSE="yes" ;;
  -h | --help) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
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
  rm -rf "$APP_DIR"
  mv "$OLD_DIR" "$APP_DIR"
  systemctl start "$SERVICE" || true
  msg_ok "Alte Version läuft wieder ($(cat "$VERSION_FILE" 2>/dev/null || echo '?'))"
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
    echo -e "${INFO}${YW}Nichts geändert, ${APP} läuft weiter mit Outline ${CURRENT:-?}.${CL}"
  elif [[ -n "${LATEST:-}" ]]; then
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

# brainbox-login ebenfalls aktuell halten
update_login_cmd() {
  local tmp
  tmp="$(mktemp)"
  if curl -fsSL "${RAW}/brainbox-login.sh" -o "$tmp" 2>/dev/null && bash -n "$tmp" 2>/dev/null && [[ -s "$tmp" ]]; then
    cmp -s "$tmp" /usr/bin/brainbox-login || install -m 755 "$tmp" /usr/bin/brainbox-login
  fi
  rm -f "$tmp"
}

# --- Ablauf -----------------------------------------------------------------------
[[ $EUID -eq 0 ]] || { msg_error "Bitte als root ausführen."; exit 1; }
if [[ ! -d "$APP_DIR" ]]; then
  msg_error "Keine ${APP}-Installation gefunden (${APP_DIR} fehlt)."
  exit 1
fi
: >"$LOG"

self_update "$@"
update_login_cmd

CURRENT="$(cat "$VERSION_FILE" 2>/dev/null || echo "unbekannt")"
if [[ -z "$OUTLINE_VERSION" ]]; then
  LATEST="$(latest_outline_tag)" || { msg_error "Neueste Outline-Version nicht ermittelbar (GitHub erreichbar?)"; exit 1; }
else
  LATEST="$OUTLINE_VERSION"
fi

if [[ "$CHECK_ONLY" == "yes" ]]; then
  if [[ "$CURRENT" == "$LATEST" ]]; then
    msg_ok "${APP} ist aktuell (Outline ${CURRENT})"
    exit 0
  fi
  msg_warn "Update verfügbar: Outline ${CURRENT} → ${LATEST}"
  exit 10
fi

if [[ "$CURRENT" == "$LATEST" && "$FORCE" != "yes" ]]; then
  msg_ok "${APP} ist aktuell (Outline ${CURRENT})"
  exit 0
fi

echo -e "${INFO}${YW}Outline ${CURRENT} → ${LATEST}${CL}"

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

msg_info "Outline ${LATEST} wird heruntergeladen"
APP_REPLACED="yes"
deploy_outline "$APP_DIR" "$LATEST"
cp "${BACKUP_DIR}/env-${STAMP}" "${APP_DIR}/.env"
chmod 600 "${APP_DIR}/.env"
msg_ok "Outline ${LATEST} heruntergeladen"

msg_info "Outline wird gebaut (dauert 5–15 Minuten)"
cd "$APP_DIR"
export NODE_ENV=development
export NODE_OPTIONS="--max-old-space-size=3584"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
$STD yarn install --immutable
export NODE_ENV=production
$STD yarn build
msg_ok "Outline gebaut"

msg_info "Dienst wird gestartet"
systemctl start "$SERVICE"
msg_ok "Dienst gestartet"

echo "$LATEST" >"$VERSION_FILE"
ROLLBACK_READY="no"
rm -rf "$OLD_DIR"

msg_info "Aufräumen"
$STD yarn cache clean --all || true
$STD npm cache clean --force || true
msg_ok "Aufgeräumt"

msg_ok "Update fertig – Outline ${LATEST}"
echo -e "${INFO}${YW}Nach einem Update migriert Outline die Datenbank – die Seite kann 1–2 Minuten brauchen.${CL}"
