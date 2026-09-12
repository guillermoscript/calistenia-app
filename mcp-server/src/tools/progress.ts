import type { AppServer } from "../mcpuse/auth-bridge.js";
import { z } from "zod";
import { getAuthManager } from "../mcpuse/auth-bridge.js";
import { errorResult, PaginationSchema, ResponseFormat, daysAgo, today } from "../utils.js";
import { getSettings, upsertSettings, listSessions, listWeightEntries } from "../api/repos/index.js";
import { resolveActiveProgramProgress } from "../api/program-progress-server.js";
import { resolvePersonalRecords, topRepRecords } from "../api/prs-server.js";

export function registerProgressTools(server: AppServer, pbUrl: string) {
  // ──────────────────────────────────────────────────────────────
  // GET SETTINGS
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_get_settings",
      title: "Get User Settings",
      description:
        "Get the user's training settings: start date, weekly workout goal, and personal records. "
        + "PRs are recomputed from the full `sets_log` history, so they cover EVERY exercise the user has logged, not just the five legacy fields. "
        + "Records for timer exercises (L-sit, plank, handstand) are in SECONDS, because timers store their seconds in `reps`. " +
        "NOTE: `phase` here is a legacy global counter, NOT the phase of the active program \u2014 read that from `cal_get_current_program` (`progress.current_phase`).",
      schema: z
        .object({
          response_format: z
            .nativeEnum(ResponseFormat)
            .default(ResponseFormat.MARKDOWN)
            .describe("Output format"),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ response_format }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();
        const settings = await getSettings(pb, userId);

        if (!settings) {
          return {
            content: [
              {
                type: "text",
                text: "No settings found. Use `cal_update_settings` to set your training phase, start date, and weekly goal.",
              },
            ],
          };
        }

        const prs = await resolvePersonalRecords(pb, userId, settings);

        const output = {
          phase: settings.phase,
          start_date: settings.start_date,
          weekly_goal: settings.weekly_goal,
          // Los cinco de siempre, para lo que ya dependía de ellos.
          personal_records: {
            pullups: prs.legacy.pullups || null,
            pushups: prs.legacy.pushups || null,
            l_sit: prs.legacy.l_sit || null,
            pistol_squat: prs.legacy.pistol_squat || null,
            handstand: prs.legacy.handstand || null,
          },
          // Y los de verdad: todos los ejercicios con serie registrada (#666).
          all_records: {
            tracked_exercises: prs.tracked_exercises,
            reps: prs.reps,
            weight: prs.weight,
            // Clave → nombre e ids crudos fusionados (#702).
            exercises: prs.exercises,
          },
        };

        let text: string;
        if (response_format === ResponseFormat.JSON) {
          text = JSON.stringify(output, null, 2);
        } else {
          const pr = output.personal_records;
          text = [
            `# Training Settings`,
            `- **Legacy global phase**: ${output.phase} _(not the active program's phase \u2014 see \`cal_get_current_program\`)_`,
            `- **Start Date**: ${output.start_date}`,
            `- **Weekly Goal**: ${output.weekly_goal} workouts/week`,
            `\n## Personal Records`,
            pr.pullups ? `- Pull-ups: **${pr.pullups}**` : `- Pull-ups: not set`,
            pr.pushups ? `- Push-ups: **${pr.pushups}**` : `- Push-ups: not set`,
            pr.l_sit ? `- L-Sit: **${pr.l_sit}**` : `- L-Sit: not set`,
            pr.pistol_squat ? `- Pistol Squat: **${pr.pistol_squat}**` : `- Pistol Squat: not set`,
            pr.handstand ? `- Handstand: **${pr.handstand}**` : `- Handstand: not set`,
            ...(prs.tracked_exercises > 0
              ? [
                  `\n## All-Time Records (${prs.tracked_exercises} exercises)`,
                  `_Best set per exercise, from the full \`sets_log\` history, merged across every id of the same exercise. Timer exercises are in seconds._`,
                  ...topRepRecords(prs).map(({ exercise_id, name, best, unit, merged_from }) => {
                    const w = prs.weight[exercise_id];
                    const label = name !== exercise_id ? `${name} (\`${exercise_id}\`)` : `\`${exercise_id}\``;
                    return `- ${label}: **${best}${unit === "s" ? " s" : ""}**`
                      + (w ? ` \u00b7 ${w.weight}kg \u00d7 ${w.reps} (e1RM ${w.e1rm}kg)` : "")
                      + (merged_from ? ` _(merged: ${merged_from.join(", ")})_` : "");
                  }),
                  ...(prs.tracked_exercises > 10
                    ? [`_\u2026 and ${prs.tracked_exercises - 10} more \u2014 read them all from \`all_records.reps\` in JSON format._`]
                    : []),
                ]
              : []),
          ].join("\n");
        }

        return { content: [{ type: "text", text }], structuredContent: output };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // UPDATE SETTINGS
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_update_settings",
      title: "Update Training Settings",
      description:
        "Update training settings: phase, start date, weekly goal, or personal records. Only provide fields you want to change. "
        + "PRs are numbers, and the app already derives them from logged sets \u2014 only write one to correct a record the user never logged as a set. "
        + "The L-sit and handstand records are SECONDS held, not reps.",
      schema: z
        .object({
          phase: z
            .number()
            .int()
            .min(1)
            .optional()
            .describe(
              "Legacy global phase counter. Since #616 the active program's phase lives in `user_programs.current_phase` and is derived from the start date \u2014 changing this does NOT change the program's phase.",
            ),
          start_date: z.string().optional().describe("Program start date (YYYY-MM-DD)"),
          weekly_goal: z.number().int().min(1).max(7).optional().describe("Target workouts per week (1-7)"),
          // Campos NUMÉRICOS en PocketBase (pb_migrations/1773246964_updated_settings.js).
          // Estaban declarados como texto con ejemplos tipo '10 strict', valores que
          // la colección no puede guardar y que rompían el ranking, que los ordena
          // como números (#666).
          pr_pullups: z.number().min(0).optional().describe("Pull-up personal record, in reps (e.g. 15)"),
          pr_pushups: z.number().min(0).optional().describe("Push-up personal record, in reps"),
          pr_lsit: z.number().min(0).optional().describe("L-Sit personal record, in SECONDS held (e.g. 30)"),
          pr_pistol: z.number().min(0).optional().describe("Pistol squat personal record, in reps"),
          pr_handstand: z.number().min(0).optional().describe("Handstand personal record, in SECONDS held"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ phase, start_date, weekly_goal, pr_pullups, pr_pushups, pr_lsit, pr_pistol, pr_handstand }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();
        const updates: Record<string, unknown> = {};
        if (phase !== undefined) updates.phase = phase;
        if (start_date !== undefined) updates.start_date = start_date;
        if (weekly_goal !== undefined) updates.weekly_goal = weekly_goal;
        if (pr_pullups !== undefined) updates.pr_pullups = pr_pullups;
        if (pr_pushups !== undefined) updates.pr_pushups = pr_pushups;
        if (pr_lsit !== undefined) updates.pr_lsit = pr_lsit;
        if (pr_pistol !== undefined) updates.pr_pistol = pr_pistol;
        if (pr_handstand !== undefined) updates.pr_handstand = pr_handstand;

        if (Object.keys(updates).length === 0) {
          return { content: [{ type: "text", text: "No fields to update. Provide at least one setting to change." }] };
        }

        const record = await upsertSettings(pb, userId, updates);

        const changed = Object.keys(updates).map((k) => `**${k}**: ${updates[k]}`).join(", ");
        return {
          content: [{ type: "text", text: `Settings updated: ${changed}` }],
          structuredContent: { id: record.id, updated: updates },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // WEIGHT TRACKING
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_list_weight_entries",
      title: "List Weight Entries",
      description:
        "List body weight measurements over time. Useful for tracking weight trends and correlating with training.",
      schema: z
        .object({
          ...PaginationSchema,
          from_date: z.string().optional().describe("Start date (YYYY-MM-DD). Defaults to 90 days ago."),
          to_date: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ limit, offset, from_date, to_date, response_format }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();
        const tz = auth.getTimezone();
        const from = from_date ?? daysAgo(90, tz);
        const to = to_date ?? today(tz);

        const result = await pb.collection("weight_entries").getList(offset / limit + 1, limit, {
          filter: pb.filter('user = {:userId} && date >= {:from} && date <= {:to}', { userId, from, to }),
          sort: "-date",
        });

        if (result.items.length === 0) {
          return { content: [{ type: "text", text: "No weight entries found for the given period." }] };
        }

        const entries = result.items.map((e) => ({
          id: e.id,
          date: e.date,
          weight_kg: e.weight_kg,
          note: e.note || null,
        }));

        const weights = entries.map((e) => e.weight_kg);
        const min = Math.min(...weights);
        const max = Math.max(...weights);
        const avg = weights.reduce((a, b) => a + b, 0) / weights.length;

        const output = {
          total: result.totalItems,
          count: entries.length,
          period: { from, to },
          stats: { min_kg: min, max_kg: max, avg_kg: Math.round(avg * 10) / 10 },
          entries,
        };

        let text: string;
        if (response_format === ResponseFormat.JSON) {
          text = JSON.stringify(output, null, 2);
        } else {
          const lines = [
            `# Weight Entries (${from} → ${to})`,
            `**${result.totalItems}** entries | Min: **${min}kg** | Max: **${max}kg** | Avg: **${avg.toFixed(1)}kg**\n`,
          ];
          for (const e of entries) {
            lines.push(`- **${e.date}**: ${e.weight_kg} kg${e.note ? ` — _${e.note}_` : ""}`);
          }
          text = lines.join("\n");
        }

        return { content: [{ type: "text", text }], structuredContent: output };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  server.tool(
    {
      name: "cal_add_weight_entry",
      title: "Add Weight Entry",
      description: "Record a body weight measurement.",
      schema: z
        .object({
          weight_kg: z.number().min(20).max(300).describe("Body weight in kilograms (e.g. 75.5)"),
          date: z.string().optional().describe("Date of measurement (YYYY-MM-DD). Defaults to today."),
          note: z.string().optional().describe("Optional note (e.g. 'morning, fasted')"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ weight_kg, date, note }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();
        const tz = auth.getTimezone();
        const record = await pb.collection("weight_entries").create({
          user: userId,
          weight_kg,
          date: date ?? today(tz),
          note: note ?? "",
        });

        return {
          content: [{ type: "text", text: `Weight logged: **${weight_kg} kg** on ${record.date}` }],
          structuredContent: { id: record.id, weight_kg, date: record.date },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  server.tool(
    {
      name: "cal_delete_weight_entry",
      title: "Delete Weight Entry",
      description: "Delete a weight measurement by its ID.",
      schema: z
        .object({ entry_id: z.string().describe("The weight entry record ID to delete") })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ entry_id }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();
        const record = await pb.collection("weight_entries").getOne(entry_id);
        if (record.user !== userId) {
          return errorResult("Access denied: this entry does not belong to you.");
        }
        await pb.collection("weight_entries").delete(entry_id);
        return { content: [{ type: "text", text: `Weight entry \`${entry_id}\` deleted.` }] };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // LUMBAR HEALTH
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_list_lumbar_checks",
      title: "List Lumbar Health Checks",
      description:
        "List lumbar health check-ins. Each entry records a daily score (1-5), sleep quality, and hours sitting. Useful for monitoring recovery and injury risk.",
      schema: z
        .object({
          ...PaginationSchema,
          from_date: z.string().optional().describe("Start date (YYYY-MM-DD). Defaults to 30 days ago."),
          to_date: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ limit, offset, from_date, to_date, response_format }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();
        const tz = auth.getTimezone();
        const from = from_date ?? daysAgo(30, tz);
        const to = to_date ?? today(tz);

        const result = await pb.collection("lumbar_checks").getList(offset / limit + 1, limit, {
          filter: pb.filter('user = {:userId} && date >= {:from} && date <= {:to}', { userId, from, to }),
          sort: "-date",
        });

        if (result.items.length === 0) {
          return { content: [{ type: "text", text: "No lumbar checks found for the given period." }] };
        }

        const checks = result.items.map((c) => ({
          id: c.id,
          date: c.date,
          lumbar_score: c.lumbar_score,
          slept_well: c.slept_well,
          sitting_hours: c.sitting_hours,
        }));

        const avgScore = checks.reduce((a, c) => a + c.lumbar_score, 0) / checks.length;

        const output = { total: result.totalItems, avg_score: Math.round(avgScore * 10) / 10, checks };

        let text: string;
        if (response_format === ResponseFormat.JSON) {
          text = JSON.stringify(output, null, 2);
        } else {
          const scoreEmoji = (s: number) => ["", "🔴", "🟠", "🟡", "🟢", "💚"][s] ?? "⚪";
          const lines = [
            `# Lumbar Health (${from} → ${to})`,
            `Avg score: **${avgScore.toFixed(1)}/5** over ${result.totalItems} check(s)\n`,
          ];
          for (const c of checks) {
            lines.push(
              `- **${c.date}**: ${scoreEmoji(c.lumbar_score)} ${c.lumbar_score}/5 | ` +
                `Slept: ${c.slept_well ? "✓" : "✗"} | Sitting: ${c.sitting_hours}h`
            );
          }
          text = lines.join("\n");
        }

        return { content: [{ type: "text", text }], structuredContent: output };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  server.tool(
    {
      name: "cal_add_lumbar_check",
      title: "Add Lumbar Health Check",
      description:
        "Record a lumbar health check-in. Score your lower back pain/comfort from 1 (severe pain) to 5 (no pain, full mobility).",
      schema: z
        .object({
          lumbar_score: z
            .number()
            .int()
            .min(1)
            .max(5)
            .describe("Lumbar comfort score: 1=severe pain, 2=moderate pain, 3=mild discomfort, 4=slight tightness, 5=no pain"),
          slept_well: z.boolean().describe("Did you sleep well last night?"),
          sitting_hours: z
            .number()
            .min(0)
            .max(24)
            .describe("Approximate hours spent sitting today"),
          date: z.string().optional().describe("Date (YYYY-MM-DD). Defaults to today."),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ lumbar_score, slept_well, sitting_hours, date }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();
        const tz = auth.getTimezone();
        const record = await pb.collection("lumbar_checks").create({
          user: userId,
          date: date ?? today(tz),
          lumbar_score,
          slept_well,
          sitting_hours,
          checked_at: new Date().toISOString(),
        });

        const advice =
          lumbar_score <= 2
            ? "\n\n⚠️ Low score detected. Consider rest or reduced intensity today."
            : lumbar_score >= 4
            ? "\n\n✅ Good score! You're good to train at full intensity."
            : "";

        return {
          content: [
            {
              type: "text",
              text: `Lumbar check logged: **${lumbar_score}/5** | Slept: ${slept_well ? "yes" : "no"} | Sitting: ${sitting_hours}h${advice}`,
            },
          ],
          structuredContent: { id: record.id, lumbar_score, slept_well, sitting_hours, date: record.date },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // PROGRESS SUMMARY
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_get_progress_summary",
      title: "Get Progress Summary",
      description:
        "Get an overall progress summary: recent workout sessions, weight trend, lumbar health average, and weekly workout consistency. Great for a quick status overview.",
      schema: z
        .object({
          days: z
            .number()
            .int()
            .min(7)
            .max(365)
            .default(30)
            .describe("Number of days to summarize (default 30)"),
          response_format: z
            .nativeEnum(ResponseFormat)
            .default(ResponseFormat.MARKDOWN)
            .describe("Output format"),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ days, response_format }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();
        const tz = auth.getTimezone();
        const from = daysAgo(days, tz);

        const [sessions, weightEntries, lumbarChecks, settings, active] = await Promise.all([
          listSessions(pb, userId, { from, sort: "completed_at", fields: "id,completed_at" }),
          listWeightEntries(pb, userId, { from, sort: "date" }),
          pb.collection("lumbar_checks").getFullList({
            filter: pb.filter('user = {:userId} && date >= {:from}', { userId, from }),
            requestKey: null,
          }),
          getSettings(pb, userId),
          resolveActiveProgramProgress(pb, userId, tz, today(tz)),
        ]);

        // Workout consistency (sessions per week)
        const weeksInPeriod = days / 7;
        const sessionsPerWeek = sessions.length / weeksInPeriod;

        // Weight trend
        let weightTrend = null;
        if (weightEntries.length >= 2) {
          const first = weightEntries[0].weight_kg as number;
          const last = weightEntries[weightEntries.length - 1].weight_kg as number;
          weightTrend = { start: first, end: last, change: Math.round((last - first) * 10) / 10 };
        }

        // Lumbar avg
        const lumbarAvg =
          lumbarChecks.length > 0
            ? Math.round((lumbarChecks.reduce((a, c) => a + (c.lumbar_score as number), 0) / lumbarChecks.length) * 10) / 10
            : null;

        const output = {
          period_days: days,
          from_date: from,
          to_date: today(tz),
          training: {
            total_sessions: sessions.length,
            sessions_per_week: Math.round(sessionsPerWeek * 10) / 10,
            weekly_goal: settings?.weekly_goal ?? null,
            // La fase del programa activo, no el entero global (#663).
            current_phase: active?.progress.currentPhase ?? settings?.phase ?? null,
            program_week: active?.progress.currentWeek ?? null,
            program_total_weeks: active?.progress.totalWeeks ?? null,
          },
          weight: weightTrend,
          lumbar: { avg_score: lumbarAvg, checks_count: lumbarChecks.length },
        };

        let text: string;
        if (response_format === ResponseFormat.JSON) {
          text = JSON.stringify(output, null, 2);
        } else {
          const goal = settings?.weekly_goal;
          const consistency = goal
            ? ` (${Math.round((sessionsPerWeek / goal) * 100)}% of ${goal}/week goal)`
            : "";
          const weightLine = weightTrend
            ? `${weightTrend.start}kg → ${weightTrend.end}kg (${weightTrend.change >= 0 ? "+" : ""}${weightTrend.change}kg)`
            : "No data";

          text = [
            `# Progress Summary — Last ${days} Days`,
            `_${from} → ${today(tz)}_\n`,
            `## Training`,
            `- Sessions: **${sessions.length}** total (avg **${sessionsPerWeek.toFixed(1)}/week**${consistency})`,
            output.training.current_phase ? `- Current Phase: **${output.training.current_phase}**` : "",
            active?.progress.currentWeek
              ? `- Program: week **${active.progress.currentWeek}** of ${active.progress.totalWeeks}`
              : "",
            `\n## Body Weight`,
            `- Trend: **${weightLine}**`,
            weightEntries.length > 0 ? `- Entries: ${weightEntries.length} measurements` : "",
            `\n## Lumbar Health`,
            lumbarAvg ? `- Avg Score: **${lumbarAvg}/5** over ${lumbarChecks.length} check(s)` : "- No lumbar checks recorded",
          ]
            .filter(Boolean)
            .join("\n");
        }

        return { content: [{ type: "text", text }], structuredContent: output };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
