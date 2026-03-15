import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AuthManager } from "../auth.js";
import { errorResult, ResponseFormat } from "../utils.js";

export function registerProgramTools(server: McpServer, auth: AuthManager) {
  const pb = auth.getClient();
  const userId = auth.getUserId();

  // ──────────────────────────────────────────────────────────────
  // LIST PROGRAMS
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_list_programs",
    {
      title: "List Training Programs",
      description:
        "List all available training programs. Shows name, description, duration, and whether the user has selected it.",
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
        const [programs, userPrograms] = await Promise.all([
          pb.collection("programs").getFullList({ filter: "is_active = true", sort: "name" }),
          pb.collection("user_programs").getFullList({ filter: `user = "${userId}"` }),
        ]);

        const activeIds = new Set(userPrograms.filter((up) => up.is_current).map((up) => up.program));
        const selectedIds = new Set(userPrograms.map((up) => up.program));

        const output = {
          count: programs.length,
          programs: programs.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            duration_weeks: p.duration_weeks,
            is_current: activeIds.has(p.id),
            is_selected: selectedIds.has(p.id),
          })),
        };

        let text: string;
        if (response_format === ResponseFormat.JSON) {
          text = JSON.stringify(output, null, 2);
        } else {
          const lines = [`# Available Training Programs\n`];
          for (const p of output.programs) {
            const badge = p.is_current ? " ✓ **CURRENT**" : p.is_selected ? " (previously selected)" : "";
            lines.push(`## ${p.name}${badge}`);
            lines.push(`- **ID**: \`${p.id}\``);
            lines.push(`- **Duration**: ${p.duration_weeks} weeks`);
            lines.push(`- **Description**: ${p.description || "N/A"}`);
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

  // ──────────────────────────────────────────────────────────────
  // GET CURRENT PROGRAM
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_get_current_program",
    {
      title: "Get Current Program",
      description:
        "Get detailed information about the user's currently active training program, including all phases and the exercises for each day. Essential context for planning workouts.",
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
        const userPrograms = await pb.collection("user_programs").getFullList({
          filter: `user = "${userId}" && is_current = true`,
          expand: "program",
        });

        if (userPrograms.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No active program found. Use `cal_list_programs` to see available programs, then `cal_set_current_program` to select one.",
              },
            ],
          };
        }

        const userProgram = userPrograms[0];
        const program = userProgram.expand?.program as Record<string, unknown>;

        if (!program) {
          return errorResult("Program data not found. The linked program may have been deleted.");
        }

        // Load phases and exercises
        const [phases, exercises] = await Promise.all([
          pb.collection("program_phases").getFullList({
            filter: `program = "${program.id}"`,
            sort: "sort_order",
          }),
          pb.collection("program_exercises").getFullList({
            filter: `program = "${program.id}"`,
            sort: "priority",
          }),
        ]);

        // Organize exercises by phase + day
        const exercisesByPhaseDay: Record<string, Record<string, typeof exercises>> = {};
        for (const ex of exercises) {
          const phaseKey = String(ex.phase_number);
          const dayKey = ex.day_id as string;
          if (!exercisesByPhaseDay[phaseKey]) exercisesByPhaseDay[phaseKey] = {};
          if (!exercisesByPhaseDay[phaseKey][dayKey]) exercisesByPhaseDay[phaseKey][dayKey] = [];
          exercisesByPhaseDay[phaseKey][dayKey].push(ex);
        }

        const output = {
          program: {
            id: program.id,
            name: program.name,
            description: program.description,
            duration_weeks: program.duration_weeks,
          },
          started_at: userProgram.started_at,
          phases: phases.map((ph) => ({
            phase_number: ph.phase_number,
            name: ph.name,
            weeks: ph.weeks,
            days: Object.entries(exercisesByPhaseDay[String(ph.phase_number)] ?? {}).map(
              ([day_id, exs]) => ({
                day_id,
                day_name: (exs[0] as Record<string, unknown>).day_name,
                day_focus: (exs[0] as Record<string, unknown>).day_focus,
                workout_title: (exs[0] as Record<string, unknown>).workout_title,
                exercises: exs.map((e) => ({
                  exercise_id: e.exercise_id,
                  name: e.exercise_name,
                  sets: e.sets,
                  reps: e.reps,
                  rest_seconds: e.rest_seconds,
                  muscles: e.muscles,
                  is_timer: e.is_timer,
                  youtube: e.youtube || null,
                })),
              })
            ),
          })),
        };

        let text: string;
        if (response_format === ResponseFormat.JSON) {
          text = JSON.stringify(output, null, 2);
        } else {
          const lines = [
            `# ${output.program.name}`,
            `Started: ${userProgram.started_at?.slice(0, 10) ?? "unknown"} | Duration: ${output.program.duration_weeks} weeks\n`,
            output.program.description ? `> ${output.program.description}\n` : "",
          ];
          for (const phase of output.phases) {
            lines.push(`\n## Phase ${phase.phase_number}: ${phase.name} (${phase.weeks})`);
            for (const day of phase.days) {
              lines.push(`\n### ${day.day_name} — ${day.day_focus}`);
              lines.push(`*${day.workout_title}*\n`);
              for (const ex of day.exercises) {
                const timer = ex.is_timer ? " (timer)" : "";
                lines.push(`- **${ex.name}**: ${ex.sets} sets × ${ex.reps}${timer} | Rest: ${ex.rest_seconds}s`);
                if (ex.muscles) lines.push(`  _Muscles: ${ex.muscles}_`);
              }
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
  // SET CURRENT PROGRAM
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_set_current_program",
    {
      title: "Set Current Training Program",
      description:
        "Select or switch to a training program. Deactivates the previous active program. Use cal_list_programs to get program IDs.",
      inputSchema: z
        .object({
          program_id: z.string().describe("The program ID to activate"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ program_id }) => {
      try {
        // Verify program exists
        const program = await pb.collection("programs").getOne(program_id);

        // Deactivate current programs
        const current = await pb.collection("user_programs").getFullList({
          filter: `user = "${userId}" && is_current = true`,
        });
        for (const up of current) {
          await pb.collection("user_programs").update(up.id, { is_current: false });
        }

        // Check if user already has this program selected
        const existing = await pb
          .collection("user_programs")
          .getFirstListItem(`user = "${userId}" && program = "${program_id}"`)
          .catch(() => null);

        if (existing) {
          await pb.collection("user_programs").update(existing.id, {
            is_current: true,
            started_at: new Date().toISOString(),
          });
        } else {
          await pb.collection("user_programs").create({
            user: userId,
            program: program_id,
            is_current: true,
            started_at: new Date().toISOString(),
          });
        }

        return {
          content: [
            {
              type: "text",
              text: `Program set to **${program.name}**. Use \`cal_get_current_program\` to see your full workout schedule.`,
            },
          ],
          structuredContent: { program_id, name: program.name, started_at: new Date().toISOString() },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // LIST EXERCISE PROGRESSIONS
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_list_exercise_progressions",
    {
      title: "List Exercise Progressions",
      description:
        "Get the progression chain for exercises in a category (e.g. push, pull, legs). Shows difficulty order and the reps target needed to advance to the next level.",
      inputSchema: z
        .object({
          category: z
            .string()
            .optional()
            .describe("Filter by category (e.g. 'push', 'pull', 'legs', 'core'). Omit for all."),
          exercise_id: z
            .string()
            .optional()
            .describe("Get the progression chain for a specific exercise ID"),
          response_format: z
            .nativeEnum(ResponseFormat)
            .default(ResponseFormat.MARKDOWN)
            .describe("Output format"),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ category, exercise_id, response_format }) => {
      try {
        let filter = "";
        if (category) filter = `category = "${category}"`;
        if (exercise_id) filter = filter ? `${filter} && exercise_id = "${exercise_id}"` : `exercise_id = "${exercise_id}"`;

        const progressions = await pb.collection("exercise_progressions").getFullList({
          filter: filter || undefined,
          sort: "category,difficulty_order",
        });

        if (progressions.length === 0) {
          return { content: [{ type: "text", text: "No progressions found." }] };
        }

        const output = {
          count: progressions.length,
          progressions: progressions.map((p) => ({
            exercise_id: p.exercise_id,
            name: p.exercise_name,
            category: p.category,
            difficulty_order: p.difficulty_order,
            next_exercise_id: p.next_exercise_id || null,
            prev_exercise_id: p.prev_exercise_id || null,
            target_reps_to_advance: p.target_reps_to_advance,
            sessions_at_target: p.sessions_at_target,
          })),
        };

        let text: string;
        if (response_format === ResponseFormat.JSON) {
          text = JSON.stringify(output, null, 2);
        } else {
          // Group by category
          const grouped: Record<string, typeof output.progressions> = {};
          for (const p of output.progressions) {
            if (!grouped[p.category]) grouped[p.category] = [];
            grouped[p.category].push(p);
          }
          const lines = [`# Exercise Progressions\n`];
          for (const [cat, progs] of Object.entries(grouped)) {
            lines.push(`## ${cat.charAt(0).toUpperCase() + cat.slice(1)}`);
            for (const p of progs) {
              lines.push(
                `${p.difficulty_order}. **${p.name}** — advance at ${p.target_reps_to_advance} reps × ${p.sessions_at_target} sessions`
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
