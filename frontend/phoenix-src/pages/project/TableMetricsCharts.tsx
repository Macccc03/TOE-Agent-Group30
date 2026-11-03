import type { PropsWithChildren } from "react";
export function TableMetricsChartsPanelGroup({
  children,
}: PropsWithChildren<{ view: string; isSkeleton?: boolean }>) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: "1 1 auto",
        minHeight: 0,
      }}
    >
      {children}
    </div>
  );
}
