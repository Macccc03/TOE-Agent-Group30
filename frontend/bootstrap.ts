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
