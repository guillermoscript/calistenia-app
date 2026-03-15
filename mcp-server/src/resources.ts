import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AuthManager } from "./auth.js";
import { today, daysAgo, startOfWeek } from "./utils.js";

export function registerResources(server: McpServer, auth: AuthManager) {
  const pb = auth.getClient();
  const userId = auth.getUserId();

  // ──────────────────────────────────────────────────────────────
  // USER PROFILE RESOURCE
  // ──────────────────────────────────────────────────────────────
  server.resource("user://profile", "User profile, training settings, and current program summary", async () => {
    const [settings, userPrograms] = await Promise.all([
      pb.collection("settings").getFirstListItem(`user = "${userId}"`).catch(() => null),
      pb.collection("user_programs").getFullList({
        filter: `user = "${userId}" && is_current = true`,
        expand: "program",
      }),
    ]);

    const currentProgram = userPrograms[0]?.expand?.program as Record<string, unknown> | undefined;

    const profile = {
      user_id: auth.getUserId(),
      email: auth.getEmail(),
      settings: settings
        ? {
            phase: settings.phase,
            start_date: settings.start_date,
            weekly_goal: settings.weekly_goal,
            personal_records: {
              pullups: settings.pr_pullups ?? null,
              pushups: settings.pr_pushups ?? null,
              l_sit: settings.pr_lsit ?? null,
              pistol: settings.pr_pistol ?? null,
              handstand: settings.pr_handstand ?? null,
            },
          }
        : null,
      current_program: currentProgram
        ? {
            id: currentProgram.id,
            name: currentProgram.name,
            duration_weeks: currentProgram.duration_weeks,
            started_at: userPrograms[0]?.started_at ?? null,
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
  });

  // ──────────────────────────────────────────────────────────────
  // TODAY'S NUTRITION RESOURCE
  // ──────────────────────────────────────────────────────────────
  server.resource(
    "nutrition://today",
    "Today's logged meals and macro totals vs daily goals",
    async () => {
      const todayStr = today();

      const [entries, goals] = await Promise.all([
        pb.collection("nutrition_entries").getFullList({
          filter: `user = "${userId}" && logged_at >= "${todayStr}" && logged_at <= "${todayStr} 23:59:59"`,
          sort: "logged_at",
        }),
        pb.collection("nutrition_goals").getFirstListItem(`user = "${userId}"`).catch(() => null),
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
    "progress://weekly",
    "This week's workout sessions and consistency vs weekly goal",
    async () => {
      const weekStart = startOfWeek();
      const todayStr = today();

      const [sessions, settings] = await Promise.all([
        pb.collection("sessions").getFullList({
          filter: `user = "${userId}" && completed_at >= "${weekStart}"`,
          sort: "completed_at",
        }),
        pb.collection("settings").getFirstListItem(`user = "${userId}"`).catch(() => null),
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
        current_phase: settings?.phase ?? null,
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
