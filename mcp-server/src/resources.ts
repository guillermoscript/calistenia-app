import type { AppServer } from "./mcpuse/auth-bridge.js";
import { getAuthManager } from "./mcpuse/auth-bridge.js";
import { today, startOfWeek } from "./utils.js";
import { resolveActiveProgramProgress } from "./api/program-progress-server.js";
import { resolvePersonalRecords } from "./api/prs-server.js";
import { loadUserExerciseResolver } from "./api/exercise-identity-server.js";

export function registerResources(server: AppServer, pbUrl: string) {
  // ──────────────────────────────────────────────────────────────
  // USER PROFILE RESOURCE
  // ──────────────────────────────────────────────────────────────
  server.resource(
    {
      name: "user-profile",
      uri: "user://profile",
      description: "User profile, training settings, and current program summary",
      mimeType: "application/json",
    },
    async (_uri, ctx) => {
      const auth = getAuthManager(ctx.auth, pbUrl);
      const pb = auth.getClient();
      const userId = auth.getUserId();

      const [settings, userPrograms] = await Promise.all([
        pb.collection("settings").getFirstListItem(pb.filter("user = {:userId}", { userId })).catch(() => null),
        pb.collection("user_programs").getFullList({
          filter: pb.filter("user = {:userId} && is_current = true", { userId }),
          expand: "program",
        }),
      ]);

      const currentProgram = userPrograms[0]?.expand?.program as Record<string, unknown> | undefined;
      // La fase y la semana reales del programa (#663). Va aparte de la lectura
      // de arriba porque necesita las fases y las sesiones, no solo el expand.
      const tz = auth.getTimezone();
      const active = currentProgram
        ? await resolveActiveProgramProgress(pb, auth.getUserId(), tz, today(tz))
        : null;
      // Los récords de TODOS los ejercicios, recalculados desde `sets_log`
      // (#666). Los cinco `pr_*` de la fila son espejos heredados y solo
      // cubren lo que `legacyPrKey` sabe traducir.
      // El resolutor de identidades (#702) necesita el programa activo, que ya
      // está leído arriba: se le pasa para no repetir la consulta.
      const current = currentProgram ? { userProgram: userPrograms[0], program: userPrograms[0].expand!.program } : null;
      const resolver = settings ? await loadUserExerciseResolver(pb, auth.getUserId(), { current }) : null;
      const prs = settings && resolver ? await resolvePersonalRecords(pb, auth.getUserId(), settings, { resolver }) : null;

      const profile = {
        user_id: auth.getUserId(),
        email: auth.getEmail(),
        settings: settings
          ? {
              // Entero global heredado, NO la fase del programa activo: esa se
              // deriva de `started_at` desde #616 y va en `current_program`.
              legacy_global_phase: settings.phase,
              start_date: settings.start_date,
              weekly_goal: settings.weekly_goal,
              personal_records: {
                pullups: prs?.legacy.pullups || null,
                pushups: prs?.legacy.pushups || null,
                l_sit: prs?.legacy.l_sit || null,
                pistol: prs?.legacy.pistol_squat || null,
                handstand: prs?.legacy.handstand || null,
              },
              // Clave de identidad → mejor marca, de todo lo registrado y
              // fusionando los ids que son el mismo ejercicio (#702);
              // `exercises` dice qué nombre e ids hay detrás de cada clave. En
              // un ejercicio de temporizador el número son SEGUNDOS.
              all_records: prs
                ? { tracked_exercises: prs.tracked_exercises, reps: prs.reps, weight: prs.weight, exercises: prs.exercises }
                : null,
            }
          : null,
        current_program: currentProgram
          ? {
              id: currentProgram.id,
              name: currentProgram.name,
              duration_weeks: currentProgram.duration_weeks,
              started_at: userPrograms[0]?.started_at ?? null,
              current_phase: active?.progress.currentPhase ?? null,
              phase_source: active?.progress.phaseSource ?? null,
              current_week: active?.progress.currentWeek ?? null,
              auto_progress: !!userPrograms[0]?.auto_progress,
            }
          : null,
      };

      return {
        contents: [
          {
            uri: "user://profile",
            mimeType: "application/json",
            text: JSON.stringify(profile, null, 2),
          },
        ],
      };
    }
  );

  // ──────────────────────────────────────────────────────────────
  // TODAY'S NUTRITION RESOURCE
  // ──────────────────────────────────────────────────────────────
  server.resource(
    {
      name: "nutrition-today",
      uri: "nutrition://today",
      description: "Today's logged meals and macro totals vs daily goals",
      mimeType: "application/json",
    },
    async (_uri, ctx) => {
      const auth = getAuthManager(ctx.auth, pbUrl);
      const pb = auth.getClient();
      const userId = auth.getUserId();
      const todayStr = today();

      const [entries, goals] = await Promise.all([
        pb.collection("nutrition_entries").getFullList({
          filter: pb.filter("user = {:userId} && logged_at >= {:from} && logged_at <= {:to}", {
            userId,
            from: todayStr,
            to: `${todayStr} 23:59:59`,
          }),
          sort: "logged_at",
        }),
        pb.collection("nutrition_goals").getFirstListItem(pb.filter("user = {:userId}", { userId })).catch(() => null),
      ]);

      const totals = entries.reduce(
        (acc, e) => ({
          calories: acc.calories + (e.total_calories as number),
          protein_g: acc.protein_g + (e.total_protein as number),
          carbs_g: acc.carbs_g + (e.total_carbs as number),
          fat_g: acc.fat_g + (e.total_fat as number),
        }),
        { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
      );

      const data = {
        date: todayStr,
        meals_logged: entries.length,
        totals: {
          calories: Math.round(totals.calories),
          protein_g: Math.round(totals.protein_g * 10) / 10,
          carbs_g: Math.round(totals.carbs_g * 10) / 10,
          fat_g: Math.round(totals.fat_g * 10) / 10,
        },
        goals: goals
          ? {
              calories: goals.daily_calories,
              protein_g: goals.daily_protein,
              carbs_g: goals.daily_carbs,
              fat_g: goals.daily_fat,
              goal_type: goals.goal,
            }
          : null,
        remaining: goals
          ? {
              calories: goals.daily_calories - Math.round(totals.calories),
              protein_g: goals.daily_protein - Math.round(totals.protein_g * 10) / 10,
              carbs_g: goals.daily_carbs - Math.round(totals.carbs_g * 10) / 10,
              fat_g: goals.daily_fat - Math.round(totals.fat_g * 10) / 10,
            }
          : null,
        meals: entries.map((e) => ({
          id: e.id,
          meal_type: e.meal_type,
          calories: e.total_calories,
          protein_g: e.total_protein,
          carbs_g: e.total_carbs,
          fat_g: e.total_fat,
          logged_at: e.logged_at,
        })),
      };

      return {
        contents: [
          {
            uri: "nutrition://today",
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }
  );

  // ──────────────────────────────────────────────────────────────
  // WEEKLY PROGRESS RESOURCE
  // ──────────────────────────────────────────────────────────────
  server.resource(
    {
      name: "progress-weekly",
      uri: "progress://weekly",
      description: "This week's workout sessions and consistency vs weekly goal",
      mimeType: "application/json",
    },
    async (_uri, ctx) => {
      const auth = getAuthManager(ctx.auth, pbUrl);
      const pb = auth.getClient();
      const userId = auth.getUserId();
      const tz = auth.getTimezone();
      const weekStart = startOfWeek(tz);
      const todayStr = today(tz);

      const [sessions, settings, active] = await Promise.all([
        pb.collection("sessions").getFullList({
          filter: pb.filter("user = {:userId} && completed_at >= {:weekStart}", { userId, weekStart }),
          sort: "completed_at",
        }),
        pb.collection("settings").getFirstListItem(pb.filter("user = {:userId}", { userId })).catch(() => null),
        resolveActiveProgramProgress(pb, userId, tz, todayStr),
      ]);

      const weeklyGoal = settings?.weekly_goal ?? null;
      const completionPct = weeklyGoal
        ? Math.min(Math.round((sessions.length / weeklyGoal) * 100), 100)
        : null;

      const data = {
        week_start: weekStart,
        today: todayStr,
        sessions_completed: sessions.length,
        weekly_goal: weeklyGoal,
        completion_pct: completionPct,
        // La fase del PROGRAMA (#663). `settings.phase` es un entero global que
        // dejó de ser la fuente de verdad en #616: solo se usa como último
        // recurso, y es core quien decide cuándo (`phase_source: 'fallback'`).
        current_phase: active?.progress.currentPhase ?? settings?.phase ?? null,
        phase_source: active?.progress.phaseSource ?? null,
        program_week: active ? { current: active.progress.currentWeek, total: active.progress.totalWeeks } : null,
        sessions: sessions.map((s) => ({
          id: s.id,
          workout_key: s.workout_key,
          phase: s.phase,
          day: s.day,
          completed_at: s.completed_at,
        })),
        workouts_done: sessions.map((s) => s.workout_key as string),
      };

      return {
        contents: [
          {
            uri: "progress://weekly",
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }
  );
}
