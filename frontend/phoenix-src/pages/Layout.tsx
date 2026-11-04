import { css } from "@emotion/react";
import { Suspense, useRef } from "react";
import { Outlet, useLoaderData } from "react-router";

import { Counter } from "@phoenix/components/core/counter/Counter";
import { Icon } from "@phoenix/components/core/icon/Icon";
import { Icons } from "@phoenix/components/core/icon/index";
import { Flex } from "@phoenix/components/core/layout/Flex";
import { Loading } from "@phoenix/components/core/loading/Loading";
import {
  DrawerPlane,
  OverlayFrameProvider,
  useOverlayFrame,
  ViewportModalPlane,
  ViewportPortal,
} from "@phoenix/components/core/overlay/frame";
import { ToastRegion } from "@phoenix/components/core/toast/ToastRegion";
import { APP_FLOATING_Z_INDEX } from "@phoenix/components/core/zIndex";
import {
  Brand,
  NavLink,
  SideNavbar,
  TopNavbar,
} from "@phoenix/components/nav/Navbar";
import { NavBreadcrumb } from "@phoenix/components/nav/NavBreadcrumb";
import { SideNavToggleButton } from "@phoenix/components/nav/SideNavToggleButton";
import {
  TopNavActionsProvider,
  TopNavActionsSlot,
} from "@phoenix/components/nav/TopNavActions";
import { useResponsiveSideNav } from "@phoenix/components/nav/useResponsiveSideNav";
import { useOwnedPreloadedQuery } from "@phoenix/hooks/useOwnedPreloadedQuery";

import type { layoutLoaderQuery } from "./__generated__/layoutLoaderQuery.graphql";
import type { LayoutLoaderData } from "./layoutLoader";
import { layoutLoaderGql } from "./layoutLoader";

const layoutCSS = css`
  height: 100vh;
  width: 100vw;

  &[data-has-pinned-rail="false"] {
    min-width: 400px;
  }

  &[data-has-pinned-rail="true"] {
    min-width: 841px;
  }
`;

const applicationViewportCSS = css`
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  height: 100%;
  overflow: hidden;
`;

const layoutContentPanelCSS = css`
  min-width: 0;
  overflow: hidden;
`;

const sideNavCellCSS = css`
  grid-column: 1;
  grid-row: 1 / 3;
  min-height: 0;
`;

const topNavCellCSS = css`
  grid-column: 2;
  grid-row: 1;
  min-width: 0;
`;

const topNavPageControlsCSS = css`
  display: contents;
`;

const topNavAssistantControlCSS = css`
  position: relative;
  z-index: ${APP_FLOATING_Z_INDEX};
  flex: none;
`;

const contentCSS = css`
  grid-column: 2;
  grid-row: 2;
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  background-color: var(--global-color-gray-75);
  border-left: 1px solid var(--global-border-color-default);
  border-top: 1px solid var(--global-border-color-default);
  border-radius: var(--global-rounding-medium) 0 0 0;
`;

const drawerPlaneCellCSS = css`
  grid-column: 1 / 3;
  grid-row: 2;
`;

const viewportModalPlaneCellCSS = css`
  grid-column: 1 / 3;
  grid-row: 1 / 3;
`;

const bottomLinksCSS = css`
  display: flex;
  flex-direction: column;
  margin: 0;
  list-style: none;
  gap: var(--global-dimension-size-50);
  padding-inline-start: 0;
`;

const sideLinksCSS = css`
  display: flex;
  flex-direction: column;
  gap: var(--global-dimension-size-50);
`;

export function Layout() {
  return (
    <OverlayFrameProvider>
      <ApplicationFrame />
    </OverlayFrameProvider>
  );
}

function ApplicationFrame() {
  const contentRef = useRef<HTMLDivElement>(null);
  const frame = useOverlayFrame();
  const { isSideNavExpanded, isSideNavExpansionAllowed, setIsSideNavExpanded } =
    useResponsiveSideNav();
  return (
    <TopNavActionsProvider>
      <div css={layoutCSS} data-has-pinned-rail="false">
        <div
          data-testid="application-viewport"
          css={applicationViewportCSS}
          ref={frame?.setApplicationViewportElement}
        >
          <ViewportPortal>
            <ToastRegion />
          </ViewportPortal>
          <div
            data-testid="application-side-navigation"
            css={sideNavCellCSS}
            inert={frame?.isViewportBlocked || undefined}
            ref={frame?.setSideNavigationElement}
          >
            <SideNav isExpanded={isSideNavExpanded} />
          </div>
          <div data-testid="application-top-navigation" css={topNavCellCSS}>
            <TopNavbar>
              <div
                className="top-navbar__page-controls"
                css={topNavPageControlsCSS}
                data-testid="application-top-navigation-page-controls"
                inert={frame?.isViewportBlocked || undefined}
              >
                <SideNavToggleButton
                  isExpanded={isSideNavExpanded}
                  isDisabled={!isSideNavExpansionAllowed}
                  onExpandedChange={setIsSideNavExpanded}
                />
                <NavBreadcrumb />
                <TopNavActionsSlot />
              </div>
            </TopNavbar>
          </div>
          <div
            data-testid="content"
            css={contentCSS}
            inert={frame?.isViewportBlocked || undefined}
            ref={contentRef}
          >
            <Suspense fallback={<Loading />}>
              {/* Mount routed drawers after their portal host exists. */}
              {frame?.drawerHostElement ? <Outlet /> : <Loading />}
            </Suspense>
          </div>
          <DrawerPlane css={drawerPlaneCellCSS} />
          <ViewportModalPlane css={viewportModalPlaneCellCSS} />
        </div>
      </div>
    </TopNavActionsProvider>
  );
}

function SideNav({ isExpanded }: { isExpanded: boolean }) {
  const loaderData = useLoaderData<LayoutLoaderData>();
  return (
    <Suspense fallback={<SideNavContent isExpanded={isExpanded} />}>
      <SideNavWithCounts
        isExpanded={isExpanded}
        queryRef={loaderData.queryRef}
      />
    </Suspense>
  );
}

function SideNavWithCounts({
  isExpanded,
  queryRef,
}: {
  isExpanded: boolean;
  queryRef: LayoutLoaderData["queryRef"];
}) {
  const counts = useOwnedPreloadedQuery<layoutLoaderQuery>({
    query: layoutLoaderGql,
    queryRef,
  });

  return <SideNavContent isExpanded={isExpanded} counts={counts} />;
}

function SideNavContent({
  isExpanded,
  counts,
}: {
  isExpanded: boolean;
  counts?: layoutLoaderQuery["response"];
}) {
  return (
    <SideNavbar isExpanded={isExpanded}>
      <Brand />
      <Flex direction="column" justifyContent="space-between" flex="1 1 auto">
        <ul css={sideLinksCSS}>
          <li>
            <NavLink
              to="/dashboard"
              text="全局看板"
              leadingVisual={<Icon svg={<Icons.BarChart />} />}
              isExpanded={isExpanded}
            />
          </li>
          <li>
            <NavLink
              to="/projects"
              text="Tracing"
              leadingVisual={<Icon svg={<Icons.Trace />} />}
              trailingVisual={
                counts?.projectCount != null ? (
                  <Counter variant="quiet">{counts.projectCount}</Counter>
                ) : undefined
              }
              isExpanded={isExpanded}
            />
          </li>

          {/* The generative workbench: destinations for talking to models
              directly rather than observing an application. */}
        </ul>
        <ul css={bottomLinksCSS}></ul>
      </Flex>
    </SideNavbar>
  );
}
