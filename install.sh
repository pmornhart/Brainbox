#!/usr/bin/env bash
# ------------------------------------------------------------------------------
# Brainbox – Installation im Container
# Installiert Brainbox: den Wiki-Kern (Outline, https://github.com/outline/outline)
# mit eigenem Brainbox-Design, die Brainbox-Zentrale und die Brainbox-Befehle,
# dazu Node.js 26, PostgreSQL 16 und Redis.
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

APP_DIR="/opt/brainbox"
KIT_DIR="/opt/brainbox-kit"
KIT_URL="${BRAINBOX_KIT_URL:-https://codeload.github.com/${REPO}/tar.gz/refs/heads/${BRANCH}}"
SERVICE="brainbox"
PORT="3000"      # Brainbox-Zentrale (davor) – das Wiki ist hier erreichbar
CORE_PORT="3100" # Outline-Kern dahinter
VERSION_FILE="/root/.brainbox"
CREDS_FILE="/root/brainbox.creds"
LOG="/root/brainbox-install.log"

NODE_MAJOR="26"
PG_VERSION="16"
PG_DB_NAME="outline"
PG_DB_USER="outline"
OUTLINE_REPO="${BRAINBOX_OUTLINE_REPO:-outline/outline}"
GITHUB="${BRAINBOX_GITHUB:-https://github.com}"
OUTLINE_VERSION="${BRAINBOX_OUTLINE_VERSION:-}" # leer = der zur Brainbox-Version passende Kern

VERBOSE="${BRAINBOX_VERBOSE:-no}"
PW_SET="${BRAINBOX_PW_SET:-no}"
FROM_HOST="${BRAINBOX_FROM_HOST:-no}"

# Ein Container = ein Wiki. Arbeitsbereich und Admin werden automatisch angelegt.
WIKI_NAME="${BRAINBOX_WIKI_NAME:-Brainbox}"
DOMAIN="${BRAINBOX_DOMAIN:-}"          # z. B. brainbox.morncloud.de, leer = nur http://IP:3000
ADMIN_NAME="${BRAINBOX_ADMIN_NAME:-}"
ADMIN_EMAIL="${BRAINBOX_ADMIN_EMAIL:-}" # leer = Arbeitsbereich beim ersten Aufruf im Browser anlegen

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

# Brainbox-Bausatz (Design, Zentrale, Befehle) nach $1 holen:
# vom Proxmox-Host mitgeschickt, lokal (BRAINBOX_KIT_DIR) oder von GitHub
fetch_kit() {
  local dst="$1" tmp
  rm -rf "$dst"
  mkdir -p "$dst"
  if [[ -n "${BRAINBOX_KIT_DIR:-}" && -d "${BRAINBOX_KIT_DIR}" ]]; then
    cp -a "${BRAINBOX_KIT_DIR}/." "$dst/"
  elif [[ -f /root/brainbox-kit.tar.gz ]]; then
    tar -xzf /root/brainbox-kit.tar.gz -C "$dst" --strip-components=1
    rm -f /root/brainbox-kit.tar.gz
  else
    tmp="$(mktemp)"
    curl -fsSL --retry 3 "$KIT_URL" -o "$tmp"
    tar -xzf "$tmp" -C "$dst" --strip-components=1
    rm -f "$tmp"
  fi
  rm -rf "$dst/.git"
  [[ -f "$dst/brainbox.version" ]]
}
kit_value() { sed -n "s/^$1=//p" "${KIT_DIR}/brainbox.version" | head -n1; }

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

# Ohne Proxmox-Skript von Hand gestartet: Wiki-Daten abfragen
if [[ "$FROM_HOST" != "yes" && -z "$ADMIN_EMAIL" && -t 0 ]]; then
  echo -e "${INFO}${YW}Ein Container = ein Wiki. Für weitere Wikis einfach weitere Container mit eigener Domain.${CL}"
  read -rp "  Name des Wikis [${WIKI_NAME}]: " _v; WIKI_NAME="${_v:-$WIKI_NAME}"
  read -rp "  Domain (leer = nur http://IP:${PORT}): " DOMAIN
  read -rp "  Dein Name (Admin): " ADMIN_NAME
  read -rp "  Deine E-Mail (Admin): " ADMIN_EMAIL
fi
DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%%/*}"
[[ -n "$ADMIN_NAME" ]] || ADMIN_NAME="${ADMIN_EMAIL%%@*}"

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

msg_info "Brainbox-Bausatz wird geladen"
fetch_kit "$KIT_DIR"
BB_VERSION="$(kit_value BRAINBOX_VERSION)"
[[ -n "$OUTLINE_VERSION" ]] || OUTLINE_VERSION="$(kit_value OUTLINE_CORE)"
if [[ -z "$OUTLINE_VERSION" ]]; then
  OUTLINE_VERSION="$(latest_outline_tag)" || { msg_error "Outline-Version nicht ermittelbar (GitHub erreichbar?)"; exit 1; }
fi
msg_ok "Brainbox ${BB_VERSION} (Kern: Outline ${OUTLINE_VERSION})"

msg_info "Wiki-Kern (Outline ${OUTLINE_VERSION}) wird geladen"
deploy_outline "$APP_DIR" "$OUTLINE_VERSION"
msg_ok "Wiki-Kern geladen"

msg_info "Brainbox-Design wird angewendet"
$STD node "${KIT_DIR}/brand/apply.mjs" "$APP_DIR"
msg_ok "Brainbox-Design angewendet (Logo, Farben, Schrift, Zentrale)"

msg_info "Brainbox wird eingerichtet und gebaut (dauert 5–15 Minuten)"
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
if [[ -n "$DOMAIN" ]]; then WIKI_URL="https://${DOMAIN}"; else WIKI_URL="http://${IP}:${PORT}"; fi
sed -i "s#^URL=.*#URL=${WIKI_URL}#" .env
sed -i "s#^PORT=.*#PORT=${CORE_PORT}#" .env
sed -i "s#^FORCE_HTTPS=.*#FORCE_HTTPS=false#" .env
sed -i "s#^DEFAULT_LANGUAGE=.*#DEFAULT_LANGUAGE=de_DE#" .env
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
printf 'BRAINBOX_VERSION=%s\nOUTLINE_CORE=%s\n' "$BB_VERSION" "$OUTLINE_VERSION" >"$VERSION_FILE"
msg_ok "Brainbox gebaut"

msg_info "Dienste, Zentrale und Befehle werden eingerichtet"
apt_install whiptail
$STD bash "${KIT_DIR}/teile-einrichten.sh"
[[ -n "${BRAINBOX_CTID:-}" ]] && echo "${BRAINBOX_CTID}" >/etc/brainbox/ctid
$STD systemctl restart "$SERVICE"
$STD systemctl restart brainbox-zentrale
msg_ok "Dienste eingerichtet (Wiki und Zentrale auf Port ${PORT}, Befehle: update, brainbox-update, brainbox-login, brainbox-connect)"

LOGIN_LINK=""
if [[ -n "$ADMIN_EMAIL" ]]; then
  msg_info "Wiki '${WIKI_NAME}' wird angelegt (Outline startet zum ersten Mal)"
  $STD brainbox-login workspace "$WIKI_NAME" "$ADMIN_NAME" "$ADMIN_EMAIL"
  msg_ok "Wiki '${WIKI_NAME}' angelegt, Admin: ${ADMIN_NAME} <${ADMIN_EMAIL}>"
  if [[ "$FROM_HOST" != "yes" ]]; then
    LOGIN_LINK="$(brainbox-login link --raw "$ADMIN_EMAIL" 2>>"$LOG" || true)"
  fi
fi

# Proxmox-Zugang vom Host mitgeschickt: Abgleich einrichten (jede VM/jeder Container = ein Eintrag)
PVE_SYNC="no"
if [[ -f /root/brainbox-pve.env ]]; then
  install -m 600 /root/brainbox-pve.env /etc/brainbox/connect.env
  [[ -f /root/brainbox-pve-ca.pem ]] && install -m 644 /root/brainbox-pve-ca.pem /etc/brainbox/pve-root-ca.pem
  rm -f /root/brainbox-pve.env /root/brainbox-pve-ca.pem
  if [[ -n "$ADMIN_EMAIL" ]]; then
    msg_info "Proxmox wird mit dem Wiki verbunden"
    if $STD brainbox-connect proxmox --from-install; then
      PVE_SYNC="yes"
      msg_ok "Proxmox verbunden – jede VM und jeder Container steht jetzt im Wiki"
    else
      msg_warn "Proxmox-Abgleich hat noch nicht geklappt – später: brainbox-connect proxmox (Log: ${LOG})"
    fi
  fi
fi

# Anleitung im Wiki (Sammlung „Start“) und Abgleich alle 5 Minuten
if [[ -n "$ADMIN_EMAIL" ]]; then
  msg_info "Anleitung wird ins Wiki gelegt"
  if $STD brainbox-connect start --quiet; then
    msg_ok "Anleitung im Wiki (Sammlung 'Start')"
  else
    msg_warn "Anleitung kommt beim nächsten Abgleich (Log: ${LOG})"
  fi
fi

msg_info "Container wird angepasst"
cat <<'EOF' >/etc/profile.d/00_brainbox-motd.sh
_bb_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
_bb_url="$(sed -n 's/^URL=//p' /opt/brainbox/.env 2>/dev/null | tr -d "\"'")"
echo ""
_bb_ver="$(sed -n 's/^BRAINBOX_VERSION=//p' /root/.brainbox 2>/dev/null)"
_bb_core="$(sed -n 's/^OUTLINE_CORE=//p' /root/.brainbox 2>/dev/null)"
echo -e "  \033[1;92mBrainbox ${_bb_ver}\033[m · Wiki fürs Homelab · Kern: Outline ${_bb_core}"
echo -e "  🌐  Adresse: \033[36m${_bb_url}\033[m (im Heimnetz: http://${_bb_ip}:3000)"
echo -e "  ⚙️   Einstellungen: \033[36m${_bb_url}/settings/brainbox\033[m (Proxmox-Server, NetBird, Claude, Anmeldung, Update)"
echo -e "  🖥️  $(hostname) · $(. /etc/os-release && echo "$PRETTY_NAME")"
_bb_new="$(jq -r '.latest // empty' /var/lib/brainbox/update.json 2>/dev/null)"
if [[ -n "$_bb_new" && "$_bb_new" != "$_bb_ver" && "$(printf '%s\n' "$_bb_ver" "$_bb_new" | sort -V | tail -n1)" == "$_bb_new" ]]; then
  echo -e "  ⬆️   \033[1;92mUpdate verfügbar: Brainbox ${_bb_new}\033[m – einfach \033[33mupdate\033[m eingeben"
fi
echo -e "  📦  Update: \033[33mupdate\033[m (oder brainbox-update) · Anmeldung: \033[33mbrainbox-login\033[m"
echo -e "  🔑  Login-Link: \033[33mbrainbox-login link\033[m · Claude, Proxmox, NetBird: \033[33mbrainbox-connect\033[m"
echo ""
unset _bb_ip _bb_url _bb_ver _bb_core _bb_new
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
msg_ok "${APP} ${BB_VERSION} ist installiert!"
echo -e "${INFO}${YW}Adresse:${CL} ${BL}${WIKI_URL}${CL}"
echo -e "${INFO}${YW}Einstellungen:${CL} ${BL}${WIKI_URL}/settings/brainbox${CL} (oben in der Seitenleiste)"
echo -e "${INFO}${YW}Anleitung:${CL} im Wiki in der Sammlung 'Start'"
[[ -n "$DOMAIN" ]] && echo -e "${INFO}${YW}Reverse-Proxy:${CL} ${DOMAIN} → http://${IP}:${PORT} (Websockets an, SSL)"
[[ "$PVE_SYNC" == "yes" ]] && echo -e "${INFO}${YW}Proxmox-Abgleich:${CL} an – Sammlung 'Proxmox' im Wiki, alle 5 Minuten aktuell"
if [[ -n "$LOGIN_LINK" ]]; then
  echo -e "${INFO}${YW}Dein Login-Link (einmal benutzbar, 60 Minuten gültig):${CL}"
  echo -e "${TAB}${TAB}${BL}${LOGIN_LINK}${CL}"
  echo -e "${INFO}${YW}Neuer Link jederzeit mit:${CL} brainbox-login link"
elif [[ -z "$ADMIN_EMAIL" ]]; then
  echo -e "${INFO}${YW}Beim ersten Aufruf Wiki-Name und Admin-E-Mail im Browser eingeben.${CL}"
fi
[[ "$FROM_HOST" == "yes" ]] || echo -e "${INFO}${YW}E-Mail-Login, Passkeys, Google, Microsoft … einrichten mit:${CL} brainbox-login"
[[ "$FROM_HOST" == "yes" ]] || echo -e "${INFO}${YW}Claude, Proxmox und NetBird verbinden mit:${CL} brainbox-connect"
