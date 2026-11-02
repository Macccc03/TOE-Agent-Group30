import { useEffect, useState } from 'react';
import type { Trace } from './types.ts';
import { traceRepository } from './data/repository.ts';
import type { Scene } from './data/repository.ts';
import { flatten } from './data/adapter.ts';
import { TraceTree } from './components/TraceTree';
import { SpanDetails } from './components/SpanDetails';
import { count, money, time, Status } from './components/shared';

function useRoute() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => { const update = () => setHash(location.hash); addEventListener('hashchange', update); return () => removeEventListener('hashchange', update); }, []);
  const [path, query] = hash.replace(/^#/, '').split('?');
  return { id: path?.startsWith('/traces/') ? decodeURIComponent(path.slice(8)) : '', span: new URLSearchParams(query).get('span') };
}
export default function App() {
  const route = useRoute();
  return <><header className="app-header"><a className="brand" href="#/"><span className="brand-mark">T</span><strong>TOE</strong><span className="brand-divider" />Agent 调用分析</a><span className="version">基础体验版</span></header>
    <div className="demo-banner"><span className="demo-label">MOCK</span>当前为本地模拟数据，仅用于页面体验，不会调用真实模型或后端服务。</div>
    <main>{route.id ? <DetailPage key={route.id} id={route.id} spanId={route.span} /> : <ListPage />}</main>
    <footer>TOE-Agent-Group30 <span>·</span> 基于 Phoenix 核心组件精简实现</footer></>;
}
function ListPage() {
  const [scene, setScene] = useState<Scene>('normal');
  const [traces, setTraces] = useState<Trace[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    traceRepository.list(scene).then(data => { if (active) setTraces(data); }).catch(e => { if (active) setError(String(e.message)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [scene]);
  return <><div className="page-heading"><div><p className="eyebrow">OBSERVABILITY</p><h1>调用记录</h1><p className="muted">从一次调用开始，了解 Agent 的执行过程。</p></div>
    <label className="scene-label">演示场景<select aria-label="演示场景" value={scene} onChange={e => setScene(e.target.value as Scene)}><option value="normal">正常列表</option><option value="empty">空列表</option><option value="error">请求失败</option></select></label></div>
    <section className="panel"><div className="panel-heading"><h2>全部调用 <span className="counter">{loading || error ? '—' : traces.length}</span></h2><span className="muted small">时间：北京时间</span></div>
      {loading ? <div className="empty" role="status">正在加载调用记录…</div> : error ? <div className="empty" role="alert"><strong>无法加载调用记录</strong><p>{error}</p><button onClick={() => setScene('normal')}>恢复正常列表</button></div> : !traces.length ? <div className="empty"><strong>暂无调用记录</strong><p>运行 Agent 后，调用记录将在这里展示。</p></div> : <div className="table-scroll"><table><thead><tr><th>调用名称</th><th>状态</th><th>开始时间</th><th>耗时</th><th>Token</th><th>费用</th><th aria-label="查看详情" /></tr></thead><tbody>{traces.map(trace => <tr key={trace.id} onClick={e => { if (!(e.target as HTMLElement).closest('a')) location.hash = `/traces/${encodeURIComponent(trace.id)}`; }}><td><a className="trace-link" href={`#/traces/${trace.id}`}>{trace.name}</a><div className="trace-id mono">{trace.id}</div></td><td><Status value={trace.status} /></td><td className="muted small">{time(trace.start)}</td><td className="numeric">{trace.duration} ms</td><td className="numeric">{count(trace.tokens)}</td><td className="numeric">{money(trace.cost)}</td><td className="row-arrow">→</td></tr>)}</tbody></table></div>}
    </section><p className="hint">体验建议：先打开天气建议查看多层调用，再查看订单查询中的错误节点。</p></>;
}
function DetailPage({ id, spanId }: { id: string; spanId: string | null }) {
  const [trace, setTrace] = useState<Trace | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { let active = true; traceRepository.get(id).then(data => { if (active) setTrace(data); }).catch(e => { if (active) setError(String(e.message)); }); return () => { active = false; }; }, [id]);
  const spans = flatten(trace?.root ?? null);
  const selected = spans.find(span => span.id === spanId) ?? trace?.root;
  return <><a className="back-link" href="#/">← 返回调用列表</a>
    {error ? <div className="panel empty" role="alert">{error}</div> : !trace ? <div className="panel empty" role="status">正在加载调用详情…</div> : <>
      <div className="page-heading detail-heading"><div><p className="eyebrow">TRACE DETAILS</p><h1>{trace.name}</h1><p className="muted mono small">{trace.id} · {time(trace.start)}</p></div><Status value={trace.status} /></div>
      <div className="trace-summary"><div><span>整链耗时</span><strong>{trace.duration}<small> ms</small></strong></div><div><span>整链 Token</span><strong>{count(trace.tokens)}</strong></div><div><span>整链费用</span><strong>{money(trace.cost)}</strong></div><div><span>调用节点</span><strong>{spans.length}<small> 个</small></strong></div></div>
      <section className="panel detail-layout"><aside className="tree-pane"><div className="panel-heading"><h2>调用链</h2><span className="muted small">{spans.length} 个节点</span></div><div className="timeline-caption"><span>0 ms</span><span>{trace.duration} ms</span></div><TraceTree root={trace.root} total={trace.duration} selected={selected?.id ?? ''} onSelect={span => { location.hash = `/traces/${encodeURIComponent(id)}?span=${encodeURIComponent(span)}`; }} /><p className="tree-note">时间条表示相对开始时间与单步耗时。</p></aside>
      {selected ? <SpanDetails key={selected.id} span={selected} /> : <div className="empty">这条调用没有可展示的节点。</div>}</section>
    </>}
  </>;
}
