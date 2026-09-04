import type { AppServer } from "../mcpuse/auth-bridge.js";
import { z } from "zod";
import { getAuthManager } from "../mcpuse/auth-bridge.js";
import { errorResult, viewResult, ResponseFormat, today, daysAgo, startOfWeek, toDateStr } from "../utils.js";
import { sessionTrackerPropsSchema } from "../views/session-tracker.schema.js";
import { readinessCheckPropsSchema } from "../views/readiness-check.schema.js";
import { gapAnalysisPropsSchema } from "../views/gap-analysis.schema.js";
import { trendsChartPropsSchema } from "../views/trends-chart.schema.js";
import { todayDashboardPropsSchema } from "../views/today-dashboard.schema.js";
import { localize } from "../lib/i18n.js";
import { pickLocale, readiness as readinessMsg } from "../lib/tool-i18n.js";
import { calculateMacroDetails, calculateMacros } from "@calistenia/core/lib/nutritionGoal";
import {
  getSettings,
  getNutritionGoals,
  upsertNutritionGoals,
  getLatestLumbarCheck,
  getCurrentProgram,
  listSessions,
  listSets,
  listExerciseSets,
  listWeightEntries,
  listNutritionEntries,
  listTodayNutritionEntries,
  listProgramExercises,
  listProgramOverrides,
  SET_FIELDS,
  NUTRITION_TOTALS_FIELDS,
} from "../api/repos/index.js";
import { resolveActiveProgramProgress } from "../api/program-progress-server.js";
import { loadUserExerciseResolver } from "../api/exercise-identity-server.js";
import { resolveProgramExercises, toProgramOverrides } from "../api/program-overrides-server.js";

export function registerSmartTools(server: AppServer, pbUrl: string) {

  // ──────────────────────────────────────────────────────────────
  // LOG FULL WORKOUT — one call instead of 7+
  // ──────────────────────────────────────────────────────────────
  const logFullWorkout = server.tool(
    {
      name: "cal_log_full_workout",
      title: "Log Full Workout",
      description:
        "Log a complete workout in one call: creates a session + all exercise sets. Much faster than calling cal_log_session + cal_log_set for each exercise. " +
        "After logging, run `cal_sync_stats` to update XP, streaks, and check for new achievements.",
      schema: z
        .object({
          workout_key: z
            .string()
            .describe("Workout identifier (e.g. 'p1_lun' = Phase 1 Monday, or 'free_{timestamp}' for a free session)"),
          // min(0) para admitir sesiones libres, igual que cal_log_workout (#376).
          phase: z.number().int().min(0).describe("Training phase number (1-4 for programs, 0 for free sessions)"),
          day: z
            .string()
            .describe("Day identifier: 'lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'"),
          exercises: z
            .array(
              z.object({
                exercise_id: z.string().describe("Exercise identifier (e.g. 'push-up')"),
                sets: z
                  .array(z.string())
                  .min(1)
                  .describe("Array of rep counts per set (e.g. ['10', '8', '7'] or ['30s', '25s'])"),
                note: z.string().optional().describe("Optional note for this exercise"),
              })
            )
            .min(1)
            .describe("Exercises performed with their sets"),
          completed_at: z.string().optional().describe("Completion time (ISO 8601). Defaults to now."),
          session_note: z.string().optional().describe("Optional note about the overall session"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ workout_key, phase, day, exercises, completed_at, session_note }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();
        const now = completed_at ?? new Date().toISOString();

        // 1. Create session
        const session = await pb.collection("sessions").create({
          user: userId,
          workout_key,
          phase,
          day,
          completed_at: now,
          note: session_note ?? "",
        });

        // 2. Create all sets in parallel
        let totalSets = 0;
        const setPromises: Promise<unknown>[] = [];
        for (const ex of exercises) {
          for (const reps of ex.sets) {
            totalSets++;
            setPromises.push(
              pb.collection("sets_log").create({
                user: userId,
                exercise_id: ex.exercise_id,
                workout_key,
                reps,
                note: ex.note ?? "",
                logged_at: now,
              })
            );
          }
        }
        await Promise.all(setPromises);

        // Summary
        const exerciseSummary = exercises
          .map((e) => `**${e.exercise_id}**: ${e.sets.join(", ")}`)
          .join("\n  ");

        return {
          content: [
            {
              type: "text",
              text: [
                `Workout logged! **${workout_key}** (Phase ${phase})`,
                `${exercises.length} exercises, ${totalSets} total sets`,
                ``,
                `  ${exerciseSummary}`,
                ``,
                `Run \`cal_sync_stats\` to update your XP, level, and check for new achievements.`,
              ].join("\n"),
            },
          ],
          structuredContent: {
            session_id: session.id,
            workout_key,
            phase,
            day,
            exercises_count: exercises.length,
            total_sets: totalSets,
            completed_at: now,
          },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // READINESS CHECK — Should I train today?
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_readiness_check",
      title: "Training Readiness Check",
      description:
        "Holistic readiness assessment: combines lumbar health, sleep, days since last workout, weekly progress vs goal, and weight trend into a single 1-10 score with a recommendation. " +
        "Use this before deciding whether/what to train today.",
      view: { name: "readiness-check" },
      outputSchema: readinessCheckPropsSchema,
      schema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (_input, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();
        const tz = auth.getTimezone();
        const weekStart = startOfWeek(tz);
        const todayStr = today(tz);

        const [lastLumbar, weekSessions, lastSession, settings, current] = await Promise.all([
          getLatestLumbarCheck(pb, userId),
          listSessions(pb, userId, { from: weekStart }),
          pb
            .collection("sessions")
            .getFirstListItem(pb.filter('user = {:userId}', { userId }), { sort: "-completed_at", fields: 'id,workout_key,phase,day,completed_at', requestKey: null })
            .catch(() => null),
          getSettings(pb, userId),
          getCurrentProgram(pb, userId),
        ]);

        // ── Score components ────────────────────────────────
        const M = readinessMsg[pickLocale(settings)];
        let score = 10;
        const factors: string[] = [];

        // Lumbar health (0-3 points deduction)
        const lumbarScore = lastLumbar?.lumbar_score as number | undefined;
        const lumbarDate = lastLumbar?.date as string | undefined;
        const lumbarRecent = lumbarDate === todayStr || lumbarDate === daysAgo(1, tz);

        if (lumbarScore !== undefined && lumbarRecent) {
          if (lumbarScore <= 2) {
            score -= 3;
            factors.push(M.lumbarPain(lumbarScore));
          } else if (lumbarScore === 3) {
            score -= 1;
            factors.push(M.lumbarDiscomfort(lumbarScore));
          } else {
            factors.push(M.lumbarHealthy(lumbarScore));
          }
          if (lastLumbar?.slept_well === false) {
            score -= 1;
            factors.push(M.poorSleep);
          }
        } else {
          factors.push(M.noLumbarCheck);
        }

        // Days since last workout (0-2 deduction for overtraining, 0-1 bonus for rest)
        let daysSinceLastWorkout = 999;
        if (lastSession?.completed_at) {
          const lastDate = new Date(toDateStr(lastSession.completed_at as string, tz));
          daysSinceLastWorkout = Math.floor(
            (new Date(todayStr).getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
          );
        }

        if (daysSinceLastWorkout === 0) {
          score -= 1;
          factors.push(M.trainedToday);
        } else if (daysSinceLastWorkout === 1) {
          factors.push(M.oneDayRest);
        } else if (daysSinceLastWorkout >= 4) {
          factors.push(M.wellRested);
        }

        // Weekly goal progress (motivation factor)
        const weeklyGoal = (settings?.weekly_goal as number) ?? 0;
        const sessionsThisWeek = weekSessions.length;

        if (weeklyGoal > 0) {
          const remaining = weeklyGoal - sessionsThisWeek;
          if (remaining <= 0) {
            factors.push(M.goalMet(sessionsThisWeek, weeklyGoal));
          } else {
            // Calculate days left in week
            const dayOfWeek = new Date().getDay();
            const daysLeft = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
            if (remaining > daysLeft) {
              score -= 1;
              factors.push(M.goalAtRisk(remaining, daysLeft));
            } else {
              factors.push(M.goalOnTrack(sessionsThisWeek, weeklyGoal, remaining));
            }
          }
        }

        // Clamp score
        score = Math.max(1, Math.min(10, score));

        // Today's scheduled workout
        let scheduledWorkout = null;
        const dayIds: Record<number, string> = {
          1: "lun",
          2: "mar",
          3: "mie",
          4: "jue",
          5: "vie",
          6: "sab",
          0: "dom",
        };
        const todayDayId = dayIds[new Date().getDay()];

        if (current) {
          const programId = current.program.id as string;
          // La fase del programa, no `settings.phase` (#663): ese entero es
          // global del usuario y no se resetea al cambiar de programa, así que
          // con él este bloque proponía los ejercicios de OTRA fase.
          const active = await resolveActiveProgramProgress(pb, userId, tz, todayStr, { current });
          const currentPhase = active?.progress.currentPhase ?? 1;

          const [exercises, overrideRows] = await Promise.all([
            listProgramExercises(pb, programId, {
              phase: currentPhase,
              dayId: todayDayId,
              sort: "priority",
            }),
            listProgramOverrides(pb, userId, programId),
          ]);

          if (exercises.length > 0) {
            // Con la dosis que el usuario ya aceptó (#617): en un programa
            // ajeno vive solo en `user_program_overrides`.
            const resolved = resolveProgramExercises(exercises, toProgramOverrides(overrideRows));
            scheduledWorkout = {
              workout_key: `p${currentPhase}_${todayDayId}`,
              day_name: localize(exercises[0].day_name),
              day_focus: localize(exercises[0].day_focus),
              workout_title: localize(exercises[0].workout_title),
              exercise_count: resolved.length,
              exercises: resolved.slice(0, 5).map((e) => ({
                name: e.name,
                sets: e.sets,
                reps: e.reps,
              })),
            };
          }
        }

        // Already done today's workout?
        const alreadyDoneToday = weekSessions.some(
          (s) => toDateStr(s.completed_at as string, tz) === todayStr
        );

        // Recommendation
        let recommendation: string;
        if (score >= 8) {
          recommendation = M.recFull;
        } else if (score >= 6) {
          recommendation = M.recModerate;
        } else if (score >= 4) {
          recommendation = M.recLight;
        } else {
          recommendation = M.recRest;
        }

        const scoreBar = "🟩".repeat(score) + "⬜".repeat(10 - score);

        let summaryText = [
          `# ${M.hReadiness}: ${score}/10`,
          scoreBar,
          `*${recommendation}*\n`,
          `## ${M.hFactors}`,
          ...factors.map((f) => `- ${f}`),
          ``,
          `## ${M.hTodayStats}`,
          M.statLine(todayDayId, sessionsThisWeek, weeklyGoal ? String(weeklyGoal) : "?"),
          M.daysSinceLine(daysSinceLastWorkout === 999 ? M.never : String(daysSinceLastWorkout)),
          alreadyDoneToday ? M.alreadyTrained : "",
        ]
          .filter(Boolean)
          .join("\n");

        if (scheduledWorkout && !alreadyDoneToday) {
          summaryText += [
            `\n## ${M.hScheduled(scheduledWorkout.workout_title)}`,
            M.scheduledFocus(scheduledWorkout.day_focus, scheduledWorkout.exercise_count),
            ...scheduledWorkout.exercises.map((e) => `- ${e.name}: ${e.sets} × ${e.reps}`),
            scheduledWorkout.exercise_count > 5 ? M.andMore(scheduledWorkout.exercise_count - 5) : "",
          ]
            .filter(Boolean)
            .join("\n");
        }

        const scoreLabel = score >= 8 ? "Listo" : score >= 5 ? "Con cuidado" : "Descansa";

        return viewResult(
          {
            score,
            label: scoreLabel,
            factors,
            recommendations: [recommendation],
            sessions_this_week: sessionsThisWeek,
            weekly_goal: weeklyGoal,
            already_trained_today: alreadyDoneToday,
            days_since_last_workout: daysSinceLastWorkout === 999 ? null : daysSinceLastWorkout,
          },
          summaryText
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // PROGRESSION READINESS — Am I ready to advance?
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_check_progression_readiness",
      title: "Check Exercise Progression Readiness",
      description:
        "Evaluates whether you're ready to advance to the next exercise variation based on the progression algorithm. " +
        "Compares your recent performance against the required reps × sessions thresholds defined in exercise_progressions.",
      schema: z
        .object({
          exercise_id: z.string().describe("Exercise to check (e.g. 'push-up', 'pull-up')"),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ exercise_id }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();
        const tz = auth.getTimezone();
        // Get progression chain for this exercise
        const progression = await pb
          .collection("exercise_progressions")
          .getFirstListItem(pb.filter('exercise_id = {:exerciseId}', { exerciseId: exercise_id }))
          .catch(() => null);

        if (!progression) {
          return {
            content: [
              {
                type: "text",
                text: `No progression data found for '${exercise_id}'. Use \`cal_list_exercise_progressions\` to see available exercises.`,
              },
            ],
          };
        }

        const targetReps = progression.target_reps_to_advance as number;
        const sessionsRequired = progression.sessions_at_target as number;
        const nextExerciseId = progression.next_exercise_id as string | null;

        // Get recent sets for this exercise (last 90 days), under every id
        // that is the same exercise: retired aliases and the active program's
        // slot keys count towards the progression too (#702).
        const ninetyDaysAgo = daysAgo(90, tz);
        const resolver = await loadUserExerciseResolver(pb, userId);
        const sets = await listExerciseSets(pb, userId, resolver.aliasesOf(exercise_id).ids, { from: ninetyDaysAgo, fields: SET_FIELDS });

        if (sets.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No logged sets for '${exercise_id}' in the last 90 days. Start logging your sets to track progression!`,
              },
            ],
          };
        }

        // Group by session date, take max reps per session
        const bySession = new Map<string, number>();
        for (const s of sets) {
          const date = toDateStr(s.logged_at as string, tz);
          const reps = parseInt(s.reps as string, 10);
          if (!isNaN(reps)) {
            bySession.set(date, Math.max(bySession.get(date) ?? 0, reps));
          }
        }

        // Count sessions where target reps were hit
        const sessionsAtTarget = [...bySession.values()].filter((maxReps) => maxReps >= targetReps).length;
        const isReady = sessionsAtTarget >= sessionsRequired;
        const progressPct = Math.min(Math.round((sessionsAtTarget / sessionsRequired) * 100), 100);

        // Get best and recent reps
        const allMaxReps = [...bySession.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        const bestReps = Math.max(...bySession.values());
        const recentSessions = allMaxReps.slice(-5);

        // Next exercise info
        let nextExercise = null;
        if (nextExerciseId) {
          nextExercise = await pb
            .collection("exercise_progressions")
            .getFirstListItem(pb.filter('exercise_id = {:exerciseId}', { exerciseId: nextExerciseId }))
            .catch(() => null);
        }

        const output = {
          exercise_id,
          exercise_name: progression.exercise_name,
          category: progression.category,
          difficulty_order: progression.difficulty_order,
          target_reps: targetReps,
          sessions_required: sessionsRequired,
          sessions_at_target: sessionsAtTarget,
          progress_pct: progressPct,
          is_ready: isReady,
          best_reps: bestReps,
          recent_sessions: recentSessions.map(([date, reps]) => ({ date, max_reps: reps })),
          next_exercise: nextExercise
            ? { id: nextExerciseId, name: nextExercise.exercise_name }
            : null,
        };

        const statusEmoji = isReady ? "✅" : "🔄";
        const nextText = nextExercise
          ? `**Next**: ${nextExercise.exercise_name}`
          : "This is the final progression!";

        const text = [
          `# ${statusEmoji} ${progression.exercise_name} — Progression Check`,
          ``,
          `**Target**: ${targetReps} reps for ${sessionsRequired} sessions`,
          `**Progress**: ${sessionsAtTarget}/${sessionsRequired} qualifying sessions (${progressPct}%)`,
          `**Best**: ${bestReps} reps | ${nextText}`,
          ``,
          `## Recent Sessions`,
          ...recentSessions.map(
            ([date, reps]) =>
              `- ${date}: ${reps} reps ${reps >= targetReps ? "✅" : `(need ${targetReps - reps} more)`}`
          ),
          ``,
          isReady
            ? `🎉 **You're ready to advance!** Start incorporating ${nextExercise?.exercise_name ?? "the next variation"} into your workouts.`
            : `Keep going! ${sessionsRequired - sessionsAtTarget} more session(s) at ${targetReps}+ reps needed.`,
        ].join("\n");

        return { content: [{ type: "text", text }], structuredContent: output };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // GAP ANALYSIS — What am I neglecting?
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_gap_analysis",
      title: "Training Gap Analysis",
      description:
        "Compares your actual sessions against your program schedule over the last N weeks. " +
        "Identifies which workout days you skip most, muscle group imbalances, and exercises you're neglecting.",
      view: { name: "gap-analysis" },
      outputSchema: gapAnalysisPropsSchema,
      schema: z
        .object({
          weeks: z
            .number()
            .int()
            .min(1)
            .max(52)
            .default(4)
            .describe("Number of weeks to analyze (default 4)"),
          response_format: z
            .nativeEnum(ResponseFormat)
            .default(ResponseFormat.MARKDOWN)
            .describe("Output format"),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ weeks, response_format }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();
        const tz = auth.getTimezone();
        const from = daysAgo(weeks * 7, tz);

        // Get current program schedule
        const current = await getCurrentProgram(pb, userId);

        if (!current) {
          return {
            content: [{ type: "text", text: "No active program. Set one with `cal_set_current_program` first." }],
            isError: true as const,
          };
        }

        const programId = current.program.id as string;
        // Misma corrección que en el briefing (#663): analizar la adherencia
        // contra los ejercicios de una fase equivocada daba un informe que no
        // se parecía a lo que el usuario tenía delante.
        const active = await resolveActiveProgramProgress(pb, userId, tz, today(tz), { current });
        const currentPhase = active?.progress.currentPhase ?? 1;

        const [programExercises, sessions, setsLog] = await Promise.all([
          listProgramExercises(pb, programId, { phase: currentPhase, sort: "day_id,priority" }),
          listSessions(pb, userId, { from }),
          listSets(pb, userId, { from }),
        ]);

        // Expected workouts per day
        const scheduledDays = new Map<string, { day_name: string; day_focus: string; exercises: string[] }>();
        for (const ex of programExercises) {
          const dayId = ex.day_id as string;
          if (!scheduledDays.has(dayId)) {
            scheduledDays.set(dayId, {
              day_name: localize(ex.day_name),
              day_focus: localize(ex.day_focus),
              exercises: [],
            });
          }
          scheduledDays.get(dayId)!.exercises.push(ex.exercise_id as string);
        }

        // Actual sessions per day_id
        const actualByDay = new Map<string, number>();
        for (const s of sessions) {
          const dayId = s.day as string;
          actualByDay.set(dayId, (actualByDay.get(dayId) ?? 0) + 1);
        }

        // Exercise volume analysis
        const exerciseVolume = new Map<string, number>();
        for (const s of setsLog) {
          const exId = s.exercise_id as string;
          exerciseVolume.set(exId, (exerciseVolume.get(exId) ?? 0) + 1);
        }

        // Muscle group volume from program exercises
        const muscleVolume = new Map<string, number>();
        for (const ex of programExercises) {
          const muscles = localize(ex.muscles)?.split(",").map((m: string) => m.trim()) ?? [];
          const exId = ex.exercise_id as string;
          const volume = exerciseVolume.get(exId) ?? 0;
          for (const muscle of muscles) {
            if (muscle) muscleVolume.set(muscle, (muscleVolume.get(muscle) ?? 0) + volume);
          }
        }

        // Build gap report
        const dayGaps = [...scheduledDays.entries()].map(([dayId, info]) => {
          const actual = actualByDay.get(dayId) ?? 0;
          const expected = weeks; // should be done once per week
          return {
            day_id: dayId,
            day_name: info.day_name,
            day_focus: info.day_focus,
            expected: expected,
            actual: actual,
            completion_pct: Math.round((actual / expected) * 100),
            missed: expected - actual,
          };
        });

        // Neglected exercises (in program but no sets logged)
        const allScheduledExercises = programExercises.map((e) => ({
          id: e.exercise_id as string,
          name: localize(e.exercise_name),
        }));
        const neglectedExercises = allScheduledExercises.filter(
          (e) => !exerciseVolume.has(e.id) || (exerciseVolume.get(e.id) ?? 0) === 0
        );

        const sortedMuscles = [...muscleVolume.entries()].sort((a, b) => b[1] - a[1]);

        const output = {
          period_weeks: weeks,
          day_completion: dayGaps,
          muscle_volume: sortedMuscles.map(([muscle, sets]) => ({ muscle, total_sets: sets })),
          neglected_exercises: neglectedExercises,
          total_scheduled_days: scheduledDays.size * weeks,
          total_actual_sessions: sessions.length,
        };

        let gapSummaryText: string;
        if (response_format === ResponseFormat.JSON) {
          gapSummaryText = JSON.stringify(output, null, 2);
        } else {
          const lines = [
            `# Training Gap Analysis (last ${weeks} weeks)`,
            `${sessions.length} sessions completed vs ~${scheduledDays.size * weeks} expected\n`,
            `## Day Completion`,
          ];

          const sorted = [...dayGaps].sort((a, b) => a.completion_pct - b.completion_pct);
          for (const d of sorted) {
            const bar =
              d.completion_pct >= 75 ? "🟢" : d.completion_pct >= 50 ? "🟡" : d.completion_pct > 0 ? "🟠" : "🔴";
            lines.push(
              `${bar} **${d.day_name}** (${d.day_focus}): ${d.actual}/${d.expected} weeks (${d.completion_pct}%)`
            );
          }

          if (neglectedExercises.length > 0) {
            lines.push(`\n## Neglected Exercises (0 sets logged)`);
            for (const e of neglectedExercises) {
              lines.push(`- ⚠️ ${e.name} (\`${e.id}\`)`);
            }
          }

          if (sortedMuscles.length > 0) {
            lines.push(`\n## Volume by Muscle Group`);
            const maxVol = sortedMuscles[0][1];
            for (const [muscle, sets] of sortedMuscles) {
              const barLen = Math.max(1, Math.round((sets / maxVol) * 15));
              lines.push(`- ${muscle}: ${"█".repeat(barLen)} ${sets} sets`);
            }
          }

          gapSummaryText = lines.join("\n");
        }

        const totalScheduled = scheduledDays.size * weeks;
        const totalCompleted = sessions.length;
        const completionPct = totalScheduled > 0 ? Math.round((totalCompleted / totalScheduled) * 100) : 0;

        return viewResult(
          {
            weeks,
            scheduled: totalScheduled,
            completed: totalCompleted,
            completion_pct: completionPct,
            day_completion: dayGaps,
            neglected_exercises: neglectedExercises,
            muscle_volume: sortedMuscles.map(([muscle, sets]) => ({ muscle, total_sets: sets })),
            // scheduledDays is empty when the phase-filtered program_exercises
            // query returns 0 rows (e.g. phase/program mismatch) — completion_pct
            // would otherwise show a misleading "0% · bajando" against 0 expected.
            no_schedule: scheduledDays.size === 0,
          },
          gapSummaryText
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // COMPARE PERIODS — Am I getting better?
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_compare_periods",
      title: "Compare Training Periods",
      description:
        "Compares two time periods side by side: sessions, volume, weight trend, and nutrition averages. " +
        "Great for monthly reviews to see if you're actually progressing.",
      schema: z
        .object({
          period_days: z
            .number()
            .int()
            .min(7)
            .max(180)
            .default(28)
            .describe("Length of each period in days (default 28 = 4 weeks). Compares 'current period' vs 'previous period'."),
          response_format: z
            .nativeEnum(ResponseFormat)
            .default(ResponseFormat.MARKDOWN)
            .describe("Output format"),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ period_days, response_format }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();
        const tz = auth.getTimezone();
        const currentFrom = daysAgo(period_days, tz);
        const previousFrom = daysAgo(period_days * 2, tz);
        const previousTo = daysAgo(period_days + 1, tz);
        const todayStr = today(tz);

        // Fetch data for both periods in parallel
        const todayEnd = `${todayStr} 23:59:59`;
        const previousEnd = `${previousTo} 23:59:59`;

        const [
          currentSessions,
          previousSessions,
          currentSets,
          previousSets,
          currentWeight,
          previousWeight,
          currentNutrition,
          previousNutrition,
        ] = await Promise.all([
          listSessions(pb, userId, { from: currentFrom, to: todayEnd }),
          listSessions(pb, userId, { from: previousFrom, to: previousEnd }),
          listSets(pb, userId, { from: currentFrom, to: todayEnd }),
          listSets(pb, userId, { from: previousFrom, to: previousEnd }),
          listWeightEntries(pb, userId, { from: currentFrom, to: todayStr }),
          listWeightEntries(pb, userId, { from: previousFrom, to: previousTo }),
          listNutritionEntries(pb, userId, { from: currentFrom, to: todayEnd, fields: NUTRITION_TOTALS_FIELDS }),
          listNutritionEntries(pb, userId, { from: previousFrom, to: previousEnd, fields: NUTRITION_TOTALS_FIELDS }),
        ]);

        const delta = (curr: number, prev: number) => ({
          current: curr,
          previous: prev,
          change: curr - prev,
          change_pct: prev > 0 ? Math.round(((curr - prev) / prev) * 100) : curr > 0 ? 100 : 0,
        });

        const avgWeight = (entries: typeof currentWeight) => {
          if (entries.length === 0) return null;
          return Math.round((entries.reduce((a, e) => a + (e.weight_kg as number), 0) / entries.length) * 10) / 10;
        };

        const avgCalories = (entries: typeof currentNutrition) => {
          if (entries.length === 0) return null;
          const days = new Set(entries.map((e) => toDateStr(e.logged_at as string, tz))).size;
          return Math.round(entries.reduce((a, e) => a + (e.total_calories as number), 0) / days);
        };

        const output = {
          period_days,
          current_period: { from: currentFrom, to: todayStr },
          previous_period: { from: previousFrom, to: previousTo },
          sessions: delta(currentSessions.length, previousSessions.length),
          total_sets: delta(currentSets.length, previousSets.length),
          avg_weight_kg: { current: avgWeight(currentWeight), previous: avgWeight(previousWeight) },
          avg_daily_calories: { current: avgCalories(currentNutrition), previous: avgCalories(previousNutrition) },
        };

        let text: string;
        if (response_format === ResponseFormat.JSON) {
          text = JSON.stringify(output, null, 2);
        } else {
          const arrow = (n: number) => (n > 0 ? `↑ +${n}` : n < 0 ? `↓ ${n}` : "→ 0");
          const s = output.sessions;
          const v = output.total_sets;

          text = [
            `# Period Comparison (${period_days}-day periods)`,
            `Current: ${currentFrom} → ${todayStr} | Previous: ${previousFrom} → ${previousTo}\n`,
            `| Metric | Previous | Current | Change |`,
            `|--------|----------|---------|--------|`,
            `| Sessions | ${s.previous} | ${s.current} | ${arrow(s.change)} (${s.change_pct}%) |`,
            `| Total Sets | ${v.previous} | ${v.current} | ${arrow(v.change)} (${v.change_pct}%) |`,
            `| Avg Weight | ${output.avg_weight_kg.previous ?? "N/A"} kg | ${output.avg_weight_kg.current ?? "N/A"} kg | ${output.avg_weight_kg.current && output.avg_weight_kg.previous ? arrow(Math.round((output.avg_weight_kg.current - output.avg_weight_kg.previous) * 10) / 10) + " kg" : "—"} |`,
            `| Avg Calories | ${output.avg_daily_calories.previous ?? "N/A"} | ${output.avg_daily_calories.current ?? "N/A"} | ${output.avg_daily_calories.current && output.avg_daily_calories.previous ? arrow(output.avg_daily_calories.current - output.avg_daily_calories.previous) + " kcal" : "—"} |`,
          ].join("\n");
        }

        return { content: [{ type: "text", text }], structuredContent: output };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // GET TRENDS — time-series charts: weight line + weekly volume bars
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_get_trends",
      title: "Training Trends Chart",
      description:
        "Visual time-series of body weight, training volume (sets), and sessions over time. " +
        "Returns an interactive chart widget. Use this when the user asks 'show my progress', 'how's my weight trending', " +
        "'am I training more?', or wants to see graphs of their data.",
      view: { name: "trends-chart" },
      outputSchema: trendsChartPropsSchema,
      schema: z
        .object({
          period_days: z
            .number()
            .int()
            .min(14)
            .max(365)
            .default(90)
            .describe("How many days back to chart (default 90). Weight shows daily points; volume/sessions bucket by week."),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ period_days }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();
        const tz = auth.getTimezone();
        const fromStr = daysAgo(period_days, tz);
        const todayStr = today(tz);
        const todayEnd = `${todayStr} 23:59:59`;

        const [weightEntries, sets, sessions] = await Promise.all([
          listWeightEntries(pb, userId, { from: fromStr, to: todayStr }),
          listSets(pb, userId, { from: fromStr, to: todayEnd, fields: "id,logged_at" }),
          listSessions(pb, userId, { from: fromStr, to: todayEnd, fields: "id,completed_at" }),
        ]);

        // Weight points (one per logged date, in kg)
        const weightPoints = weightEntries.map((e) => ({ date: toDateStr(e.date as string, tz), kg: e.weight_kg as number }));
        const kgs = weightPoints.map((p) => p.kg);
        const firstKg = kgs.length ? kgs[0] : null;
        const lastKg = kgs.length ? kgs[kgs.length - 1] : null;
        const r1 = (n: number) => Math.round(n * 10) / 10;

        // Weekly buckets for volume + sessions
        const weeks = Math.ceil(period_days / 7);
        const startMs = new Date(`${fromStr}T00:00:00`).getTime();
        const bucketOf = (dateStr: string) => {
          const ms = new Date(`${toDateStr(dateStr, tz)}T00:00:00`).getTime();
          const b = Math.floor((ms - startMs) / (7 * 86400000));
          return Math.min(Math.max(b, 0), weeks - 1);
        };
        const weekly = Array.from({ length: weeks }, (_, i) => {
          const startDay = new Date(startMs + i * 7 * 86400000);
          const label = `${String(startDay.getDate()).padStart(2, "0")}/${String(startDay.getMonth() + 1).padStart(2, "0")}`;
          return { label, sets: 0, sessions: 0 };
        });
        for (const s of sets) weekly[bucketOf(s.logged_at as string)].sets += 1;
        for (const s of sessions) weekly[bucketOf(s.completed_at as string)].sessions += 1;

        const props = {
          period_days,
          weight: {
            points: weightPoints,
            first: firstKg !== null ? r1(firstKg) : null,
            last: lastKg !== null ? r1(lastKg) : null,
            delta: firstKg !== null && lastKg !== null ? r1(lastKg - firstKg) : null,
            min: kgs.length ? r1(Math.min(...kgs)) : 0,
            max: kgs.length ? r1(Math.max(...kgs)) : 0,
          },
          weekly,
          totals: { sets: sets.length, sessions: sessions.length },
        };

        const weightLine = props.weight.delta !== null
          ? `Peso: ${props.weight.first} → ${props.weight.last} kg (${props.weight.delta >= 0 ? "+" : ""}${props.weight.delta} kg en ${period_days} días)`
          : "Peso: sin registros en el periodo";

        return viewResult(
          props,
          [
            `# Tendencias — últimos ${period_days} días`,
            weightLine,
            `Volumen total: ${props.totals.sets} series en ${props.totals.sessions} sesiones`,
          ].join("\n")
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // CALCULATE MACROS — TDEE-based, not just storage
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_calculate_macros",
      title: "Calculate Macros (TDEE-based)",
      description:
        "Calculates daily calorie and macro targets using the Mifflin-St Jeor equation based on your body stats, activity level, and goal. " +
        "Automatically saves the calculated values to your nutrition goals.",
      schema: z
        .object({
          weight_kg: z.number().min(30).max(300).describe("Current body weight in kg"),
          height_cm: z.number().min(100).max(250).describe("Height in cm"),
          age: z.number().int().min(10).max(100).describe("Age in years"),
          sex: z.enum(["male", "female"]).describe("Biological sex"),
          activity_level: z
            .enum(["sedentary", "light", "moderate", "active", "very_active"])
            .describe(
              "sedentary=desk job, light=1-3 days/week, moderate=3-5 days, active=6-7 days, very_active=2x/day or physical job"
            ),
          goal: z
            .enum(["muscle_gain", "fat_loss", "recomp", "maintain"])
            .describe("Body composition goal"),
          pace: z
            .enum(["gradual", "balanced", "aggressive"])
            .optional()
            .describe("Rate for calorie adjustments. Defaults to balanced."),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ weight_kg, height_cm, age, sex, activity_level, goal, pace }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();
        const calculatedGoal = calculateMacros(
          weight_kg,
          height_cm,
          age,
          sex,
          activity_level,
          goal,
          pace,
        );
        // Keep the established response metadata without recreating its formula here.
        const calculation = calculateMacroDetails(
          weight_kg,
          height_cm,
          age,
          sex,
          activity_level,
          goal,
          pace,
        );

        // Save the same canonical values used by web and mobile.
        const goalData = {
          goal,
          daily_calories: calculatedGoal.dailyCalories,
          daily_protein: calculatedGoal.dailyProtein,
          daily_carbs: calculatedGoal.dailyCarbs,
          daily_fat: calculatedGoal.dailyFat,
          weight: weight_kg,
          height: height_cm,
          age,
          sex,
          activity_level,
        };

        await upsertNutritionGoals(pb, userId, goalData);

        const goalLabels: Record<string, string> = {
          muscle_gain: "Muscle Gain",
          fat_loss: "Fat Loss",
          recomp: "Recomposition",
          maintain: "Maintenance",
        };

        const proteinCals = calculatedGoal.dailyProtein * 4;
        const fatCals = calculatedGoal.dailyFat * 9;
        const carbCals = calculatedGoal.dailyCarbs * 4;
        const text = [
          `# Calculated Macros`,
          ``,
          `## Your Profile`,
          `- ${sex}, ${age}y, ${height_cm}cm, ${weight_kg}kg`,
          `- Activity: ${activity_level} | Goal: ${goalLabels[goal]}`,
          ...(pace ? [`- Pace: ${pace}`] : []),
          ``,
          `## Daily Macro Targets (saved)`,
          `- **Target**: ${calculatedGoal.dailyCalories} kcal/day`,
          `| Macro | Grams | Calories | % of total |`,
          `|-------|-------|----------|------------|`,
          `| Protein | **${calculatedGoal.dailyProtein}g** | ${proteinCals} | ${Math.round((proteinCals / calculatedGoal.dailyCalories) * 100)}% |`,
          `| Carbs | **${calculatedGoal.dailyCarbs}g** | ${carbCals} | ${Math.round((carbCals / calculatedGoal.dailyCalories) * 100)}% |`,
          `| Fat | **${calculatedGoal.dailyFat}g** | ${fatCals} | ${Math.round((fatCals / calculatedGoal.dailyCalories) * 100)}% |`,
          `| **Total** | — | **${calculatedGoal.dailyCalories}** | 100% |`,
        ].join("\n");

        return {
          content: [{ type: "text", text }],
          structuredContent: {
            bmr: calculation.bmr,
            tdee: calculation.tdee,
            target_calories: calculatedGoal.dailyCalories,
            protein_g: calculatedGoal.dailyProtein,
            carbs_g: calculatedGoal.dailyCarbs,
            fat_g: calculatedGoal.dailyFat,
            protein_per_kg: calculation.proteinPerKg,
            goal,
            saved: true,
          },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // TODAY'S WORKOUT — What should I do today?
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_todays_workout",
      title: "Get Today's Workout",
      description:
        "Shows what workout you should do today based on your current program and what you've done this week. " +
        "Identifies the next unfinished workout day in the schedule. Returns an interactive session tracker widget.",
      view: { name: "session-tracker" },
      outputSchema: sessionTrackerPropsSchema,
      schema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async (_input, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();
        const tz = auth.getTimezone();
        // Get current program
        const current = await getCurrentProgram(pb, userId);

        if (!current) {
          return { content: [{ type: "text", text: "No active program. Use `cal_set_current_program` to select one." }], isError: true };
        }

        const program = current.program;
        const programId = program.id as string;
        const programName = localize(program.name as string);

        const settings = await getSettings(pb, userId);
        const currentPhase = (settings?.phase as number) ?? 1;

        // Get this week's sessions and program exercises
        const weekStart = startOfWeek(tz);
        const [thisWeekSessions, programExercises] = await Promise.all([
          listSessions(pb, userId, { from: weekStart }),
          listProgramExercises(pb, programId, { phase: currentPhase, sort: "day_id,sort_order" }),
        ]);

        // Group exercises by day
        const dayMap = new Map<string, { name: string; focus: string; title: string; exercises: Array<{ exercise_id?: string; name: string; sets: number; reps: string; rest: number; muscles: string }> }>();
        for (const ex of programExercises) {
          const dayId = ex.day_id as string;
          if (!dayMap.has(dayId)) {
            dayMap.set(dayId, {
              name: localize(ex.day_name),
              focus: localize(ex.day_focus),
              title: localize(ex.workout_title),
              exercises: [],
            });
          }
          dayMap.get(dayId)!.exercises.push({
            exercise_id: (ex.exercise_id as string | undefined) || undefined,
            name: localize(ex.exercise_name),
            sets: ex.sets as number,
            reps: ex.reps as string,
            rest: ex.rest_seconds as number,
            muscles: localize(ex.muscles),
          });
        }

        // Find which days were completed this week
        const completedDays = new Set(thisWeekSessions.map((s) => s.day as string));

        // Find next unfinished day
        const allDays = [...dayMap.entries()];
        const nextDay = allDays.find(([dayId]) => !completedDays.has(dayId));

        if (!nextDay) {
          return viewResult(
            {
              all_complete: true,
              week_progress: { completed: completedDays.size, total: allDays.length },
            },
            `All ${allDays.length} workout days completed this week! Rest or do active recovery.`
          );
        }

        const [dayId, day] = nextDay;
        const lines = [
          `# Today's Workout`,
          `**${programName}** — Phase ${currentPhase}\n`,
          `## ${day.name}: ${day.focus}`,
          day.title ? `*${day.title}*\n` : "",
          `Week progress: ${completedDays.size}/${allDays.length} days done\n`,
        ];

        for (const ex of day.exercises) {
          lines.push(`- **${ex.name}**: ${ex.sets} × ${ex.reps} | Rest: ${ex.rest}s`);
          if (ex.muscles) lines.push(`  _${ex.muscles}_`);
        }

        lines.push(`\nTo log this workout use \`cal_log_full_workout\` with workout_key \`p${currentPhase}_${dayId}\``);

        return viewResult(
          {
            day_id: dayId,
            day_name: day.name,
            day_focus: day.focus,
            phase: currentPhase,
            program_name: programName,
            workout_key: `p${currentPhase}_${dayId}`,
            exercises: day.exercises,
            week_progress: { completed: completedDays.size, total: allDays.length },
          },
          lines.join("\n")
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // TODAY DASHBOARD — single-call snapshot for chat apps
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_get_today_dashboard",
      title: "Today's Dashboard",
      description:
        "One-call snapshot of today: nutrition progress vs goals, today's workout from active program, readiness score, and training streak. " +
        "Returns a visual dashboard widget. Use this when the user asks 'how's my day?', 'what should I do today?', or opens the chat without a specific request.",
      view: { name: "today-dashboard" },
      outputSchema: todayDashboardPropsSchema,
      schema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (_input, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();
        const tz = auth.getTimezone();
        const todayStr = today(tz);
        const weekStart = startOfWeek(tz);

        // Parallel: nutrition + sessions + lumbar + settings + active program
        const [nutritionEntries, nutritionGoals, weekSessions, lastLumbar, settings, current] = await Promise.all([
          listTodayNutritionEntries(pb, userId, todayStr),
          getNutritionGoals(pb, userId),
          listSessions(pb, userId, { from: weekStart }),
          getLatestLumbarCheck(pb, userId),
          getSettings(pb, userId),
          getCurrentProgram(pb, userId),
        ]);

        // Nutrition totals
        const nutrition = nutritionEntries.reduce(
          (acc, e) => ({
            calories: acc.calories + (e.total_calories as number),
            protein: acc.protein + (e.total_protein as number),
            carbs: acc.carbs + (e.total_carbs as number),
            fat: acc.fat + (e.total_fat as number),
          }),
          { calories: 0, protein: 0, carbs: 0, fat: 0 }
        );
        const goals = nutritionGoals
          ? { calories: nutritionGoals.daily_calories as number, protein: nutritionGoals.daily_protein as number, carbs: nutritionGoals.daily_carbs as number, fat: nutritionGoals.daily_fat as number }
          : null;

        // Readiness score
        let readinessScore = 10;
        const readinessFactors: string[] = [];
        const lumbarScore = lastLumbar?.lumbar_score as number | undefined;
        const lumbarDate = lastLumbar?.date as string | undefined;
        const lumbarRecent = lumbarDate === todayStr || lumbarDate === daysAgo(1, tz);
        if (lumbarScore !== undefined && lumbarRecent) {
          if (lumbarScore <= 2) { readinessScore -= 3; readinessFactors.push("🔴 Lumbar bajo"); }
          else if (lumbarScore === 3) { readinessScore -= 1; readinessFactors.push("🟡 Lumbar medio"); }
          else { readinessFactors.push("🟢 Lumbar OK"); }
        }
        const weeklyGoal = (settings?.weekly_sessions_goal as number) ?? 4;
        const sessionsDone = weekSessions.length;
        if (sessionsDone >= weeklyGoal) { readinessFactors.push("✅ Meta semanal cumplida"); }
        else { readinessFactors.push(`📅 ${sessionsDone}/${weeklyGoal} sesiones esta semana`); }
        const readinessLabel = readinessScore >= 8 ? "Listo para entrenar" : readinessScore >= 5 ? "Entrena con cuidado" : "Considera descansar";

        // Today's workout
        let workoutData: {
          has_workout: boolean; day_name: string; day_focus: string; program_name: string;
          exercises: Array<{ name: string; sets: number; reps: string; rest: number }>;
          week_progress: { completed: number; total: number }; workout_key: string;
        } | null = null;

        if (current) {
          const program = current.program;
          const programId = program.id as string;
          const programName = localize(program.name as string);
          const currentPhase = (settings?.phase as number) ?? 1;

          const programExercises = await listProgramExercises(pb, programId, { phase: currentPhase, sort: "day_id,sort_order" });

          const dayMap = new Map<string, { name: string; focus: string; exercises: Array<{ name: string; sets: number; reps: string; rest: number }> }>();
          for (const ex of programExercises) {
            const dayId = ex.day_id as string;
            if (!dayMap.has(dayId)) dayMap.set(dayId, { name: localize(ex.day_name), focus: localize(ex.day_focus), exercises: [] });
            dayMap.get(dayId)!.exercises.push({ name: localize(ex.exercise_name), sets: ex.sets as number, reps: ex.reps as string, rest: ex.rest_seconds as number });
          }

          const completedDays = new Set(weekSessions.map((s) => s.day as string));
          const allDays = [...dayMap.entries()];
          const nextDay = allDays.find(([dayId]) => !completedDays.has(dayId));

          if (nextDay) {
            const [dayId, day] = nextDay;
            workoutData = {
              has_workout: true,
              day_name: day.name,
              day_focus: day.focus,
              program_name: programName,
              exercises: day.exercises,
              week_progress: { completed: completedDays.size, total: allDays.length },
              workout_key: `p${currentPhase}_${dayId}`,
            };
          } else {
            workoutData = {
              has_workout: false,
              day_name: "Semana completa",
              day_focus: "Descanso activo",
              program_name: programName,
              exercises: [],
              week_progress: { completed: completedDays.size, total: allDays.length },
              workout_key: "",
            };
          }
        }

        const streak = (settings?.sessions_streak as number) ?? 0;

        return viewResult(
          {
            readiness: { score: readinessScore, label: readinessLabel, factors: readinessFactors },
            workout: workoutData,
            nutrition: {
              calories: { consumed: Math.round(nutrition.calories), goal: goals?.calories ?? 0 },
              protein: { consumed: Math.round(nutrition.protein * 10) / 10, goal: goals?.protein ?? 0 },
              carbs: { consumed: Math.round(nutrition.carbs * 10) / 10, goal: goals?.carbs ?? 0 },
              fat: { consumed: Math.round(nutrition.fat * 10) / 10, goal: goals?.fat ?? 0 },
              meals_logged: nutritionEntries.length,
            },
            streak,
          },
          [
            `# Tu día — ${todayStr}`,
            `Readiness: ${readinessScore}/10 — ${readinessLabel}`,
            goals ? `Calorías: ${Math.round(nutrition.calories)}/${goals.calories} kcal` : `Calorías hoy: ${Math.round(nutrition.calories)} kcal`,
            workoutData?.has_workout ? `Entrenamiento: ${workoutData.day_name} — ${workoutData.day_focus} (${workoutData.exercises.length} ejercicios)` : "Sin entrenamiento programado hoy",
            streak > 0 ? `Racha: ${streak} días 🔥` : "",
          ].filter(Boolean).join("\n")
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // Tool refs consumed by Views through useCallTool(); re-exported from server.ts
  // so mcp-use can register their input/output types (mcp-env.d.ts).
  return { logFullWorkout };
}
