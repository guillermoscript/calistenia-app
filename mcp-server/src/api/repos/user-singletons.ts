/**
 * repos/user-singletons.ts — the one-row-per-user collections the tools read
 * on almost every call (#480): `settings`, `nutrition_goals`, `user_stats`,
 * plus the "latest" lumbar check. 20 inline call sites collapsed into these.
 */

import { getUserSingleton, upsertUserSingleton, type PB, type RecordModel } from "./pb.js";

export function getSettings<T extends RecordModel = RecordModel>(pb: PB, userId: string): Promise<T | null> {
  return getUserSingleton<T>(pb, "settings", userId);
}

export function upsertSettings<T extends RecordModel = RecordModel>(
  pb: PB,
  userId: string,
  data: Record<string, unknown>,
): Promise<T> {
  return upsertUserSingleton<T>(pb, "settings", userId, data);
}

export function getNutritionGoals<T extends RecordModel = RecordModel>(pb: PB, userId: string): Promise<T | null> {
  return getUserSingleton<T>(pb, "nutrition_goals", userId);
}

export function upsertNutritionGoals<T extends RecordModel = RecordModel>(
  pb: PB,
  userId: string,
  data: Record<string, unknown>,
): Promise<T> {
  return upsertUserSingleton<T>(pb, "nutrition_goals", userId, data);
}

export function getUserStats<T extends RecordModel = RecordModel>(pb: PB, userId: string): Promise<T | null> {
  return getUserSingleton<T>(pb, "user_stats", userId);
}

export function upsertUserStats<T extends RecordModel = RecordModel>(
  pb: PB,
  userId: string,
  data: Record<string, unknown>,
): Promise<T> {
  return upsertUserSingleton<T>(pb, "user_stats", userId, data);
}

/** Most recent lumbar check (by `date`), or null if the user never logged one. */
export function getLatestLumbarCheck<T extends RecordModel = RecordModel>(pb: PB, userId: string): Promise<T | null> {
  return getUserSingleton<T>(pb, "lumbar_checks", userId, { sort: "-date" });
}
