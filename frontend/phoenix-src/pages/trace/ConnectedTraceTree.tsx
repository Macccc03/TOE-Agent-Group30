import { useMemo } from "react";
import { usePaginationFragment } from "react-relay";

import { useProjectAnnotationConfigsByName } from "@phoenix/components/annotation/useProjectAnnotationConfigsByName";
import { Alert } from "@phoenix/components/core/alert/Alert";
import { Button } from "@phoenix/components/core/button/Button";
import { Flex } from "@phoenix/components/core/layout/Flex";
import type { TraceTreeProps } from "@phoenix/components/trace/TraceTree";
import { TraceTree } from "@phoenix/components/trace/TraceTree";

import type { ConnectedTraceTree$key } from "./__generated__/ConnectedTraceTree.graphql";
import __compiled_0 from "./__generated__/ConnectedTraceTree.graphql";
import type { ConnectedTraceTreeQuery } from "./__generated__/ConnectedTraceTreeQuery.graphql";

type ConnectedTraceTreeProps = {
  trace: ConnectedTraceTree$key;
} & Omit<TraceTreeProps, "spans" | "annotationConfigsByName">;

const PAGE_SIZE = 1000;
/**
 * A TraceTree that is connected to relay via data fetching
 */
export function ConnectedTraceTree(props: ConnectedTraceTreeProps) {
  const { data, hasNext, loadNext } = usePaginationFragment<
    ConnectedTraceTreeQuery,
    ConnectedTraceTree$key
  >(__compiled_0, props.trace);
  const spansList = useMemo(() => {
    const gqlSpans = data?.spans.edges || [];
    return gqlSpans.map((node) => node.span);
  }, [data]);
  const annotationConfigsByName = useProjectAnnotationConfigsByName(
    data.project
  );

  const totalSpans = data?.numSpans;
  const totalSpansViewing = spansList.length;
  return (
    <Flex direction="column" flex="1 1 auto" minHeight={0}>
      {hasNext ? (
        <Alert
          variant="warning"
          banner
          extra={
            <Button
              size="S"
              variant="primary"
              onPress={() => {
                loadNext(PAGE_SIZE);
              }}
            >
              Load More
            </Button>
          }
        >
          Viewing {totalSpansViewing} of {totalSpans} spans.
        </Alert>
      ) : null}
      <TraceTree
        spans={spansList}
        annotationConfigsByName={annotationConfigsByName}
        {...props}
      />
    </Flex>
  );
}
