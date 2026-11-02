// Simplified from Arize Phoenix TraceTree.tsx (c660258); copyright Arize AI, Inc.
// ELv2. Modified: nested team data, native buttons, local collapse state; removed
// Relay, annotations, hover queries, Preferences and theme contexts. See THIRD_PARTY_NOTICES.md.
import { useState } from 'react';
import type { Span } from '../types.ts';
import { TimelineBar } from './TimelineBar';

export const colors: Record<string, string> = { AGENT: '#64748b', CHAIN: '#4c7cbf', TOOL: '#bb862a', LLM: '#8a64b7' };
export function TraceTree({ root, total, selected, onSelect }: { root: Span | null; total: number; selected: string; onSelect: (id: string) => void }) {
  return root ? <ul className="tree" aria-label="调用层级"><TreeItem node={root} total={total} selected={selected} onSelect={onSelect} /></ul>
    : <p className="empty">暂无调用节点。</p>;
}
function TreeItem({ node, total, selected, onSelect }: { node: Span; total: number; selected: string; onSelect: (id: string) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  return <li>
    <div className={`tree-row ${selected === node.id ? 'selected' : ''}`}>
      {node.children.length ? <button className="toggle" aria-label={`${collapsed ? '展开' : '收起'} ${node.name}`} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>{collapsed ? '›' : '⌄'}</button> : <span className="toggle-spacer" />}
      <button className="node-select" aria-pressed={selected === node.id} onClick={() => onSelect(node.id)}>
        <span className="node-title"><span className="kind-dot" style={{ background: colors[node.kind] ?? '#64748b' }} />{node.name}{node.status === 'ERROR' && <span className="error-dot" aria-label="错误">!</span>}</span>
        <span className="node-meta">{node.kind} <span>{node.duration} ms</span></span>
        <TimelineBar total={total} offset={node.offset} duration={node.duration} color={colors[node.kind] ?? '#64748b'} />
      </button>
    </div>
    {!collapsed && node.children.length > 0 && <ul>{node.children.map(child => <TreeItem key={child.id} node={child} total={total} selected={selected} onSelect={onSelect} />)}</ul>}
  </li>;
}
