from argparse import SUPPRESS, ArgumentParser

from server.cli.commands import db, serve


def main() -> None:
    """
    Phoenix 官方原生 CLI 命令行总入口函数。
    负责初始化系统环境、构建子命令分发器，并将执行控制权转交给各子模块（如 serve.run()）。
    """
    # TODO 初始化settings  initialize_settings()

    # TODO 初始化log  setup_logging()

    # 初始化一个“现代化多级子命令”解析架构（类似于 git commit 或 docker run）
    parser = ArgumentParser(prog="phoenix", add_help=False)
    parser.add_argument("-h", "--help", action="help", help=SUPPRESS)
    subparsers = parser.add_subparsers(dest="command", required=True, help=SUPPRESS)

    # 1. 注册核心服务启动子命令（包含 HTTP 6006 端口和 gRPC 4317 端口监听发布）
    serve.register(subparsers)
    # 2. 注册数据库管理子命令（init, migrate 等）
    db.register(subparsers)
    # TODO 注册模拟数据集生成子命令

    args = parser.parse_args()
    # 调度执行具体子命令绑定的入口函数（例如 serve 子命令绑定的是 serve.run()）
    args.func(args)


if __name__ == "__main__":
    # 当直接以脚本形式运行 `python -m phoenix.server.main` 时触发总 main 函数
    main()
