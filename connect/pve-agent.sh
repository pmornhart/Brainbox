#!/usr/bin/env bash
# Brainbox-Agent für Proxmox VE an einem anderen Standort
#
# Läuft auf dem Proxmox-Host, liest alle 5 Minuten Nodes, VMs und Container (nur lesend, über pvesh)
# und schickt sie an deine Brainbox. Brainbox muss den Server dafür nicht erreichen – er meldet sich selbst.
# Von den VM-Einstellungen gehen nur Beschreibung, Betriebssystem, Name, Tags und Netzwerk mit,
# keine Passwörter oder SSH-Schlüssel.
#
#   Einrichten (den fertigen Befehl gibt es unter Einstellungen → Brainbox → Proxmox-Server):
#     curl -fsSL https://wiki.example.de/zentrale/agent.sh | bash -s -- install https://wiki.example.de <TOKEN>
#   brainbox-agent push        jetzt melden
#   brainbox-agent status      letzte Meldung anzeigen
#   brainbox-agent uninstall   Agent wieder entfernen
#
# Verfasst mit Claude 🤖
set -euo pipefail

AGENT_VERSION="1"
BIN="/usr/local/bin/brainbox-agent"
ENV_FILE="/etc/brainbox-agent.env"
STATE_DIR="/var/lib/brainbox-agent"
UNIT="brainbox-agent"

say() { echo "  $*"; }
ok() { echo "  ✔ $*"; }
fail() {
  echo "  ✖ $*" >&2
  exit 1
}

# JSON-Text sicher in Anführungszeichen
jstr() {
  local s="${1//\\/\\\\}"
  s="${s//\"/\\\"}"
  printf '"%s"' "$s"
}

# pvej PFAD [Optionen] – Antwort von pvesh als JSON, bei Fehler null
pvej() {
  local out
  if out="$(timeout 20 pvesh get "$@" --output-format json 2>/dev/null)" && [[ -n "$out" ]]; then printf '%s' "$out"; else printf 'null'; fi
}

# Aus einer VM-Konfiguration nur das Nötige behalten
conf_keep() {
  perl -MJSON::PP -e 'local $/; my $d = eval { JSON::PP::decode_json(<STDIN>) };
    if (ref $d ne "HASH") { print "null"; exit 0 }
    my %k; for (keys %$d) { $k{$_} = $d->{$_} if /^(description|ostype|hostname|name|tags|net\d+)$/ }
    print JSON::PP->new->canonical->encode(\%k);'
}

collect() {
  local res list node type vmid status sep ip
  res="$(pvej /cluster/resources --type vm)"
  [[ "$res" != "null" ]] || fail "pvesh liefert keine VMs – läuft das als root auf einem Proxmox-Host?"
  list="$(printf '%s' "$res" | perl -MJSON::PP -e 'local $/; my $d = JSON::PP::decode_json(<STDIN>);
    for my $r (@$d) { next unless defined $r->{vmid}; print join(" ", $r->{node}, $r->{type}, $r->{vmid}, $r->{status} // "unknown"), "\n" }')"
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  printf '{"agent":1,"agentVersion":%s,"host":%s,"url":%s,"version":%s,"nodes":%s,"resources":%s,"configs":{' \
    "$(jstr "$AGENT_VERSION")" "$(jstr "$(hostname -f 2>/dev/null || hostname)")" "$(jstr "https://${ip:-$(hostname)}:8006")" \
    "$(pvej /version)" "$(pvej /nodes)" "$res"
  sep=""
  while read -r node type vmid status; do
    [[ -n "${vmid:-}" ]] || continue
    printf '%s"%s/%s/%s":%s' "$sep" "$node" "$type" "$vmid" "$(pvej "/nodes/${node}/${type}/${vmid}/config" | conf_keep)"
    sep=","
  done <<<"$list"
  printf '},"interfaces":{'
  sep=""
  while read -r node type vmid status; do
    [[ "${status:-}" == "running" ]] || continue
    local ifs
    if [[ "$type" == "lxc" ]]; then
      ifs="$(pvej "/nodes/${node}/lxc/${vmid}/interfaces")"
    else
      ifs="$(pvej "/nodes/${node}/qemu/${vmid}/agent/network-get-interfaces")"
    fi
    [[ "$ifs" != "null" ]] || continue
    printf '%s"%s/%s/%s":%s' "$sep" "$node" "$type" "$vmid" "$ifs"
    sep=","
  done <<<"$list"
  printf '}}'
}

load_env() {
  [[ -f "$ENV_FILE" ]] || fail "Agent ist nicht eingerichtet (${ENV_FILE} fehlt)."
  BRAINBOX_URL="$(sed -n 's/^BRAINBOX_URL=//p' "$ENV_FILE" | head -n1)"
  BRAINBOX_TOKEN="$(sed -n 's/^BRAINBOX_TOKEN=//p' "$ENV_FILE" | head -n1)"
  [[ -n "$BRAINBOX_URL" && -n "$BRAINBOX_TOKEN" ]] || fail "${ENV_FILE} ist unvollständig."
}

push() {
  load_env
  local body code stamp
  mkdir -p "$STATE_DIR"
  chmod 700 "$STATE_DIR"
  body="$(mktemp)"
  collect >"$body"
  code="$(curl -sS -o "${STATE_DIR}/antwort.json" -w '%{http_code}' --max-time 90 -X POST \
    -H "Authorization: Bearer ${BRAINBOX_TOKEN}" -H "Content-Type: application/json" \
    --data-binary "@${body}" "${BRAINBOX_URL}/zentrale/agent/push" 2>"${STATE_DIR}/fehler.txt" || true)"
  rm -f "$body"
  stamp="$(date '+%d.%m.%Y %H:%M')"
  if [[ "$code" == "200" ]]; then
    echo "${stamp} ok $(cat "${STATE_DIR}/antwort.json")" >"${STATE_DIR}/letzte-meldung"
    ok "Gemeldet an ${BRAINBOX_URL} – $(sed -n 's/.*"guests":\([0-9]*\).*/\1/p' "${STATE_DIR}/antwort.json") VMs und Container."
  else
    echo "${stamp} Fehler HTTP ${code:-?} $(head -c 300 "${STATE_DIR}/antwort.json" 2>/dev/null) $(head -c 300 "${STATE_DIR}/fehler.txt")" >"${STATE_DIR}/letzte-meldung"
    case "$code" in
    401) fail "Brainbox kennt den Token nicht – Befehl unter Einstellungen → Proxmox-Server neu erzeugen." ;;
    000 | "") fail "Brainbox unter ${BRAINBOX_URL} nicht erreichbar: $(head -c 200 "${STATE_DIR}/fehler.txt")" ;;
    *) fail "Brainbox hat die Meldung nicht angenommen (HTTP ${code})." ;;
    esac
  fi
}

install_agent() {
  local url="${1:-}" token="${2:-}"
  [[ $EUID -eq 0 ]] || fail "Bitte als root ausführen."
  command -v pvesh >/dev/null 2>&1 || fail "Das ist kein Proxmox-Host (pvesh fehlt)."
  url="${url%/}"
  [[ "$url" =~ ^https?://[A-Za-z0-9.:-]+$ && "$token" =~ ^[A-Za-z0-9_-]{20,200}$ ]] ||
    fail "Aufruf: … install https://wiki.example.de <TOKEN> – den fertigen Befehl gibt es in Brainbox unter Einstellungen → Proxmox-Server."
  # sich selbst ablegen (beim Aufruf über „curl … | bash“ gibt es keine Datei – dann frisch laden)
  if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" && "${BASH_SOURCE[0]}" != "$BIN" ]]; then
    install -m 755 "${BASH_SOURCE[0]}" "$BIN"
  elif [[ ! -f "$BIN" || "${BASH_SOURCE[0]:-}" != "$BIN" ]]; then
    curl -fsSL "${url}/zentrale/agent.sh" -o "${BIN}.neu" || fail "Agent nicht ladbar von ${url}."
    install -m 755 "${BIN}.neu" "$BIN"
    rm -f "${BIN}.neu"
  fi
  (
    umask 077
    printf 'BRAINBOX_URL=%s\nBRAINBOX_TOKEN=%s\n' "$url" "$token" >"$ENV_FILE"
  )
  cat >"/etc/systemd/system/${UNIT}.service" <<EOF
[Unit]
Description=Brainbox-Agent: VMs und Container an Brainbox melden
After=network-online.target pve-cluster.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=${BIN} push
EOF
  cat >"/etc/systemd/system/${UNIT}.timer" <<EOF
[Unit]
Description=Brainbox-Agent alle 5 Minuten

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
RandomizedDelaySec=30

[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now "${UNIT}.timer" >/dev/null 2>&1
  push
  ok "Brainbox-Agent läuft – der Server meldet sich jetzt alle 5 Minuten. Im Wiki steht er nach dem nächsten Abgleich."
}

uninstall_agent() {
  [[ $EUID -eq 0 ]] || fail "Bitte als root ausführen."
  systemctl disable --now "${UNIT}.timer" >/dev/null 2>&1 || true
  rm -f "/etc/systemd/system/${UNIT}.service" "/etc/systemd/system/${UNIT}.timer" "$ENV_FILE"
  rm -rf "$STATE_DIR"
  systemctl daemon-reload
  rm -f "$BIN"
  ok "Brainbox-Agent entfernt. In Brainbox den Server unter Einstellungen → Proxmox-Server entfernen."
}

status_agent() {
  load_env
  say "Meldet an: ${BRAINBOX_URL}"
  say "Zeitplan:  $(systemctl is-active "${UNIT}.timer" 2>/dev/null || echo aus)"
  say "Zuletzt:   $(cat "${STATE_DIR}/letzte-meldung" 2>/dev/null || echo 'noch keine Meldung')"
}

case "${1:-}" in
install) shift; install_agent "$@" ;;
push) push ;;
status) status_agent ;;
uninstall) uninstall_agent ;;
*) sed -n '2,13p' "$0" 2>/dev/null | sed 's/^# \{0,1\}//' || true ;;
esac
