#!/usr/bin/env bash
# ------------------------------------------------------------------------------
# Brainbox – Teile einrichten (von install.sh und update aufgerufen)
#
#   bash /opt/brainbox-kit/teile-einrichten.sh
#
# Installiert aus dem Brainbox-Bausatz (/opt/brainbox-kit) die Befehle update
# (auch als brainbox-update), brainbox-login und brainbox-connect, das Abgleich-Programm und die
# Brainbox-Zentrale. Die Zentrale lauscht auf Port 3000 und reicht das Wiki an
# den Outline-Kern auf Port 3100 weiter. Mehrfach ausführbar.
# Lizenz: MIT, siehe LICENSE.
# ------------------------------------------------------------------------------
set -Eeuo pipefail

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="/opt/brainbox"
ENV_FILE="${APP_DIR}/.env"
CORE_PORT="3100"

install -m 755 "${KIT_DIR}/update.sh" /usr/bin/update
ln -sf /usr/bin/update /usr/bin/brainbox-update   # gleicher Befehl, passend zu brainbox-login/-connect
install -m 755 "${KIT_DIR}/brainbox-login.sh" /usr/bin/brainbox-login
install -m 755 "${KIT_DIR}/brainbox-connect.sh" /usr/bin/brainbox-connect
mkdir -p /opt/brainbox-connect /etc/brainbox /var/lib/brainbox-connect /var/lib/brainbox
chmod 700 /etc/brainbox
install -m 755 "${KIT_DIR}/connect/sync.mjs" /opt/brainbox-connect/sync.mjs

# Outline-Kern auf Port 3100, davor die Zentrale auf Port 3000
if [[ -f "$ENV_FILE" ]] && ! grep -q "^PORT=${CORE_PORT}$" "$ENV_FILE"; then
  if grep -q "^PORT=" "$ENV_FILE"; then sed -i "s#^PORT=.*#PORT=${CORE_PORT}#" "$ENV_FILE"; else echo "PORT=${CORE_PORT}" >>"$ENV_FILE"; fi
fi

cat >/etc/systemd/system/brainbox.service <<EOF
[Unit]
Description=Brainbox-Kern (Outline)
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

cat >/etc/systemd/system/brainbox-zentrale.service <<EOF
[Unit]
Description=Brainbox-Zentrale und Tor zum Wiki (Port 3000)
After=network.target brainbox.service

[Service]
Type=simple
User=root
Environment=BRAINBOX_LISTEN=3000
Environment=BRAINBOX_CORE_PORT=${CORE_PORT}
ExecStart=/usr/bin/node ${KIT_DIR}/zentrale/server.mjs
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload >/dev/null 2>&1 || true
systemctl enable brainbox.service brainbox-zentrale.service >/dev/null 2>&1 || true
