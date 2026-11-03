import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const backend = process.env.PHOENIX_BACKEND_URL || "http://127.0.0.1:6006";
const proxy = {
  "/graphql": { target: backend, changeOrigin: true, ws: true },
  "/v1": { target: backend, changeOrigin: true },
  "/client_errors": { target: backend, changeOrigin: true },
};

// Python normally injects window.Config into Phoenix's HTML template.
function phoenixRuntimeConfig(): Plugin {
  const configure = (server: { middlewares: { use: Function } }) => {
    server.middlewares.use(
      "/phoenix-runtime-config.js",
      async (_req: unknown, res: any) => {
        try {
          const response = await fetch(backend, {
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
          res.setHeader(
            "Content-Type",
            "application/javascript; charset=utf-8"
          );
          res.setHeader("Cache-Control", "no-store");
          res.end(config);
        } catch (error) {
          res.statusCode = 503;
          res.setHeader(
            "Content-Type",
            "application/javascript; charset=utf-8"
          );
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
