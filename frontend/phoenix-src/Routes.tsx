// Phoenix Routes.tsx reduced to the tracing workflow; other product routes removed.
import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Route,
} from "react-router";
import { RouterProvider } from "react-router/dom";

import { DashboardPage } from "../dashboard/DashboardPage";
import { AuthenticatedRoot } from "./pages/AuthenticatedRoot";
import { authenticatedRootLoader } from "./pages/authenticatedRootLoader";
import { ErrorElement } from "./pages/ErrorElement";
import { Layout } from "./pages/Layout";
import { layoutLoader } from "./pages/layoutLoader";
import { projectLoader } from "./pages/project/projectLoader";
import { ProjectPage } from "./pages/project/ProjectPage";
import { ProjectRoot } from "./pages/project/ProjectRoot";
import { ProjectTracesPage } from "./pages/project/ProjectTracesPage";
import { ProjectsPage } from "./pages/projects/ProjectsPage";
import { ProjectsRoot } from "./pages/ProjectsRoot";
import { RootLayout } from "./pages/RootLayout";
import { TracePage } from "./pages/trace/TracePage";
export const appRouteObjects = createRoutesFromElements(
  <Route path="/" element={<RootLayout />} errorElement={<ErrorElement />}>
    <Route element={<AuthenticatedRoot />} loader={authenticatedRootLoader}>
      <Route element={<Layout />} loader={layoutLoader}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route
          path="dashboard"
          element={<ProjectsRoot />}
          handle={{ crumb: () => "全局看板" }}
        >
          <Route index element={<DashboardPage />} />
        </Route>
        <Route
          path="projects"
          element={<ProjectsRoot />}
          handle={{ crumb: () => "Projects" }}
        >
          <Route index element={<ProjectsPage />} />
          <Route
            path=":projectId"
            element={<ProjectRoot />}
            loader={projectLoader}
            shouldRevalidate={({ currentUrl, nextUrl }) =>
              currentUrl.pathname !== nextUrl.pathname
            }
            handle={{ crumb: (data: any) => data?.project?.name }}
          >
            <Route index element={<Navigate to="traces" replace />} />
            <Route element={<ProjectPage />}>
              <Route path="traces" element={<ProjectTracesPage />}>
                <Route path=":traceId" element={<TracePage />} />
              </Route>
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Route>
    </Route>
  </Route>
);
const router = createBrowserRouter(appRouteObjects, {
  basename: window.Config.basename,
});
export function AppRoutes() {
  return <RouterProvider router={router} />;
}
