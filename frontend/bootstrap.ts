// Presentation-only polish for the tracing shell. This file must stay free of
// data, routing, or behavior changes; it is loaded before the Phoenix app so
// the shared surfaces and motion primitives are available on every route.
import "./polish/global.css";

// Phoenix requires server-injected configuration before importing its modules.
// Keep a useful message if that local server is not running.
if (window.Config) {
  void import("./phoenix-src/index").catch(() => {
    const root = document.getElementById("root");
    if (root) root.textContent = "前端加载失败，请刷新页面并检查开发服务终端。";
  });
} else {
  const root = document.getElementById("root");
  if (root)
    root.textContent =
      "无法连接本地 Phoenix 后端，请先启动 Docker Phoenix，再刷新此页面。";
}
