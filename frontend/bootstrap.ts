// Presentation-only polish for the tracing shell. This file must stay free of
// data, routing, or behavior changes; it is loaded before the Phoenix app so
// the shared surfaces and motion primitives are available on every route.
import "./polish/global.css";

// The retained Phoenix modules read window.Config at import time.
if (window.Config) {
  void import("./phoenix-src/index").catch(() => {
    const root = document.getElementById("root");
    if (root) root.textContent = "前端加载失败，请刷新页面并检查开发服务终端。";
  });
} else {
  const root = document.getElementById("root");
  if (root)
    root.textContent = "前端运行配置加载失败，请检查开发服务和后端连接。";
}
