import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AuthManager } from "../auth.js";
import { errorResult, PaginationSchema, ResponseFormat, daysAgo, today } from "../utils.js";

export function registerProgressTools(server: McpServer, auth: AuthManager) {
  const pb = auth.getClient();
  const userId = auth.getUserId();

  // ──────────────────────────────────────────────────────────────
  // GET SETTINGS
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_get_settings",
    {
      title: "Get User Settings",
      description:
        "Get the user's training settings: current phase, start date, weekly workout goal, and personal records (PR) for key exercises.",
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
        const settings = await pb
          .collection("settings")
          .getFirstListItem(`user = "${userId}"`)
          .catch(() => null);

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

        const output = {
          phase: settings.phase,
          start_date: settings.start_date,
          weekly_goal: settings.weekly_goal,
          personal_records: {
            pullups: settings.pr_pullups ?? null,
            pushups: settings.pr_pushups ?? null,
            l_sit: settings.pr_lsit ?? null,
            pistol_squat: settings.pr_pistol ?? null,
            handstand: settings.pr_handstand ?? null,
          },
        };

        let text: string;
        if (response_format === ResponseFormat.JSON) {
          text = JSON.stringify(output, null, 2);
        } else {
          const pr = output.personal_records;
          text = [
            `# Training Settings`,
            `- **Current Phase**: ${output.phase}`,
            `- **Start Date**: ${output.start_date}`,
            `- **Weekly Goal**: ${output.weekly_goal} workouts/week`,
            `\n## Personal Records`,
            pr.pullups ? `- Pull-ups: **${pr.pullups}**` : `- Pull-ups: not set`,
            pr.pushups ? `- Push-ups: **${pr.pushups}**` : `- Push-ups: not set`,
            pr.l_sit ? `- L-Sit: **${pr.l_sit}**` : `- L-Sit: not set`,
            pr.pistol_squat ? `- Pistol Squat: **${pr.pistol_squat}**` : `- Pistol Squat: not set`,
            pr.handstand ? `- Handstand: **${pr.handstand}**` : `- Handstand: not set`,
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
  server.registerTool(
    "cal_update_settings",
    {
      title: "Update Training Settings",
      description:
        "Update training settings: phase, start date, weekly goal, or personal records. Only provide fields you want to change.",
      inputSchema: z
        .object({
          phase: z.number().int().min(1).optional().describe("Current training phase (1, 2, 3, ...)"),
          start_date: z.string().optional().describe("Program start date (YYYY-MM-DD)"),
          weekly_goal: z.number().int().min(1).max(7).optional().describe("Target workouts per week (1-7)"),
          pr_pullups: z.string().optional().describe("Pull-up personal record (e.g. '15', '10 strict')"),
          pr_pushups: z.string().optional().describe("Push-up personal record"),
          pr_lsit: z.string().optional().describe("L-Sit personal record (e.g. '30s')"),
          pr_pistol: z.string().optional().describe("Pistol squat personal record"),
          pr_handstand: z.string().optional().describe("Handstand personal record"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ phase, start_date, weekly_goal, pr_pullups, pr_pushups, pr_lsit, pr_pistol, pr_handstand }) => {
      try {
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

        const existing = await pb
          .collection("settings")
          .getFirstListItem(`user = "${userId}"`)
          .catch(() => null);

        let record;
        if (existing) {
          record = await pb.collection("settings").update(existing.id, updates);
        } else {
          record = await pb.collection("settings").create({ user: userId, ...updates });
        }

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
  server.registerTool(
    "cal_list_weight_entries",
    {
      title: "List Weight Entries",
      description:
        "List body weight measurements over time. Useful for tracking weight trends and correlating with training.",
      inputSchema: z
        .object({
          ...PaginationSchema,
          from_date: z.string().optional().describe("Start date (YYYY-MM-DD). Defaults to 90 days ago."),
          to_date: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ limit, offset, from_date, to_date, response_format }) => {
      try {
        const from = from_date ?? daysAgo(90);
        const to = to_date ?? today();

        const result = await pb.collection("weight_entries").getList(offset / limit + 1, limit, {
          filter: `user = "${userId}" && date >= "${from}" && date <= "${to}"`,
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

  server.registerTool(
    "cal_add_weight_entry",
    {
      title: "Add Weight Entry",
      description: "Record a body weight measurement.",
      inputSchema: z
        .object({
          weight_kg: z.number().min(20).max(300).describe("Body weight in kilograms (e.g. 75.5)"),
          date: z.string().optional().describe("Date of measurement (YYYY-MM-DD). Defaults to today."),
          note: z.string().optional().describe("Optional note (e.g. 'morning, fasted')"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ weight_kg, date, note }) => {
      try {
        const record = await pb.collection("weight_entries").create({
          user: userId,
          weight_kg,
          date: date ?? today(),
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

  server.registerTool(
    "cal_delete_weight_entry",
    {
      title: "Delete Weight Entry",
      description: "Delete a weight measurement by its ID.",
      inputSchema: z
        .object({ entry_id: z.string().describe("The weight entry record ID to delete") })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ entry_id }) => {
      try {
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
  server.registerTool(
    "cal_list_lumbar_checks",
    {
      title: "List Lumbar Health Checks",
      description:
        "List lumbar health check-ins. Each entry records a daily score (1-5), sleep quality, and hours sitting. Useful for monitoring recovery and injury risk.",
      inputSchema: z
        .object({
          ...PaginationSchema,
          from_date: z.string().optional().describe("Start date (YYYY-MM-DD). Defaults to 30 days ago."),
          to_date: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ limit, offset, from_date, to_date, response_format }) => {
      try {
        const from = from_date ?? daysAgo(30);
        const to = to_date ?? today();

        const result = await pb.collection("lumbar_checks").getList(offset / limit + 1, limit, {
          filter: `user = "${userId}" && date >= "${from}" && date <= "${to}"`,
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

  server.registerTool(
    "cal_add_lumbar_check",
    {
      title: "Add Lumbar Health Check",
      description:
        "Record a lumbar health check-in. Score your lower back pain/comfort from 1 (severe pain) to 5 (no pain, full mobility).",
      inputSchema: z
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
    async ({ lumbar_score, slept_well, sitting_hours, date }) => {
      try {
        const record = await pb.collection("lumbar_checks").create({
          user: userId,
          date: date ?? today(),
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
  server.registerTool(
    "cal_get_progress_summary",
    {
      title: "Get Progress Summary",
      description:
        "Get an overall progress summary: recent workout sessions, weight trend, lumbar health average, and weekly workout consistency. Great for a quick status overview.",
      inputSchema: z
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
    async ({ days, response_format }) => {
      try {
        const from = daysAgo(days);

        const [sessions, weightEntries, lumbarChecks, settings] = await Promise.all([
          pb.collection("sessions").getFullList({
            filter: `user = "${userId}" && completed_at >= "${from}"`,
            sort: "completed_at",
          }),
          pb.collection("weight_entries").getFullList({
            filter: `user = "${userId}" && date >= "${from}"`,
            sort: "date",
          }),
          pb.collection("lumbar_checks").getFullList({
            filter: `user = "${userId}" && date >= "${from}"`,
          }),
          pb.collection("settings").getFirstListItem(`user = "${userId}"`).catch(() => null),
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
          to_date: today(),
          training: {
            total_sessions: sessions.length,
            sessions_per_week: Math.round(sessionsPerWeek * 10) / 10,
            weekly_goal: settings?.weekly_goal ?? null,
            current_phase: settings?.phase ?? null,
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
            `_${from} → ${today()}_\n`,
            `## Training`,
            `- Sessions: **${sessions.length}** total (avg **${sessionsPerWeek.toFixed(1)}/week**${consistency})`,
            settings?.phase ? `- Current Phase: **${settings.phase}**` : "",
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
