import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AuthManager } from "../auth.js";
import { errorResult, ResponseFormat, today, daysAgo, toDateStr } from "../utils.js";
import {
  ACHIEVEMENTS,
  XP_PER_SESSION,
  XP_PER_SET,
  XP_PER_NUTRITION_LOG,
  XP_PER_LUMBAR_CHECK,
  XP_PER_WEIGHT_LOG,
  XP_PER_WEEKLY_GOAL,
  xpToLevel,
  xpForLevel,
} from "../data/achievements.js";
import type PocketBase from "pocketbase";

// ── Sync engine ─────────────────────────────────────────────────────────────

interface ComputedStats {
  total_sessions: number;
  total_sets: number;
  total_nutrition_logs: number;
  total_lumbar_checks: number;
  total_weight_logs: number;
  workout_streak_current: number;
  workout_streak_best: number;
  nutrition_streak_current: number;
  nutrition_streak_best: number;
  weekly_goals_hit: number;
  last_workout_date: string;
  last_nutrition_date: string;
  xp: number;
  level: number;
  achievements_unlocked: number;
}

/** Compute streaks from an array of date strings (YYYY-MM-DD), sorted asc. */
function computeStreak(dates: string[], tz?: string): { current: number; best: number } {
  if (dates.length === 0) return { current: 0, best: 0 };

  const unique = [...new Set(dates)].sort();
  let best = 1;
  let current = 1;

  for (let i = 1; i < unique.length; i++) {
    const prev = new Date(unique[i - 1]);
    const curr = new Date(unique[i]);
    const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);

    if (diffDays === 1) {
      current++;
      if (current > best) best = current;
    } else {
      current = 1;
    }
  }

  // Check if the current streak is still active (last date is today or yesterday)
  const lastDate = new Date(unique[unique.length - 1]);
  const todayDate = new Date(today(tz));
  const daysSinceLast = (todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceLast > 1) current = 0; // streak is broken

  return { current, best: Math.max(best, current) };
}

/** Count consecutive weeks where sessions >= weekly goal, ending at current week. */
function computeWeeklyGoalStreak(sessionDates: string[], weeklyGoal: number): number {
  if (weeklyGoal <= 0 || sessionDates.length === 0) return 0;

  // Group sessions by ISO week
  const byWeek = new Map<string, number>();
  for (const dateStr of sessionDates) {
    const d = new Date(dateStr);
    // Get ISO week start (Monday)
    const dayOfWeek = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((dayOfWeek + 6) % 7));
    const weekKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    byWeek.set(weekKey, (byWeek.get(weekKey) ?? 0) + 1);
  }

  // Sort weeks descending and count consecutive goal-hitting weeks
  const sortedWeeks = [...byWeek.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  let streak = 0;
  let expectedWeek = new Date();
  expectedWeek.setDate(expectedWeek.getDate() - ((expectedWeek.getDay() + 6) % 7)); // current Monday

  for (const [weekKey, count] of sortedWeeks) {
    const weekDate = new Date(weekKey);
    const diffWeeks = Math.round(
      (expectedWeek.getTime() - weekDate.getTime()) / (1000 * 60 * 60 * 24 * 7)
    );

    if (diffWeeks !== streak) break; // gap in weeks
    if (count < weeklyGoal) break; // didn't meet goal
    streak++;
  }

  return streak;
}

/** Full stat recalculation from source data. */
async function computeAllStats(pb: PocketBase, userId: string, tz?: string): Promise<ComputedStats> {
  // Fetch all source data in parallel
  const userFilter = pb.filter('user = {:userId}', { userId });
  const [sessions, sets, nutritionEntries, lumbarChecks, weightEntries, settings] = await Promise.all([
    pb.collection("sessions").getFullList({ filter: userFilter, sort: "completed_at", fields: "completed_at", requestKey: null }),
    pb.collection("sets_log").getFullList({ filter: userFilter, fields: "id", requestKey: null }),
    pb.collection("nutrition_entries").getFullList({ filter: userFilter, sort: "logged_at", fields: "logged_at", requestKey: null }),
    pb.collection("lumbar_checks").getFullList({ filter: userFilter, fields: "id", requestKey: null }),
    pb.collection("weight_entries").getFullList({ filter: userFilter, fields: "id", requestKey: null }),
    pb.collection("settings").getFirstListItem(pb.filter('user = {:userId}', { userId }), { requestKey: null }).catch(() => null),
  ]);

  const sessionDates = sessions.map((s) => toDateStr(s.completed_at as string, tz));
  const nutritionDates = nutritionEntries.map((n) => toDateStr(n.logged_at as string, tz));

  const workoutStreak = computeStreak(sessionDates, tz);
  const nutritionStreak = computeStreak(nutritionDates, tz);
  const weeklyGoal = (settings?.weekly_goal as number) ?? 0;
  const weeklyGoalsHit = computeWeeklyGoalStreak(sessionDates, weeklyGoal);

  // XP from activity
  const activityXp =
    sessions.length * XP_PER_SESSION +
    sets.length * XP_PER_SET +
    nutritionEntries.length * XP_PER_NUTRITION_LOG +
    lumbarChecks.length * XP_PER_LUMBAR_CHECK +
    weightEntries.length * XP_PER_WEIGHT_LOG +
    weeklyGoalsHit * XP_PER_WEEKLY_GOAL;

  return {
    total_sessions: sessions.length,
    total_sets: sets.length,
    total_nutrition_logs: nutritionEntries.length,
    total_lumbar_checks: lumbarChecks.length,
    total_weight_logs: weightEntries.length,
    workout_streak_current: workoutStreak.current,
    workout_streak_best: workoutStreak.best,
    nutrition_streak_current: nutritionStreak.current,
    nutrition_streak_best: nutritionStreak.best,
    weekly_goals_hit: weeklyGoalsHit,
    last_workout_date: sessionDates.length > 0 ? sessionDates[sessionDates.length - 1] : "",
    last_nutrition_date: nutritionDates.length > 0 ? nutritionDates[nutritionDates.length - 1] : "",
    xp: activityXp, // achievement XP added after checking achievements
    level: xpToLevel(activityXp),
    achievements_unlocked: 0, // filled after achievement check
  };
}

/** Sync achievements catalog to PocketBase if missing. */
async function ensureAchievementsCatalog(pb: PocketBase): Promise<void> {
  const existing = await pb.collection("achievements").getFullList({ fields: "key" });
  const existingKeys = new Set(existing.map((a) => a.key as string));

  const missing = ACHIEVEMENTS.filter((ach) => !existingKeys.has(ach.key));
  if (missing.length > 0) {
    const batch = pb.createBatch();
    for (const ach of missing) {
      batch.collection("achievements").create(ach);
    }
    await batch.send();
  }
}

/** Check achievements and return newly unlocked ones. */
async function checkAchievements(
  pb: PocketBase,
  userId: string,
  stats: ComputedStats
): Promise<{ newly_unlocked: string[]; total_unlocked: number; achievement_xp: number }> {
  const allAchievements = await pb.collection("achievements").getFullList({ sort: "sort_order" });
  const userAchievements = await pb.collection("user_achievements").getFullList({
    filter: pb.filter('user = {:userId}', { userId }),
  });
  const unlockedMap = new Map(userAchievements.map((ua) => [ua.achievement as string, ua]));

  const statValues: Record<string, number> = {
    total_sessions: stats.total_sessions,
    total_sets: stats.total_sets,
    total_nutrition_logs: stats.total_nutrition_logs,
    total_lumbar_checks: stats.total_lumbar_checks,
    total_weight_logs: stats.total_weight_logs,
    weekly_goals_hit: stats.weekly_goals_hit,
    workout_streak_best: stats.workout_streak_best,
    nutrition_streak_best: stats.nutrition_streak_best,
    xp: stats.xp,
    achievements_unlocked: stats.achievements_unlocked,
  };

  const newlyUnlocked: string[] = [];
  let achievementXp = 0;
  let totalUnlocked = 0;

  const batch = pb.createBatch();
  let hasBatchOps = false;

  for (const ach of allAchievements) {
    const currentValue = statValues[ach.requirement_type as string] ?? 0;
    const requiredValue = ach.requirement_value as number;
    const progress = Math.min(Math.round((currentValue / requiredValue) * 100), 100);
    const isUnlocked = currentValue >= requiredValue;
    const existingUA = unlockedMap.get(ach.id);

    if (isUnlocked) {
      totalUnlocked++;
      achievementXp += ach.xp_reward as number;
    }

    if (existingUA) {
      // Update progress if changed
      if (
        existingUA.progress !== progress ||
        existingUA.unlocked !== isUnlocked
      ) {
        batch.collection("user_achievements").update(existingUA.id, {
          progress,
          unlocked: isUnlocked,
          unlocked_at: isUnlocked && !existingUA.unlocked ? new Date().toISOString() : existingUA.unlocked_at,
        });
        hasBatchOps = true;
        if (isUnlocked && !existingUA.unlocked) {
          newlyUnlocked.push(ach.name as string);
        }
      }
    } else {
      // Create user_achievement record
      batch.collection("user_achievements").create({
        user: userId,
        achievement: ach.id,
        progress,
        unlocked: isUnlocked,
        unlocked_at: isUnlocked ? new Date().toISOString() : null,
      });
      hasBatchOps = true;
      if (isUnlocked) {
        newlyUnlocked.push(ach.name as string);
      }
    }
  }

  if (hasBatchOps) {
    await batch.send();
  }

  return { newly_unlocked: newlyUnlocked, total_unlocked: totalUnlocked, achievement_xp: achievementXp };
}

// ── Tool registration ───────────────────────────────────────────────────────

export function registerGamificationTools(server: McpServer, auth: AuthManager) {
  const pb = auth.getClient();
  const userId = auth.getUserId();
  const tz = auth.getTimezone();

  // ──────────────────────────────────────────────────────────────
  // SYNC STATS — The core engine
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_sync_stats",
    {
      title: "Sync Stats & Achievements",
      description:
        "Recalculate all stats from source data: total sessions, sets, XP, level, streaks, and check achievement progress. " +
        "Call this after logging workouts/meals or to initialize gamification for a new user. " +
        "Also ensures the achievement catalog is seeded in the database.",
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        // 1. Ensure achievement catalog exists
        await ensureAchievementsCatalog(pb);

        // 2. Compute stats from source data
        const stats = await computeAllStats(pb, userId, tz);

        // 3. Check achievements (may create/update user_achievements)
        const achResult = await checkAchievements(pb, userId, stats);

        // 4. Add achievement XP to total
        stats.xp += achResult.achievement_xp;
        stats.level = xpToLevel(stats.xp);
        stats.achievements_unlocked = achResult.total_unlocked;

        // Re-check xp-based milestones after adding achievement XP
        // (achievements_unlocked count also updated)
        const finalAch = await checkAchievements(pb, userId, stats);
        stats.achievements_unlocked = finalAch.total_unlocked;

        // 5. Upsert user_stats
        const existing = await pb
          .collection("user_stats")
          .getFirstListItem(pb.filter('user = {:userId}', { userId }))
          .catch(() => null);

        if (existing) {
          await pb.collection("user_stats").update(existing.id, stats);
        } else {
          await pb.collection("user_stats").create({ user: userId, ...stats });
        }

        const nextLevelXp = xpForLevel(stats.level + 1);
        const xpToNext = nextLevelXp - stats.xp;

        let text = [
          `# Stats Synced`,
          `**Level ${stats.level}** — ${stats.xp} XP (${xpToNext} XP to level ${stats.level + 1})`,
          ``,
          `## Activity`,
          `- Sessions: **${stats.total_sessions}** | Sets: **${stats.total_sets}**`,
          `- Meals logged: **${stats.total_nutrition_logs}** | Lumbar checks: **${stats.total_lumbar_checks}** | Weight logs: **${stats.total_weight_logs}**`,
          ``,
          `## Streaks`,
          `- Workout: **${stats.workout_streak_current}** days (best: ${stats.workout_streak_best})`,
          `- Nutrition: **${stats.nutrition_streak_current}** days (best: ${stats.nutrition_streak_best})`,
          `- Weekly goals hit: **${stats.weekly_goals_hit}** consecutive weeks`,
          ``,
          `## Achievements`,
          `**${stats.achievements_unlocked}** / ${ACHIEVEMENTS.length} unlocked`,
        ].join("\n");

        if (achResult.newly_unlocked.length > 0 || finalAch.newly_unlocked.length > 0) {
          const all = [...achResult.newly_unlocked, ...finalAch.newly_unlocked];
          text += `\n\n🎉 **Newly unlocked**: ${all.join(", ")}`;
        }

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            stats,
            newly_unlocked: [...achResult.newly_unlocked, ...finalAch.newly_unlocked],
          },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // GET STATS
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_get_stats",
    {
      title: "Get Gamification Stats",
      description:
        "Get your current XP, level, streaks, and lifetime stats. If stats haven't been synced yet, run cal_sync_stats first.",
      inputSchema: z
        .object({
          response_format: z
            .nativeEnum(ResponseFormat)
            .default(ResponseFormat.MARKDOWN)
            .describe("Output format"),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ response_format }) => {
      try {
        const stats = await pb
          .collection("user_stats")
          .getFirstListItem(pb.filter('user = {:userId}', { userId }))
          .catch(() => null);

        if (!stats) {
          return {
            content: [
              {
                type: "text",
                text: "No stats found. Run `cal_sync_stats` to initialize your gamification profile.",
              },
            ],
          };
        }

        const nextLevelXp = xpForLevel((stats.level as number) + 1);
        const xpToNext = nextLevelXp - (stats.xp as number);
        const progressPct = Math.round(
          (((stats.xp as number) - xpForLevel(stats.level as number)) /
            (nextLevelXp - xpForLevel(stats.level as number))) *
            100
        );

        const output = {
          level: stats.level,
          xp: stats.xp,
          xp_to_next_level: xpToNext,
          level_progress_pct: progressPct,
          streaks: {
            workout: { current: stats.workout_streak_current, best: stats.workout_streak_best },
            nutrition: { current: stats.nutrition_streak_current, best: stats.nutrition_streak_best },
            weekly_goals_hit: stats.weekly_goals_hit,
          },
          totals: {
            sessions: stats.total_sessions,
            sets: stats.total_sets,
            nutrition_logs: stats.total_nutrition_logs,
            lumbar_checks: stats.total_lumbar_checks,
            weight_logs: stats.total_weight_logs,
          },
          achievements_unlocked: stats.achievements_unlocked,
          achievements_total: ACHIEVEMENTS.length,
          last_workout: stats.last_workout_date || null,
          last_nutrition: stats.last_nutrition_date || null,
        };

        let text: string;
        if (response_format === ResponseFormat.JSON) {
          text = JSON.stringify(output, null, 2);
        } else {
          const bar = "█".repeat(Math.floor(progressPct / 5)) + "░".repeat(20 - Math.floor(progressPct / 5));
          text = [
            `# Level ${stats.level} — ${stats.xp} XP`,
            `${bar} ${progressPct}% → Level ${(stats.level as number) + 1} (${xpToNext} XP needed)`,
            ``,
            `## Streaks 🔥`,
            `- Workout: **${stats.workout_streak_current}** days ${stats.workout_streak_current === stats.workout_streak_best ? "(PB!)" : `(best: ${stats.workout_streak_best})`}`,
            `- Nutrition: **${stats.nutrition_streak_current}** days ${stats.nutrition_streak_current === stats.nutrition_streak_best ? "(PB!)" : `(best: ${stats.nutrition_streak_best})`}`,
            `- Weekly goals hit: **${stats.weekly_goals_hit}** consecutive weeks`,
            ``,
            `## Lifetime 📈`,
            `- ${stats.total_sessions} sessions | ${stats.total_sets} sets`,
            `- ${stats.total_nutrition_logs} meals | ${stats.total_lumbar_checks} health checks | ${stats.total_weight_logs} weigh-ins`,
            ``,
            `## Achievements 🏆`,
            `**${stats.achievements_unlocked}** / ${ACHIEVEMENTS.length} unlocked`,
          ].join("\n");
        }

        return { content: [{ type: "text", text }], structuredContent: output };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // GET ACHIEVEMENTS
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_get_achievements",
    {
      title: "Get Achievements",
      description:
        "View all achievements with your progress toward each. Filter by category or see only unlocked/locked ones.",
      inputSchema: z
        .object({
          category: z
            .enum(["consistency", "strength", "health", "nutrition", "milestone"])
            .optional()
            .describe("Filter by category"),
          status: z
            .enum(["unlocked", "locked", "all"])
            .default("all")
            .describe("Filter by unlock status"),
          response_format: z
            .nativeEnum(ResponseFormat)
            .default(ResponseFormat.MARKDOWN)
            .describe("Output format"),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ category, status, response_format }) => {
      try {
        const achFilter = category ? pb.filter('category = {:category}', { category }) : undefined;
        const allAch = await pb.collection("achievements").getFullList({
          filter: achFilter,
          sort: "sort_order",
        });

        const userAch = await pb.collection("user_achievements").getFullList({
          filter: pb.filter('user = {:userId}', { userId }),
        });
        const progressMap = new Map(
          userAch.map((ua) => [
            ua.achievement as string,
            { progress: ua.progress as number, unlocked: ua.unlocked as boolean, unlocked_at: ua.unlocked_at },
          ])
        );

        let achievements = allAch.map((a) => {
          const ua = progressMap.get(a.id);
          return {
            key: a.key as string,
            name: a.name as string,
            description: a.description as string,
            category: a.category as string,
            icon: a.icon as string,
            tier: a.tier as string,
            xp_reward: a.xp_reward as number,
            progress: ua?.progress ?? 0,
            unlocked: ua?.unlocked ?? false,
            unlocked_at: ua?.unlocked_at ?? null,
          };
        });

        if (status === "unlocked") achievements = achievements.filter((a) => a.unlocked);
        if (status === "locked") achievements = achievements.filter((a) => !a.unlocked);

        const output = {
          total: achievements.length,
          unlocked: achievements.filter((a) => a.unlocked).length,
          achievements,
        };

        let text: string;
        if (response_format === ResponseFormat.JSON) {
          text = JSON.stringify(output, null, 2);
        } else {
          const tierColors: Record<string, string> = {
            bronze: "🥉",
            silver: "🥈",
            gold: "🥇",
            diamond: "💎",
          };
          const lines = [
            `# Achievements (${output.unlocked}/${output.total} unlocked)\n`,
          ];

          // Group by category
          const grouped: Record<string, typeof achievements> = {};
          for (const a of achievements) {
            if (!grouped[a.category]) grouped[a.category] = [];
            grouped[a.category].push(a);
          }

          for (const [cat, achs] of Object.entries(grouped)) {
            lines.push(`## ${cat.charAt(0).toUpperCase() + cat.slice(1)}\n`);
            for (const a of achs) {
              const lock = a.unlocked ? "✅" : "🔒";
              const tier = tierColors[a.tier] ?? "";
              const progressBar =
                a.progress < 100
                  ? ` [${a.progress}%]`
                  : "";
              lines.push(
                `${lock} ${a.icon} **${a.name}** ${tier}${progressBar} — ${a.description}${a.xp_reward > 0 ? ` (+${a.xp_reward} XP)` : ""}`
              );
            }
            lines.push("");
          }
          text = lines.join("\n");
        }

        return { content: [{ type: "text", text }], structuredContent: output };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
