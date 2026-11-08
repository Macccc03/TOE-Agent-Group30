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
import { ConnectedTimeRangeSelector } from "@phoenix/components/datetime/ConnectedTimeRangeSelector";
import {
  useTimeRange,
  useTimeRangeSearch,
} from "@phoenix/components/datetime/TimeRangeContext";
import { TopNavActions } from "@phoenix/components/nav/TopNavActions";

import { loadProjects, loadSpans } from "./data";
import type { Project, Span } from "./data";
import { getTools, getTraces, getTrend, summarize } from "./metrics";

import "./dashboard.css";

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
  borderRadius: 9,
  color: "var(--global-text-color-900)",
  boxShadow: "0 14px 34px rgba(0, 0, 0, 0.28)",
  fontFamily: "var(--global-font-family-sans)",
  fontSize: 12,
  padding: "9px 11px",
};

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function Sparkline({ values }: { values: (number | null)[] }) {
  const recorded = values.filter(
    (value): value is number => value !== null && Number.isFinite(value)
  );
  if (recorded.length < 2) return null;
  const min = Math.min(...recorded);
  const max = Math.max(...recorded);
  const range = max - min || 1;
  const points: string[] = [];
  let lastX = 0;
  let lastY = 14;
  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) return;
    const x = (index / (values.length - 1)) * 100;
    const y = 25 - ((value - min) / range) * 21;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    lastX = x;
    lastY = y;
  });
  return (
    <svg
      className="sparkline"
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lastX} cy={lastY} r="2" fill="currentColor" />
    </svg>
  );
}

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
  const reducedMotion = usePrefersReducedMotion();

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
  const finished = useMemo(
    () => traces.filter((trace) => trace.status !== "进行中"),
    [traces]
  );
  const failed = useMemo(
    () => finished.filter((trace) => trace.status === "失败"),
    [finished]
  );
  const averageTokens =
    summary.tokens !== null && summary.count
      ? summary.tokens / summary.count
      : null;
  const averageCost =
    summary.cost !== null && summary.count
      ? summary.cost / summary.count
      : null;
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
  const successRate = summary.successRate;
  const successTone =
    successRate === null
      ? "neutral"
      : successRate >= 80
        ? "success"
        : successRate >= 50
          ? "average"
          : "error";
  const successColor =
    successRate === null
      ? undefined
      : successRate >= 80
        ? colors.calls
        : successRate >= 50
          ? colors.average
          : colors.errors;
  const hasResourceTrend = trend.some(
    (bin) => bin.tokens !== null || bin.cost !== null
  );
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
      en: "CALLS",
      tone: "calls",
      value: number.format(summary.count),
      color: undefined,
      hint: `${projectId === "all" ? `${projects.length} 项目` : "当前项目"} · ${traces.length} 条`,
      series: trend.map((bin) => bin.calls),
    },
    {
      label: "成功率",
      en: "SUCCESS",
      tone: successTone,
      value: metric(summary.successRate, (value) => `${value.toFixed(1)}%`),
      color: successColor,
      hint:
        finished.length > 0
          ? `${finished.length - failed.length} / ${finished.length} 成功`
          : "暂无已结束调用",
      series: trend.map((bin) => bin.successRate),
    },
    {
      label: "平均耗时",
      en: "AVG LATENCY",
      tone: "average",
      value: metric(summary.average, seconds),
      color: colors.average,
      hint: `P95 ${metric(summary.p95, seconds)}`,
      series: trend.map((bin) => bin.average),
    },
    {
      label: "P95 耗时",
      en: "P95",
      tone: "p95",
      value: metric(summary.p95, seconds),
      color: colors.p95,
      hint: `平均 ${metric(summary.average, seconds)}`,
      series: trend.map((bin) => bin.p95),
    },
    {
      label: "总 Token",
      en: "TOKENS",
      tone: "tokens",
      value: metric(summary.tokens, number.format),
      color: colors.tokens,
      hint:
        averageTokens === null
          ? "未记录 Token"
          : `约 ${number.format(averageTokens)} / 次`,
      series: trend.map((bin) => bin.tokens),
    },
    {
      label: "总费用",
      en: "COST",
      tone: "cost",
      value: metric(summary.cost, money.format),
      color: undefined,
      hint:
        averageCost === null
          ? "未记录费用"
          : `${money.format(averageCost)} / 次`,
      series: trend.map((bin) => bin.cost),
    },
  ];

  return (
    <>
      <TopNavActions>
        <ConnectedTimeRangeSelector size="S" />
      </TopNavActions>
      <main className="dashboard-page" aria-busy={loading}>
        <header className="dashboard-header">
          <div className="dashboard-heading">
            <p className="dashboard-eyebrow">
              <span className="live-dot" aria-hidden="true" />
              Agent Observability
            </p>
            <h1>全局指标看板</h1>
            <p className="dashboard-subtitle">跨项目查看 Agent 运行情况</p>
          </div>
          <div className="dashboard-controls">
            <label className="select-field">
              <span className="select-field__label">项目范围</span>
              <span className="select-field__control">
                <select
                  aria-label="项目范围"
                  value={projectId}
                  onChange={(event) =>
                    updateParam("project", event.target.value)
                  }
                >
                  <option value="all">全部项目</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <span className="select-field__chevron" aria-hidden="true">
                  ⌄
                </span>
              </span>
            </label>
            <Button
              size="S"
              isDisabled={loading}
              className="refresh-button"
              onPress={() => {
                refreshLiveTimeRange();
                setRevision((value) => value + 1);
              }}
            >
              <span
                className={`refresh-icon${loading ? " is-spinning" : ""}`}
                aria-hidden="true"
              >
                ↻
              </span>
              刷新
            </Button>
          </div>
        </header>
        {loading ? (
          <div className="dashboard-loading" role="status">
            <span className="loading-caption">
              <span className="loading-spinner" aria-hidden="true" />
              正在汇总调用数据…
            </span>
            <div className="metric-grid">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="skeleton-card" aria-hidden="true" />
              ))}
            </div>
            <div className="skeleton-panel" aria-hidden="true" />
          </div>
        ) : error ? (
          <div
            className="dashboard-message dashboard-message--error"
            role="alert"
          >
            {error}
            <Button size="S" onPress={() => setRevision((value) => value + 1)}>
              重试
            </Button>
          </div>
        ) : (
          <>
            <section className="metric-grid" aria-label="全局指标">
              {cards.map((card) => (
                <article
                  key={card.label}
                  className="metric-card"
                  data-tone={card.tone}
                >
                  <div className="metric-card__head">
                    <h2>{card.label}</h2>
                    <span className="metric-card__en">{card.en}</span>
                  </div>
                  <strong style={{ color: card.color }}>{card.value}</strong>
                  <div className="metric-card__foot">
                    <span className="metric-card__hint">{card.hint}</span>
                    <span
                      className="metric-card__spark"
                      style={card.color ? { color: card.color } : undefined}
                    >
                      <Sparkline values={card.series} />
                    </span>
                  </div>
                </article>
              ))}
            </section>
            <div className="data-caption">
              <span className="data-caption__source">
                <span className="live-dot" aria-hidden="true" />
                当前读取本机 Phoenix 数据，示例项目为合成调用。
              </span>
              {updatedAt && (
                <span className="data-caption__time">
                  更新于 {updatedAt.toLocaleTimeString("zh-CN")}
                </span>
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
                    <span className="group-index">01</span>
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
                              <Legend iconType="circle" iconSize={7} />
                              <Bar
                                dataKey="calls"
                                name="调用量"
                                fill={colors.calls}
                                radius={[4, 4, 0, 0]}
                                isAnimationActive={!reducedMotion}
                                animationDuration={700}
                                animationEasing="ease-out"
                              />
                              <Bar
                                dataKey="errors"
                                name="错误数"
                                fill={colors.errors}
                                radius={[4, 4, 0, 0]}
                                isAnimationActive={!reducedMotion}
                                animationDuration={700}
                                animationEasing="ease-out"
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
                              <Legend iconType="circle" iconSize={7} />
                              <Line
                                dataKey="average"
                                name="平均耗时"
                                stroke={colors.average}
                                strokeWidth={2}
                                strokeLinecap="round"
                                activeDot={{ r: 3 }}
                                isAnimationActive={!reducedMotion}
                                animationDuration={700}
                                animationEasing="ease-out"
                              />
                              <Line
                                dataKey="p95"
                                name="P95 耗时"
                                stroke={colors.p95}
                                strokeWidth={2}
                                strokeLinecap="round"
                                activeDot={{ r: 3 }}
                                isAnimationActive={!reducedMotion}
                                animationDuration={700}
                                animationEasing="ease-out"
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
                    <span className="group-index">02</span>
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
                          {hasResourceTrend ? (
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
                                <Legend iconType="circle" iconSize={7} />
                                <Bar
                                  yAxisId="tokens"
                                  dataKey="tokens"
                                  name="Token"
                                  fill={colors.tokens}
                                  radius={[4, 4, 0, 0]}
                                  isAnimationActive={!reducedMotion}
                                  animationDuration={700}
                                  animationEasing="ease-out"
                                />
                                <Line
                                  yAxisId="cost"
                                  dataKey="cost"
                                  name="费用"
                                  stroke={colors.average}
                                  strokeWidth={2}
                                  strokeLinecap="round"
                                  activeDot={{ r: 3 }}
                                  isAnimationActive={!reducedMotion}
                                  animationDuration={700}
                                  animationEasing="ease-out"
                                />
                              </ComposedChart>
                            </ChartResponsiveContainer>
                          ) : (
                            <div className="chart-empty">
                              当前范围内没有 Token 或费用记录
                            </div>
                          )}
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
                                  radius={[0, 4, 4, 0]}
                                  isAnimationActive={!reducedMotion}
                                  animationDuration={700}
                                  animationEasing="ease-out"
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
                <div className="recent-heading">
                  <h2>最近调用</h2>
                  <span className="recent-count">{traces.length}</span>
                </div>
                <Link to={`/projects${timeSearch}`}>
                  查看项目调用列表 <span aria-hidden="true">›</span>
                </Link>
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
                                  ? "status status-error"
                                  : trace.status === "成功"
                                    ? "status status-success"
                                    : "status"
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
