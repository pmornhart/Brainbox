// Brainbox: Menü unter dem eigenen Namen (unten links in der Seitenleiste).
// Oben stehen die Konto-Einstellungen, darunter Farbschema, Hilfe und Abmelden.
import { observer } from "mobx-react";
import {
  EmailIcon,
  KeyIcon,
  PaletteIcon,
  ProfileIcon,
} from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  ActionSeparator,
  createActionGroup,
  createInternalLinkAction,
} from "~/actions";
import {
  logout,
  navigateToSettings,
  openBugReportUrl,
  openChangelog,
  openDocumentation,
  openKeyboardShortcuts,
} from "~/actions/definitions/navigation";
import { changeTheme } from "~/actions/definitions/settings";
import { NavigationSection } from "~/actions/sections";
import { DropdownMenu } from "~/components/Menu/DropdownMenu";
import { useMenuAction } from "~/hooks/useMenuAction";
import { settingsPath } from "~/utils/routeHelpers";

type Props = {
  children?: React.ReactNode;
};

const accountProfile = createInternalLinkAction({
  name: () => "Profil",
  analyticsName: "Navigate to profile settings",
  section: NavigationSection,
  icon: <ProfileIcon />,
  to: settingsPath(),
});

const accountAppearance = createInternalLinkAction({
  name: () => "Darstellung",
  analyticsName: "Navigate to account preferences",
  section: NavigationSection,
  icon: <PaletteIcon />,
  to: settingsPath("preferences"),
});

const accountNotifications = createInternalLinkAction({
  name: () => "Benachrichtigungen",
  analyticsName: "Navigate to notification settings",
  section: NavigationSection,
  icon: <EmailIcon />,
  to: settingsPath("notifications"),
});

const accountPasskeys = createInternalLinkAction({
  name: () => "Passkeys",
  analyticsName: "Navigate to passkeys",
  section: NavigationSection,
  icon: <KeyIcon />,
  to: settingsPath("passkeys"),
});

// gleiche Aktionen wie im Kern, nur mit Brainbox-Namen
const themeMenu = { ...changeTheme, name: () => "Farbschema" };
const signOut = { ...logout, name: () => "Abmelden" };

const AccountMenu: React.FC<Props> = ({ children }: Props) => {
  const { t } = useTranslation();

  const actions = React.useMemo(
    () => [
      createActionGroup({
        name: "Konto",
        actions: [
          accountProfile,
          accountAppearance,
          accountNotifications,
          accountPasskeys,
        ],
      }),
      ActionSeparator,
      themeMenu,
      navigateToSettings,
      ActionSeparator,
      openDocumentation,
      openKeyboardShortcuts,
      openChangelog,
      openBugReportUrl,
      ActionSeparator,
      signOut,
    ],
    []
  );

  const rootAction = useMenuAction(actions);

  return (
    <DropdownMenu action={rootAction} align="end" ariaLabel={t("Account")}>
      {children}
    </DropdownMenu>
  );
};

export default observer(AccountMenu);
