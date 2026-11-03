import { Suspense } from "react";
import type { PreloadedQuery } from "react-relay";
import { usePreloadedQuery } from "react-relay";
import { Outlet } from "react-router";

import { ErrorBoundary } from "@phoenix/components/exception/ErrorBoundary";
import { TableSkeleton } from "@phoenix/components/table/TableSkeleton";
import { TableMetricsChartsPanelGroup } from "@phoenix/pages/project/TableMetricsCharts";
import { TracesTable } from "@phoenix/pages/project/TracesTable";
import { TracePaginationProvider } from "@phoenix/pages/trace/TracePaginationContext";
import { TracingRoot } from "@phoenix/pages/TracingRoot";

import type { ProjectPageQueriesTracesQuery as ProjectPageTracesQueryType } from "./__generated__/ProjectPageQueriesTracesQuery.graphql";
import {
  ProjectPageQueriesTracesQuery,
  useProjectPageQueryReferenceContext,
} from "./ProjectPageQueries";
import { TraceFiltersProvider } from "./TraceFiltersContext";

// Module-level: an inline component would remount the field on every render.

function TracesTabContent({
  tracesQueryReference,
  seed,
}: {
  tracesQueryReference: PreloadedQuery<ProjectPageTracesQueryType>;
  seed: string;
}) {
  const data = usePreloadedQuery<ProjectPageTracesQueryType>(
    ProjectPageQueriesTracesQuery,
    tracesQueryReference
  );

  return <TracesTable project={data.project} seed={seed} />;
}

export const ProjectTracesPage = () => {
  const { tracesQueryReference, tracesFilterSeed, resolveTracesSeed } =
    useProjectPageQueryReferenceContext();
  const hasTracesQuery =
    tracesQueryReference !== null && tracesFilterSeed !== null;
  // Keyed on the condition so re-resolving the same filter does not remount the
  // editor and table; a new condition does, which resets the editor.
  const seedKey =
    tracesFilterSeed === null ? "seed-pending" : `seed-${tracesFilterSeed}`;
  return (
    <TracingRoot>
      <TracePaginationProvider>
        <TraceFiltersProvider key={seedKey}>
          {/* Inside the provider so a resolved seed -- a new `key` -- remounts it. */}
          <ErrorBoundary>
            <Suspense
              fallback={
                <TableMetricsChartsPanelGroup view="traces" isSkeleton>
                  <TableSkeleton hasToolbar isSelectable rowCount="fill" />
                </TableMetricsChartsPanelGroup>
              }
            >
              {hasTracesQuery ? (
                <TracesTabContent
                  tracesQueryReference={tracesQueryReference}
                  seed={tracesFilterSeed}
                />
              ) : tracesFilterSeed === null ? (
                // A rejected condition falls back to no filter; the URL keeps
                // the rejected text.
                <TableMetricsChartsPanelGroup
                  view="traces"
                  isSkeleton
                ></TableMetricsChartsPanelGroup>
              ) : (
                // Showing the field here would mount it twice: once now and
                // again inside the table.
                <TableMetricsChartsPanelGroup view="traces" isSkeleton>
                  <TableSkeleton hasToolbar isSelectable rowCount="fill" />
                </TableMetricsChartsPanelGroup>
              )}
            </Suspense>
          </ErrorBoundary>
          <Suspense>
            <Outlet />
          </Suspense>
        </TraceFiltersProvider>
      </TracePaginationProvider>
    </TracingRoot>
  );
};
