import { loadQuery } from "react-relay";

import RelayEnvironment from "@phoenix/RelayEnvironment";

import type { authenticatedRootLoaderQuery } from "./__generated__/authenticatedRootLoaderQuery.graphql";
import __compiled_0 from "./__generated__/authenticatedRootLoaderQuery.graphql";

export const authenticatedRootLoaderQueryNode = __compiled_0;

/**
 * Loads in the necessary data at the root of the authenticated application
 */
export function authenticatedRootLoader() {
  const queryRef = loadQuery<authenticatedRootLoaderQuery>(
    RelayEnvironment,
    authenticatedRootLoaderQueryNode,
    {},
    {
      fetchPolicy: "store-and-network",
    }
  );

  return { queryRef };
}

export type AuthenticatedRootLoaderData = {
  queryRef: ReturnType<typeof loadQuery<authenticatedRootLoaderQuery>>;
};
