import type { ComponentSize } from "@phoenix/components/core/types/sizing";

import { useTimeRange } from "./TimeRangeContext";
import { TimeRangeSelector } from "./TimeRangeSelector";

export function ConnectedTimeRangeSelector({
  size = "S",
}: {
  size?: ComponentSize;
}) {
  const { timeRange, setTimeRange } = useTimeRange();
  return (
    <TimeRangeSelector value={timeRange} onChange={setTimeRange} size={size} />
  );
}
