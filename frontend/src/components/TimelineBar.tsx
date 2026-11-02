// Adapted from Arize Phoenix TimelineBar.tsx (c660258); copyright Arize AI, Inc.
// ELv2. Modified: offset-based props, local styles, safe empty ranges; see THIRD_PARTY_NOTICES.md.
import { css } from '@emotion/react';
import { timelinePosition } from './timeline.ts';

export function TimelineBar({ total, offset, duration, color }: { total: number; offset: number; duration: number; color: string }) {
  const position = timelinePosition(total, offset, duration);
  return <div aria-label={`相对起点 ${offset}ms，耗时 ${duration}ms`} title={`+${offset}ms · ${duration}ms`}
    css={css`position:relative;height:6px;background:#e9edf2;border-radius:4px;overflow:hidden;`}>
    <div data-testid="timeline-fill" style={{ left: `${position.left}%`, width: `${position.width}%`, backgroundColor: color }}
      css={css`position:absolute;top:0;bottom:0;border-radius:4px;`} />
  </div>;
}
