import { css } from "@emotion/react";
import { useLazyLoadQuery } from "react-relay";

import { JSONViewBody } from "@phoenix/components/code/jsonView/JSONViewBody";
import { JSONViewProvider } from "@phoenix/components/code/jsonView/JSONViewContext";
import { JSONViewToolbar } from "@phoenix/components/code/jsonView/JSONViewToolbar";
import { PreBlock } from "@phoenix/components/code/PreBlock";
import { Card } from "@phoenix/components/core/card/Card";
import { ExpandableContent } from "@phoenix/components/core/content/ExpandableContent";
import { Text } from "@phoenix/components/core/content/Text";
import { CopyToClipboardButton } from "@phoenix/components/core/copy/CopyToClipboardButton";
import {
  Disclosure,
  DisclosureGroup,
  DisclosurePanel,
  DisclosureTrigger,
} from "@phoenix/components/core/disclosure/Disclosure";
import { EmptyState } from "@phoenix/components/core/empty/EmptyState";
import { EmptyStateArea } from "@phoenix/components/core/empty/EmptyStateArea";
import { EmptyStateGraphic } from "@phoenix/components/core/empty/EmptyStateGraphic";
import { Icon } from "@phoenix/components/core/icon/Icon";
import { Icons } from "@phoenix/components/core/icon/index";
import { Flex } from "@phoenix/components/core/layout/Flex";
import { Truncate } from "@phoenix/components/core/utility/Truncate";
import { View } from "@phoenix/components/core/view/View";
import { useTimeFormatters } from "@phoenix/hooks/useTimeFormatters";
import { isPlainObject } from "@phoenix/utils/jsonUtils";

import type { SpanEventsListQuery } from "./__generated__/SpanEventsListQuery.graphql";
import __compiled_0 from "./__generated__/SpanEventsListQuery.graphql";

type SpanEventsListProps = {
  spanId: string;
};

/**
 * Wrapper component that lazily fetches span events with attributes
 * when the Events tab is selected.
 */
export function SpanEventsList({ spanId }: SpanEventsListProps) {
  const data = useLazyLoadQuery<SpanEventsListQuery>(__compiled_0, {
    id: spanId,
  });

  const events = data.span?.events ?? [];

  return <SpanEventsListContent events={events} />;
}

type SpanEvent = {
  name: string;
  message: string;
  timestamp: string;
  attributes: unknown;
};

const EXCEPTION_STACKTRACE = "exception.stacktrace";

function EventAttributesJSONView({ attributes }: { attributes: unknown }) {
  return (
    <JSONViewProvider
      value={attributes}
      defaultMode="table"
      indexNotation="dot"
    >
      <Card
        title="Attributes"
        extra={<JSONViewToolbar searchPlaceholder="Search event attributes" />}
      >
        <JSONViewBody />
      </Card>
    </JSONViewProvider>
  );
}

export function SpanEventAttributes({ event }: { event: SpanEvent }) {
  const exceptionAttributes =
    event.name === "exception" && isPlainObject(event.attributes)
      ? event.attributes
      : {};
  const { [EXCEPTION_STACKTRACE]: stacktrace, ...remainingAttributes } =
    exceptionAttributes;
  if (typeof stacktrace !== "string" || stacktrace.length === 0) {
    return (
      <View padding="size-200">
        <EventAttributesJSONView attributes={event.attributes} />
      </View>
    );
  }
  return (
    <View padding="size-200">
      <Flex direction="column" gap="size-200">
        <Card
          title="Stack trace"
          extra={
            <CopyToClipboardButton
              aria-label="Copy stack trace"
              text={stacktrace}
              tooltipText="Copy stack trace"
            />
          }
        >
          <ExpandableContent height={320} expandedBehavior="grow">
            <PreBlock>{stacktrace}</PreBlock>
          </ExpandableContent>
        </Card>
        {Object.keys(remainingAttributes).length > 0 ? (
          <EventAttributesJSONView attributes={remainingAttributes} />
        ) : null}
      </Flex>
    </View>
  );
}

function SpanEventsListContent({ events }: { events: readonly SpanEvent[] }) {
  const { fullTimeFormatter } = useTimeFormatters();

  if (events.length === 0) {
    return (
      <EmptyStateArea>
        <EmptyState
          graphic={<EmptyStateGraphic variant="event" />}
          description="No events for this span"
        />
      </EmptyStateArea>
    );
  }

  return (
    <DisclosureGroup
      css={css`
        .react-aria-Button[slot="trigger"] {
          padding: var(--global-dimension-size-200);
        }
      `}
    >
      {events.map((event, idx) => {
        const isException = event.name === "exception";
        const hasAttributes =
          event.attributes &&
          typeof event.attributes === "object" &&
          Object.keys(event.attributes).length > 0;

        const eventHeader = (
          <Flex direction="row" gap="size-100" alignItems="center">
            <View flex="none">
              <Text color="text-700">
                {fullTimeFormatter(new Date(event.timestamp))}
              </Text>
            </View>
            {isException && (
              <View flex="none">
                <Icon svg={<Icons.AlertTriangle />} color="danger" />
              </View>
            )}
            <Flex direction="row" gap="size-100">
              <Text weight="heavy">{event.name}</Text>
              <Truncate maxWidth="200px" title={event.message}>
                {event.message && <Text color="text-700">{event.message}</Text>}
              </Truncate>
            </Flex>
          </Flex>
        );

        return (
          <Disclosure key={idx} isDisabled={!hasAttributes}>
            <DisclosureTrigger arrowPosition="start">
              {eventHeader}
            </DisclosureTrigger>
            {hasAttributes ? (
              <DisclosurePanel>
                <SpanEventAttributes event={event} />
              </DisclosurePanel>
            ) : null}
          </Disclosure>
        );
      })}
    </DisclosureGroup>
  );
}
