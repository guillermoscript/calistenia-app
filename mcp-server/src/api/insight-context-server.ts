/**
 * insight-context-server.ts — server-side (cron-triggered) entry point for
 * the weekly cross-metric insight (issue #127), on top of the SHARED
 * `@calistenia/core/lib/insightContext` implementation (#480).
 *
 * This file used to be a 700-line "faithful port" of the client's
 * buildInsightContext + monthActivity math, re-declaring the InsightContext
 * types a third time, because the client version relied on a module-level
 * timezone singleton and the PocketBase singleton — neither exists in this
 * process, which handles many users (each with their own timezone) with one
 * superuser client. Core now takes both as explicit deps (`InsightDeps`), so
 * the ONLY thing left here is what is genuinely server-specific: reading the
 * calendar collections as a single ranged query per collection (the client
 * reads month by month through fetchMonthActivity, the calendar's own path).
 *
 * Every read degrades to "no data" on failure — never throws — same contract
 * as core.
 */

import type PocketBase from "pocketbase";
import {
  buildInsightContext,
  emptyInsightActivity,
  type InsightActivity,
  type InsightContext,
} from "@calistenia/core/lib/insightContext";
import { addDaysIn, localMidnightAsUTCIn, utcToLocalDateStrIn } from "@calistenia/core/lib/tzDate";

export type { InsightContext, InsightDayRow, InsightSummary } from "@calistenia/core/lib/insightContext";

// PB `date` fields (sleep_entries/weight_entries/body_measurements) serialize
// as "YYYY-MM-DD 00:00:00.000Z" — take the local-date prefix, same as
// monthActivity.ts `dateKey`.
const dateKey = (raw: string): string => (raw || "").split(" ")[0].split("T")[0];

const warn = (message: string, err: unknown): void => console.warn(`insight-context-server: ${message}`, err);

/**
 * Calendar activity for `userId` in [start, end] (YYYY-MM-DD in `tz`,
 * inclusive) as one ranged query per collection. Filters mirror
 * packages/core/lib/monthActivity.ts (same collections, same date semantics):
 * timestamp collections use [local midnight of start, local midnight of
 * end+1) in UTC; `date`-field collections compare the YYYY-MM-DD prefix
 * lexicographically.
 */
export async function fetchInsightActivityWindow(
  pb: PocketBase,
  userId: string,
  tz: string,
  start: string,
  end: string,
): Promise<InsightActivity> {
  const activity = emptyInsightActivity();

  const pbStart = localMidnightAsUTCIn(start, tz);
  const pbEndExclusive = localMidnightAsUTCIn(addDaysIn(end, 1, tz), tz);
  const tsRange = (field: string): string =>
    pb.filter(`user = {:uid} && ${field} >= {:start} && ${field} < {:end}`, {
      uid: userId,
      start: pbStart,
      end: pbEndExclusive,
    });
  const dateRange = pb.filter("user = {:uid} && date >= {:start} && date <= {:end}", { uid: userId, start, end });

  // 1. cardio_sessions
  try {
    const items = await pb.collection("cardio_sessions").getFullList({
      filter: tsRange("started_at"),
      fields: "id,activity_type,distance_km,duration_seconds,started_at,finished_at,note",
    });
    activity.cardio = items as unknown as InsightActivity["cardio"];
  } catch (err) {
    warn("cardio fetch failed", err);
  }

  // 2. circuit_sessions
  try {
    const items = await pb.collection("circuit_sessions").getFullList({
      filter: tsRange("started_at"),
      fields: "id,circuit_name,mode,rounds_completed,rounds_target,duration_seconds,started_at,finished_at,note",
    });
    activity.circuits = items as unknown as InsightActivity["circuits"];
  } catch (err) {
    warn("circuit fetch failed", err);
  }

  // 3. nutrition_entries → meals + calories per local day
  try {
    const items = await pb.collection("nutrition_entries").getFullList({
      filter: tsRange("logged_at"),
      fields: "id,logged_at,total_calories",
    });
    for (const item of items as unknown as Array<{ logged_at: string; total_calories?: number }>) {
      const date = utcToLocalDateStrIn(item.logged_at || "", tz);
      if (!date || date === "Invalid Date") continue;
      const cur = activity.nutritionByDate[date] || (activity.nutritionByDate[date] = { meals: 0, calories: 0 });
      cur.meals++;
      cur.calories += item.total_calories || 0;
    }
  } catch (err) {
    warn("nutrition fetch failed", err);
  }

  // 4. water_entries → ml per local day
  try {
    const items = await pb.collection("water_entries").getFullList({
      filter: tsRange("logged_at"),
      fields: "id,logged_at,amount_ml",
    });
    for (const item of items as unknown as Array<{ logged_at: string; amount_ml?: number }>) {
      const date = utcToLocalDateStrIn(item.logged_at || "", tz);
      if (!date || date === "Invalid Date") continue;
      const cur = activity.waterByDate[date] || (activity.waterByDate[date] = { totalMl: 0 });
      cur.totalMl += item.amount_ml || 0;
    }
  } catch (err) {
    warn("water fetch failed", err);
  }

  // 5. sleep_entries (date field)
  try {
    const items = await pb.collection("sleep_entries").getFullList({
      filter: dateRange,
      fields: "id,date,quality,duration_minutes,bedtime,wake_time,awakenings,caffeine,screen_before_bed,stress_level",
    });
    for (const raw of items as unknown as Array<InsightActivity["sleepByDate"][string] & { date: string }>) {
      const date = dateKey(raw.date);
      if (!date) continue;
      activity.sleepByDate[date] = { ...raw, date };
    }
  } catch (err) {
    warn("sleep fetch failed", err);
  }

  // 6. weight_entries (date field)
  try {
    const items = await pb.collection("weight_entries").getFullList({
      filter: dateRange,
      fields: "id,date,weight_kg,note",
    });
    for (const raw of items as unknown as Array<InsightActivity["weightByDate"][string] & { date: string }>) {
      const date = dateKey(raw.date);
      if (!date) continue;
      activity.weightByDate[date] = { ...raw, date };
    }
  } catch (err) {
    warn("weight fetch failed", err);
  }

  // 7. body_measurements (date field) — waist/neck/hips for the #227 BF%
  // estimate. One per day, most recent wins (sorted -date), as in monthActivity.
  try {
    const items = await pb.collection("body_measurements").getFullList({
      filter: dateRange,
      sort: "-date",
      fields: "id,date,waist,neck,hips",
    });
    for (const raw of items as unknown as Array<InsightActivity["measurementByDate"][string]>) {
      const date = dateKey(raw.date);
      if (!date || activity.measurementByDate[date]) continue;
      activity.measurementByDate[date] = { ...raw, date };
    }
  } catch (err) {
    warn("measurements fetch failed", err);
  }

  return activity;
}

/**
 * Server-side (cron) equivalent of the client's `buildInsightContext`.
 * `tz` is explicit (caller passes `user.timezone || 'UTC'`) since the cron
 * processes many users' timezones in one process.
 */
export function buildInsightContextServer(
  pb: PocketBase,
  userId: string,
  tz: string,
  days: 7 | 30,
  withPrevious: boolean,
): Promise<InsightContext> {
  return buildInsightContext(
    {
      pb,
      tz,
      fetchActivity: (uid, start, end) => fetchInsightActivityWindow(pb, uid, tz, start, end),
      warn,
    },
    userId,
    { days, withPrevious },
  );
}
