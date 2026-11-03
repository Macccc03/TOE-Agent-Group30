import { fetchQuery } from "react-relay";
import type { LoaderFunctionArgs } from "react-router";

import RelayEnvironment from "@phoenix/RelayEnvironment";

import type { projectLoaderQuery } from "./__generated__/projectLoaderQuery.graphql";
import __compiled_0 from "./__generated__/projectLoaderQuery.graphql";

/**
 * Loads in the necessary page data for the project page
 */
export async function projectLoader(args: LoaderFunctionArgs) {
  const { projectId } = args.params;
  return await fetchQuery<projectLoaderQuery>(RelayEnvironment, __compiled_0, {
    id: projectId as string,
  }).toPromise();
}

export type ProjectLoaderData = Awaited<ReturnType<typeof projectLoader>>;
