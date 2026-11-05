// Brainbox: Startseite – Begrüßung und Homelab auf einen Blick, darunter
// angeheftete Seiten und die zuletzt angesehenen oder geänderten Dokumente.
import { observer } from "mobx-react";
import { HomeIcon } from "outline-icons";
import { useTranslation } from "react-i18next";
import { Switch, Route, Redirect, useRouteMatch } from "react-router-dom";
import styled from "styled-components";
import { s } from "@shared/styles";
import { Action } from "~/components/Actions";
import BrainboxDashboard from "~/components/BrainboxDashboard";
import Empty from "~/components/Empty";
import InputSearchPage from "~/components/InputSearchPage";
import PaginatedDocumentList from "~/components/PaginatedDocumentList";
import PinnedDocuments from "~/components/PinnedDocuments";
import Scene from "~/components/Scene";
import { Tab, Tabs } from "~/components/Tabs";
import useCurrentUser from "~/hooks/useCurrentUser";
import { usePinnedDocuments } from "~/hooks/usePinnedDocuments";
import usePersistedState from "~/hooks/usePersistedState";
import useStores from "~/hooks/useStores";
import NewDocumentMenu from "~/menus/NewDocumentMenu";

enum HomeTab {
  Viewed = "",
  Updated = "recent",
  Created = "created",
}

function Home() {
  const { documents } = useStores();
  const user = useCurrentUser();
  const { t } = useTranslation();
  const userId = user?.id;
  const { pins, count } = usePinnedDocuments("home");
  const [homeTab, setHomeTab] = usePersistedState<HomeTab>(
    "home-tab",
    HomeTab.Viewed,
    {
      listen: false,
    }
  );

  // Beim Öffnen der Startseite den zuletzt gewählten Reiter wiederherstellen
  const isIndex = !!useRouteMatch({ path: "/home", exact: true });
  const redirectTo =
    isIndex &&
    (homeTab === HomeTab.Updated || homeTab === HomeTab.Created)
      ? `/home/${homeTab}`
      : undefined;

  const recentlyViewed = (
    <PaginatedDocumentList
      key="recent"
      documents={documents.recentlyViewed}
      fetch={documents.fetchRecentlyViewed}
      empty={<Empty>Seiten, die du dir ansiehst, stehen hier zum schnellen Wiederfinden.</Empty>}
      showCollection
    />
  );

  return (
    <Scene
      icon={<HomeIcon />}
      title="Startseite"
      left={<InputSearchPage source="dashboard" label={t("Search documents")} />}
      actions={
        <Action>
          <NewDocumentMenu />
        </Action>
      }
    >
      <BrainboxDashboard />
      <PinnedDocuments pins={pins} placeholderCount={count} collapseKey="home" />
      <Documents>
        {!redirectTo && (
          <Tabs>
            <Tab to="/home" exact onClick={() => setHomeTab(HomeTab.Viewed)}>
              Zuletzt angesehen
            </Tab>
            <Tab to="/home/recent" exact onClick={() => setHomeTab(HomeTab.Updated)}>
              Zuletzt geändert
            </Tab>
            <Tab to="/home/created" onClick={() => setHomeTab(HomeTab.Created)}>
              Von mir
            </Tab>
          </Tabs>
        )}
        <Switch>
          <Route path="/home" exact>
            {redirectTo ? <Redirect to={redirectTo} /> : recentlyViewed}
          </Route>
          <Route path="/home/recent">
            <PaginatedDocumentList
              documents={documents.recentlyUpdated}
              fetch={documents.fetchRecentlyUpdated}
              empty={<Empty>Noch keine Seiten.</Empty>}
              showCollection
            />
          </Route>
          <Route path="/home/created">
            <PaginatedDocumentList
              key="created"
              documents={documents.createdByUser(userId)}
              fetch={documents.fetchOwned}
              options={{
                filters: [{ field: "createdById", operator: "eq", value: userId }],
              }}
              empty={<Empty>Du hast noch keine Seiten angelegt.</Empty>}
              showCollection
            />
          </Route>
          <Route path="/home">{recentlyViewed}</Route>
        </Switch>
      </Documents>
    </Scene>
  );
}

const Documents = styled.div`
  position: relative;
  background: ${s("background")};
`;

export default observer(Home);
