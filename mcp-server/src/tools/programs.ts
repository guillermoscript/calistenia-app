import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AuthManager } from "../auth.js";
import { errorResult, ResponseFormat, PaginationSchema } from "../utils.js";

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

  // ──────────────────────────────────────────────────────────────
  // CREATE PROGRAM
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_create_program",
    {
      title: "Create Training Program",
      description:
        "Create a new training program. After creating, use cal_create_phase and cal_add_program_exercise to populate it, or use cal_build_program to create a complete program in one call.",
      inputSchema: z
        .object({
          name: z.string().min(2).describe("Program name"),
          description: z.string().optional().describe("Program description"),
          duration_weeks: z.number().int().min(1).optional().describe("Program duration in weeks"),
          difficulty: z
            .enum(["beginner", "intermediate", "advanced"])
            .optional()
            .describe("Difficulty level"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (input) => {
      try {
        const record = await pb.collection("programs").create({
          name: input.name,
          description: input.description || "",
          duration_weeks: input.duration_weeks || 0,
          difficulty: input.difficulty || "",
          is_active: true,
          created_by: userId,
        });

        return {
          content: [{ type: "text", text: `Created program **${input.name}** (ID: ${record.id})` }],
          structuredContent: { id: record.id, name: input.name },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // UPDATE PROGRAM
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_update_program",
    {
      title: "Update Training Program",
      description: "Update an existing training program's metadata (name, description, duration, difficulty).",
      inputSchema: z
        .object({
          program_id: z.string().describe("Program ID to update"),
          name: z.string().optional().describe("New program name"),
          description: z.string().optional().describe("New description"),
          duration_weeks: z.number().int().min(1).optional().describe("New duration in weeks"),
          difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional().describe("New difficulty"),
          is_active: z.boolean().optional().describe("Whether the program is active/visible"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ program_id, ...updates }) => {
      try {
        const data: Record<string, unknown> = {};
        if (updates.name !== undefined) data.name = updates.name;
        if (updates.description !== undefined) data.description = updates.description;
        if (updates.duration_weeks !== undefined) data.duration_weeks = updates.duration_weeks;
        if (updates.difficulty !== undefined) data.difficulty = updates.difficulty;
        if (updates.is_active !== undefined) data.is_active = updates.is_active;

        const record = await pb.collection("programs").update(program_id, data);
        return {
          content: [{ type: "text", text: `Updated program **${record.name}**` }],
          structuredContent: { id: record.id, name: record.name },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // DELETE PROGRAM
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_delete_program",
    {
      title: "Delete Training Program",
      description:
        "Delete a training program. Phases and exercises are cascade-deleted by PocketBase. Only the program creator can delete.",
      inputSchema: z.object({ program_id: z.string().describe("Program ID to delete") }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ program_id }) => {
      try {
        const program = await pb.collection("programs").getOne(program_id);
        await pb.collection("programs").delete(program_id);
        return {
          content: [{ type: "text", text: `Deleted program **${program.name}**` }],
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // CREATE PHASE
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_create_phase",
    {
      title: "Create Program Phase",
      description: "Add a training phase to a program (e.g. 'Foundation', 'Strength', 'Advanced').",
      inputSchema: z
        .object({
          program_id: z.string().describe("Program ID to add the phase to"),
          phase_number: z.number().int().min(1).describe("Phase number (1, 2, 3...)"),
          name: z.string().describe("Phase name (e.g. 'Foundation')"),
          weeks: z.string().optional().describe("Weeks range (e.g. '1-4')"),
          color: z.string().optional().describe("Phase color hex"),
          bg_color: z.string().optional().describe("Phase background color hex"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (input) => {
      try {
        const record = await pb.collection("program_phases").create({
          program: input.program_id,
          phase_number: input.phase_number,
          name: input.name,
          weeks: input.weeks || "",
          color: input.color || "",
          bg_color: input.bg_color || "",
          sort_order: input.phase_number,
        });
        return {
          content: [
            { type: "text", text: `Created phase **${input.name}** (Phase ${input.phase_number}) for program ${input.program_id}` },
          ],
          structuredContent: { id: record.id, phase_number: input.phase_number, name: input.name },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // UPDATE PHASE
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_update_phase",
    {
      title: "Update Program Phase",
      description: "Update a phase's name, weeks, or colors.",
      inputSchema: z
        .object({
          phase_id: z.string().describe("Phase record ID"),
          name: z.string().optional().describe("New phase name"),
          weeks: z.string().optional().describe("New weeks range"),
          color: z.string().optional().describe("New color hex"),
          bg_color: z.string().optional().describe("New bg color hex"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ phase_id, ...updates }) => {
      try {
        const data: Record<string, unknown> = {};
        if (updates.name !== undefined) data.name = updates.name;
        if (updates.weeks !== undefined) data.weeks = updates.weeks;
        if (updates.color !== undefined) data.color = updates.color;
        if (updates.bg_color !== undefined) data.bg_color = updates.bg_color;

        const record = await pb.collection("program_phases").update(phase_id, data);
        return {
          content: [{ type: "text", text: `Updated phase **${record.name}**` }],
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // DELETE PHASE
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_delete_phase",
    {
      title: "Delete Program Phase",
      description: "Delete a phase from a program. Exercises in this phase are NOT cascade-deleted — remove them first if needed.",
      inputSchema: z.object({ phase_id: z.string().describe("Phase record ID") }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ phase_id }) => {
      try {
        await pb.collection("program_phases").delete(phase_id);
        return { content: [{ type: "text", text: `Deleted phase ${phase_id}` }] };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // ADD PROGRAM EXERCISE
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_add_program_exercise",
    {
      title: "Add Exercise to Program",
      description:
        "Add an exercise to a specific phase and day in a program. Day info (name, focus, title) is stored with each exercise record.",
      inputSchema: z
        .object({
          program_id: z.string().describe("Program ID"),
          phase_number: z.number().int().min(1).describe("Phase number"),
          day_id: z.string().describe("Day identifier (e.g. 'd1', 'd2', 'monday')"),
          day_name: z.string().optional().describe("Day display name (e.g. 'Day 1', 'Monday')"),
          day_focus: z.string().optional().describe("Day focus (e.g. 'Push + Core')"),
          day_type: z.string().optional().describe("Day type"),
          day_color: z.string().optional().describe("Day color hex"),
          workout_title: z.string().optional().describe("Workout title (e.g. 'Upper Body Strength')"),
          exercise_name: z.string().describe("Exercise name"),
          exercise_id: z.string().optional().describe("Exercise ID from catalog (optional)"),
          sets: z.number().int().min(1).default(3).describe("Number of sets"),
          reps: z.string().default("8-12").describe("Reps (e.g. '8-12', '30s', 'max')"),
          rest_seconds: z.number().int().default(60).describe("Rest between sets in seconds"),
          muscles: z.string().optional().describe("Target muscles"),
          note: z.string().optional().describe("Exercise notes or cues"),
          youtube: z.string().optional().describe("YouTube demo URL"),
          is_timer: z.boolean().default(false).describe("Timed exercise?"),
          timer_seconds: z.number().int().optional().describe("Timer duration"),
          sort_order: z.number().int().optional().describe("Display order within the day"),
          priority: z.enum(["primary", "secondary", "accessory"]).default("primary").describe("Exercise priority"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (input) => {
      try {
        const record = await pb.collection("program_exercises").create({
          program: input.program_id,
          phase_number: input.phase_number,
          day_id: input.day_id,
          day_name: input.day_name || input.day_id,
          day_focus: input.day_focus || "",
          day_type: input.day_type || "",
          day_color: input.day_color || "",
          workout_title: input.workout_title || "",
          exercise_id: input.exercise_id || input.exercise_name.toLowerCase().replace(/\s+/g, "-"),
          exercise_name: input.exercise_name,
          sets: input.sets,
          reps: input.reps,
          rest_seconds: input.rest_seconds,
          muscles: input.muscles || "",
          note: input.note || "",
          youtube: input.youtube || "",
          is_timer: input.is_timer,
          timer_seconds: input.timer_seconds || 0,
          sort_order: input.sort_order ?? 0,
          priority: input.priority,
        });

        return {
          content: [
            {
              type: "text",
              text: `Added **${input.exercise_name}** to Phase ${input.phase_number}, ${input.day_name || input.day_id} (${input.sets}×${input.reps})`,
            },
          ],
          structuredContent: { id: record.id, exercise_name: input.exercise_name },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // UPDATE PROGRAM EXERCISE
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_update_program_exercise",
    {
      title: "Update Exercise in Program",
      description: "Update an exercise's sets, reps, rest, notes, or other properties within a program.",
      inputSchema: z
        .object({
          exercise_record_id: z.string().describe("The program_exercises record ID to update"),
          exercise_name: z.string().optional(),
          sets: z.number().int().min(1).optional(),
          reps: z.string().optional(),
          rest_seconds: z.number().int().optional(),
          muscles: z.string().optional(),
          note: z.string().optional(),
          youtube: z.string().optional(),
          is_timer: z.boolean().optional(),
          timer_seconds: z.number().int().optional(),
          sort_order: z.number().int().optional(),
          priority: z.enum(["primary", "secondary", "accessory"]).optional(),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ exercise_record_id, ...updates }) => {
      try {
        const data: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(updates)) {
          if (v !== undefined) data[k] = v;
        }

        const record = await pb.collection("program_exercises").update(exercise_record_id, data);
        return {
          content: [{ type: "text", text: `Updated exercise **${record.exercise_name}**` }],
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // REMOVE PROGRAM EXERCISE
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_remove_program_exercise",
    {
      title: "Remove Exercise from Program",
      description: "Remove an exercise from a program day.",
      inputSchema: z.object({ exercise_record_id: z.string().describe("The program_exercises record ID") }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ exercise_record_id }) => {
      try {
        const record = await pb.collection("program_exercises").getOne(exercise_record_id);
        await pb.collection("program_exercises").delete(exercise_record_id);
        return { content: [{ type: "text", text: `Removed **${record.exercise_name}** from program` }] };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // BUILD PROGRAM (BULK)
  // ──────────────────────────────────────────────────────────────
  const ExerciseInput = z.object({
    name: z.string().describe("Exercise name"),
    exercise_id: z.string().optional().describe("Catalog exercise ID (optional)"),
    sets: z.number().int().min(1).default(3),
    reps: z.string().default("8-12"),
    rest_seconds: z.number().int().default(60),
    muscles: z.string().optional(),
    note: z.string().optional(),
    youtube: z.string().optional(),
    is_timer: z.boolean().default(false),
    timer_seconds: z.number().int().optional(),
    priority: z.enum(["primary", "secondary", "accessory"]).default("primary"),
  });

  const DayInput = z.object({
    day_id: z.string().describe("Day identifier (e.g. 'd1')"),
    day_name: z.string().describe("Day display name"),
    day_focus: z.string().optional().describe("Day focus (e.g. 'Push + Core')"),
    workout_title: z.string().optional(),
    exercises: z.array(ExerciseInput).min(1),
  });

  const PhaseInput = z.object({
    name: z.string().describe("Phase name"),
    weeks: z.string().optional().describe("Weeks range (e.g. '1-4')"),
    days: z.array(DayInput).min(1),
  });

  server.registerTool(
    "cal_build_program",
    {
      title: "Build Complete Program",
      description:
        "Create a full training program with phases, days, and exercises in one call. " +
        "This is the fastest way to build a program. Phases are numbered automatically starting from 1.",
      inputSchema: z
        .object({
          name: z.string().min(2).describe("Program name"),
          description: z.string().optional().describe("Program description"),
          duration_weeks: z.number().int().min(1).optional().describe("Duration in weeks"),
          difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
          phases: z.array(PhaseInput).min(1).describe("Program phases with days and exercises"),
          set_as_current: z.boolean().default(true).describe("Activate this program for the user"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (input) => {
      try {
        // 1. Create program
        const program = await pb.collection("programs").create({
          name: input.name,
          description: input.description || "",
          duration_weeks: input.duration_weeks || 0,
          difficulty: input.difficulty || "",
          is_active: true,
          created_by: userId,
        });

        let totalExercises = 0;

        // 2. Create phases and exercises
        for (let pi = 0; pi < input.phases.length; pi++) {
          const phase = input.phases[pi];
          const phaseNumber = pi + 1;

          await pb.collection("program_phases").create({
            program: program.id,
            phase_number: phaseNumber,
            name: phase.name,
            weeks: phase.weeks || "",
            sort_order: phaseNumber,
          });

          // 3. Create exercises for each day
          for (const day of phase.days) {
            for (let ei = 0; ei < day.exercises.length; ei++) {
              const ex = day.exercises[ei];
              await pb.collection("program_exercises").create({
                program: program.id,
                phase_number: phaseNumber,
                day_id: day.day_id,
                day_name: day.day_name,
                day_focus: day.day_focus || "",
                workout_title: day.workout_title || "",
                exercise_id: ex.exercise_id || ex.name.toLowerCase().replace(/\s+/g, "-"),
                exercise_name: ex.name,
                sets: ex.sets,
                reps: ex.reps,
                rest_seconds: ex.rest_seconds,
                muscles: ex.muscles || "",
                note: ex.note || "",
                youtube: ex.youtube || "",
                is_timer: ex.is_timer,
                timer_seconds: ex.timer_seconds || 0,
                sort_order: ei + 1,
                priority: ex.priority,
              });
              totalExercises++;
            }
          }
        }

        // 4. Optionally set as current program
        if (input.set_as_current) {
          const current = await pb.collection("user_programs").getFullList({
            filter: `user = "${userId}" && is_current = true`,
          });
          for (const up of current) {
            await pb.collection("user_programs").update(up.id, { is_current: false });
          }
          await pb.collection("user_programs").create({
            user: userId,
            program: program.id,
            is_current: true,
            started_at: new Date().toISOString(),
          });
        }

        const summary = input.phases.map((p, i) => {
          const dayCount = p.days.length;
          const exCount = p.days.reduce((s, d) => s + d.exercises.length, 0);
          return `  Phase ${i + 1}: ${p.name} — ${dayCount} days, ${exCount} exercises`;
        });

        return {
          content: [
            {
              type: "text",
              text: [
                `Created program **${input.name}** (ID: ${program.id})`,
                `${input.phases.length} phases, ${totalExercises} total exercises`,
                ...summary,
                input.set_as_current ? "\nSet as your current program." : "",
              ].join("\n"),
            },
          ],
          structuredContent: {
            id: program.id,
            name: input.name,
            phases: input.phases.length,
            total_exercises: totalExercises,
            is_current: input.set_as_current,
          },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
