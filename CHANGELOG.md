# Änderungen

Brainbox hat eigene Versionen. Der Kern (Outline) ist je Version fest getestet und steht dabei.

## 1.0.0 – 04.11.2026 · Kern: Outline v1.12.0

Erste eigenständige Brainbox.

- **Eigenes Gesicht:** Logo, Name, Icons, Schrift (Geist) und Farbschema „Homelab-Konsole“, dunkel als Standard
- **Brainbox-Zentrale** im Browser (`/zentrale`, unten in der Seitenleiste): Übersicht, Proxmox-Server, NetBird, Claude, Bereiche, Anmeldung, Update
- **Mehrere Proxmox-Server**, jeder mit eigenem Eintrag und seinen VMs/Containern darunter
- **Ein Container = ein Wiki:** Wiki und Admin werden bei der Installation angelegt, Login-Link am Ende
- **Sechs Anmeldewege:** E-Mail, Passkey, Google, Microsoft, Discord, OIDC (`brainbox-login`)
- **Claude** mit eigenem Konto über den MCP-Anschluss (`brainbox-connect claude`)
- **Proxmox und NetBird** automatisch im Wiki, alle 5 Minuten abgeglichen
- **Bereiche** per Zuordnungsregeln, z. B. `*.morninghosting.de → Minecraft-Server`
- **Update mit Rückweg:** sichert Datenbank und Einstellungen, spielt bei Fehlern die alte Version zurück
- **Update-Symbol:** Brainbox sieht alle 6 Stunden nach neuen Versionen; im Wiki erscheint dann „Update verfügbar“ in der Seitenleiste, in der Zentrale „Jetzt aktualisieren“
- **Update-Befehl:** `update` (auch `brainbox-update`) im Container, `pct exec <ID> -- update` vom Proxmox-Host

Verfasst mit Claude 🤖
