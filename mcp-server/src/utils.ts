import { z } from "zod";
import { nowWallClockIn, wallClockDayOf, wallClockForPBIn } from "@calistenia/core/lib/wallClock";

export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json",
}

export const PaginationSchema = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum results to return (1-100)"),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Number of results to skip for pagination"),
  response_format: z
    .nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for structured data"),
};

export function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true as const,
  };
}

/**
 * Result of a View-bound tool (one that declares `outputSchema` + `view`).
 *
 * mcp-use v2 types such tools as `ToolResult<TOutput>`, which demands either
 * `structuredContent: TOutput` or `isError: true` — the legacy `widget()` /
 * `error()` helpers type both as optional and no longer fit. `props` goes to
 * the View as `structuredContent`; `text` is what the model reads.
 */
export function viewResult<TProps>(props: TProps, text: string) {
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: props,
  };
}

/** Format a JS Date or ISO string as YYYY-MM-DD in the given timezone */
export function toDateStr(d: Date | string, tz?: string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (tz) {
    return date.toLocaleDateString("sv-SE", { timeZone: tz });
  }
  return date.toLocaleDateString("sv-SE", { timeZone: "UTC" });
}

/**
 * Day (YYYY-MM-DD) of a `sessions.completed_at` / `sets_log.logged_at` value.
 *
 * Those fields hold the user's LOCAL WALL-CLOCK time (the app writes
 * `nowLocalForPB()`, PocketBase appends "Z"), not a UTC instant, so the day is
 * the first 10 characters. Passing them through `toDateStr(x, tz)` shifts the
 * day by the tz offset. Falls back to `toDateStr` only for unparseable input.
 * Do NOT use for nutrition/water `logged_at` or cardio/circuit `started_at`
 * (real UTC instants).
 */
export function wallClockDayStr(stamp: string | undefined | null, tz?: string): string {
  return wallClockDayOf(stamp) ?? (stamp ? toDateStr(stamp, tz) : "");
}

/**
 * Value to WRITE into `sessions.completed_at` / `sets_log.logged_at`: the user's
 * wall-clock time in `tz`. With an explicit ISO datetime that carries a zone the
 * instant is converted to `tz`; one without a zone is already wall-clock.
 */
export function wallClockStamp(input: string | undefined | null, tz: string): string {
  return input ? wallClockForPBIn(input, tz) : nowWallClockIn(tz);
}

/** Today as YYYY-MM-DD in the given timezone */
export function today(tz?: string): string {
  return toDateStr(new Date(), tz);
}

/** Start of current week (Monday) as YYYY-MM-DD in the given timezone */
export function startOfWeek(tz?: string): string {
  const todayStr = today(tz);
  const d = new Date(`${todayStr}T12:00:00`);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return toDateStr(d, tz);
}

/** N days ago as YYYY-MM-DD in the given timezone */
export function daysAgo(n: number, tz?: string): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateStr(d, tz);
}
