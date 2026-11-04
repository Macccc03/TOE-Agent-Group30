import { BASE_URL } from "@phoenix/config";

export type Project = { id: string; name: string };
export type Span = {
  id: string;
  name: string;
  spanKind: string;
  parentId: string | null;
  startTime: string;
  endTime: string | null;
  latencyMs: number | null;
  statusCode: string;
  tokenCountTotal: number | null;
  costSummary: { total: { cost: number | null } } | null;
  trace: { traceId: string };
  projectId: string;
  projectName: string;
};

type Connection<T> = {
  edges: { node: T }[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

async function query<T>(
  text: string,
  variables: object,
  signal: AbortSignal
): Promise<T> {
  const response = await fetch(`${BASE_URL}/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: text, variables }),
    signal,
  });
  const result = await response.json();
  if (!response.ok || result.errors?.length) {
    throw new Error(result.errors?.[0]?.message ?? "看板数据加载失败");
  }
  return result.data;
}

export async function loadProjects(signal: AbortSignal): Promise<Project[]> {
  const projects: Project[] = [];
  let after: string | null = null;
  do {
    const data: { projects: Connection<Project> } = await query(
      `query DashboardProjects($after: String) {
        projects(first: 100, after: $after) {
          edges { node { id name } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { after },
      signal
    );
    projects.push(...data.projects.edges.map(({ node }) => node));
    after = data.projects.pageInfo.hasNextPage
      ? data.projects.pageInfo.endCursor
      : null;
  } while (after);
  return projects;
}

export async function loadSpans(
  projects: Project[],
  timeRange: { start: string | undefined; end: string | undefined },
  signal: AbortSignal
): Promise<Span[]> {
  const pages = await Promise.all(
    projects.map(async (project) => {
      const spans: Span[] = [];
      let after: string | null = null;
      do {
        const data: { node: { spans: Connection<Span> } } = await query(
          `query DashboardSpans($id: ID!, $after: String, $timeRange: TimeRange) {
            node(id: $id) {
              ... on Project {
                spans(first: 500, after: $after, timeRange: $timeRange) {
                  edges { node {
                    id name spanKind parentId startTime endTime latencyMs statusCode
                    tokenCountTotal costSummary { total { cost } }
                    trace { traceId }
                  } }
                  pageInfo { hasNextPage endCursor }
                }
              }
            }
          }`,
          { id: project.id, after, timeRange },
          signal
        );
        spans.push(
          ...data.node.spans.edges.map(({ node }) => ({
            ...node,
            projectId: project.id,
            projectName: project.name,
          }))
        );
        after = data.node.spans.pageInfo.hasNextPage
          ? data.node.spans.pageInfo.endCursor
          : null;
      } while (after);
      return spans;
    })
  );
  return pages.flat();
}
