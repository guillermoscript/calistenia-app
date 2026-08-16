/**
 * repos/activity.ts — the user's logged activity over a period (#480):
 * strength sessions and sets, nutrition and water entries, weight entries.
 * All are `listUserRange` under the hood; the wrappers fix the range field
 * and the projection each tool family expects.
 *
 * `from`/`to` are passed through VERBATIM to the filter (a PB datetime like
 * `2026-08-01 00:00:00`, or `YYYY-MM-DD` for `date` fields). The tools decide
 * the bounds — e.g. `${day} 23:59:59` for an inclusive end of day.
 */

import { listUserRange, type PB, type RecordModel } from "./pb.js";

export interface PeriodQuery {
  from: string;
  to?: string;
  /** Override the default projection. */
  fields?: string;
  sort?: string;
}

/** Projection the workout tools read from `sessions`. */
export const SESSION_FIELDS = "id,workout_key,phase,day,completed_at";
/** Projection the workout tools read from `sets_log`. */
export const SET_FIELDS = "id,exercise_id,reps,logged_at,workout_key";
/** Projection the nutrition tools read from `nutrition_entries` for aggregates. */
export const NUTRITION_TOTALS_FIELDS = "id,total_calories,total_protein,total_carbs,total_fat,logged_at,meal_type";
/** Projection the progress tools read from `weight_entries`. */
export const WEIGHT_FIELDS = "id,weight_kg,date";

/** Completed strength sessions with `completed_at` in the period. */
export function listSessions<T extends RecordModel = RecordModel>(pb: PB, userId: string, q: PeriodQuery): Promise<T[]> {
  return listUserRange<T>(pb, "sessions", userId, {
    field: "completed_at",
    from: q.from,
    to: q.to,
    fields: q.fields ?? SESSION_FIELDS,
    sort: q.sort,
  });
}

/** Sets logged in the period (any exercise). */
export function listSets<T extends RecordModel = RecordModel>(pb: PB, userId: string, q: PeriodQuery): Promise<T[]> {
  return listUserRange<T>(pb, "sets_log", userId, {
    field: "logged_at",
    from: q.from,
    to: q.to,
    fields: q.fields ?? SET_FIELDS,
    sort: q.sort,
  });
}

/** Sets of ONE exercise since `from`, oldest first (exercise history / progression). */
export function listExerciseSets<T extends RecordModel = RecordModel>(
  pb: PB,
  userId: string,
  exerciseId: string,
  q: PeriodQuery,
): Promise<T[]> {
  return pb.collection("sets_log").getFullList<T>({
    filter: pb.filter("user = {:userId} && exercise_id = {:exerciseId} && logged_at >= {:from}", {
      userId,
      exerciseId,
      from: q.from,
    }),
    sort: q.sort ?? "logged_at",
    fields: q.fields ?? `${SET_FIELDS},note`,
    requestKey: null,
  });
}

/** Meals logged in the period. Full records unless `fields` is given. */
export function listNutritionEntries<T extends RecordModel = RecordModel>(
  pb: PB,
  userId: string,
  q: PeriodQuery,
): Promise<T[]> {
  return listUserRange<T>(pb, "nutrition_entries", userId, {
    field: "logged_at",
    from: q.from,
    to: q.to,
    fields: q.fields,
    sort: q.sort,
  });
}

/** Meals logged today (`day` = YYYY-MM-DD in the user's tz). Full records. */
export function listTodayNutritionEntries<T extends RecordModel = RecordModel>(
  pb: PB,
  userId: string,
  day: string,
): Promise<T[]> {
  return listNutritionEntries<T>(pb, userId, { from: `${day} 00:00:00` });
}

/** Water entries logged since `from` (typically the start of today). */
export function listWaterEntries<T extends RecordModel = RecordModel>(pb: PB, userId: string, q: PeriodQuery): Promise<T[]> {
  return listUserRange<T>(pb, "water_entries", userId, {
    field: "logged_at",
    from: q.from,
    to: q.to,
    fields: q.fields,
    sort: q.sort,
  });
}

/** Weight entries with `date` in the period, oldest first by default. */
export function listWeightEntries<T extends RecordModel = RecordModel>(
  pb: PB,
  userId: string,
  q: PeriodQuery,
): Promise<T[]> {
  return listUserRange<T>(pb, "weight_entries", userId, {
    field: "date",
    from: q.from,
    to: q.to,
    fields: q.fields ?? WEIGHT_FIELDS,
    sort: q.sort ?? "date",
  });
}
