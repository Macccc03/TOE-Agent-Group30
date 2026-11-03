import { css } from "@emotion/react";
import type { PropsWithChildren } from "react";
import { Suspense, useRef } from "react";
import { useLazyLoadQuery } from "react-relay";
import { Group, Panel } from "react-resizable-panels";

import { Counter } from "@phoenix/components/core/counter/Counter";
import { EdgeFade } from "@phoenix/components/core/layout/EdgeFade";
import { Flex } from "@phoenix/components/core/layout/Flex";
import { Loading } from "@phoenix/components/core/loading/Loading";
import { Skeleton } from "@phoenix/components/core/loading/Skeleton";
import {
  LazyTabPanel,
  Tab,
  TabList,
  Tabs,
} from "@phoenix/components/core/tabs/Tabs";
import { View } from "@phoenix/components/core/view/View";
import { ErrorBoundary } from "@phoenix/components/exception/ErrorBoundary";
import { useDimensions } from "@phoenix/hooks/useDimensions";
import { SpanAttributesCard } from "@phoenix/pages/trace/span/SpanAttributesCard";
import { SpanInfo } from "@phoenix/pages/trace/span/SpanInfo";

import { SpanHeader } from "../SpanHeader";
import type {
  SpanDetailsQuery,
  SpanDetailsQuery$data,
} from "./__generated__/SpanDetailsQuery.graphql";
import __compiled_0 from "./__generated__/SpanDetailsQuery.graphql";
import { SpanEventsList } from "./SpanEventsList";

type Span = Extract<SpanDetailsQuery$data["span"], { __typename: "Span" }>;

const spanHasException = (span: Span) => {
  return span.events.some((event) => event.name === "exception");
};

// Below this container width the header actions collapse to icon-only buttons.
// The identity row also holds the span kind, name, and status badge, so the
// actions have to give up their labels well before the container gets narrow.
const CONDENSED_VIEW_CONTAINER_WIDTH_THRESHOLD = 1200;
// The side panel sizes in pixels
const ASIDE_PANEL_DEFAULT_SIZE_PIXELS = 400;
const ASIDE_PANEL_MIN_SIZE_PIXELS = 300;
const ASIDE_PANEL_MAX_SIZE_PIXELS = 500;
export function SpanDetails({
  spanNodeId,
}: {
  /**
   * The Global ID of the span
   */
  spanNodeId: string;
}) {
  return (
    <>
      <SpanDetailsContent spanNodeId={spanNodeId} />
    </>
  );
}

function SpanDetailsContent({ spanNodeId }: { spanNodeId: string }) {
  const spanDetailsContainerRef = useRef<HTMLDivElement>(null);
  const spanDetailsContainerDimensions = useDimensions(spanDetailsContainerRef);
  const isCondensedView = spanDetailsContainerDimensions?.width
    ? spanDetailsContainerDimensions.width <
      CONDENSED_VIEW_CONTAINER_WIDTH_THRESHOLD
    : true;
  const { span } = useLazyLoadQuery<SpanDetailsQuery>(__compiled_0, {
    id: spanNodeId,
  });

  if (span.__typename !== "Span") {
    throw new Error(
      "Expected a span, but got a different type" + span.__typename
    );
  }

  // scoped so only the active trace of the compare view responds

  const hasExceptions = spanHasException(span);

  return (
    // No fixed group id: the aside panel ref resolves its group by id, so two
    // mounted span details (the compare view) must not share one
    <Group orientation="horizontal">
      <Panel>
        <Flex
          direction="column"
          flex="1 1 auto"
          height="100%"
          ref={spanDetailsContainerRef}
        >
          <View
            paddingTop="size-100"
            paddingBottom="size-100"
            paddingStart="size-150"
            paddingEnd="size-200"
            flex="none"
            data-testid="span-header-row"
          >
            <SpanHeader span={span} actions={<></>} />
          </View>
          <Tabs>
            <TabList extra={<></>}>
              <Tab id="info">Info</Tab>
              <Tab id="attributes">Attributes</Tab>
              <Tab id="events">
                Events{" "}
                <Counter variant={hasExceptions ? "danger" : "default"}>
                  {span.events.length}
                </Counter>
              </Tab>
            </TabList>
            <LazyTabPanel id="info">
              <Flex direction="row" height="100%">
                <SpanInfoWrap>
                  <ErrorBoundary>
                    <SpanInfo span={span} />
                  </ErrorBoundary>
                </SpanInfoWrap>
              </Flex>
            </LazyTabPanel>
            <LazyTabPanel id="attributes">
              <View
                padding="size-200"
                height="100%"
                maxHeight="100%"
                overflow="auto"
              >
                <SpanAttributesCard attributes={span.attributes} />
              </View>
            </LazyTabPanel>

            <LazyTabPanel id="events">
              <View height="100%" overflow="auto">
                <Suspense fallback={<Loading />}>
                  <SpanEventsList spanId={span.id} />
                </Suspense>
              </View>
            </LazyTabPanel>
          </Tabs>
        </Flex>
      </Panel>
    </Group>
  );
}

const spanInfoWrapCSS = css`
  flex: 1 1 auto;
  overflow-y: auto;
  // Overflow fails to take into account padding
  & > *:after {
    content: "";
    display: block;
    height: var(--global-dimension-size-400);
  }
`;

/**
 * A wrapper for the span info to style it with the appropriate overflow
 */
function SpanInfoWrap({ children }: PropsWithChildren) {
  return (
    <div css={spanInfoWrapCSS} data-testid="span-info-wrap">
      {children}
    </div>
  );
}

const spanDetailsSkeletonCSS = css`
  height: 100%;
  overflow: hidden;
  padding: var(--global-dimension-size-200);
  box-sizing: border-box;
  .span-details-skeleton__blocks {
    display: flex;
    flex-direction: column;
    gap: var(--global-dimension-size-200);
    /* Capped so a short panel shrinks the fade band rather than clipping
       the blocks mid-fade. */
    max-height: 100%;
    overflow: hidden;
  }
  .span-details-skeleton__blocks > * {
    flex: none;
  }
`;

/**
 * A loading placeholder for `SpanDetails`: one block for the span header and
 * tab list, then the cards of the info tab.
 */
export function SpanDetailsSkeleton() {
  return (
    <div role="status" aria-label="loading" css={spanDetailsSkeletonCSS}>
      <EdgeFade
        edge="bottom"
        className="span-details-skeleton__blocks"
        aria-hidden
      >
        <Skeleton height={96} borderRadius="medium" />
        <Skeleton height={180} borderRadius="medium" />
        <Skeleton height={240} borderRadius="medium" />
      </EdgeFade>
    </div>
  );
}
