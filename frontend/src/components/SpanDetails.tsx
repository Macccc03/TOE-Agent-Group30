import { useState } from 'react';
import type { Span } from '../types.ts';
import { pretty } from '../data/adapter.ts';
import { money, count, Status } from './shared';

function ValueCard({ title, value }: { title: string; value: string }) {
  const [notice, setNotice] = useState('');
  async function copy() {
    try { await navigator.clipboard.writeText(value); setNotice('已复制'); }
    catch { setNotice('复制失败，请选择文本复制'); }
  }
  return <section className="value-card"><div className="card-label"><h3>{title}</h3><div><span role="status">{notice}</span><button className="text-button" disabled={!value} onClick={copy}>复制</button></div></div><pre>{pretty(value)}</pre></section>;
}
export function SpanDetails({ span }: { span: Span }) {
  return <div className="span-details">
    <div className="span-heading"><div><span className="eyebrow">{span.kind}</span><h2>{span.name}</h2></div><Status value={span.status} /></div>
    <p className="mono muted span-id">{span.id}</p>
    <div className="node-stats"><span>单步耗时 <strong>{span.duration} ms</strong></span><span>单步 Token <strong>{count(span.tokens)}</strong></span><span>单步费用 <strong>{money(span.cost)}</strong></span></div>
    {span.error && <div className="error-box" role="alert"><strong>节点错误</strong><pre>{span.error}</pre></div>}
    <ValueCard key={`${span.id}-input`} title="输入 Input" value={span.input} />
    <ValueCard key={`${span.id}-output`} title="输出 Output" value={span.output} />
    <details className="attributes"><summary>节点属性</summary><pre>{pretty(span.attributes)}</pre></details>
  </div>;
}
