import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer) {
  // ──────────────────────────────────────────────────────────────
  // PLAN TRAINING WEEK
  // ──────────────────────────────────────────────────────────────
  server.prompt(
    "plan_training_week",
    "Generate a personalized weekly training plan based on the user's current program, phase, progress, and recovery status.",
    {
      focus: z
        .string()
        .optional()
        .describe("Optional focus or constraint (e.g. 'I have a sore shoulder', 'I want to prioritize pull strength')"),
    },
    ({ focus }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Help me plan my training week.",
              "",
              "Please:",
              "1. Read my current program using `cal_get_current_program` to see my phase and scheduled workouts",
              "2. Check this week's sessions with the `progress://weekly` resource to see what I've already done",
              "3. Check my settings with `cal_get_settings` to know my weekly goal and current phase",
              "4. Check my last lumbar score with `cal_list_lumbar_checks` (last 3 days) to assess my recovery",
              "",
              "Then create a day-by-day plan for the rest of the week that:",
              "- Fits my remaining weekly session goal",
              "- Respects my recovery status (lumbar score)",
              "- Lists the specific exercises for each planned workout day",
              "- Suggests rest days strategically",
              focus ? `\nAdditional context: ${focus}` : "",
            ]
              .filter((l) => l !== null)
              .join("\n"),
          },
        },
      ],
    })
  );

  // ──────────────────────────────────────────────────────────────
  // ANALYZE PROGRESS
  // ──────────────────────────────────────────────────────────────
  server.prompt(
    "analyze_progress",
    "Analyze the user's recent training progress and provide actionable insights on consistency, exercise progression, and recovery patterns.",
    {
      period_days: z
        .number()
        .int()
        .min(7)
        .max(180)
        .default(30)
        .describe("How many days of history to analyze (default 30)"),
    },
    ({ period_days }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Analyze my training progress over the last ${period_days} days and give me actionable insights.`,
              "",
              "Please gather the following data:",
              `1. Use \`cal_get_progress_summary\` with days=${period_days} for an overview`,
              "2. Use `cal_list_sessions` to see my workout frequency and consistency",
              "3. Use `cal_list_lumbar_checks` to spot recovery patterns",
              "4. Use `cal_list_weight_entries` to see body weight trend",
              "5. Use `cal_get_settings` to see my PRs and weekly goal",
              "",
              "In your analysis, address:",
              "- **Consistency**: Am I hitting my weekly goal? Which days/workouts do I skip most?",
              "- **Recovery**: How is my lumbar health trending? Any concerning patterns?",
              "- **Progression**: Based on my session frequency, am I ready to advance phases?",
              "- **Body composition**: How is my weight trending relative to my training?",
              "- **Top 3 recommendations**: Specific actions to improve over the next 4 weeks",
            ].join("\n"),
          },
        },
      ],
    })
  );

  // ──────────────────────────────────────────────────────────────
  // NUTRITION ADVICE
  // ──────────────────────────────────────────────────────────────
  server.prompt(
    "nutrition_advice",
    "Review the user's recent nutrition data and provide personalized advice aligned with their training and body composition goal.",
    {
      days: z
        .number()
        .int()
        .min(3)
        .max(30)
        .default(7)
        .describe("Days of nutrition history to review (default 7)"),
    },
    ({ days }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Please review my nutrition for the last ${days} days and give me personalized advice.`,
              "",
              "Gather this data:",
              "1. Use `cal_get_nutrition_goals` to see my macro targets and body goal",
              `2. Use \`cal_get_nutrition_summary\` with from_date=${days} days ago to see daily averages vs goals`,
              "3. Use `cal_list_nutrition_entries` to see specific meal patterns",
              "4. Use `cal_get_settings` to know my current training phase",
              "5. Use `cal_list_sessions` (last 7 days) to correlate nutrition with training days",
              "",
              "Provide:",
              "- **Macro adherence**: Am I consistently hitting protein/calorie targets?",
              "- **Meal timing**: Are my meals distributed well around training sessions?",
              "- **Goal alignment**: Is my intake aligned with my stated goal (muscle gain / fat loss / etc.)?",
              "- **Specific improvements**: 3 concrete changes I can make this week",
              "- **Sample meal adjustments**: If I'm short on protein, suggest what to add",
            ].join("\n"),
          },
        },
      ],
    })
  );
}
