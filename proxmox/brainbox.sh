#!/usr/bin/env bash
# ------------------------------------------------------------------------------
# Brainbox – Outline-Wissensdatenbank als Proxmox-LXC
#
# In der Proxmox-Shell (Host) ausführen:
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/pmornhart/Brainbox/main/proxmox/brainbox.sh)"
#
# Legt einen Debian-13-Container an (Standard: 2 CPU, 4096 MB RAM, 8 GB Disk,
# unprivilegiert) und installiert darin Outline. Im Container aufgerufen
# startet das Skript stattdessen das Update – wie beim Original.
#
# Werte vorab setzen (ohne Dialog), z. B.:
#   var_cpu=4 var_ram=6144 var_mode=default bash -c "$(curl -fsSL …/proxmox/brainbox.sh)"
#
# Nachbau von community-scripts/ProxmoxVE ct/outline.sh
# (MIT, Autor: Slaviša Arežina / tremor021). Lizenz: MIT, siehe LICENSE.
# Quelle der App: https://github.com/outline/outline
# ------------------------------------------------------------------------------
set -Eeuo pipefail

APP="Brainbox"
NSAPP="brainbox"
REPO="pmornhart/Brainbox"
BRANCH="${BRAINBOX_BRANCH:-main}"
RAW="${BRAINBOX_RAW:-https://raw.githubusercontent.com/${REPO}/${BRANCH}}"
PORT="3000"

# Standardwerte (wie beim Original), überschreibbar per Umgebungsvariable
var_tags="${var_tags:-documentation}"
var_disk="${var_disk:-8}"
var_cpu="${var_cpu:-2}"
var_ram="${var_ram:-4096}"
var_swap="${var_swap:-512}"
var_os="${var_os:-debian}"
var_version="${var_version:-13}"
var_unprivileged="${var_unprivileged:-1}"
var_hostname="${var_hostname:-$NSAPP}"
var_bridge="${var_bridge:-vmbr0}"
var_net="${var_net:-dhcp}"        # dhcp oder z. B. 192.168.1.50/24
var_gateway="${var_gateway:-}"    # nur bei fester IP
var_vlan="${var_vlan:-}"
var_ctid="${var_ctid:-}"          # leer = nächste freie ID
var_storage="${var_storage:-}"    # leer = Auswahl/erster passender Speicher
var_template_storage="${var_template_storage:-}"
var_pw="${var_pw:-}"              # leer = automatische Anmeldung auf der Konsole
var_verbose="${var_verbose:-no}"
var_mode="${var_mode:-}"          # default | advanced | leer = fragen

# --- Ausgabe ------------------------------------------------------------------
YW=$'\033[33m'; GN=$'\033[1;92m'; RD=$'\033[01;31m'; BL=$'\033[36m'; BGN=$'\033[4;92m'; CL=$'\033[m'; BOLD=$'\033[1m'
TAB="  "; CM="${TAB}✔️${TAB}"; CROSS="${TAB}✖️${TAB}"; INFO="${TAB}💡${TAB}"; HOLD="${TAB}⏳${TAB}"
CURRENT_MSG=""
CTID=""
CT_CREATED="no"
TMP_DIR=""

header_info() {
  clear 2>/dev/null || true
  cat <<'EOF'
    ____             _       __
   / __ )_________ _(_)___  / /_  ____  _  __
  / __  / ___/ __ `/ / __ \/ __ \/ __ \| |/_/
 / /_/ / /  / /_/ / / / / / /_/ / /_/ />  <
/_____/_/   \__,_/_/_/ /_/_.___/\____/_/|_|

EOF
  echo -e "  ${BOLD}Outline-Wissensdatenbank für Proxmox VE${CL}\n"
}

msg_info() { CURRENT_MSG="$1"; printf '%s%s%s...%s' "$HOLD" "$YW" "$1" "$CL"; }
msg_ok() { printf '\r\033[K%s%s%s%s\n' "$CM" "$GN" "$1" "$CL"; CURRENT_MSG=""; }
msg_warn() { printf '\r\033[K%s%s%s%s\n' "$INFO" "$YW" "$1" "$CL"; }
msg_error() { printf '\r\033[K%s%s%s%s\n' "$CROSS" "$RD" "$1" "$CL" >&2; }

cleanup() { [[ -n "$TMP_DIR" && -d "$TMP_DIR" ]] && rm -rf "$TMP_DIR"; return 0; }
trap cleanup EXIT

error_handler() {
  local code=$? line=$1 cmd=$2
  trap - ERR
  msg_error "Fehler (Code ${code}) in Zeile ${line}: ${cmd}"
  [[ -n "$CURRENT_MSG" ]] && echo -e "${TAB}${TAB}bei: ${CURRENT_MSG}"
  if [[ "$CT_CREATED" == "yes" ]]; then
    echo -e "${INFO}${YW}Container ${CTID} bleibt zur Fehlersuche bestehen. Löschen mit:${CL} pct stop ${CTID}; pct destroy ${CTID}"
  fi
  exit "$code"
}
trap 'error_handler $LINENO "$BASH_COMMAND"' ERR

die() { msg_error "$1"; exit 1; }

# --- Im Container aufgerufen? Dann Update ausführen (wie community-scripts) ----
if ! command -v pveversion >/dev/null 2>&1; then
  if [[ -d /opt/brainbox ]]; then
    if [[ -x /usr/bin/update ]]; then
      exec /usr/bin/update "$@"
    fi
    exec bash -c "$(curl -fsSL "${RAW}/update.sh")" update "$@"
  fi
  die "Bitte in der Proxmox-Shell (Host) ausführen – pveversion nicht gefunden."
fi

# --- Prüfungen auf dem Host -----------------------------------------------------
header_info
[[ $EUID -eq 0 ]] || die "Bitte als root ausführen."
PVE_VER="$(pveversion | awk -F'/' '{print $2}' | cut -d'-' -f1)"
PVE_MAJOR="${PVE_VER%%.*}"
[[ "$PVE_MAJOR" =~ ^[0-9]+$ ]] && ((PVE_MAJOR >= 8)) || die "Proxmox VE 8 oder neuer nötig (gefunden: ${PVE_VER:-?})."
ARCH="$(dpkg --print-architecture)"
[[ "$ARCH" == "amd64" || "$ARCH" == "arm64" ]] || die "Architektur ${ARCH} wird nicht unterstützt."
command -v whiptail >/dev/null 2>&1 || var_mode="${var_mode:-default}"
[[ -t 0 && -t 1 ]] || var_mode="${var_mode:-default}"

is_number() { [[ "$1" =~ ^[0-9]+$ ]]; }
ctid_free() { pvesh get /cluster/nextid --vmid "$1" >/dev/null 2>&1; }

CTID="${var_ctid:-$(pvesh get /cluster/nextid)}"
HN="$var_hostname"; DISK="$var_disk"; CPU="$var_cpu"; RAM="$var_ram"; SWAP="$var_swap"
BRIDGE="$var_bridge"; NET="$var_net"; GATE="$var_gateway"; VLAN="$var_vlan"
UNPRIV="$var_unprivileged"; PW="$var_pw"; VERBOSE="$var_verbose"

# --- Einstellungen ------------------------------------------------------------
wt() { whiptail --backtitle "Proxmox VE · ${APP}" "$@" 3>&1 1>&2 2>&3; }
ask() { # ask <Titel> <Text> <Standardwert>
  local v
  v="$(wt --title "$1" --inputbox "$2" 10 64 "$3")" || die "Abgebrochen."
  echo "$v"
}

advanced_settings() {
  local v
  while :; do
    v="$(ask "CONTAINER-ID" "Container-ID" "$CTID")"
    is_number "$v" && ctid_free "$v" && { CTID="$v"; break; }
    wt --title "CONTAINER-ID" --msgbox "ID ${v} ist ungültig oder schon vergeben." 8 50 || true
  done
  HN="$(ask "HOSTNAME" "Hostname (Kleinbuchstaben, Ziffern, Bindestrich)" "$HN")"
  HN="$(echo "${HN,,}" | tr -cd 'a-z0-9-')"; [[ -n "$HN" ]] || HN="$NSAPP"
  while v="$(ask "DISK" "Festplatte in GB" "$DISK")"; ! is_number "$v"; do :; done; DISK="$v"
  while v="$(ask "CPU" "CPU-Kerne" "$CPU")"; ! is_number "$v"; do :; done; CPU="$v"
  while v="$(ask "RAM" "Arbeitsspeicher in MB (Outline braucht zum Bauen ca. 4096)" "$RAM")"; ! is_number "$v"; do :; done; RAM="$v"
  BRIDGE="$(ask "BRIDGE" "Netzwerk-Bridge" "$BRIDGE")"
  NET="$(ask "IP-ADRESSE" "dhcp oder feste IP mit Präfix, z. B. 192.168.1.50/24" "$NET")"
  if [[ "$NET" != "dhcp" ]]; then
    [[ "$NET" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}$ ]] || die "Ungültige IP-Angabe: ${NET}"
    GATE="$(ask "GATEWAY" "Gateway-IP" "$GATE")"
  else
    GATE=""
  fi
  VLAN="$(ask "VLAN" "VLAN-Tag (leer = keins)" "$VLAN")"
  PW="$(wt --title "ROOT-PASSWORT" --passwordbox "Root-Passwort für den Container\n(leer = automatische Anmeldung auf der Konsole)" 10 64)" || die "Abgebrochen."
  if wt --title "CONTAINER-TYP" --yesno "Unprivilegierten Container anlegen? (empfohlen)" 8 58; then UNPRIV=1; else UNPRIV=0; fi
  if wt --title "AUSGABE" --defaultno --yesno "Ausführliche Ausgabe während der Installation?" 8 58; then VERBOSE="yes"; else VERBOSE="no"; fi
}

summary() {
  echo -e "  ${BOLD}Einstellungen${CL}"
  echo -e "  🆔  Container-ID: ${BL}${CTID}${CL}"
  echo -e "  🏠  Hostname:     ${BL}${HN}${CL}"
  echo -e "  🖥️  System:       ${BL}${var_os} ${var_version} (${ARCH})${CL}"
  echo -e "  📦  Typ:          ${BL}$([[ "$UNPRIV" == 1 ]] && echo unprivilegiert || echo privilegiert)${CL}"
  echo -e "  💾  Disk:         ${BL}${DISK} GB${CL}"
  echo -e "  🧠  CPU / RAM:    ${BL}${CPU} Kerne / ${RAM} MB${CL}"
  echo -e "  🌉  Netzwerk:     ${BL}${BRIDGE}, ${NET}${GATE:+, GW ${GATE}}${VLAN:+, VLAN ${VLAN}}${CL}"
  echo
}

if [[ -z "$var_mode" ]]; then
  CHOICE="$(wt --title "${APP}" --menu "Wie soll der Container angelegt werden?" 14 64 3 \
    "1" "Standard-Einstellungen" \
    "2" "Erweiterte Einstellungen" \
    "3" "Abbrechen")" || die "Abgebrochen."
  case "$CHOICE" in
  1) var_mode="default" ;;
  2) var_mode="advanced" ;;
  *) die "Abgebrochen." ;;
  esac
fi
[[ "$var_mode" == "advanced" ]] && advanced_settings
is_number "$CTID" && ctid_free "$CTID" || die "Container-ID ${CTID} ist ungültig oder schon vergeben."
is_number "$DISK" && is_number "$CPU" && is_number "$RAM" || die "Disk, CPU und RAM müssen Zahlen sein."
((RAM >= 4096)) || msg_warn "Weniger als 4096 MB RAM – der Outline-Build kann abbrechen."
summary

# --- Speicher wählen ------------------------------------------------------------
pick_storage() { # pick_storage <content> <Beschreibung> <Vorgabe>
  local content="$1" label="$2" preset="$3" list=() menu=() name
  if [[ -n "$preset" ]]; then echo "$preset"; return; fi
  mapfile -t list < <(pvesm status -content "$content" 2>/dev/null | awk 'NR>1 && $3=="active" {print $1}')
  ((${#list[@]} > 0)) || die "Kein aktiver Speicher für ${label} gefunden."
  if ((${#list[@]} == 1)) || [[ "$var_mode" == "default" && ! -t 0 ]]; then echo "${list[0]}"; return; fi
  for name in "${list[@]}"; do menu+=("$name" "" "OFF"); done
  menu[2]="ON"
  wt --title "SPEICHER" --radiolist "Speicher für ${label} wählen (Leertaste, dann Enter)" 16 64 6 "${menu[@]}" || die "Abgebrochen."
}
STORAGE="$(pick_storage rootdir "den Container" "$var_storage")"
TPL_STORAGE="$(pick_storage vztmpl "Vorlagen (Templates)" "$var_template_storage")"
msg_ok "Speicher: Container auf ${BL}${STORAGE}${CL}${GN}, Vorlagen auf ${BL}${TPL_STORAGE}${CL}"

# --- Vorlage (Template) -------------------------------------------------------------
msg_info "Vorlage ${var_os} ${var_version} wird gesucht"
TEMPLATE="$(pveam list "$TPL_STORAGE" 2>/dev/null | awk '{print $1}' | sed 's#.*/##' | grep -E "^${var_os}-${var_version}-standard_.*_${ARCH}\.tar\.(zst|xz|gz)$" | sort -V | tail -n1 || true)"
if [[ -z "$TEMPLATE" ]]; then
  pveam update >/dev/null 2>&1 || true
  TEMPLATE="$(pveam available -section system 2>/dev/null | awk '{print $2}' | grep -E "^${var_os}-${var_version}-standard_.*_${ARCH}\.tar\.(zst|xz|gz)$" | sort -V | tail -n1 || true)"
  [[ -n "$TEMPLATE" ]] || die "Keine Vorlage für ${var_os} ${var_version} (${ARCH}) gefunden."
  msg_ok "Vorlage gefunden: ${TEMPLATE}"
  msg_info "Vorlage wird heruntergeladen"
  pveam download "$TPL_STORAGE" "$TEMPLATE" >/dev/null
  msg_ok "Vorlage heruntergeladen"
else
  msg_ok "Vorlage vorhanden: ${TEMPLATE}"
fi

# --- Container anlegen ------------------------------------------------------------
msg_info "Container ${CTID} wird angelegt"
NET0="name=eth0,bridge=${BRIDGE},ip=${NET}"
[[ -n "$GATE" ]] && NET0+=",gw=${GATE}"
[[ -n "$VLAN" ]] && NET0+=",tag=${VLAN}"
FEATURES="nesting=1"
[[ "$UNPRIV" == "1" ]] && FEATURES+=",keyctl=1"
CREATE_ARGS=(
  --hostname "$HN"
  --cores "$CPU"
  --memory "$RAM"
  --swap "$SWAP"
  --rootfs "${STORAGE}:${DISK}"
  --net0 "$NET0"
  --onboot 1
  --unprivileged "$UNPRIV"
  --features "$FEATURES"
  --tags "$var_tags"
  --ostype "$var_os"
  --arch "$ARCH"
)
pct help create 2>/dev/null | grep -q -- '-timezone' && CREATE_ARGS+=(--timezone host)
[[ -n "$PW" ]] && CREATE_ARGS+=(--password "$PW")
pct create "$CTID" "${TPL_STORAGE}:vztmpl/${TEMPLATE}" "${CREATE_ARGS[@]}" >/dev/null
CT_CREATED="yes"
msg_ok "Container ${CTID} angelegt"

msg_info "Container wird gestartet"
pct start "$CTID"
IP=""
for _ in {1..30}; do
  IP="$(pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}' || true)"
  [[ -n "$IP" ]] && break
  sleep 2
done
[[ -n "$IP" ]] || die "Container hat keine IP-Adresse bekommen (Bridge ${BRIDGE}, ${NET})."
msg_ok "Container läuft (IP ${IP})"

# --- Installation im Container ----------------------------------------------------------
TMP_DIR="$(mktemp -d)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-}")" 2>/dev/null && pwd || true)"
for f in install.sh update.sh brainbox-login.sh; do
  if [[ -n "$SCRIPT_DIR" && -f "${SCRIPT_DIR}/brainbox.sh" && -f "${SCRIPT_DIR}/../${f}" ]]; then
    cp "${SCRIPT_DIR}/../${f}" "${TMP_DIR}/${f}"
  else
    curl -fsSL "${RAW}/${f}" -o "${TMP_DIR}/${f}"
  fi
  pct push "$CTID" "${TMP_DIR}/${f}" "/root/brainbox-${f#brainbox-}" --perms 755
done

echo -e "\n  ${BOLD}Installation im Container${CL}"
pct exec "$CTID" -- env \
  BRAINBOX_VERBOSE="$VERBOSE" \
  BRAINBOX_PW_SET="$([[ -n "$PW" ]] && echo yes || echo no)" \
  BRAINBOX_BRANCH="$BRANCH" \
  BRAINBOX_RAW="$RAW" \
  ${BRAINBOX_OUTLINE_VERSION:+BRAINBOX_OUTLINE_VERSION="$BRAINBOX_OUTLINE_VERSION"} \
  bash /root/brainbox-install.sh
pct exec "$CTID" -- rm -f /root/brainbox-install.sh

# --- Beschreibung (Notizen) in Proxmox -------------------------------------------------
pct set "$CTID" --description "<div align='center'>
<h2>🧠 Brainbox</h2>
<p>Outline-Wissensdatenbank</p>
<p><a href='http://${IP}:${PORT}' target='_blank'>Weboberfläche</a> · <a href='https://github.com/${REPO}' target='_blank'>GitHub</a> · <a href='https://docs.getoutline.com/s/hosting/' target='_blank'>Outline-Doku</a></p>
<p>Update im Container: <code>update</code></p>
</div>" >/dev/null

echo
msg_ok "Fertig!"
echo -e "${INFO}${GN}${APP} wurde erfolgreich eingerichtet.${CL}"
echo -e "${INFO}${YW}Aufrufen unter:${CL} ${BGN}http://${IP}:${PORT}${CL}"
echo -e "${INFO}${YW}Beim ersten Aufruf Workspace-Name und Admin-E-Mail eingeben – danach bist du als Admin angemeldet.${CL}"
echo -e "${INFO}${YW}Danach E-Mail-Login, Passkeys, Google, Microsoft … einrichten:${CL} pct enter ${CTID}  →  brainbox-login"
