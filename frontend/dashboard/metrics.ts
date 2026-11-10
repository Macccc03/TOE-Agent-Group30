import type { Span } from "./data";

export type Trace = {
  id: string;
  projectId: string;
  projectName: string;
  name: string;
  start: number;
  latency: number | null;
  status: "成功" | "失败" | "进行中";
  tokens: number | null;
  cost: number | null;
};

function sumRecorded(values: (number | null | undefined)[]) {
  const recorded = values.filter((value): value is number => value != null);
  return recorded.length
    ? recorded.reduce((sum, value) => sum + value, 0)
    : null;
}

function durations(traces: Trace[]) {
  return traces.flatMap((trace) =>
    trace.latency === null ? [] : [trace.latency]
  );
}

export function p95(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.ceil(sorted.length * 0.95) - 1] : null;
}

function average(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

export function getTraces(spans: Span[]): Trace[] {
  const groups = new Map<string, Span[]>();
  for (const span of spans) {
    const key = `${span.projectId}:${span.trace.traceId}`;
    const group = groups.get(key) ?? [];
    group.push(span);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map<Trace>((group) => {
      const root = group.find((span) => span.parentId === null) ?? group[0];
      const start = Math.min(
        ...group.map((span) => Date.parse(span.startTime))
      );
      const finished = group.every((span) => span.endTime !== null);
      const end = Math.max(
        ...group.map((span) => Date.parse(span.endTime ?? span.startTime))
      );
      return {
        id: root.trace.traceId,
        projectId: root.projectId,
        projectName: root.projectName,
        name: root.name,
        start,
        latency: finished ? (end - start) / 1000 : null,
        status: !finished
          ? "进行中"
          : group.some((span) => span.statusCode === "ERROR")
            ? "失败"
            : "成功",
        tokens: sumRecorded(group.map((span) => span.tokenCountTotal)),
        cost: sumRecorded(group.map((span) => span.costSummary?.total.cost)),
      };
    })
    .sort((a, b) => b.start - a.start);
}

export function summarize(traces: Trace[]) {
  const finished = traces.filter((trace) => trace.status !== "进行中");
  return {
    count: traces.length,
    successRate: finished.length
      ? (finished.filter((trace) => trace.status === "成功").length /
          finished.length) *
        100
      : null,
    average: average(durations(traces)),
    p95: p95(durations(traces)),
    tokens: sumRecorded(traces.map((trace) => trace.tokens)),
    cost: sumRecorded(traces.map((trace) => trace.cost)),
  };
}

export function getTrend(traces: Trace[], start: number, end: number) {
  const hourly = end - start <= 2 * 24 * 60 * 60 * 1000;
  const cursor = new Date(start);
  cursor.setMinutes(0, 0, 0);
  if (!hourly) cursor.setHours(0);
  const bins = [];
  while (cursor.getTime() <= end) {
    const timestamp = cursor.getTime();
    if (hourly) cursor.setHours(cursor.getHours() + 1);
    else cursor.setDate(cursor.getDate() + 1);
    const subset = traces.filter(
      (trace) => trace.start >= timestamp && trace.start < cursor.getTime()
    );
    const summary = summarize(subset);
    bins.push({
      timestamp,
      label: new Date(timestamp).toLocaleString(
        "zh-CN",
        hourly
          ? { hour: "2-digit", minute: "2-digit" }
          : { month: "2-digit", day: "2-digit" }
      ),
      calls: summary.count,
      errors: subset.filter((trace) => trace.status === "失败").length,
      successRate: summary.successRate,
      average: summary.average,
      p95: summary.p95,
      tokens: summary.tokens,
      cost: summary.cost,
    });
  }
  return bins;
}

export function getTools(spans: Span[]) {
  const counts = new Map<string, number>();
  for (const span of spans) {
    if (span.spanKind === "tool")
      counts.set(span.name, (counts.get(span.name) ?? 0) + 1);
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}
