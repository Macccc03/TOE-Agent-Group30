import { createContext, useContext } from "react";
import type { PreloadedQuery } from "react-relay";

import type { ProjectPageQueriesTracesQuery as ProjectPageTracesQueryType } from "./__generated__/ProjectPageQueriesTracesQuery.graphql";
import __compiled_0 from "./__generated__/ProjectPageQueriesTracesQuery.graphql";

// Each query carries the settled condition, so a table never loads unfiltered
// rows first.
export const ProjectPageQueriesTracesQuery = __compiled_0;

export const ProjectPageQueryReferenceContext = createContext<{
  tracesQueryReference: PreloadedQuery<ProjectPageTracesQueryType> | null;
  /** The traces counterpart of `sessionsFilterSeed`. */
  tracesFilterSeed: string | null;
  resolveTracesSeed: (condition: string, persistToUrl?: boolean) => void;
}>({
  tracesQueryReference: null,
  tracesFilterSeed: null,
  resolveTracesSeed: () => {},
});

export const useProjectPageQueryReferenceContext = () => {
  const context = useContext(ProjectPageQueryReferenceContext);
  if (!context) {
    throw new Error("ProjectPageQueryReferenceContext not found");
  }
  return context;
};
