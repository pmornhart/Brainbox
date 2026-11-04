#!/usr/bin/env bash
# ------------------------------------------------------------------------------
# Brainbox – Installation im Container
# Installiert die Wissensdatenbank Outline (https://github.com/outline/outline)
# mit Node.js 26, PostgreSQL 16 und Redis nach /opt/brainbox.
#
# Wird normalerweise von proxmox/brainbox.sh auf dem Proxmox-Host gestartet.
# Von Hand in einem frischen Debian-13-Container:
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/pmornhart/Brainbox/main/install.sh)"
#
# Nachbau von community-scripts/ProxmoxVE install/outline-install.sh
# (MIT, Autor: Slaviša Arežina / tremor021). Lizenz: MIT, siehe LICENSE.
# ------------------------------------------------------------------------------
set -Eeuo pipefail

APP="Brainbox"
REPO="pmornhart/Brainbox"
BRANCH="${BRAINBOX_BRANCH:-main}"
RAW="${BRAINBOX_RAW:-https://raw.githubusercontent.com/${REPO}/${BRANCH}}"

APP_DIR="/opt/brainbox"
SERVICE="brainbox"
PORT="3000"
VERSION_FILE="/root/.brainbox"
CREDS_FILE="/root/brainbox.creds"
LOG="/root/brainbox-install.log"

NODE_MAJOR="26"
PG_VERSION="16"
PG_DB_NAME="outline"
PG_DB_USER="outline"
OUTLINE_REPO="${BRAINBOX_OUTLINE_REPO:-outline/outline}"
GITHUB="${BRAINBOX_GITHUB:-https://github.com}"
OUTLINE_VERSION="${BRAINBOX_OUTLINE_VERSION:-}" # leer = neuestes Release

VERBOSE="${BRAINBOX_VERBOSE:-no}"
PW_SET="${BRAINBOX_PW_SET:-no}"

# --- Ausgabe ------------------------------------------------------------------
YW=$'\033[33m'; GN=$'\033[1;92m'; RD=$'\033[01;31m'; BL=$'\033[36m'; CL=$'\033[m'
TAB="  "; CM="${TAB}✔️${TAB}"; CROSS="${TAB}✖️${TAB}"; INFO="${TAB}💡${TAB}"; HOLD="${TAB}⏳${TAB}"
CURRENT_MSG=""

msg_info() {
  CURRENT_MSG="$1"
  if [[ "$VERBOSE" == "yes" ]]; then echo -e "${HOLD}${YW}$1${CL}"; else printf '%s%s%s...%s' "$HOLD" "$YW" "$1" "$CL"; fi
}
msg_ok() { printf '\r\033[K%s%s%s%s\n' "$CM" "$GN" "$1" "$CL"; CURRENT_MSG=""; }
msg_warn() { printf '\r\033[K%s%s%s%s\n' "$INFO" "$YW" "$1" "$CL"; }
msg_error() { printf '\r\033[K%s%s%s%s\n' "$CROSS" "$RD" "$1" "$CL"; }

silent() { "$@" >>"$LOG" 2>&1; }
if [[ "$VERBOSE" == "yes" ]]; then STD=""; else STD="silent"; fi

error_handler() {
  local code=$? line=$1 cmd=$2
  trap - ERR
  msg_error "Fehler (Code ${code}) in Zeile ${line}: ${cmd}"
  [[ -n "$CURRENT_MSG" ]] && echo -e "${TAB}${TAB}bei: ${CURRENT_MSG}"
  if [[ -s "$LOG" && "$VERBOSE" != "yes" ]]; then
    echo -e "${TAB}${TAB}Letzte Zeilen aus ${LOG}:"
    tail -n 20 "$LOG" | sed "s/^/${TAB}${TAB}  /"
  fi
  exit "$code"
}
trap 'error_handler $LINENO "$BASH_COMMAND"' ERR

# --- Hilfsfunktionen ------------------------------------------------------------
apt_install() { $STD env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "$@"; }

local_ip() { hostname -I 2>/dev/null | awk '{print $1}'; }

# Neuestes Outline-Release ermitteln: erst GitHub-API, dann Weiterleitung von /releases/latest
latest_outline_tag() {
  local tag=""
  tag="$(curl -fsSL "https://api.github.com/repos/${OUTLINE_REPO}/releases/latest" 2>/dev/null | jq -r '.tag_name // empty' 2>/dev/null || true)"
  if [[ -z "$tag" ]]; then
    tag="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "${GITHUB}/${OUTLINE_REPO}/releases/latest" 2>/dev/null | sed -n 's#.*/tag/##p' || true)"
  fi
  [[ -n "$tag" ]] || return 1
  echo "$tag"
}

# Release-Quellen nach $1 entpacken (Ordner wird vorher geleert)
deploy_outline() {
  local target="$1" tag="$2" tmp
  tmp="$(mktemp -d)"
  curl -fsSL --retry 3 "${GITHUB}/${OUTLINE_REPO}/archive/refs/tags/${tag}.tar.gz" -o "${tmp}/outline.tar.gz"
  rm -rf "$target"
  mkdir -p "$target"
  tar -xzf "${tmp}/outline.tar.gz" -C "$target" --strip-components=1
  rm -rf "$tmp"
}

setup_nodejs() {
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" >/etc/apt/sources.list.d/nodesource.list
  $STD apt-get update
  apt_install nodejs
  # Seit Node 25 ist corepack nicht mehr dabei – Outline braucht es für Yarn 4
  $STD npm install -g corepack@latest
  $STD corepack enable
  $STD npm config set update-notifier false --global || true
}

setup_postgresql() {
  local codename
  codename="$(. /etc/os-release && echo "$VERSION_CODENAME")"
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor --yes -o /etc/apt/keyrings/postgresql.gpg
  echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] https://apt.postgresql.org/pub/repos/apt ${codename}-pgdg main" >/etc/apt/sources.list.d/pgdg.list
  $STD apt-get update
  apt_install "postgresql-${PG_VERSION}" "postgresql-client-${PG_VERSION}"
  $STD systemctl enable --now postgresql
}

setup_postgresql_db() {
  PG_DB_PASS="$(openssl rand -base64 18 | tr -dc 'a-zA-Z0-9' | head -c13)"
  $STD sudo -u postgres psql -c "CREATE ROLE \"${PG_DB_USER}\" WITH LOGIN PASSWORD '${PG_DB_PASS}';"
  $STD sudo -u postgres psql -c "CREATE DATABASE \"${PG_DB_NAME}\" WITH OWNER \"${PG_DB_USER}\" ENCODING 'UTF8' TEMPLATE template0;"
  $STD sudo -u postgres psql -c "ALTER ROLE \"${PG_DB_USER}\" SET client_encoding TO 'utf8';"
  $STD sudo -u postgres psql -c "ALTER ROLE \"${PG_DB_USER}\" SET default_transaction_isolation TO 'read committed';"
  $STD sudo -u postgres psql -c "ALTER ROLE \"${PG_DB_USER}\" SET timezone TO 'UTC';"
  {
    echo "PostgreSQL Credentials"
    echo "Database: ${PG_DB_NAME}"
    echo "User: ${PG_DB_USER}"
    echo "Password: ${PG_DB_PASS}"
  } >"$CREDS_FILE"
  chmod 600 "$CREDS_FILE"
}

# --- Los geht's -----------------------------------------------------------------
[[ $EUID -eq 0 ]] || { msg_error "Bitte als root ausführen."; exit 1; }
: >"$LOG"

msg_info "Container wird vorbereitet"
for _ in {1..30}; do [[ -n "$(local_ip)" ]] && break; sleep 1; done
[[ -n "$(local_ip)" ]] || { msg_error "Keine IP-Adresse – Netzwerk prüfen"; exit 1; }
msg_ok "Container vorbereitet (IP $(local_ip))"

msg_info "Netzwerk wird geprüft"
for _ in {1..30}; do getent hosts deb.debian.org >/dev/null 2>&1 && break; sleep 1; done
getent hosts deb.debian.org >/dev/null 2>&1 || { msg_error "Kein Internet bzw. DNS im Container"; exit 1; }
msg_ok "Netzwerk ok"

msg_info "Betriebssystem wird aktualisiert"
$STD apt-get update
$STD env DEBIAN_FRONTEND=noninteractive apt-get -o Dpkg::Options::="--force-confold" -y dist-upgrade
msg_ok "Betriebssystem aktualisiert"

msg_info "Abhängigkeiten werden installiert"
apt_install curl ca-certificates gnupg jq openssl sudo git redis mkcert
$STD systemctl enable --now redis-server
msg_ok "Abhängigkeiten installiert"

msg_info "Node.js ${NODE_MAJOR} wird eingerichtet"
setup_nodejs
msg_ok "Node.js $(node -v) eingerichtet"

msg_info "PostgreSQL ${PG_VERSION} wird eingerichtet"
setup_postgresql
msg_ok "PostgreSQL ${PG_VERSION} eingerichtet"

msg_info "Datenbank wird angelegt"
setup_postgresql_db
msg_ok "Datenbank angelegt (Zugangsdaten in ${CREDS_FILE})"

msg_info "Outline wird heruntergeladen"
if [[ -z "$OUTLINE_VERSION" ]]; then
  OUTLINE_VERSION="$(latest_outline_tag)" || { msg_error "Neueste Outline-Version nicht ermittelbar (GitHub erreichbar?)"; exit 1; }
fi
deploy_outline "$APP_DIR" "$OUTLINE_VERSION"
msg_ok "Outline ${OUTLINE_VERSION} heruntergeladen"

msg_info "Outline wird eingerichtet und gebaut (dauert 5–15 Minuten)"
SECRET_KEY="$(openssl rand -hex 32)"
UTILS_SECRET="$(openssl rand -hex 32)"
IP="$(local_ip)"
cd "$APP_DIR"
cp .env.sample .env
chmod 600 .env
sed -i "s#^NODE_ENV=.*#NODE_ENV=development#" .env
sed -i "s#^SECRET_KEY=.*#SECRET_KEY=${SECRET_KEY}#" .env
sed -i "s#^UTILS_SECRET=.*#UTILS_SECRET=${UTILS_SECRET}#" .env
sed -i "s#^DATABASE_URL=.*#DATABASE_URL=postgres://${PG_DB_USER}:${PG_DB_PASS}@localhost:5432/${PG_DB_NAME}#" .env
sed -i "s#^REDIS_URL=.*#REDIS_URL=redis://localhost:6379#" .env
sed -i "s#^URL=.*#URL=http://${IP}:${PORT}#" .env
sed -i "s#^PORT=.*#PORT=${PORT}#" .env
sed -i "s#^FORCE_HTTPS=.*#FORCE_HTTPS=false#" .env
# Slack-Platzhalter aus der Beispielkonfiguration entfernen (sonst zeigt die
# Login-Seite einen Slack-Knopf, der nicht funktioniert)
sed -i -E "s#^(SLACK_CLIENT_ID|SLACK_CLIENT_SECRET|SLACK_VERIFICATION_TOKEN|SLACK_APP_ID)=.*#\1=#" .env
export NODE_ENV=development
export NODE_OPTIONS="--max-old-space-size=3584"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
$STD yarn install --immutable
export NODE_ENV=production
sed -i "s#^NODE_ENV=.*#NODE_ENV=production#" .env
$STD yarn build
echo "$OUTLINE_VERSION" >"$VERSION_FILE"
msg_ok "Outline eingerichtet und gebaut"

msg_info "Dienst wird angelegt"
cat <<EOF >/etc/systemd/system/${SERVICE}.service
[Unit]
Description=Brainbox (Outline)
After=network.target postgresql.service redis-server.service
Wants=postgresql.service redis-server.service

[Service]
Type=simple
User=root
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
Environment=COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ExecStart=/usr/bin/yarn start
Restart=always

[Install]
WantedBy=multi-user.target
EOF
$STD systemctl daemon-reload
$STD systemctl enable --now "$SERVICE"
msg_ok "Dienst angelegt"

msg_info "Update-Befehl wird eingerichtet"
if [[ -f /root/brainbox-update.sh ]]; then
  install -m 755 /root/brainbox-update.sh /usr/bin/update
  rm -f /root/brainbox-update.sh
else
  curl -fsSL "${RAW}/update.sh" -o /usr/bin/update
  chmod 755 /usr/bin/update
fi
msg_ok "Update-Befehl eingerichtet (im Container: update)"

msg_info "Container wird angepasst"
cat <<'EOF' >/etc/profile.d/00_brainbox-motd.sh
_bb_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo ""
echo -e "  \033[1;92mBrainbox\033[m · Outline-Wissensdatenbank"
echo -e "  🌐  Weboberfläche: \033[36mhttp://${_bb_ip}:3000\033[m"
echo -e "  🖥️  $(hostname) · $(. /etc/os-release && echo "$PRETTY_NAME")"
echo -e "  📦  Outline $(cat /root/.brainbox 2>/dev/null || echo '?') · Update: \033[33mupdate\033[m"
echo ""
unset _bb_ip
EOF
if [[ "$PW_SET" != "yes" ]]; then
  # Ohne Root-Passwort: automatische Anmeldung auf der Proxmox-Konsole (wie beim Original)
  passwd -d root >/dev/null 2>&1 || true
  mkdir -p /etc/systemd/system/container-getty@1.service.d
  cat <<'EOF' >/etc/systemd/system/container-getty@1.service.d/override.conf
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin root --noclear --keep-baud tty%I 115200,38400,9600 $TERM
EOF
  $STD systemctl daemon-reload
fi
msg_ok "Container angepasst"

msg_info "Aufräumen"
$STD yarn cache clean --all || true
$STD npm cache clean --force || true
$STD apt-get -y autoremove
$STD apt-get -y autoclean
msg_ok "Aufgeräumt"

echo
msg_ok "${APP} ist installiert!"
echo -e "${INFO}${YW}Weboberfläche:${CL} ${BL}http://${IP}:${PORT}${CL}"
echo -e "${INFO}${YW}Beim ersten Start migriert Outline die Datenbank – die Seite kann 1–2 Minuten brauchen.${CL}"
echo -e "${INFO}${YW}Beim ersten Aufruf Workspace-Name und Admin-E-Mail eingeben – danach bist du als Admin angemeldet.${CL}"
