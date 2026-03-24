import { z } from "zod";

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
    isError: true,
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
