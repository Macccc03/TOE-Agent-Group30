import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const upstreamPhoenix = process.env.PHOENIX_BACKEND_URL;
const backend =
  upstreamPhoenix || process.env.TOE_BACKEND_URL || "http://127.0.0.1:6060";
const proxy = {
  "/graphql": {
    target: backend,
    changeOrigin: true,
    ws: Boolean(upstreamPhoenix),
  },
  ...(upstreamPhoenix
    ? {
        "/v1": { target: backend, changeOrigin: true },
        "/client_errors": { target: backend, changeOrigin: true },
      }
    : { "/api": { target: backend, changeOrigin: true } }),
};

const localConfig = {
  basename: "/",
  platformVersion: "TOE Agent",
  authenticationEnabled: false,
  basicAuthDisabled: true,
  passwordResetEmailEnabled: false,
  oAuth2Idps: [],
  ldapEnabled: false,
  ldapManualUserCreationEnabled: false,
  hasDbThreshold: false,
  allowExternalResources: false,
  agentAssistantDisabled: true,
  agentBashDisabled: true,
  mcpServerEnabled: false,
  mcpCodeModeEnabled: false,
  authErrorMessages: {},
} satisfies Window["Config"];

function phoenixRuntimeConfig(): Plugin {
  const configure = (server: { middlewares: { use: Function } }) => {
    server.middlewares.use(
      "/phoenix-runtime-config.js",
      async (_req: unknown, res: any) => {
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        if (!upstreamPhoenix) {
          res.end(`window.Config = ${JSON.stringify(localConfig)};`);
          return;
        }

        try {
          const response = await fetch(upstreamPhoenix, {
            signal: AbortSignal.timeout(8000),
          });
          if (!response.ok)
            throw new Error(`Phoenix returned ${response.status}`);
          const html = await response.text();
          const scripts = [
            ...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi),
          ];
          const config = scripts
            .map((match) => match[1])
            .find((script) =>
              /Object\.defineProperty\(window,\s*"Config"/.test(script)
            );
          if (!config)
            throw new Error("Phoenix public window.Config was not found");
          res.end(config);
        } catch (error) {
          res.statusCode = 503;
          res.end(
            `document.getElementById('root').textContent=${JSON.stringify(`无法连接本地 Phoenix 后端 ${backend}，请先启动 Docker Phoenix。`)}; throw new Error(${JSON.stringify(String(error))});`
          );
        }
      }
    );
  };
  return {
    name: "phoenix-public-runtime-config",
    configureServer: configure,
    configurePreviewServer: configure,
  };
}

export default defineConfig({
  plugins: [
    phoenixRuntimeConfig(),
    react({ jsxImportSource: "@emotion/react" }),
  ],
  resolve: {
    alias: {
      "@phoenix": fileURLToPath(new URL("./phoenix-src", import.meta.url)),
    },
  },
  server: { proxy },
  preview: { proxy },
  build: { chunkSizeWarningLimit: 1500 },
});
