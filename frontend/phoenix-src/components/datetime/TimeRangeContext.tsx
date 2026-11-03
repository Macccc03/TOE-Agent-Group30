import React, {
  createContext,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSearchParams } from "react-router";

import { usePreferencesContext } from "@phoenix/contexts/PreferencesContext";

import type { OpenTimeRangeWithKey } from "./types";
import {
  getMillisecondsUntilNextLastNTimeRangeRefresh,
  getTimeRangeFromLastNTimeRangeKey,
  getTimeRangeFromSearchParams,
  getTimeRangeSearch,
  isLastNTimeRangeKey,
  setTimeRangeSearchParams,
} from "./utils";

export type TimeRangeContextType = {
  timeRange: OpenTimeRangeWithKey;
  /**
   * The stable "now" anchor used to resolve open time ranges. It is owned by
   * this provider so descendants can suspend and retry without changing it.
   */
  timeRangeNow: number;
  timeRangeISOStrings: TimeRangeISOStrings;
  /**
   * Set the time range with the state write wrapped in a transition so
   * steering interactions (preset picks, pan/zoom) do not block the input
   * event.
   */
  setTimeRange: (
    timeRange: OpenTimeRangeWithKey,
    options?: SetTimeRangeOptions
  ) => void;
  /**
   * Apply a chart-selected closed time range as a custom selection. The URL
   * write remains transition-wrapped and pushes a history entry so browser
   * Back restores the prior range.
   */
  setCustomTimeRange: (timeRange: TimeRange) => void;
  /** Advance a live last-N range to the current time. */
  refreshLiveTimeRange: () => void;
};

export type SetTimeRangeOptions = {
  /** Choose whether the URL write replaces or pushes browser history. */
  history?: "replace" | "push";
};

/** ISO 8601 bounds for the active time range. */
export type TimeRangeISOStrings = {
  start: string | undefined;
  end: string | undefined;
};

export const TimeRangeContext = createContext<TimeRangeContextType | null>(
  null
);

export function useNullableTimeRangeContext() {
  return React.useContext(TimeRangeContext);
}

export function useTimeRange() {
  const context = useNullableTimeRangeContext();
  if (context === null) {
    throw new Error(
      "useTimeRange must be used within a TimeRangeContextProvider"
    );
  }
  return context;
}

/**
 * The active time range serialized as a URL search string (including the
 * leading "?"), for building links to other time-scoped views so the range
 * carries across the navigation. A live range serializes as just its last-N
 * key so it stays live at the destination; a custom range as its bounds.
 */
export function useTimeRangeSearch(): string {
  const { timeRange } = useTimeRange();
  return getTimeRangeSearch(timeRange);
}

/**
 * Resolve the time range to fall back to when the URL carries none, from the
 * user's stored last-N preference. Defaults to the last 7 days when the stored
 * value is missing or invalid.
 */
function getStoredTimeRange({
  storedLastNTimeRangeKey,
  now,
}: {
  storedLastNTimeRangeKey: unknown;
  now: number;
}): OpenTimeRangeWithKey {
  // Guard against a malformed stored value before trusting it.
  if (isLastNTimeRangeKey(storedLastNTimeRangeKey)) {
    return {
      timeRangeKey: storedLastNTimeRangeKey,
      ...getTimeRangeFromLastNTimeRangeKey(storedLastNTimeRangeKey, now),
    };
  }
  // Fall back to the default time range
  return {
    timeRangeKey: "7d",
    ...getTimeRangeFromLastNTimeRangeKey("7d", now),
  };
}

/**
 * Provides the active tracing time range to the app and keeps it in sync with
 * the URL.
 *
 * The active range takes one of two shapes, mirroring the URL's two mutually
 * exclusive representations (see {@link getTimeRangeFromSearchParams}):
 * - **Live (last-N):** a `timeRangeKey` like "7d" with no bounds. It always
 *   ends at "now" and refreshes on a timer (see {@link LastNTimeRangeKey}).
 * - **Custom:** explicit start/end bounds with no key — a fixed window honored
 *   verbatim.
 *
 * Because the URL is declarative — a key XOR explicit bounds — "is this range
 * live?" is a pure function of its shape: a last-N key is always live, a custom
 * range never is. No provenance tracking is needed to tell a self-authored URL
 * apart from a shared/restored one.
 *
 * State is sourced with the following precedence:
 * 1. The URL search params — the canonical, shareable source of truth.
 * 2. The user's stored last-N preference — used when the URL carries no time
 *    range (e.g. a fresh visit), and then seeded into the URL.
 */
export function TimeRangeProvider({ children }: { children: React.ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const storedLastNTimeRangeKey = usePreferencesContext(
    (state) => state.lastNTimeRangeKey
  );
  const setStoredLastNTimeRangeKey = usePreferencesContext(
    (state) => state.setLastNTimeRangeKey
  );

  // The "now" anchor for resolving relative (last-N) windows. Bumped on a timer
  // so live windows slide forward, and reset whenever a new last-N range is set.
  const [timeRangeNow, setTimeRangeNow] = useState(() => Date.now());

  // The URL wins when it carries a usable range; otherwise fall back to the
  // stored preference (computed lazily, only when the URL carries no range).
  const urlTimeRange = getTimeRangeFromSearchParams(searchParams, timeRangeNow);
  const timeRange =
    urlTimeRange ??
    getStoredTimeRange({ storedLastNTimeRangeKey, now: timeRangeNow });
  const timeRangeStartMs = timeRange.start?.getTime();
  const start = timeRange.start?.toISOString();
  const end = timeRange.end?.toISOString();
  const timeRangeISOStrings = useMemo(() => ({ start, end }), [start, end]);

  /**
   * Set the active time range and reflect it in the URL.
   *
   * The URL write is declarative: a last-N key is written as just the key
   * (clearing any bounds) and a custom range as just its bounds. The write
   * replaces history by default and any last-N key is persisted as the user's
   * preference. Callers can explicitly push discrete changes that should be
   * undoable with browser Back.
   */
  const setTimeRange = (
    timeRange: OpenTimeRangeWithKey,
    options?: SetTimeRangeOptions
  ) => {
    startTransition(() => {
      // Re-anchor partially open custom ranges as well as live presets at the
      // time the user applies them.
      setTimeRangeNow(Date.now());
      setSearchParams(
        (currentSearchParams) =>
          setTimeRangeSearchParams({
            searchParams: currentSearchParams,
            timeRange,
          }),
        { replace: options?.history !== "push" }
      );
      // Persist the preset and re-anchor "now" so the live window refreshes.
      if (isLastNTimeRangeKey(timeRange.timeRangeKey)) {
        setStoredLastNTimeRangeKey(timeRange.timeRangeKey);
      }
    });
  };

  const setCustomTimeRange = (timeRange: TimeRange) => {
    setTimeRange(
      {
        timeRangeKey: "custom",
        start: timeRange.start,
        end: timeRange.end,
      },
      { history: "push" }
    );
  };

  const refreshLiveTimeRange = useCallback(() => {
    if (isLastNTimeRangeKey(timeRange.timeRangeKey)) {
      setTimeRangeNow(Date.now());
    }
  }, [timeRange.timeRangeKey]);

  // Seed a fresh URL from the stored preference on first load. Once the URL
  // carries a range it is canonical, so this no-ops. A live window's refresh
  // needs no URL write: the URL holds only the key, and the window is
  // recomputed from `timeRangeNow` on each render.
  useEffect(() => {
    if (urlTimeRange != null) {
      return;
    }
    const nextSearchParams = setTimeRangeSearchParams({
      searchParams,
      timeRange,
    });
    if (nextSearchParams.toString() === searchParams.toString()) {
      return;
    }
    setSearchParams(nextSearchParams, { replace: true });
  }, [urlTimeRange, searchParams, setSearchParams, timeRange]);

  // Drive live refreshes. While a last-N range is live, schedule a bump of
  // `timeRangeNow` for when its window next rolls over (the start of the next
  // minute or hour) so the displayed window keeps tracking "now".
  useEffect(() => {
    if (!isLastNTimeRangeKey(timeRange.timeRangeKey)) {
      return undefined;
    }
    const timeRangeKey = timeRange.timeRangeKey;
    const timeoutId = window.setTimeout(() => {
      refreshLiveTimeRange();
    }, getMillisecondsUntilNextLastNTimeRangeRefresh(timeRangeKey));
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [timeRange.timeRangeKey, timeRangeStartMs, refreshLiveTimeRange]);

  return (
    <TimeRangeContext.Provider
      value={{
        timeRange,
        timeRangeNow,
        timeRangeISOStrings,
        setTimeRange,
        setCustomTimeRange,
        refreshLiveTimeRange,
      }}
    >
      {children}
    </TimeRangeContext.Provider>
  );
}

/**
 * Parse an optional tool-supplied datetime into the Date shape used by the
 * shared time range context.
 */
