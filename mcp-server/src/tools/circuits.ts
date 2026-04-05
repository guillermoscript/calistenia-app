import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AuthManager } from "../auth.js";
import { errorResult, PaginationSchema, ResponseFormat, daysAgo, today, toDateStr } from "../utils.js";

export function registerCircuitTools(server: McpServer, auth: AuthManager) {
  const pb = auth.getClient();
  const userId = auth.getUserId();
  const tz = auth.getTimezone();

  // ──────────────────────────────────────────────────────────────
  // LIST CIRCUIT SESSIONS
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_list_circuit_sessions",
    {
      title: "List Circuit / HIIT Sessions",
      description:
        "List completed circuit and HIIT workout sessions. Filter by date range or mode (circuit vs timed). Returns session name, mode, rounds, duration, and note.",
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
          mode: z
            .enum(["circuit", "timed"])
            .optional()
            .describe("Filter by circuit mode: 'circuit' (rep-based) or 'timed' (HIIT/Tabata)"),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ limit, offset, from_date, to_date, mode, response_format }) => {
      try {
        const from = from_date ?? daysAgo(30, tz);
        const to = to_date ?? today(tz);

        const conditions = ["user = {:userId}", "started_at >= {:from}", "started_at <= {:to}"];
        const params: Record<string, unknown> = { userId, from, to: `${to} 23:59:59` };
        if (mode) {
          conditions.push("mode = {:mode}");
          params.mode = mode;
        }

        const result = await pb.collection("circuit_sessions").getList(offset / limit + 1, limit, {
          filter: pb.filter(conditions.join(" && "), params),
          sort: "-started_at",
          fields: "id,circuit_name,mode,rounds_completed,rounds_target,duration_seconds,started_at,finished_at,note",
        });

        if (result.items.length === 0) {
          return { content: [{ type: "text", text: "No circuit sessions found for the given filters." }] };
        }

        const sessions = result.items.map((s) => {
          const name = typeof s.circuit_name === "object" ? (s.circuit_name as Record<string, string>).en ?? (s.circuit_name as Record<string, string>).es ?? "Circuit" : String(s.circuit_name);
          return {
            id: s.id,
            name,
            mode: s.mode,
            rounds_completed: s.rounds_completed,
            rounds_target: s.rounds_target,
            duration_seconds: s.duration_seconds,
            started_at: s.started_at,
            finished_at: s.finished_at,
            note: s.note || null,
          };
        });

        const output = { total: result.totalItems, count: sessions.length, from_date: from, to_date: to, sessions };

        let text: string;
        if (response_format === ResponseFormat.JSON) {
          text = JSON.stringify(output, null, 2);
        } else {
          const lines = [
            `# Circuit Sessions (${from} → ${to})`,
            `Found **${result.totalItems}** session(s)\n`,
          ];
          for (const s of sessions) {
            const mins = Math.floor(s.duration_seconds / 60);
            const secs = s.duration_seconds % 60;
            const modeLabel = s.mode === "timed" ? "HIIT" : "Circuit";
            lines.push(`- **${toDateStr(s.started_at, tz)}** — ${s.name} [${modeLabel}] — ${s.rounds_completed}/${s.rounds_target} rounds — ${mins}m${secs}s`);
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
  // GET CIRCUIT SESSION DETAIL
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_get_circuit_session",
    {
      title: "Get Circuit Session Details",
      description:
        "Get full details of a specific circuit session including exercises, timing config, rounds completed, and notes.",
      inputSchema: z
        .object({
          session_id: z.string().describe("The circuit session record ID"),
          response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ session_id, response_format }) => {
      try {
        const s = await pb.collection("circuit_sessions").getOne(session_id);

        if (s.user !== userId) {
          return errorResult("Access denied: this session does not belong to you.");
        }

        const name = typeof s.circuit_name === "object" ? (s.circuit_name as Record<string, string>).en ?? (s.circuit_name as Record<string, string>).es ?? "Circuit" : String(s.circuit_name);
        const exercises = Array.isArray(s.exercises) ? s.exercises : [];
        const config = s.config as Record<string, unknown> | null;

        const output = {
          id: s.id,
          name,
          mode: s.mode,
          rounds_completed: s.rounds_completed,
          rounds_target: s.rounds_target,
          duration_seconds: s.duration_seconds,
          started_at: s.started_at,
          finished_at: s.finished_at,
          note: s.note || null,
          exercises: exercises.map((ex: Record<string, unknown>) => {
            const exName = typeof ex.name === "object" ? (ex.name as Record<string, string>).en ?? (ex.name as Record<string, string>).es ?? "" : String(ex.name ?? "");
            return { exerciseId: ex.exerciseId, name: exName, reps: ex.reps ?? null };
          }),
          config: config ? {
            work_seconds: config.workSeconds ?? null,
            rest_seconds: config.restSeconds ?? null,
            rest_between_exercises: config.restBetweenExercises ?? null,
            rest_between_rounds: config.restBetweenRounds ?? null,
          } : null,
        };

        let text: string;
        if (response_format === ResponseFormat.JSON) {
          text = JSON.stringify(output, null, 2);
        } else {
          const mins = Math.floor(output.duration_seconds / 60);
          const secs = output.duration_seconds % 60;
          const modeLabel = output.mode === "timed" ? "HIIT/Timed" : "Circuit";
          const lines = [
            `# ${output.name}`,
            `**Mode:** ${modeLabel}`,
            `**Date:** ${toDateStr(output.started_at, tz)}`,
            `**Rounds:** ${output.rounds_completed} / ${output.rounds_target}`,
            `**Duration:** ${mins}m ${secs}s`,
          ];
          if (output.note) lines.push(`**Note:** ${output.note}`);
          if (output.config) {
            lines.push("", "## Timing Config");
            if (output.config.work_seconds != null) lines.push(`- Work: ${output.config.work_seconds}s`);
            if (output.config.rest_seconds != null) lines.push(`- Rest: ${output.config.rest_seconds}s`);
            if (output.config.rest_between_exercises != null) lines.push(`- Rest between exercises: ${output.config.rest_between_exercises}s`);
            if (output.config.rest_between_rounds != null) lines.push(`- Rest between rounds: ${output.config.rest_between_rounds}s`);
          }
          lines.push("", "## Exercises");
          for (let i = 0; i < output.exercises.length; i++) {
            const ex = output.exercises[i];
            const repsStr = ex.reps ? ` — ${ex.reps}` : "";
            lines.push(`${i + 1}. ${ex.name}${repsStr}`);
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
  // LOG CIRCUIT SESSION
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_log_circuit_session",
    {
      title: "Log Circuit / HIIT Session",
      description:
        "Record a completed circuit or HIIT workout session. Provide the circuit name, mode, exercises, rounds, and duration.",
      inputSchema: z
        .object({
          circuit_name: z.string().describe("Name of the circuit (e.g. 'Upper Body Blast', 'Tabata Cardio')"),
          mode: z.enum(["circuit", "timed"]).describe("'circuit' for rep-based, 'timed' for HIIT/Tabata"),
          exercises: z
            .array(
              z.object({
                name: z.string().describe("Exercise name"),
                reps: z.string().optional().describe("Reps (e.g. '10', '12/lado', '30s')"),
              })
            )
            .min(1)
            .describe("List of exercises in the circuit"),
          rounds_completed: z.number().int().min(1).describe("Number of rounds completed"),
          rounds_target: z.number().int().min(1).describe("Number of rounds planned"),
          duration_seconds: z.number().int().min(0).describe("Total workout duration in seconds"),
          work_seconds: z.number().int().optional().describe("Work interval in seconds (timed mode)"),
          rest_seconds: z.number().int().optional().describe("Rest interval in seconds (timed mode)"),
          rest_between_exercises: z.number().int().optional().describe("Rest between exercises in seconds"),
          rest_between_rounds: z.number().int().optional().describe("Rest between rounds in seconds"),
          note: z.string().optional().describe("Optional session note"),
          started_at: z.string().optional().describe("ISO timestamp when session started. Defaults to now minus duration."),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (input) => {
      try {
        const now = new Date();
        const startedAt = input.started_at ?? new Date(now.getTime() - input.duration_seconds * 1000).toISOString();
        const finishedAt = now.toISOString();

        const circuitName = { en: input.circuit_name, es: input.circuit_name };
        const exercises = input.exercises.map((ex, i) => ({
          exerciseId: ex.name.toLowerCase().replace(/\s+/g, "_"),
          name: { en: ex.name, es: ex.name },
          reps: ex.reps ?? undefined,
        }));

        const config = {
          mode: input.mode,
          rounds: input.rounds_target,
          workSeconds: input.work_seconds ?? undefined,
          restSeconds: input.rest_seconds ?? undefined,
          restBetweenExercises: input.rest_between_exercises ?? 0,
          restBetweenRounds: input.rest_between_rounds ?? 60,
          exercises,
        };

        const record = await pb.collection("circuit_sessions").create({
          user: userId,
          circuit_name: circuitName,
          mode: input.mode,
          exercises,
          rounds_completed: input.rounds_completed,
          rounds_target: input.rounds_target,
          duration_seconds: input.duration_seconds,
          started_at: startedAt,
          finished_at: finishedAt,
          note: input.note ?? "",
          config,
        });

        const mins = Math.floor(input.duration_seconds / 60);
        const secs = input.duration_seconds % 60;
        const modeLabel = input.mode === "timed" ? "HIIT" : "Circuit";

        return {
          content: [
            {
              type: "text",
              text: `Logged **${input.circuit_name}** [${modeLabel}] — ${input.rounds_completed}/${input.rounds_target} rounds — ${mins}m${secs}s`,
            },
          ],
          structuredContent: { id: record.id, circuit_name: input.circuit_name, mode: input.mode, rounds_completed: input.rounds_completed, duration_seconds: input.duration_seconds },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // DELETE CIRCUIT SESSION
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_delete_circuit_session",
    {
      title: "Delete Circuit Session",
      description: "Delete a completed circuit session by its record ID. Only the owner can delete their sessions.",
      inputSchema: z
        .object({
          session_id: z.string().describe("The circuit session record ID to delete"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ session_id }) => {
      try {
        const record = await pb.collection("circuit_sessions").getOne(session_id);
        if (record.user !== userId) {
          return errorResult("Access denied: this session does not belong to you.");
        }

        await pb.collection("circuit_sessions").delete(session_id);
        return { content: [{ type: "text", text: `Deleted circuit session \`${session_id}\`` }] };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // CIRCUIT STATS SUMMARY
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_circuit_stats",
    {
      title: "Circuit Training Stats",
      description:
        "Get aggregate stats for circuit/HIIT training: total sessions, total time, average duration, most used mode, and recent activity.",
      inputSchema: z
        .object({
          from_date: z.string().optional().describe("Start date (YYYY-MM-DD). Defaults to 30 days ago."),
          to_date: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
          response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ from_date, to_date, response_format }) => {
      try {
        const from = from_date ?? daysAgo(30, tz);
        const to = to_date ?? today(tz);

        const result = await pb.collection("circuit_sessions").getFullList({
          filter: pb.filter("user = {:userId} && started_at >= {:from} && started_at <= {:to}", {
            userId,
            from,
            to: `${to} 23:59:59`,
          }),
          sort: "-started_at",
          fields: "id,mode,rounds_completed,rounds_target,duration_seconds,started_at",
        });

        if (result.length === 0) {
          return { content: [{ type: "text", text: `No circuit sessions found between ${from} and ${to}.` }] };
        }

        const totalSessions = result.length;
        const totalSeconds = result.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);
        const avgSeconds = Math.round(totalSeconds / totalSessions);
        const totalRounds = result.reduce((sum, s) => sum + (s.rounds_completed ?? 0), 0);
        const circuitCount = result.filter((s) => s.mode === "circuit").length;
        const timedCount = result.filter((s) => s.mode === "timed").length;
        const completionRate = Math.round(
          (result.filter((s) => s.rounds_completed >= s.rounds_target).length / totalSessions) * 100
        );

        const output = {
          period: { from, to },
          total_sessions: totalSessions,
          total_time_seconds: totalSeconds,
          total_time_minutes: Math.round(totalSeconds / 60),
          avg_duration_seconds: avgSeconds,
          avg_duration_minutes: Math.round(avgSeconds / 60),
          total_rounds: totalRounds,
          circuit_sessions: circuitCount,
          timed_sessions: timedCount,
          completion_rate_percent: completionRate,
        };

        let text: string;
        if (response_format === ResponseFormat.JSON) {
          text = JSON.stringify(output, null, 2);
        } else {
          const totalMins = Math.round(totalSeconds / 60);
          const avgMins = Math.round(avgSeconds / 60);
          text = [
            `# Circuit Training Stats (${from} → ${to})`,
            "",
            `| Metric | Value |`,
            `|--------|-------|`,
            `| Total sessions | **${totalSessions}** |`,
            `| Total time | **${totalMins} min** |`,
            `| Avg duration | **${avgMins} min** |`,
            `| Total rounds | **${totalRounds}** |`,
            `| Circuit mode | ${circuitCount} |`,
            `| Timed/HIIT mode | ${timedCount} |`,
            `| Completion rate | **${completionRate}%** |`,
          ].join("\n");
        }

        return { content: [{ type: "text", text }], structuredContent: output };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
