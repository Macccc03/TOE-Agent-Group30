// Adapted from Arize Phoenix TimelineBar.tsx, c6602582f13a082ba696c60c9d182e5729462e59.
// Copyright 2025 Arize AI, Inc. ELv2; see ../../vendor/arize-phoenix/LICENSE and IP_NOTICE.
// Modified: millisecond offsets, bounds checking, and zero-duration handling.
export function timelinePosition(total: number, offset: number, duration: number) {
  if (![total, offset, duration].every(Number.isFinite) || total <= 0) return { left: 0, width: 0 };
  const start = Math.min(total, Math.max(0, offset));
  const end = Math.min(total, Math.max(start, offset + Math.max(0, duration)));
  return { left: start / total * 100, width: (end - start) / total * 100 };
}
