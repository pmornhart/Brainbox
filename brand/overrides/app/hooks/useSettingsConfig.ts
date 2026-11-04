// Brainbox: aufgeräumte Einstellungen.
// Drei Gruppen: „Brainbox“ (Zentrale im Wiki), „Wiki“ und „Konto“.
// Alles, was ein Homelab-Wiki nicht braucht (Slack, Zapier, Webhooks, GitHub,
// Analytics, Gruppen, Emojis, API-Schlüssel, Integrationen …), ist ausgeblendet.
import {
  EmailIcon,
  ProfileIcon,
  UserIcon,
  ShieldIcon,
  TeamIcon,
  SettingsIcon,
  ExportIcon,
  ShapesIcon,
} from "outline-icons";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { createLazyComponent as lazy } from "~/components/LazyLoad";
import { brainboxComponents, brainboxPages } from "~/scenes/Settings/Brainbox";
import { Hook, PluginManager } from "~/utils/PluginManager";
import { settingsPath } from "~/utils/routeHelpers";
import { useComputed } from "./useComputed";
import useCurrentTeam from "./useCurrentTeam";
import useCurrentUser from "./useCurrentUser";
import usePolicy from "./usePolicy";
import useStores from "./useStores";

const Details = lazy(() => import("~/scenes/Settings/Details"));
const Export = lazy(() => import("~/scenes/Settings/Export"));
const Users = lazy(() => import("~/scenes/Settings/Users"));
const Notifications = lazy(() => import("~/scenes/Settings/Notifications"));
const Preferences = lazy(() => import("~/scenes/Settings/Preferences"));
const Profile = lazy(() => import("~/scenes/Settings/Profile"));
const Security = lazy(() => import("~/scenes/Settings/Security"));
const Templates = lazy(() => import("~/scenes/Settings/Templates"));

export type ConfigItem = {
  name: string;
  path: string;
  icon: React.FC<{
    size?: number;
    fill?: string;
    monochrome?: boolean;
  }>;
  component: React.ComponentType;
  description?: string;
  preload?: () => void;
  enabled: boolean;
  group: string;
  pluginId?: string;
};

/** Gruppen in der Reihenfolge, in der sie in der Seitenleiste stehen */
export const SettingsGroup = {
  Brainbox: "Brainbox",
  Wiki: "Wiki",
  Account: "Konto",
} as const;

/** Erweiterungen, die in den Einstellungen bleiben dürfen */
const ALLOWED_PLUGINS = new Set(["passkeys"]);

const useSettingsConfig = () => {
  const { integrations } = useStores();
  const user = useCurrentUser();
  const team = useCurrentTeam();
  const can = usePolicy(team);
  const { t } = useTranslation();

  useEffect(() => {
    void integrations.fetchAllIfNeeded();
  }, [integrations]);

  const config = useComputed(() => {
    const items: ConfigItem[] = [
      // Brainbox: die Zentrale, eingebettet ins Wiki (nur Admins)
      ...brainboxPages.map((page) => ({
        name: page.name,
        path: page.path,
        component: brainboxComponents[page.page],
        enabled: can.update,
        group: SettingsGroup.Brainbox,
        icon: page.icon,
      })),
      // Wiki
      {
        name: "Allgemein",
        path: settingsPath("details"),
        component: Details.Component,
        preload: Details.preload,
        enabled: can.update,
        group: SettingsGroup.Wiki,
        icon: TeamIcon,
      },
      {
        name: "Mitglieder",
        path: settingsPath("users"),
        component: Users.Component,
        preload: Users.preload,
        enabled: can.listUsers,
        group: SettingsGroup.Wiki,
        icon: UserIcon,
      },
      {
        name: "Sicherheit",
        path: settingsPath("security"),
        component: Security.Component,
        preload: Security.preload,
        enabled: can.update,
        group: SettingsGroup.Wiki,
        icon: ShieldIcon,
      },
      {
        name: "Vorlagen",
        path: settingsPath("templates"),
        component: Templates.Component,
        preload: Templates.preload,
        enabled: can.readTemplate,
        group: SettingsGroup.Wiki,
        icon: ShapesIcon,
      },
      {
        name: "Export",
        path: settingsPath("export"),
        component: Export.Component,
        preload: Export.preload,
        enabled: can.createExport,
        group: SettingsGroup.Wiki,
        icon: ExportIcon,
      },
      // Konto
      {
        name: "Profil",
        path: settingsPath(),
        component: Profile.Component,
        preload: Profile.preload,
        enabled: true,
        group: SettingsGroup.Account,
        icon: ProfileIcon,
      },
      {
        name: "Darstellung",
        path: settingsPath("preferences"),
        component: Preferences.Component,
        preload: Preferences.preload,
        enabled: true,
        group: SettingsGroup.Account,
        icon: SettingsIcon,
      },
      {
        name: "Benachrichtigungen",
        path: settingsPath("notifications"),
        component: Notifications.Component,
        preload: Notifications.preload,
        enabled: true,
        group: SettingsGroup.Account,
        icon: EmailIcon,
      },
    ];

    // Erweiterungen: nur Passkeys (unter „Konto“)
    PluginManager.getHooks(Hook.Settings)
      .filter((plugin) => ALLOWED_PLUGINS.has(plugin.id))
      .forEach((plugin) => {
        const after = items.findIndex((i) => i.name === "Benachrichtigungen");
        items.splice(after + 1, 0, {
          name: t(plugin.name),
          path: settingsPath(plugin.id),
          group: SettingsGroup.Account,
          pluginId: plugin.id,
          description: plugin.value.description,
          component: plugin.value.component.Component,
          preload: plugin.value.component.preload,
          enabled: plugin.value.enabled
            ? plugin.value.enabled(team, user)
            : can.update,
          icon: plugin.value.icon,
        } as ConfigItem);
      });

    return items;
  }, [t, can.update, can.createExport, can.listUsers, can.readTemplate]);

  return config.filter((item) => item.enabled);
};

export default useSettingsConfig;
