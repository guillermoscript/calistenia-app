import type { AppServer } from "../mcpuse/auth-bridge.js";
import { z } from "zod";
import { getAuthManager } from "../mcpuse/auth-bridge.js";
import { errorResult, viewResult, ResponseFormat, PaginationSchema, today } from "../utils.js";
import { localize, toTranslatable } from "../lib/i18n.js";
import { programViewPropsSchema } from "../views/program-view.schema.js";
import {
  getCurrentProgram,
  setCurrentProgram as setCurrentProgramRepo,
  listProgramPhases,
  listProgramExercises,
  listProgramOverrides,
  listProgramStats,
} from "../api/repos/index.js";
import { resolveActiveProgramProgress } from "../api/program-progress-server.js";
import { resolveProgramExercises, toProgramOverrides } from "../api/program-overrides-server.js";

export function registerProgramTools(server: AppServer, pbUrl: string) {
  // ──────────────────────────────────────────────────────────────
  // LIST PROGRAMS
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_list_programs",
      title: "List Training Programs",
      description:
        "List all available training programs. Shows name, description, duration, and whether the user has selected it.",
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
        const [programs, userPrograms] = await Promise.all([
          pb.collection("programs").getFullList({ sort: "name", requestKey: null }),
          pb.collection("user_programs").getFullList({
            filter: pb.filter('user = {:userId}', { userId }),
            fields: 'id,program,is_current',
            requestKey: null,
          }),
        ]);

        // Cuánta gente sigue cada uno (#669). Va después de la lista porque
        // se filtra por los ids que acaba de devolver, y nunca tumba la tool:
        // un despliegue sin la migración de #620 devuelve 404 en la view.
        const stats = await listProgramStats(pb, programs.map((p) => p.id));

        const activeIds = new Set(userPrograms.filter((up) => up.is_current).map((up) => up.program));
        const selectedIds = new Set(userPrograms.map((up) => up.program));

        // El crédito del remix (#620) se resuelve contra esta misma lista, sin
        // una consulta por programa. Un `forked_from` que no aparezca aquí es el
        // caso normal y esperado: el original puede ser privado, o haber sido
        // borrado (la relación va sin cascade a propósito, así que la copia
        // sobrevive y deja de acreditar a nadie).
        const nameById = new Map(programs.map((p) => [p.id, localize(p.name)]));

        const output = {
          count: programs.length,
          programs: programs.map((p) => ({
            id: p.id,
            name: localize(p.name),
            description: localize(p.description),
            duration_weeks: p.duration_weeks,
            is_current: activeIds.has(p.id),
            is_selected: selectedIds.has(p.id),
            forked_from: (p.forked_from as string) || null,
            forked_from_name: p.forked_from ? nameById.get(p.forked_from as string) ?? null : null,
            // `null` = no se sabe (la view no está o no se puede leer), que no
            // es lo mismo que 0 = todavía no lo sigue nadie. Ver `listProgramStats`.
            followers_count: stats[p.id]?.followers_count ?? null,
            athletes_count: stats[p.id]?.athletes_count ?? null,
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
            // Sin dato no se escribe la línea: un "0 followers" inventado a
            // partir de un fallo de permisos es perfectamente creíble y falso.
            if (p.followers_count !== null) {
              const athletes = p.athletes_count ? `, ${p.athletes_count} training it` : "";
              lines.push(`- **Followers**: ${p.followers_count}${athletes}`);
            }
            if (p.forked_from) {
              lines.push(`- **Based on**: ${p.forked_from_name ?? `\`${p.forked_from}\``}`);
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
  // GET CURRENT PROGRAM
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_get_current_program",
      title: "Get Current Program",
      description:
        "Get detailed information about the user's currently active training program, including all phases and the exercises for each day. Essential context for planning workouts.",
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
        const tz = auth.getTimezone();
        const current = await getCurrentProgram(pb, userId);

        if (!current) {
          return {
            content: [
              {
                type: "text",
                text: "No active program found. Use `cal_list_programs` to see available programs, then `cal_set_current_program` to select one.",
              },
            ],
          };
        }

        const { userProgram, program } = current;

        // Load phases and exercises
        const programId = program.id as string;
        const [phases, exercises, overrideRows, active, stats] = await Promise.all([
          listProgramPhases(pb, programId),
          listProgramExercises(pb, programId, { sort: "priority" }),
          listProgramOverrides(pb, userId, programId),
          // La semana y la fase reales (#616): derivadas de `started_at`, no del
          // entero global `settings.phase`. Se le pasa el `current` que ya
          // tenemos para que no vuelva a leer la inscripción.
          resolveActiveProgramProgress(pb, userId, tz, today(tz), { current }),
          // Cuánta gente más lo sigue (#620/#669). Nunca lanza y `undefined`
          // significa «no se sabe», no «cero»: ver `listProgramStats`.
          listProgramStats(pb, [programId]),
        ]);
        const overrides = toProgramOverrides(overrideRows);

        // Organize exercises by phase + day
        const exercisesByPhaseDay: Record<string, Record<string, typeof exercises>> = {};
        for (const ex of exercises) {
          const phaseKey = String(ex.phase_number);
          const dayKey = ex.day_id as string;
          if (!exercisesByPhaseDay[phaseKey]) exercisesByPhaseDay[phaseKey] = {};
          if (!exercisesByPhaseDay[phaseKey][dayKey]) exercisesByPhaseDay[phaseKey][dayKey] = [];
          exercisesByPhaseDay[phaseKey][dayKey].push(ex);
        }

        const progress = active?.progress ?? null;

        const output = {
          program: {
            id: program.id,
            name: localize(program.name as string),
            description: localize(program.description as string),
            duration_weeks: program.duration_weeks,
            instructions: localize(program.instructions as string) || null,
            forked_from: (program.forked_from as string) || null,
            followers_count: stats[programId]?.followers_count ?? null,
            athletes_count: stats[programId]?.athletes_count ?? null,
          },
          started_at: userProgram.started_at,
          // El estado de la inscripción, que es donde viven las dos cosas que
          // el MCP ignoraba: la fase de ESTE programa y el interruptor de la
          // progresión automática (#617).
          enrollment: {
            status: (userProgram.status as string) || "active",
            auto_progress: !!userProgram.auto_progress,
            phase_override: (userProgram.current_phase as number) || null,
          },
          progress: progress && {
            current_week: progress.currentWeek,
            total_weeks: progress.totalWeeks,
            current_phase: progress.currentPhase,
            // 'override' = la fijó el usuario a mano; 'derived' = sale de las
            // semanas transcurridas; 'fallback' = el programa no tiene fases de
            // donde derivarla.
            phase_source: progress.phaseSource,
            percent: progress.percent,
            sessions_this_week: progress.sessionsThisWeek,
            planned_this_week: progress.plannedThisWeek,
            next_day: progress.nextDay,
            is_completed: progress.isCompleted,
          },
          phases: phases.map((ph) => ({
            phase_number: ph.phase_number,
            name: localize(ph.name),
            weeks: ph.weeks,
            days: Object.entries(exercisesByPhaseDay[String(ph.phase_number)] ?? {}).map(
              ([day_id, exs]) => ({
                day_id,
                day_name: localize((exs[0] as Record<string, unknown>).day_name as string),
                day_focus: localize((exs[0] as Record<string, unknown>).day_focus as string),
                workout_title: localize((exs[0] as Record<string, unknown>).workout_title as string),
                // Con la progresión aceptada por el usuario ya aplicada (#617):
                // en un programa ajeno esa dosis solo existe en
                // `user_program_overrides`, así que servir la fila cruda sería
                // darle una prescripción que su propia app ya no le enseña.
                exercises: resolveProgramExercises(exs, overrides),
              })
            ),
          })),
        };

        let text: string;
        if (response_format === ResponseFormat.JSON) {
          text = JSON.stringify(output, null, 2);
        } else {
          const p = output.progress;
          const lines = [
            `# ${output.program.name}`,
            `Started: ${userProgram.started_at?.slice(0, 10) ?? "unknown"} | Duration: ${output.program.duration_weeks} weeks`,
            p
              ? `**Week ${p.current_week ?? "—"} of ${p.total_weeks}** · Phase **${p.current_phase}**` +
                `${p.phase_source === "override" ? " (set manually)" : ""}` +
                ` · ${p.sessions_this_week}/${p.planned_this_week} workouts this week` +
                `${p.is_completed ? " · **program finished**" : ""}`
              : "",
            output.enrollment.auto_progress ? `_Auto-progression is ON for this enrollment._` : "",
            // Sin dato no se escribe la línea: un «0 followers» sacado de un
            // fallo de permisos es creíble y falso (#669).
            output.program.followers_count !== null
              ? `_${output.program.followers_count} people follow this program` +
                `${output.program.athletes_count ? `, ${output.program.athletes_count} have trained it` : ""}._`
              : "",
            "",
            output.program.description ? `> ${output.program.description}\n` : "",
          ];
          for (const phase of output.phases) {
            // La fase en curso se marca: sin la marca, un programa de 4 fases
            // son cuatro bloques idénticos y el modelo elige el que quiere.
            const isCurrent = p?.current_phase === phase.phase_number;
            lines.push(`\n## Phase ${phase.phase_number}: ${phase.name} (${phase.weeks})${isCurrent ? " ← **CURRENT**" : ""}`);
            for (const day of phase.days) {
              lines.push(`\n### ${day.day_name} — ${day.day_focus}`);
              lines.push(`*${day.workout_title}*\n`);
              for (const ex of day.exercises) {
                const timer = ex.is_timer ? " (timer)" : "";
                const progressed = ex.auto_progressed ? " _(auto-progressed)_" : "";
                lines.push(`- **${ex.name}**: ${ex.sets} sets × ${ex.reps}${timer} | Rest: ${ex.rest_seconds}s${progressed}`);
                if (ex.variant_of) lines.push(`  _Doing variant \`${ex.variant_of}\` instead_`);
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
  const setCurrentProgram = server.tool(
    {
      name: "cal_set_current_program",
      title: "Set Current Training Program",
      description:
        "Select or switch to a training program. Deactivates the previous active program. Use cal_list_programs to get program IDs.",
      schema: z
        .object({
          program_id: z.string().describe("The program ID to activate"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ program_id }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();
        // Verify program exists
        const program = await pb.collection("programs").getOne(program_id);

        await setCurrentProgramRepo(pb, userId, program_id);

        return {
          content: [
            {
              type: "text",
              text: `Program set to **${localize(program.name)}**. Use \`cal_get_current_program\` to see your full workout schedule.`,
            },
          ],
          structuredContent: { program_id, name: localize(program.name), started_at: new Date().toISOString() },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // LIST EXERCISE PROGRESSIONS
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_list_exercise_progressions",
      title: "List Exercise Progressions",
      description:
        "Get the progression chain for exercises in a category (e.g. push, pull, legs). Shows difficulty order and the reps target needed to advance to the next level.",
      schema: z
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
    async ({ category, exercise_id, response_format }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const conditions: string[] = [];
        const params: Record<string, unknown> = {};
        if (category) {
          conditions.push('category = {:category}');
          params.category = category;
        }
        if (exercise_id) {
          conditions.push('exercise_id = {:exercise_id}');
          params.exercise_id = exercise_id;
        }

        const progressions = await pb.collection("exercise_progressions").getFullList({
          filter: conditions.length > 0 ? pb.filter(conditions.join(' && '), params) : undefined,
          sort: "category,difficulty_order",
        });

        if (progressions.length === 0) {
          return { content: [{ type: "text", text: "No progressions found." }] };
        }

        const output = {
          count: progressions.length,
          progressions: progressions.map((p) => ({
            exercise_id: p.exercise_id,
            name: localize(p.exercise_name),
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
  server.tool(
    {
      name: "cal_create_program",
      title: "Create Training Program",
      description:
        "Create a new training program. After creating, use cal_create_phase and cal_add_program_exercise to populate it, or use cal_build_program to create a complete program in one call.",
      schema: z
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
    async (input, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();
        const record = await pb.collection("programs").create({
          name: toTranslatable(input.name),
          description: toTranslatable(input.description || ""),
          duration_weeks: input.duration_weeks || 0,
          difficulty: input.difficulty || "",
          is_active: true,
          // Nace privado (#603): es un programa de usuario, no de catálogo.
          // Se publica desde el editor cambiando la visibilidad.
          visibility: "private",
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
  server.tool(
    {
      name: "cal_update_program",
      title: "Update Training Program",
      description: "Update an existing training program's metadata (name, description, duration, difficulty).",
      schema: z
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
    async ({ program_id, ...updates }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const data: Record<string, unknown> = {};
        if (updates.name !== undefined) data.name = toTranslatable(updates.name);
        if (updates.description !== undefined) data.description = toTranslatable(updates.description);
        if (updates.duration_weeks !== undefined) data.duration_weeks = updates.duration_weeks;
        if (updates.difficulty !== undefined) data.difficulty = updates.difficulty;
        if (updates.is_active !== undefined) data.is_active = updates.is_active;

        const record = await pb.collection("programs").update(program_id, data);
        return {
          content: [{ type: "text", text: `Updated program **${localize(record.name)}**` }],
          structuredContent: { id: record.id, name: localize(record.name) },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // DELETE PROGRAM
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_delete_program",
      title: "Delete Training Program",
      description:
        "Delete a training program. Phases and exercises are cascade-deleted by PocketBase; anyone enrolled keeps their history and is notified. Only the program creator can delete.",
      schema: z.object({ program_id: z.string().describe("Program ID to delete") }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ program_id }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const program = await pb.collection("programs").getOne(program_id);

        // Las inscripciones NO se tocan desde aquí, y borrarlas antes era un bug
        // (#663). El comentario que había —«PocketBase bloquea el borrado si
        // existen»— dejó de ser cierto: `user_programs.program` es opcional
        // desde 1784900000_user_programs_program_optional.js, así que el borrado
        // pasa igual y la fila sobrevive, que es lo que se quiere: es el
        // historial del inscrito, no un detalle del programa del autor.
        //
        // De cerrarlas se encarga `pb_hooks/programs_delete_cleanup.pb.js`, que
        // las marca `abandoned` con `$app` (saltándose las API rules, cosa que
        // el cliente no puede) y manda la notificación `program_deleted` de
        // #633. Adelantarse al hook destruía ese historial y se saltaba el
        // aviso — y encima solo a medias: el `deleteRule` es
        // `user = @request.auth.id`, así que el bucle moría con un 403 en la
        // primera inscripción ajena, dentro de un `catch {}` vacío.
        //
        // program_exercises, program_phases, program_day_config y
        // user_program_overrides sí van con cascade y se los lleva PocketBase.
        await pb.collection("programs").delete(program_id);
        return {
          content: [{ type: "text", text: `Deleted program **${localize(program.name)}**` }],
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // CREATE PHASE
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_create_phase",
      title: "Create Program Phase",
      description: "Add a training phase to a program (e.g. 'Foundation', 'Strength', 'Advanced').",
      schema: z
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
    async (input, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const record = await pb.collection("program_phases").create({
          program: input.program_id,
          phase_number: input.phase_number,
          name: toTranslatable(input.name),
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
  server.tool(
    {
      name: "cal_update_phase",
      title: "Update Program Phase",
      description: "Update a phase's name, weeks, or colors.",
      schema: z
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
    async ({ phase_id, ...updates }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const data: Record<string, unknown> = {};
        if (updates.name !== undefined) data.name = toTranslatable(updates.name);
        if (updates.weeks !== undefined) data.weeks = updates.weeks;
        if (updates.color !== undefined) data.color = updates.color;
        if (updates.bg_color !== undefined) data.bg_color = updates.bg_color;

        const record = await pb.collection("program_phases").update(phase_id, data);
        return {
          content: [{ type: "text", text: `Updated phase **${localize(record.name)}**` }],
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // DELETE PHASE
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_delete_phase",
      title: "Delete Program Phase",
      description: "Delete a phase from a program. Exercises in this phase are NOT cascade-deleted — remove them first if needed.",
      schema: z.object({ phase_id: z.string().describe("Phase record ID") }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ phase_id }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
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
  server.tool(
    {
      name: "cal_add_program_exercise",
      title: "Add Exercise to Program",
      description:
        "Add an exercise to a specific phase and day in a program. Day info (name, focus, title) is stored with each exercise record.",
      schema: z
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
          section: z.enum(["warmup", "main", "cooldown"]).default("main").optional().describe("Exercise section: warmup, main, or cooldown"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (input, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const record = await pb.collection("program_exercises").create({
          program: input.program_id,
          phase_number: input.phase_number,
          day_id: input.day_id,
          day_name: toTranslatable(input.day_name || input.day_id),
          day_focus: toTranslatable(input.day_focus || ""),
          day_type: input.day_type || "",
          day_color: input.day_color || "",
          workout_title: toTranslatable(input.workout_title || ""),
          exercise_id: input.exercise_id || input.exercise_name.toLowerCase().replace(/\s+/g, "-"),
          exercise_name: toTranslatable(input.exercise_name),
          sets: input.sets,
          reps: input.reps,
          rest_seconds: input.rest_seconds,
          muscles: toTranslatable(input.muscles || ""),
          note: toTranslatable(input.note || ""),
          youtube: input.youtube || "",
          is_timer: input.is_timer,
          timer_seconds: input.timer_seconds || 0,
          sort_order: input.sort_order ?? 0,
          priority: input.priority,
          section: input.section ?? "main",
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
  server.tool(
    {
      name: "cal_update_program_exercise",
      title: "Update Exercise in Program",
      description: "Update an exercise's sets, reps, rest, notes, or other properties within a program.",
      schema: z
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
          section: z.enum(["warmup", "main", "cooldown"]).optional().describe("Exercise section: warmup, main, or cooldown"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ exercise_record_id, ...updates }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const translatableKeys = new Set(['exercise_name', 'muscles', 'note']);
        const data: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(updates)) {
          if (v !== undefined) {
            data[k] = translatableKeys.has(k) ? toTranslatable(v as string) : v;
          }
        }

        const record = await pb.collection("program_exercises").update(exercise_record_id, data);
        return {
          content: [{ type: "text", text: `Updated exercise **${localize(record.exercise_name)}**` }],
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // REMOVE PROGRAM EXERCISE
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_remove_program_exercise",
      title: "Remove Exercise from Program",
      description: "Remove an exercise from a program day.",
      schema: z.object({ exercise_record_id: z.string().describe("The program_exercises record ID") }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ exercise_record_id }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const record = await pb.collection("program_exercises").getOne(exercise_record_id);
        await pb.collection("program_exercises").delete(exercise_record_id);
        return { content: [{ type: "text", text: `Removed **${localize(record.exercise_name)}** from program` }] };
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
    section: z.enum(["warmup", "main", "cooldown"]).default("main").optional().describe("Exercise section: warmup, main, or cooldown"),
  });

  const DayInput = z.object({
    day_id: z.string().describe("Day identifier (e.g. 'd1')"),
    day_name: z.string().describe("Day display name"),
    day_focus: z.string().optional().describe("Day focus (e.g. 'Push + Core')"),
    day_type: z.string().optional().describe("Day type (e.g. 'push', 'cardio', 'circuit')"),
    workout_title: z.string().optional(),
    exercises: z.array(ExerciseInput).min(1),
    // Circuit fields (required when day_type is 'circuit')
    circuit_mode: z.enum(['circuit', 'timed']).optional().describe("Circuit mode: 'circuit' (rep-based) or 'timed' (HIIT/Tabata). Required when day_type is 'circuit'."),
    circuit_rounds: z.number().int().min(1).max(20).optional().describe("Number of rounds. Default 3."),
    circuit_work_seconds: z.number().int().optional().describe("Work interval seconds for timed mode. Default 40."),
    circuit_rest_seconds: z.number().int().optional().describe("Rest interval seconds for timed mode. Default 20."),
    circuit_rest_between_exercises: z.number().int().optional().describe("Rest between exercises in seconds. Default 0."),
    circuit_rest_between_rounds: z.number().int().optional().describe("Rest between rounds in seconds. Default 60."),
  });

  const PhaseInput = z.object({
    name: z.string().describe("Phase name"),
    weeks: z.string().optional().describe("Weeks range (e.g. '1-4')"),
    days: z.array(DayInput).min(1),
  });

  server.tool(
    {
      name: "cal_build_program",
      title: "Build Complete Program",
      description:
        "Create a full training program with phases, days, and exercises in one call. " +
        "This is the fastest way to build a program. Phases are numbered automatically starting from 1. " +
        "Returns a visual program card with phase breakdown and an activation button.",
      view: { name: "program-view" },
      outputSchema: programViewPropsSchema,
      schema: z
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
    async (input, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();
        // 1. Create program
        const program = await pb.collection("programs").create({
          name: toTranslatable(input.name),
          description: toTranslatable(input.description || ""),
          duration_weeks: input.duration_weeks || 0,
          difficulty: input.difficulty || "",
          is_active: true,
          // Nace privado (#603): es un programa de usuario, no de catálogo.
          visibility: "private",
          created_by: userId,
        });

        let totalExercises = 0;

        // 2. Create phases and exercises sequentially
        for (let pi = 0; pi < input.phases.length; pi++) {
          const phase = input.phases[pi];
          const phaseNumber = pi + 1;

          await pb.collection("program_phases").create({
            program: program.id,
            phase_number: phaseNumber,
            name: toTranslatable(phase.name),
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
                day_name: toTranslatable(day.day_name),
                day_focus: toTranslatable(day.day_focus || ""),
                day_type: day.day_type || "",
                workout_title: toTranslatable(day.workout_title || ""),
                exercise_id: ex.exercise_id || ex.name.toLowerCase().replace(/\s+/g, "-"),
                exercise_name: toTranslatable(ex.name),
                sets: ex.sets,
                reps: ex.reps,
                rest_seconds: ex.rest_seconds,
                muscles: toTranslatable(ex.muscles || ""),
                note: toTranslatable(ex.note || ""),
                youtube: ex.youtube || "",
                is_timer: ex.is_timer,
                timer_seconds: ex.timer_seconds || 0,
                sort_order: ei + 1,
                priority: ex.priority,
                section: ex.section ?? "main",
              });
              totalExercises++;
            }

            // Create circuit config if day_type is 'circuit'
            if (day.day_type === 'circuit') {
              await pb.collection('program_day_config').create({
                program: program.id,
                day_id: day.day_id,
                day_type: 'circuit',
                circuit_mode: day.circuit_mode ?? 'circuit',
                circuit_rounds: day.circuit_rounds ?? 3,
                circuit_work_seconds: day.circuit_work_seconds ?? 40,
                circuit_rest_seconds: day.circuit_rest_seconds ?? 20,
                circuit_rest_between_exercises: day.circuit_rest_between_exercises ?? 0,
                circuit_rest_between_rounds: day.circuit_rest_between_rounds ?? 60,
              });
            }
          }
        }

        // 4. Optionally set as current program
        if (input.set_as_current) {
          await setCurrentProgramRepo(pb, userId, program.id);
        }

        const summary = input.phases.map((p, i) => {
          const dayCount = p.days.length;
          const exCount = p.days.reduce((s, d) => s + d.exercises.length, 0);
          return `  Phase ${i + 1}: ${p.name} — ${dayCount} days, ${exCount} exercises`;
        });

        const fallbackText = [
          `Created program **${input.name}** (ID: ${program.id})`,
          `${input.phases.length} phases, ${totalExercises} total exercises`,
          ...summary,
          input.set_as_current ? "\nSet as your current program." : "",
        ].join("\n");

        return viewResult(
          {
            id: program.id,
            name: input.name,
            difficulty: input.difficulty ?? "",
            duration_weeks: input.duration_weeks ?? 0,
            is_current: input.set_as_current,
            phases_count: input.phases.length,
            total_exercises: totalExercises,
            phases: input.phases.map((p) => ({
              name: p.name,
              days: p.days.map((d) => ({
                day_name: d.day_name,
                day_focus: d.day_focus ?? "",
                exercises: d.exercises.map((e) => ({
                  name: e.name,
                  sets: e.sets,
                  reps: e.reps,
                  rest_seconds: e.rest_seconds,
                  muscles: e.muscles ?? "",
                })),
              })),
            })),
          },
          fallbackText
        );
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // SEED PROGRAM FROM JSON
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_seed_program_from_json",
      title: "Seed Program from JSON",
      description:
        "Import a complete program from a JSON object matching the program export format. " +
        "Accepts the same structure as intermedio_balance_total.json: { program: {...}, phases: [{...}] }. " +
        "Creates the program as official. All text is stored with i18n support.",
      schema: z
        .object({
          program: z.object({
            name: z.string(),
            description: z.string().optional(),
            difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
            duration_weeks: z.number().int().optional(),
          }),
          phases: z.array(z.object({
            phase_number: z.number().int(),
            name: z.string(),
            weeks: z.string().optional(),
            color: z.string().optional(),
            days: z.array(z.object({
              day_id: z.string(),
              day_name: z.string(),
              day_type: z.string().optional().describe("Day type override (e.g. 'yoga', 'cardio'). Defaults to auto-detect from day_id."),
              day_focus: z.string().optional(),
              day_color: z.string().optional(),
              workout_title: z.string().optional(),
              // Circuit fields (required when day_type is 'circuit')
              circuit_mode: z.enum(['circuit', 'timed']).optional().describe("Circuit mode: 'circuit' (rep-based) or 'timed' (HIIT/Tabata). Required when day_type is 'circuit'."),
              circuit_rounds: z.number().int().min(1).max(20).optional().describe("Number of rounds. Default 3."),
              circuit_work_seconds: z.number().int().optional().describe("Work interval seconds for timed mode. Default 40."),
              circuit_rest_seconds: z.number().int().optional().describe("Rest interval seconds for timed mode. Default 20."),
              circuit_rest_between_exercises: z.number().int().optional().describe("Rest between exercises in seconds. Default 0."),
              circuit_rest_between_rounds: z.number().int().optional().describe("Rest between rounds in seconds. Default 60."),
              exercises: z.array(z.object({
                sort_order: z.number().int().optional(),
                name: z.string(),
                muscles: z.string().optional(),
                sets: z.number().int().optional(),
                reps: z.string().optional(),
                rest_seconds: z.number().int().optional(),
                priority: z.string().optional(),
                is_timer: z.boolean().optional(),
                timer_seconds: z.number().int().optional(),
                note: z.string().optional(),
                youtube: z.string().optional(),
                section: z.enum(["warmup", "main", "cooldown"]).optional(),
              })),
            })),
          })).min(1),
          is_official: z.boolean().default(true).describe("Mark as official program"),
          set_as_current: z.boolean().default(false).describe("Set as user's current program"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (input, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();
        const dayTypeMap: Record<string, string> = {
          lun: "push", mar: "pull", mie: "lumbar", jue: "legs",
          vie: "full", sab: "rest", dom: "rest",
        };
        const priorityMap: Record<string, string> = {
          primary: "high", secondary: "med", accessory: "low",
        };

        // 1. Create program
        const program = await pb.collection("programs").create({
          name: toTranslatable(input.program.name),
          description: toTranslatable(input.program.description || ""),
          duration_weeks: input.program.duration_weeks || 0,
          difficulty: input.program.difficulty || "",
          is_active: true,
          is_official: input.is_official,
          // Los sembrados como oficiales son catálogo; el resto, del usuario (#603).
          visibility: input.is_official ? "public" : "private",
          created_by: userId,
        });

        let totalExercises = 0;
        const batch = pb.createBatch();

        for (const phase of input.phases) {
          batch.collection("program_phases").create({
            program: program.id,
            phase_number: phase.phase_number,
            name: toTranslatable(phase.name),
            weeks: phase.weeks || "",
            color: phase.color || "#888",
            sort_order: phase.phase_number,
          });

          for (const day of phase.days) {
            // Create day config record for discipline detection
            const resolvedDayType = day.day_type || dayTypeMap[day.day_id] || "full";
            const dayConfigData: Record<string, unknown> = {
              program: program.id,
              phase_number: phase.phase_number,
              day_id: day.day_id,
              day_name: toTranslatable(day.day_name),
              day_type: resolvedDayType,
              day_focus: toTranslatable(day.day_focus || ""),
              day_color: day.day_color || phase.color || "#888",
              sort_order: phase.days.indexOf(day) + 1,
            };

            // Add circuit config fields when day_type is 'circuit'
            if (resolvedDayType === 'circuit') {
              dayConfigData.circuit_mode = day.circuit_mode ?? 'circuit';
              dayConfigData.circuit_rounds = day.circuit_rounds ?? 3;
              dayConfigData.circuit_work_seconds = day.circuit_work_seconds ?? 40;
              dayConfigData.circuit_rest_seconds = day.circuit_rest_seconds ?? 20;
              dayConfigData.circuit_rest_between_exercises = day.circuit_rest_between_exercises ?? 0;
              dayConfigData.circuit_rest_between_rounds = day.circuit_rest_between_rounds ?? 60;
            }

            batch.collection("program_day_config").create(dayConfigData);

            for (let ei = 0; ei < day.exercises.length; ei++) {
              const ex = day.exercises[ei];
              batch.collection("program_exercises").create({
                program: program.id,
                phase_number: phase.phase_number,
                day_id: day.day_id,
                day_name: toTranslatable(day.day_name),
                day_focus: toTranslatable(day.day_focus || ""),
                day_type: resolvedDayType,
                day_color: day.day_color || phase.color || "#888",
                workout_title: toTranslatable(day.workout_title || day.day_focus || ""),
                exercise_id: ex.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/_+$/, ""),
                exercise_name: toTranslatable(ex.name),
                sets: ex.sets ?? 3,
                reps: ex.reps || "8-12",
                rest_seconds: ex.rest_seconds ?? 60,
                muscles: toTranslatable(ex.muscles || ""),
                note: toTranslatable(ex.note || ""),
                youtube: ex.youtube || "",
                is_timer: ex.is_timer || false,
                timer_seconds: ex.timer_seconds || 0,
                sort_order: ex.sort_order ?? ei + 1,
                priority: priorityMap[ex.priority || ""] || ex.priority || "med",
                section: ex.section ?? "main",
              });
              totalExercises++;
            }
          }
        }

        await batch.send();

        // Optionally set as current
        if (input.set_as_current) {
          await setCurrentProgramRepo(pb, userId, program.id);
        }

        const summary = input.phases.map((p) => {
          const exCount = p.days.reduce((s, d) => s + d.exercises.length, 0);
          return `  Phase ${p.phase_number}: ${p.name} — ${p.days.length} days, ${exCount} exercises`;
        });

        return {
          content: [{
            type: "text",
            text: [
              `✅ Seeded program **${input.program.name}** (ID: ${program.id})`,
              `${input.phases.length} phases, ${totalExercises} total exercises`,
              input.is_official ? "Marked as official." : "",
              input.set_as_current ? "Set as current program." : "",
              "",
              ...summary,
            ].join("\n"),
          }],
          structuredContent: {
            id: program.id,
            name: input.program.name,
            phases: input.phases.length,
            total_exercises: totalExercises,
            is_official: input.is_official,
            is_current: input.set_as_current,
          },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // DUPLICATE PROGRAM
  // ──────────────────────────────────────────────────────────────
  server.tool(
    {
      name: "cal_duplicate_program",
      title: "Duplicate Training Program",
      description:
        "Clone an existing program with all its phases and exercises. Great for creating variations of a program.",
      schema: z
        .object({
          program_id: z.string().describe("Program ID to duplicate"),
          new_name: z.string().optional().describe("Name for the copy (defaults to 'Original Name (copy)')"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ program_id, new_name }, ctx) => {
      try {
        const auth = getAuthManager(ctx.auth, pbUrl);
        const pb = auth.getClient();
        const userId = auth.getUserId();
        const original = await pb.collection("programs").getOne(program_id);

        // Create new program
        const newProgram = await pb.collection("programs").create({
          name: new_name ? toTranslatable(new_name) : toTranslatable(`${localize(original.name)} (copy)`),
          description: original.description,
          duration_weeks: original.duration_weeks,
          difficulty: original.difficulty || "",
          is_active: true,
          // La copia nace privada aunque el original fuera público (#603),
          // igual que `duplicateProgram` en packages/core/hooks/usePrograms.ts.
          visibility: "private",
          created_by: userId,
        });

        // Copy phases and exercises
        const [phases, exercises] = await Promise.all([
          listProgramPhases(pb, program_id),
          listProgramExercises(pb, program_id, { sort: "phase_number,day_id,sort_order" }),
        ]);

        const copyBatch = pb.createBatch();

        for (const phase of phases) {
          copyBatch.collection("program_phases").create({
            program: newProgram.id,
            phase_number: phase.phase_number,
            name: phase.name,
            weeks: phase.weeks,
            color: phase.color || "",
            bg_color: phase.bg_color || "",
            sort_order: phase.sort_order,
          });
        }

        for (const ex of exercises) {
          copyBatch.collection("program_exercises").create({
            program: newProgram.id,
            phase_number: ex.phase_number,
            day_id: ex.day_id,
            day_name: ex.day_name,
            day_focus: ex.day_focus,
            day_type: ex.day_type || "",
            day_color: ex.day_color || "",
            workout_title: ex.workout_title,
            exercise_id: ex.exercise_id,
            exercise_name: ex.exercise_name,
            sets: ex.sets,
            reps: ex.reps,
            rest_seconds: ex.rest_seconds,
            muscles: ex.muscles,
            note: ex.note,
            youtube: ex.youtube || "",
            is_timer: ex.is_timer,
            timer_seconds: ex.timer_seconds || 0,
            sort_order: ex.sort_order,
            priority: ex.priority,
            section: ex.section || "main",
          });
        }

        await copyBatch.send();

        return {
          content: [
            {
              type: "text",
              text: `Duplicated **${localize(original.name)}** → **${localize(newProgram.name)}** (ID: ${newProgram.id})\nCopied ${phases.length} phases, ${exercises.length} exercises`,
            },
          ],
          structuredContent: { id: newProgram.id, name: localize(newProgram.name), phases: phases.length, exercises: exercises.length },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // Tool ref consumed by the program-view View through useCallTool().
  return { setCurrentProgram };
}
