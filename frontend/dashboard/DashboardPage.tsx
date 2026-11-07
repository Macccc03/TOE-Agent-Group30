import { css } from "@emotion/react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartPanel } from "@phoenix/components/chart/ChartPanel";
import { ChartResponsiveContainer } from "@phoenix/components/chart/ChartResponsiveContainer";
import {
  defaultCartesianGridProps,
  defaultTooltipProps,
  defaultXAxisProps,
  defaultYAxisProps,
} from "@phoenix/components/chart/defaults";
import { Button } from "@phoenix/components/core/button/Button";
import {
  Disclosure,
  DisclosureGroup,
  DisclosurePanel,
  DisclosureTrigger,
} from "@phoenix/components/core/disclosure/Disclosure";
import { Loading } from "@phoenix/components/core/loading/Loading";
import { ConnectedTimeRangeSelector } from "@phoenix/components/datetime/ConnectedTimeRangeSelector";
import {
  useTimeRange,
  useTimeRangeSearch,
} from "@phoenix/components/datetime/TimeRangeContext";
import { TopNavActions } from "@phoenix/components/nav/TopNavActions";

import { loadProjects, loadSpans } from "./data";
import type { Project, Span } from "./data";
import { getTools, getTraces, getTrend, summarize } from "./metrics";

const number = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 4,
});
const metric = (value: number | null, formatter: (n: number) => string) =>
  value === null ? "—" : formatter(value);
const seconds = (value: number) => `${value.toFixed(2)} s`;
const colors = {
  calls: "var(--dashboard-calls-color)",
  errors: "var(--dashboard-errors-color)",
  average: "var(--dashboard-average-color)",
  p95: "var(--dashboard-p95-color)",
  tokens: "var(--dashboard-tokens-color)",
};
const tooltipStyle = {
  background: "var(--global-background-color-default)",
  border: "1px solid var(--global-border-color-default)",
  borderRadius: 4,
  color: "var(--global-text-color-900)",
};

export function DashboardPage() {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const projectId = params.get("project") ?? "all";
  const chartGroup = params.get("charts") ?? "performance";
  const { timeRangeISOStrings, timeRangeNow, refreshLiveTimeRange } =
    useTimeRange();
  const timeSearch = useTimeRangeSearch();
  const detailParams = new URLSearchParams(timeSearch);
  detailParams.set("dashboardSearch", location.search);
  const [revision, setRevision] = useState(0);
  const [projects, setProjects] = useState<Project[]>([]);
  const [spans, setSpans] = useState<Span[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const { start, end } = timeRangeISOStrings;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    async function load() {
      try {
        const available = await loadProjects(controller.signal);
        const selected =
          projectId === "all"
            ? available
            : available.filter((project) => project.id === projectId);
        const result = await loadSpans(
          selected,
          { start, end },
          controller.signal
        );
        if (controller.signal.aborted) return;
        setProjects(available);
        setSpans(result);
        setUpdatedAt(new Date());
      } catch (reason) {
        if (!controller.signal.aborted) setError((reason as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [projectId, start, end, revision]);

  const traces = useMemo(() => getTraces(spans), [spans]);
  const summary = useMemo(() => summarize(traces), [traces]);
  const trend = useMemo(
    () =>
      getTrend(
        traces,
        start ? Date.parse(start) : timeRangeNow - 7 * 86400000,
        end ? Date.parse(end) : timeRangeNow
      ),
    [traces, start, end, timeRangeNow]
  );
  const tools = useMemo(() => getTools(spans), [spans]);
  const updateParam = (key: string, value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set(key, value);
        return next;
      },
      { replace: true }
    );
  const cards = [
    {
      label: "总调用量",
      value: number.format(summary.count),
      color: undefined,
    },
    {
      label: "成功率",
      value: metric(summary.successRate, (value) => `${value.toFixed(1)}%`),
      color: colors.calls,
    },
    {
      label: "平均耗时",
      value: metric(summary.average, seconds),
      color: colors.average,
    },
    {
      label: "P95 耗时",
      value: metric(summary.p95, seconds),
      color: colors.average,
    },
    {
      label: "总 Token",
      value: metric(summary.tokens, number.format),
      color: colors.tokens,
    },
    {
      label: "总费用",
      value: metric(summary.cost, money.format),
      color: undefined,
    },
  ];

  return (
    <>
      <TopNavActions>
        <ConnectedTimeRangeSelector size="S" />
      </TopNavActions>
      <main css={pageCSS} aria-busy={loading}>
        <header className="dashboard-header">
          <div>
            <h1>全局指标看板</h1>
            <p>跨项目查看 Agent 运行情况</p>
          </div>
          <div className="dashboard-controls">
            <select
              aria-label="项目范围"
              value={projectId}
              onChange={(event) => updateParam("project", event.target.value)}
            >
              <option value="all">全部项目</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <Button
              size="S"
              isDisabled={loading}
              onPress={() => {
                refreshLiveTimeRange();
                setRevision((value) => value + 1);
              }}
            >
              刷新
            </Button>
          </div>
        </header>
        {loading ? (
          <div className="dashboard-message" role="status">
            <Loading />
            正在汇总调用数据…
          </div>
        ) : error ? (
          <div className="dashboard-message" role="alert">
            {error}
            <Button size="S" onPress={() => setRevision((value) => value + 1)}>
              重试
            </Button>
          </div>
        ) : (
          <>
            <section className="metric-grid" aria-label="全局指标">
              {cards.map((card) => (
                <article key={card.label} className="metric-card">
                  <h2>{card.label}</h2>
                  <strong style={{ color: card.color }}>{card.value}</strong>
                  <span>所选时间范围内</span>
                </article>
              ))}
            </section>
            <div className="data-caption">
              当前读取本机 Phoenix 数据，示例项目为合成调用。
              {updatedAt && (
                <span>更新于 {updatedAt.toLocaleTimeString("zh-CN")}</span>
              )}
            </div>
            <section aria-label="趋势分析" className="analysis-section">
              <DisclosureGroup
                allowsMultipleExpanded={false}
                expandedKeys={
                  new Set(chartGroup === "none" ? [] : [chartGroup])
                }
                onExpandedChange={(keys) =>
                  updateParam("charts", String([...keys][0] ?? "none"))
                }
              >
                <Disclosure id="performance">
                  <DisclosureTrigger>
                    <span className="group-title">调用表现</span>
                    <span className="group-description">
                      调用量与错误趋势 · 耗时趋势
                    </span>
                  </DisclosureTrigger>
                  <DisclosurePanel>
                    {chartGroup === "performance" && (
                      <div className="chart-grid">
                        <ChartPanel
                          title="调用量与错误趋势"
                          subtitle="按调用链去重，错误包含链内异常"
                        >
                          <ChartResponsiveContainer>
                            <BarChart data={trend}>
                              <CartesianGrid {...defaultCartesianGridProps} />
                              <XAxis
                                {...defaultXAxisProps}
                                dataKey="label"
                                minTickGap={28}
                              />
                              <YAxis
                                {...defaultYAxisProps}
                                allowDecimals={false}
                              />
                              <Tooltip
                                {...defaultTooltipProps}
                                contentStyle={tooltipStyle}
                              />
                              <Legend />
                              <Bar
                                dataKey="calls"
                                name="调用量"
                                fill={colors.calls}
                                isAnimationActive={false}
                              />
                              <Bar
                                dataKey="errors"
                                name="错误数"
                                fill={colors.errors}
                                isAnimationActive={false}
                              />
                            </BarChart>
                          </ChartResponsiveContainer>
                        </ChartPanel>
                        <ChartPanel
                          title="耗时趋势"
                          subtitle="调用链整体耗时，单位：秒"
                        >
                          <ChartResponsiveContainer>
                            <LineChart data={trend}>
                              <CartesianGrid {...defaultCartesianGridProps} />
                              <XAxis
                                {...defaultXAxisProps}
                                dataKey="label"
                                minTickGap={28}
                              />
                              <YAxis
                                {...defaultYAxisProps}
                                tickFormatter={(value: number) => `${value}s`}
                              />
                              <Tooltip
                                {...defaultTooltipProps}
                                contentStyle={tooltipStyle}
                                formatter={(value) =>
                                  `${Number(value).toFixed(2)} s`
                                }
                              />
                              <Legend />
                              <Line
                                dataKey="average"
                                name="平均耗时"
                                stroke={colors.average}
                                strokeWidth={2}
                                isAnimationActive={false}
                              />
                              <Line
                                dataKey="p95"
                                name="P95 耗时"
                                stroke={colors.p95}
                                strokeWidth={2}
                                isAnimationActive={false}
                              />
                            </LineChart>
                          </ChartResponsiveContainer>
                        </ChartPanel>
                      </div>
                    )}
                  </DisclosurePanel>
                </Disclosure>
                <Disclosure id="resources">
                  <DisclosureTrigger>
                    <span className="group-title">资源使用</span>
                    <span className="group-description">
                      Token 与费用趋势 · 工具调用分布
                    </span>
                  </DisclosureTrigger>
                  <DisclosurePanel>
                    {chartGroup === "resources" && (
                      <div className="chart-grid">
                        <ChartPanel
                          title="Token 与费用趋势"
                          subtitle="仅汇总已记录值，费用单位：USD"
                        >
                          <ChartResponsiveContainer>
                            <ComposedChart data={trend}>
                              <CartesianGrid {...defaultCartesianGridProps} />
                              <XAxis
                                {...defaultXAxisProps}
                                dataKey="label"
                                minTickGap={28}
                              />
                              <YAxis
                                {...defaultYAxisProps}
                                yAxisId="tokens"
                                tickFormatter={(value: number) =>
                                  number.format(value)
                                }
                              />
                              <YAxis
                                {...defaultYAxisProps}
                                yAxisId="cost"
                                orientation="right"
                                tickFormatter={(value: number) => `$${value}`}
                              />
                              <Tooltip
                                {...defaultTooltipProps}
                                contentStyle={tooltipStyle}
                                formatter={(value, name) =>
                                  name === "费用"
                                    ? money.format(Number(value))
                                    : number.format(Number(value))
                                }
                              />
                              <Legend />
                              <Bar
                                yAxisId="tokens"
                                dataKey="tokens"
                                name="Token"
                                fill={colors.tokens}
                                isAnimationActive={false}
                              />
                              <Line
                                yAxisId="cost"
                                dataKey="cost"
                                name="费用"
                                stroke={colors.average}
                                strokeWidth={2}
                                isAnimationActive={false}
                              />
                            </ComposedChart>
                          </ChartResponsiveContainer>
                        </ChartPanel>
                        <ChartPanel
                          title="工具调用分布"
                          subtitle="TOOL 类型节点，按调用次数取前 8 项"
                        >
                          {tools.length ? (
                            <ChartResponsiveContainer>
                              <BarChart
                                data={tools}
                                layout="vertical"
                                margin={{ left: 12, right: 20 }}
                              >
                                <CartesianGrid
                                  {...defaultCartesianGridProps}
                                  horizontal={false}
                                  vertical
                                />
                                <XAxis
                                  {...defaultXAxisProps}
                                  type="number"
                                  allowDecimals={false}
                                />
                                <YAxis
                                  {...defaultYAxisProps}
                                  dataKey="name"
                                  type="category"
                                  width={120}
                                  tick={{ fontSize: 11 }}
                                />
                                <Tooltip
                                  {...defaultTooltipProps}
                                  contentStyle={tooltipStyle}
                                />
                                <Bar
                                  dataKey="count"
                                  name="调用次数"
                                  fill={colors.calls}
                                  isAnimationActive={false}
                                />
                              </BarChart>
                            </ChartResponsiveContainer>
                          ) : (
                            <div className="chart-empty">
                              当前范围内没有工具调用
                            </div>
                          )}
                        </ChartPanel>
                      </div>
                    )}
                  </DisclosurePanel>
                </Disclosure>
              </DisclosureGroup>
            </section>
            <section className="recent-section" aria-label="最近调用">
              <header>
                <h2>最近调用</h2>
                <Link to={`/projects${timeSearch}`}>查看项目调用列表 ›</Link>
              </header>
              {traces.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {[
                          "调用名称",
                          "项目",
                          "状态",
                          "耗时",
                          "Token",
                          "费用",
                          "开始时间",
                        ].map((title) => (
                          <th key={title}>{title}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {traces.slice(0, 10).map((trace) => (
                        <tr key={`${trace.projectId}:${trace.id}`}>
                          <td>
                            <Link
                              to={`/projects/${trace.projectId}/traces/${trace.id}?${detailParams}`}
                            >
                              {trace.name} ›
                            </Link>
                          </td>
                          <td>{trace.projectName}</td>
                          <td>
                            <span
                              className={
                                trace.status === "失败"
                                  ? "status-error"
                                  : trace.status === "成功"
                                    ? "status-success"
                                    : ""
                              }
                            >
                              {trace.status}
                            </span>
                          </td>
                          <td>{metric(trace.latency, seconds)}</td>
                          <td>{metric(trace.tokens, number.format)}</td>
                          <td>{metric(trace.cost, money.format)}</td>
                          <td>
                            {new Date(trace.start).toLocaleString("zh-CN", {
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="dashboard-message">
                  当前范围内没有调用，可切换项目或时间范围。
                </div>
              )}
            </section>
            <p className="metric-note">
              成功率按已结束调用中链内无错误的占比计算。Token
              与费用累加节点自身记录，避免父子累计值重复计算；“—”表示未记录。
            </p>
          </>
        )}
      </main>
    </>
  );
}

const pageCSS = css`
  --dashboard-calls-color: #54c5b7;
  --dashboard-errors-color: #ef827c;
  --dashboard-average-color: #f2b766;
  --dashboard-p95-color: #aeb5c4;
  --dashboard-tokens-color: #aa88d1;

  .theme--light & {
    --dashboard-calls-color: #146c62;
    --dashboard-errors-color: #a12928;
    --dashboard-average-color: #865209;
    --dashboard-p95-color: #475569;
    --dashboard-tokens-color: #6945a0;
  }

  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 24px;
  color: var(--global-text-color-900);
  h1,
  h2,
  p {
    margin: 0;
  }
  h1 {
    font-size: 26px;
    font-weight: 600;
  }
  .dashboard-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    margin-bottom: 22px;
  }
  .dashboard-header p {
    color: var(--global-text-color-500);
    margin-top: 6px;
  }
  .dashboard-controls {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  select {
    color: var(--global-text-color-900);
    background: var(--global-background-color-default);
    border: 1px solid var(--global-border-color-default);
    border-radius: 4px;
    padding: 7px 10px;
    font: inherit;
    max-width: 220px;
  }
  .metric-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 12px;
  }
  .metric-card {
    padding: 16px;
    border: 1px solid var(--global-border-color-default);
    border-radius: 6px;
    background: var(--chart-panel-background-color);
  }
  .metric-card h2 {
    color: var(--global-text-color-700);
    font-size: 13px;
    font-weight: 500;
  }
  .metric-card strong {
    display: block;
    font-size: clamp(22px, 2vw, 30px);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    margin: 8px 0;
    white-space: nowrap;
  }
  .metric-card span,
  .data-caption,
  .metric-note {
    color: var(--global-text-color-500);
    font-size: 12px;
  }
  .data-caption {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin: 12px 0 20px;
  }
  .analysis-section {
    border: 1px solid var(--global-border-color-default);
    border-radius: 6px;
    overflow: hidden;
  }
  .group-title {
    font-weight: 600;
    font-size: 15px;
  }
  .group-description {
    color: var(--global-text-color-500);
    font-size: 12px;
    margin-left: 12px;
  }
  .chart-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    padding: 14px;
  }
  .chart-grid .chart-panel {
    min-width: 0;
  }
  .chart-empty {
    display: grid;
    place-items: center;
    height: 100%;
    color: var(--global-text-color-500);
  }
  .recent-section {
    margin-top: 20px;
    border: 1px solid var(--global-border-color-default);
    border-radius: 6px;
    overflow: hidden;
  }
  .recent-section > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
  }
  .recent-section h2 {
    font-size: 16px;
    font-weight: 600;
  }
  a {
    color: var(--global-text-color-900);
    text-decoration: none;
  }
  a:hover {
    color: ${colors.calls};
    text-decoration: underline;
  }
  .recent-section > header a {
    color: ${colors.calls};
    font-size: 12px;
  }
  .table-scroll {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    white-space: nowrap;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
  th,
  td {
    text-align: left;
    padding: 12px 16px;
    border-top: 1px solid var(--global-border-color-default);
  }
  th {
    font-weight: 500;
    color: var(--global-text-color-500);
  }
  tbody tr:hover {
    background: var(--global-background-color-default);
  }
  .status-success {
    color: ${colors.calls};
  }
  .status-error {
    color: ${colors.errors};
  }
  .metric-note {
    margin: 12px 0 0;
    line-height: 1.7;
  }
  .dashboard-message {
    min-height: 150px;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 12px;
    color: var(--global-text-color-700);
  }
  @media (max-width: 1100px) {
    .metric-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
  @media (max-width: 800px) {
    padding: 16px;
    .chart-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .group-description {
      display: none;
    }
    .dashboard-header {
      flex-wrap: wrap;
    }
    .data-caption {
      flex-wrap: wrap;
    }
  }
`;
