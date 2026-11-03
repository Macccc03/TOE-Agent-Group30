import { loadQuery } from "react-relay";

import RelayEnvironment from "@phoenix/RelayEnvironment";

import type { layoutLoaderQuery } from "./__generated__/layoutLoaderQuery.graphql";
import __compiled_0 from "./__generated__/layoutLoaderQuery.graphql";

export const layoutLoaderGql = __compiled_0;

export function layoutLoader() {
  const queryRef = loadQuery<layoutLoaderQuery>(
    RelayEnvironment,
    layoutLoaderGql,
    {},
    { fetchPolicy: "store-and-network" }
  );

  return { queryRef };
}

export type LayoutLoaderData = ReturnType<typeof layoutLoader>;
