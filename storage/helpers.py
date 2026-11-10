from enum import Enum
from typing import Literal

from typing_extensions import assert_never

SupportedSQLDialectName = Literal["postgresql", "sqlite"]


class SupportedSQLDialect(Enum):
    """支持的 SQL 数据库方言枚举类

    Phoenix 底层支持两种主流数据库后端：
    - SQLite: 适用于本地轻量部署、测试环境及单机嵌入式场景；
    - PostgreSQL: 适用于生产环境、高并发追踪摄取及大规模团队协作。
    """
    SQLITE = "sqlite"
    POSTGRESQL = "postgresql"

    @property
    def name_literal(self) -> SupportedSQLDialectName:
        """获取字面量形式的方言名称。

        由于 `Enum.value` 在类型系统中被标记为通用 `str`，严格模式下的静态类型检查器
        （如 mypy/pyright）无法直接将其作为具有 `Literal["postgresql", "sqlite"]` 约束的参数，
        因此提供该属性以实现类型安全的向上转换。
        """
        if self is SupportedSQLDialect.POSTGRESQL:
            return "postgresql"
        if self is SupportedSQLDialect.SQLITE:
            return "sqlite"
        assert_never(self)

    @classmethod
    def _missing_(cls, value: object) -> "SupportedSQLDialect":
        """容错解析函数：支持大小写不敏感的方言字符串输入。

        例如传入 "PostgreSQL"、"POSTGRESQL" 或 "SQLite" 时，均能正确映射至对应的枚举成员。
        """
        if isinstance(value, str) and value and value.isascii() and not value.islower():
            return cls(value.lower())
        raise ValueError(f"`{value}` is not a supported SQL backend/dialect.")
