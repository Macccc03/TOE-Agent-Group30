import { useMemo } from "react";
import { useLazyLoadQuery } from "react-relay";

import type { TraceTokenCountDetailsQuery } from "./__generated__/TraceTokenCountDetailsQuery.graphql";
import __compiled_0 from "./__generated__/TraceTokenCountDetailsQuery.graphql";
import {
  getTokenCountDetailsFromCostDetails,
  TokenCountDetails,
} from "./TokenCountDetails";

export function TraceTokenCountDetails(props: { traceNodeId: string }) {
  const data = useLazyLoadQuery<TraceTokenCountDetailsQuery>(__compiled_0, {
    nodeId: props.traceNodeId,
  });

  const tokenData = useMemo(() => {
    if (data.node.__typename === "Trace") {
      const tracePrompt = data.node.rootSpan?.cumulativeTokenCountPrompt ?? 0;
      const traceCompletion =
        data.node.rootSpan?.cumulativeTokenCountCompletion ?? 0;

      const { promptDetails, completionDetails } =
        getTokenCountDetailsFromCostDetails(data.node.costDetailSummaryEntries);

      return {
        total: tracePrompt + traceCompletion,
        prompt: tracePrompt,
        completion: traceCompletion,
        promptDetails,
        completionDetails,
      };
    }

    return {
      total: null,
      prompt: null,
      completion: null,
    };
  }, [data.node]);

  return <TokenCountDetails {...tokenData} />;
}
