#!/usr/bin/env node

/**
 * Seed script — populates the `achievements` table with all definitions
 * and initializes `user_stats` for the authenticated user.
 *
 * Usage:
 *   PB_TOKEN=your_token node build/seed.js
 *   PB_TOKEN=your_token POCKETBASE_URL=http://localhost:8090 node build/seed.js
 */

import dotenv from "dotenv";
dotenv.config();

import PocketBase from "pocketbase";
import { ACHIEVEMENTS, xpToLevel, XP_PER_SESSION, XP_PER_SET, XP_PER_NUTRITION_LOG, XP_PER_LUMBAR_CHECK, XP_PER_WEIGHT_LOG } from "./data/achievements.js";

const PB_URL = process.env.POCKETBASE_URL ?? "http://127.0.0.1:8090";
const PB_TOKEN = process.env.PB_TOKEN;

if (!PB_TOKEN) {
  console.error("Error: PB_TOKEN environment variable is required.");
  console.error("Get it from: DevTools → Application → Local Storage → 'pb_auth' → token");
  process.exit(1);
}

async function main() {
  const pb = new PocketBase(PB_URL);
  pb.authStore.save(PB_TOKEN!, null);

  // Validate token
  console.log("Authenticating with PocketBase...");
  let userId: string;
  try {
    const result = await pb.collection("users").authRefresh();
    userId = result.record.id;
    console.log(`Authenticated as ${result.record.email} (${userId})`);
  } catch {
    console.error("Error: Invalid or expired token. Get a fresh one from the app.");
    process.exit(1);
  }

  // ── Seed achievements ───────────────────────────────────────
  console.log("\nSeeding achievements...");
  const existing = await pb.collection("achievements").getFullList({ fields: "key" });
  const existingKeys = new Set(existing.map((a) => a.key as string));

  let created = 0;
  let skipped = 0;
  for (const ach of ACHIEVEMENTS) {
    if (existingKeys.has(ach.key)) {
      skipped++;
      continue;
    }
    await pb.collection("achievements").create(ach);
    created++;
    console.log(`  + ${ach.icon} ${ach.name} (${ach.tier})`);
  }
  console.log(`Achievements: ${created} created, ${skipped} already existed (${ACHIEVEMENTS.length} total)`);

  // ── Initialize user stats ───────────────────────────────────
  console.log("\nComputing user stats...");

  const [sessions, sets, nutrition, lumbar, weight] = await Promise.all([
    pb.collection("sessions").getFullList({ filter: `user = "${userId}"`, fields: "id" }),
    pb.collection("sets_log").getFullList({ filter: `user = "${userId}"`, fields: "id" }),
    pb.collection("nutrition_entries").getFullList({ filter: `user = "${userId}"`, fields: "id" }),
    pb.collection("lumbar_checks").getFullList({ filter: `user = "${userId}"`, fields: "id" }),
    pb.collection("weight_entries").getFullList({ filter: `user = "${userId}"`, fields: "id" }),
  ]);

  const xp =
    sessions.length * XP_PER_SESSION +
    sets.length * XP_PER_SET +
    nutrition.length * XP_PER_NUTRITION_LOG +
    lumbar.length * XP_PER_LUMBAR_CHECK +
    weight.length * XP_PER_WEIGHT_LOG;

  const level = xpToLevel(xp);

  const statsData = {
    user: userId,
    xp,
    level,
    total_sessions: sessions.length,
    total_sets: sets.length,
    total_nutrition_logs: nutrition.length,
    total_lumbar_checks: lumbar.length,
    total_weight_logs: weight.length,
    workout_streak_current: 0,
    workout_streak_best: 0,
    nutrition_streak_current: 0,
    nutrition_streak_best: 0,
    weekly_goals_hit: 0,
    achievements_unlocked: 0,
    last_workout_date: "",
    last_nutrition_date: "",
  };

  const existingStats = await pb
    .collection("user_stats")
    .getFirstListItem(`user = "${userId}"`)
    .catch(() => null);

  if (existingStats) {
    await pb.collection("user_stats").update(existingStats.id, statsData);
    console.log("Updated existing user_stats record.");
  } else {
    await pb.collection("user_stats").create(statsData);
    console.log("Created user_stats record.");
  }

  console.log(`  Level: ${level} | XP: ${xp}`);
  console.log(`  Sessions: ${sessions.length} | Sets: ${sets.length} | Meals: ${nutrition.length}`);
  console.log(`  Lumbar: ${lumbar.length} | Weight: ${weight.length}`);

  // ── Check achievements ──────────────────────────────────────
  console.log("\nChecking achievements...");
  const allAch = await pb.collection("achievements").getFullList({ sort: "sort_order" });

  const statValues: Record<string, number> = {
    total_sessions: sessions.length,
    total_sets: sets.length,
    total_nutrition_logs: nutrition.length,
    total_lumbar_checks: lumbar.length,
    total_weight_logs: weight.length,
    xp,
    weekly_goals_hit: 0,
    workout_streak_best: 0,
    nutrition_streak_best: 0,
    achievements_unlocked: 0,
  };

  let unlocked = 0;
  for (const ach of allAch) {
    const current = statValues[ach.requirement_type as string] ?? 0;
    const required = ach.requirement_value as number;
    const progress = Math.min(Math.round((current / required) * 100), 100);
    const isUnlocked = current >= required;

    if (isUnlocked) unlocked++;

    const existingUA = await pb
      .collection("user_achievements")
      .getFirstListItem(`user = "${userId}" && achievement = "${ach.id}"`)
      .catch(() => null);

    if (existingUA) {
      await pb.collection("user_achievements").update(existingUA.id, {
        progress,
        unlocked: isUnlocked,
        unlocked_at: isUnlocked && !existingUA.unlocked ? new Date().toISOString() : existingUA.unlocked_at,
      });
    } else {
      await pb.collection("user_achievements").create({
        user: userId,
        achievement: ach.id,
        progress,
        unlocked: isUnlocked,
        unlocked_at: isUnlocked ? new Date().toISOString() : null,
      });
    }

    const icon = isUnlocked ? "✅" : `🔒 ${progress}%`;
    console.log(`  ${icon} ${ach.icon} ${ach.name}`);
  }

  // Update achievements_unlocked count
  if (existingStats) {
    await pb.collection("user_stats").update(existingStats.id, { achievements_unlocked: unlocked });
  }

  console.log(`\nDone! ${unlocked}/${allAch.length} achievements unlocked.`);
}

main().catch((err) => {
  console.error("Seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
