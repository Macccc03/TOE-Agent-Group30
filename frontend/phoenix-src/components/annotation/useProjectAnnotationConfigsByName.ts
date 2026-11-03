import { useFragment } from "react-relay";

import type { ProjectAnnotationConfigsByNameFragment$key } from "./__generated__/ProjectAnnotationConfigsByNameFragment.graphql";
import __compiled_0 from "./__generated__/ProjectAnnotationConfigsByNameFragment.graphql";
import type { AnnotationOptimizationConfig } from "./optimizationUtils";

export function useProjectAnnotationConfigsByName(
  project: ProjectAnnotationConfigsByNameFragment$key | null | undefined
): ReadonlyMap<string, AnnotationOptimizationConfig> {
  const data = useFragment(__compiled_0, project);
  const configsByName = new Map<string, AnnotationOptimizationConfig>();
  data?.configsByName.edges.forEach(({ config }) => {
    if (config.name == null || config.annotationType == null) {
      return;
    }
    configsByName.set(config.name, {
      annotationType: config.annotationType,
      optimizationDirection: config.optimizationDirection,
      lowerBound: config.lowerBound,
      upperBound: config.upperBound,
      threshold: config.threshold,
      values: config.values,
    });
  });
  return configsByName;
}
