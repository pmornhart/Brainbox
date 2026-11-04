// Brainbox: Seitenleiste der Einstellungen – Gruppen Brainbox, Wiki, Konto
// und unten die Brainbox-Version statt der Outline-Version.
import { groupBy } from "es-toolkit/compat";
import { observer } from "mobx-react";
import { BackIcon } from "outline-icons";
import { useCallback } from "react";
import { useHistory } from "react-router-dom";
import styled from "styled-components";
import Flex from "~/components/Flex";
import Scrollable from "~/components/Scrollable";
import useSettingsConfig from "~/hooks/useSettingsConfig";
import { useLocationSelector } from "~/hooks/useLocationSelector";
import { settingsPath } from "~/utils/routeHelpers";
import Sidebar from "./Sidebar";
import BrainboxVersion from "./components/BrainboxVersion";
import Header from "./components/Header";
import HistoryNavigation from "./components/HistoryNavigation";
import Section from "./components/Section";
import SidebarButton from "./components/SidebarButton";
import SidebarLink from "./components/SidebarLink";

function SettingsSidebar() {
  const history = useHistory();
  const pathname = useLocationSelector((location) => location.pathname);
  const configs = useSettingsConfig();
  const groupedConfig = groupBy(configs, "group");

  const returnToApp = useCallback(() => {
    history.push("/home");
  }, [history]);

  return (
    <Sidebar canCollapse={false}>
      <SidebarButton
        title="Zurück zum Wiki"
        image={<StyledBackIcon />}
        onClick={returnToApp}
      />

      <Flex auto column>
        <Scrollable shadow>
          {Object.keys(groupedConfig).map((header) => (
            <Section key={header}>
              <Header title={header}>
                {groupedConfig[header].map((item) => (
                  <SidebarLink
                    key={item.path}
                    to={item.path}
                    onClickIntent={item.preload}
                    active={
                      item.path.startsWith(settingsPath("templates"))
                        ? pathname.startsWith(item.path)
                        : undefined
                    }
                    icon={<item.icon />}
                    label={item.name}
                  />
                ))}
              </Header>
            </Section>
          ))}
          <Section>
            <Header title="Installation" />
            <BrainboxVersion />
          </Section>
        </Scrollable>
      </Flex>
      <HistoryNavigation />
    </Sidebar>
  );
}

const StyledBackIcon = styled(BackIcon)`
  margin-inline-start: 4px;

  [dir="rtl"] & {
    transform: rotate(180deg);
  }
`;

export default observer(SettingsSidebar);
