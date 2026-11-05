// Brainbox: aufgeräumte Einstellungen.
// Drei Gruppen – „Brainbox“, „Wiki“ und „Konto“ – alle im Stil der Brainbox-Zentrale
// (siehe scenes/Settings/Brainbox.tsx). Dazu kommt nur noch „Passkeys“ aus den Erweiterungen.
// Slack, Zapier, Webhooks, GitHub, Analytics, Gruppen, Emojis, API-Schlüssel und
// Integrationen sind ausgeblendet.
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { zentraleComponents, zentralePages } from "~/scenes/Settings/Brainbox";
import type { PageAccess } from "~/scenes/Settings/Brainbox";
import { Hook, PluginManager } from "~/utils/PluginManager";
import { settingsPath } from "~/utils/routeHelpers";
import { useComputed } from "./useComputed";
import useCurrentTeam from "./useCurrentTeam";
import useCurrentUser from "./useCurrentUser";
import usePolicy from "./usePolicy";
import useStores from "./useStores";

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
    const allowed: Record<PageAccess, boolean> = {
      admin: !!can.update,
      listUsers: !!can.listUsers,
      readTemplate: !!can.readTemplate,
      createExport: !!can.createExport,
      all: true,
    };
    const items: ConfigItem[] = zentralePages.map((page) => ({
      name: page.name,
      path: page.path,
      component: zentraleComponents[page.page],
      enabled: allowed[page.access],
      group: page.group,
      icon: page.icon,
    }));

    // Erweiterungen: nur Passkeys (unter „Konto“, nach „Benachrichtigungen“)
    PluginManager.getHooks(Hook.Settings)
      .filter((plugin) => ALLOWED_PLUGINS.has(plugin.id))
      .forEach((plugin) => {
        const after = items.findIndex((i) => i.name === "Benachrichtigungen");
        items.splice(after + 1, 0, {
          name: t(plugin.name),
          path: settingsPath(plugin.id),
          group: "Konto",
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
