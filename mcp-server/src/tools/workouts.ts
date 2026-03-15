import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AuthManager } from "../auth.js";
import { errorResult, PaginationSchema, ResponseFormat, daysAgo, today } from "../utils.js";

export function registerWorkoutTools(server: McpServer, auth: AuthManager) {
  const pb = auth.getClient();
  const userId = auth.getUserId();

  // ──────────────────────────────────────────────────────────────
  // LIST SESSIONS
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_list_sessions",
    {
      title: "List Workout Sessions",
      description:
        "List completed workout sessions for the authenticated user. Filter by date range, phase, or workout day. Returns sessions with date, workout key, and phase info.",
      inputSchema: z
        .object({
          ...PaginationSchema,
          from_date: z
            .string()
            .optional()
            .describe("Start date filter (YYYY-MM-DD). Defaults to 30 days ago."),
          to_date: z
            .string()
            .optional()
            .describe("End date filter (YYYY-MM-DD). Defaults to today."),
          phase: z
            .number()
            .int()
            .min(1)
            .optional()
            .describe("Filter by training phase number"),
          workout_key: z
            .string()
            .optional()
            .describe("Filter by workout key (e.g. 'p1_lun' for phase 1 Monday)"),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ limit, offset, from_date, to_date, phase, workout_key, response_format }) => {
      try {
        const from = from_date ?? daysAgo(30);
        const to = to_date ?? today();

        let filter = `user = "${userId}" && completed_at >= "${from}" && completed_at <= "${to} 23:59:59"`;
        if (phase) filter += ` && phase = ${phase}`;
        if (workout_key) filter += ` && workout_key = "${workout_key}"`;

        const result = await pb.collection("sessions").getList(offset / limit + 1, limit, {
          filter,
          sort: "-completed_at",
        });

        if (result.items.length === 0) {
          return { content: [{ type: "text", text: "No workout sessions found for the given filters." }] };
        }

        const sessions = result.items.map((s) => ({
          id: s.id,
          workout_key: s.workout_key,
          phase: s.phase,
          day: s.day,
          completed_at: s.completed_at,
          note: s.note || null,
        }));

        const output = {
          total: result.totalItems,
          count: sessions.length,
          from_date: from,
          to_date: to,
          sessions,
        };

        let text: string;
        if (response_format === ResponseFormat.JSON) {
          text = JSON.stringify(output, null, 2);
        } else {
          const lines = [
            `# Workout Sessions (${from} → ${to})`,
            `Found **${result.totalItems}** session(s)\n`,
          ];
          for (const s of sessions) {
            lines.push(`- **${s.completed_at.slice(0, 10)}** — ${s.workout_key} (Phase ${s.phase}, ${s.day})`);
            if (s.note) lines.push(`  > ${s.note}`);
          }
          text = lines.join("\n");
        }

        return { content: [{ type: "text", text }], structuredContent: output };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // LOG SESSION
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_log_session",
    {
      title: "Log Workout Session",
      description:
        "Record a completed workout session. The workout_key identifies which workout was done (e.g. 'p1_lun' = Phase 1 Monday). Phase and day are auto-derived from the key if not provided.",
      inputSchema: z
        .object({
          workout_key: z
            .string()
            .describe("Workout identifier like 'p1_lun', 'p2_mie', etc. Format: p{phase}_{day_id}"),
          phase: z.number().int().min(1).describe("Training phase number (1, 2, 3, ...)"),
          day: z
            .string()
            .describe("Day identifier: 'lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'"),
          completed_at: z
            .string()
            .optional()
            .describe("Completion datetime (ISO 8601). Defaults to now."),
          note: z.string().optional().describe("Optional note about the session"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ workout_key, phase, day, completed_at, note }) => {
      try {
        const data = {
          user: userId,
          workout_key,
          phase,
          day,
          completed_at: completed_at ?? new Date().toISOString(),
          note: note ?? "",
        };

        const record = await pb.collection("sessions").create(data);

        return {
          content: [
            {
              type: "text",
              text: `Session logged! **${workout_key}** completed on ${record.completed_at.slice(0, 10)} (Phase ${phase})`,
            },
          ],
          structuredContent: { id: record.id, workout_key, phase, day, completed_at: record.completed_at },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // DELETE SESSION
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_delete_session",
    {
      title: "Delete Workout Session",
      description: "Delete a logged workout session by its ID. Use cal_list_sessions to find the session ID first.",
      inputSchema: z
        .object({
          session_id: z.string().describe("The session record ID to delete"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ session_id }) => {
      try {
        // Verify ownership before deletion
        const record = await pb.collection("sessions").getOne(session_id);
        if (record.user !== userId) {
          return errorResult("Access denied: this session does not belong to you.");
        }

        await pb.collection("sessions").delete(session_id);
        return {
          content: [{ type: "text", text: `Session \`${session_id}\` deleted successfully.` }],
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // LIST SETS LOG
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_list_sets",
    {
      title: "List Exercise Sets Log",
      description:
        "List logged exercise sets with reps and notes. Filter by exercise, date range, or workout. Useful for tracking personal records and progression.",
      inputSchema: z
        .object({
          ...PaginationSchema,
          exercise_id: z
            .string()
            .optional()
            .describe("Filter by exercise ID (e.g. 'push-up', 'pull-up')"),
          from_date: z
            .string()
            .optional()
            .describe("Start date filter (YYYY-MM-DD). Defaults to 30 days ago."),
          to_date: z
            .string()
            .optional()
            .describe("End date filter (YYYY-MM-DD). Defaults to today."),
          workout_key: z.string().optional().describe("Filter by workout key"),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ limit, offset, exercise_id, from_date, to_date, workout_key, response_format }) => {
      try {
        const from = from_date ?? daysAgo(30);
        const to = to_date ?? today();

        let filter = `user = "${userId}" && logged_at >= "${from}" && logged_at <= "${to} 23:59:59"`;
        if (exercise_id) filter += ` && exercise_id = "${exercise_id}"`;
        if (workout_key) filter += ` && workout_key = "${workout_key}"`;

        const result = await pb.collection("sets_log").getList(offset / limit + 1, limit, {
          filter,
          sort: "-logged_at",
        });

        if (result.items.length === 0) {
          return { content: [{ type: "text", text: "No sets found for the given filters." }] };
        }

        const sets = result.items.map((s) => ({
          id: s.id,
          exercise_id: s.exercise_id,
          workout_key: s.workout_key,
          reps: s.reps,
          note: s.note || null,
          logged_at: s.logged_at,
        }));

        const output = { total: result.totalItems, count: sets.length, sets };

        let text: string;
        if (response_format === ResponseFormat.JSON) {
          text = JSON.stringify(output, null, 2);
        } else {
          const lines = [`# Sets Log (${from} → ${to})`, `Found **${result.totalItems}** set(s)\n`];
          // Group by exercise
          const grouped: Record<string, typeof sets> = {};
          for (const s of sets) {
            if (!grouped[s.exercise_id]) grouped[s.exercise_id] = [];
            grouped[s.exercise_id].push(s);
          }
          for (const [ex, exSets] of Object.entries(grouped)) {
            lines.push(`\n## ${ex}`);
            for (const s of exSets) {
              lines.push(`- **${s.logged_at.slice(0, 10)}** — ${s.reps} reps${s.note ? ` _(${s.note})_` : ""}`);
            }
          }
          text = lines.join("\n");
        }

        return { content: [{ type: "text", text }], structuredContent: output };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // LOG SET
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_log_set",
    {
      title: "Log Exercise Set",
      description:
        "Record a completed exercise set with reps. Use this to track your performance for individual exercises within a workout.",
      inputSchema: z
        .object({
          exercise_id: z
            .string()
            .describe("Exercise identifier (e.g. 'push-up', 'pull-up', 'dip')"),
          workout_key: z
            .string()
            .describe("Workout this set belongs to (e.g. 'p1_lun')"),
          reps: z
            .string()
            .describe("Reps performed. Can be a number '10', range '8-10', or description '5 + 3 negatives'"),
          note: z.string().optional().describe("Optional note (form cues, difficulty, etc.)"),
          logged_at: z.string().optional().describe("Log datetime (ISO 8601). Defaults to now."),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ exercise_id, workout_key, reps, note, logged_at }) => {
      try {
        const record = await pb.collection("sets_log").create({
          user: userId,
          exercise_id,
          workout_key,
          reps,
          note: note ?? "",
          logged_at: logged_at ?? new Date().toISOString(),
        });

        return {
          content: [
            {
              type: "text",
              text: `Set logged: **${exercise_id}** × ${reps}${note ? ` _(${note})_` : ""}`,
            },
          ],
          structuredContent: { id: record.id, exercise_id, workout_key, reps, logged_at: record.logged_at },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // GET EXERCISE HISTORY
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_get_exercise_history",
    {
      title: "Get Exercise History",
      description:
        "Get full history for a specific exercise — all logged sets grouped by date. Great for spotting progression and personal records over time.",
      inputSchema: z
        .object({
          exercise_id: z.string().describe("Exercise identifier (e.g. 'push-up', 'pull-up')"),
          days: z
            .number()
            .int()
            .min(1)
            .max(365)
            .default(90)
            .describe("How many days back to look (default 90)"),
          response_format: z
            .nativeEnum(ResponseFormat)
            .default(ResponseFormat.MARKDOWN)
            .describe("Output format"),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ exercise_id, days, response_format }) => {
      try {
        const from = daysAgo(days);
        const result = await pb.collection("sets_log").getFullList({
          filter: `user = "${userId}" && exercise_id = "${exercise_id}" && logged_at >= "${from}"`,
          sort: "logged_at",
        });

        if (result.length === 0) {
          return {
            content: [{ type: "text", text: `No history found for exercise '${exercise_id}' in the last ${days} days.` }],
          };
        }

        // Group by date
        const byDate: Record<string, string[]> = {};
        for (const s of result) {
          const date = s.logged_at.slice(0, 10);
          if (!byDate[date]) byDate[date] = [];
          byDate[date].push(s.reps + (s.note ? ` (${s.note})` : ""));
        }

        const output = {
          exercise_id,
          days_looked_back: days,
          total_sets: result.length,
          sessions: Object.entries(byDate).map(([date, sets]) => ({ date, sets })),
        };

        let text: string;
        if (response_format === ResponseFormat.JSON) {
          text = JSON.stringify(output, null, 2);
        } else {
          const lines = [
            `# ${exercise_id} History (last ${days} days)`,
            `**${result.length} total sets** across **${Object.keys(byDate).length} sessions**\n`,
          ];
          for (const [date, sets] of Object.entries(byDate)) {
            lines.push(`**${date}**: ${sets.join(", ")}`);
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
