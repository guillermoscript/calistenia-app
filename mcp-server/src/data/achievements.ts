/**
 * Achievement definitions — the single source of truth.
 * Synced to PocketBase `achievements` collection via `cal_sync_stats`.
 *
 * requirement_type values are used by the stat-checker to evaluate progress.
 * requirement_value is the threshold (e.g., 10 sessions, 7-day streak).
 */

export interface AchievementDef {
  key: string;
  name: string;
  description: string;
  category: "consistency" | "strength" | "health" | "nutrition" | "milestone";
  icon: string;
  tier: "bronze" | "silver" | "gold" | "diamond";
  requirement_type: string;
  requirement_value: number;
  xp_reward: number;
  sort_order: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // ── Consistency ─────────────────────────────────────────────
  {
    key: "first_session",
    name: "First Step",
    description: "Complete your first workout session",
    category: "consistency",
    icon: "🏁",
    tier: "bronze",
    requirement_type: "total_sessions",
    requirement_value: 1,
    xp_reward: 50,
    sort_order: 1,
  },
  {
    key: "sessions_10",
    name: "Getting Serious",
    description: "Complete 10 workout sessions",
    category: "consistency",
    icon: "💪",
    tier: "bronze",
    requirement_type: "total_sessions",
    requirement_value: 10,
    xp_reward: 100,
    sort_order: 2,
  },
  {
    key: "sessions_50",
    name: "Half Century",
    description: "Complete 50 workout sessions",
    category: "consistency",
    icon: "🔥",
    tier: "silver",
    requirement_type: "total_sessions",
    requirement_value: 50,
    xp_reward: 250,
    sort_order: 3,
  },
  {
    key: "sessions_100",
    name: "Century Club",
    description: "Complete 100 workout sessions",
    category: "consistency",
    icon: "💯",
    tier: "gold",
    requirement_type: "total_sessions",
    requirement_value: 100,
    xp_reward: 500,
    sort_order: 4,
  },
  {
    key: "sessions_365",
    name: "Year of Iron",
    description: "Complete 365 workout sessions",
    category: "consistency",
    icon: "👑",
    tier: "diamond",
    requirement_type: "total_sessions",
    requirement_value: 365,
    xp_reward: 1500,
    sort_order: 5,
  },
  {
    key: "weekly_goal_1",
    name: "Week Warrior",
    description: "Hit your weekly workout goal for the first time",
    category: "consistency",
    icon: "🎯",
    tier: "bronze",
    requirement_type: "weekly_goals_hit",
    requirement_value: 1,
    xp_reward: 100,
    sort_order: 6,
  },
  {
    key: "weekly_goal_4",
    name: "Month Strong",
    description: "Hit your weekly workout goal 4 weeks in a row",
    category: "consistency",
    icon: "📅",
    tier: "silver",
    requirement_type: "weekly_goals_hit",
    requirement_value: 4,
    xp_reward: 300,
    sort_order: 7,
  },
  {
    key: "weekly_goal_12",
    name: "Quarter Beast",
    description: "Hit your weekly workout goal 12 weeks in a row",
    category: "consistency",
    icon: "⚡",
    tier: "gold",
    requirement_type: "weekly_goals_hit",
    requirement_value: 12,
    xp_reward: 750,
    sort_order: 8,
  },
  {
    key: "workout_streak_7",
    name: "Iron Week",
    description: "Train 7 days in a row",
    category: "consistency",
    icon: "🔗",
    tier: "silver",
    requirement_type: "workout_streak_best",
    requirement_value: 7,
    xp_reward: 200,
    sort_order: 9,
  },
  {
    key: "workout_streak_30",
    name: "Unstoppable",
    description: "Train 30 days in a row",
    category: "consistency",
    icon: "🦾",
    tier: "diamond",
    requirement_type: "workout_streak_best",
    requirement_value: 30,
    xp_reward: 1000,
    sort_order: 10,
  },

  // ── Strength ────────────────────────────────────────────────
  {
    key: "sets_100",
    name: "Rep Machine",
    description: "Log 100 exercise sets",
    category: "strength",
    icon: "🏋️",
    tier: "bronze",
    requirement_type: "total_sets",
    requirement_value: 100,
    xp_reward: 100,
    sort_order: 20,
  },
  {
    key: "sets_500",
    name: "Volume King",
    description: "Log 500 exercise sets",
    category: "strength",
    icon: "🏆",
    tier: "silver",
    requirement_type: "total_sets",
    requirement_value: 500,
    xp_reward: 300,
    sort_order: 21,
  },
  {
    key: "sets_2000",
    name: "Iron Will",
    description: "Log 2000 exercise sets",
    category: "strength",
    icon: "⭐",
    tier: "gold",
    requirement_type: "total_sets",
    requirement_value: 2000,
    xp_reward: 750,
    sort_order: 22,
  },
  {
    key: "sets_10000",
    name: "Legendary",
    description: "Log 10,000 exercise sets",
    category: "strength",
    icon: "🌟",
    tier: "diamond",
    requirement_type: "total_sets",
    requirement_value: 10000,
    xp_reward: 2000,
    sort_order: 23,
  },

  // ── Health ──────────────────────────────────────────────────
  {
    key: "lumbar_first",
    name: "Body Aware",
    description: "Log your first lumbar health check",
    category: "health",
    icon: "🩺",
    tier: "bronze",
    requirement_type: "total_lumbar_checks",
    requirement_value: 1,
    xp_reward: 50,
    sort_order: 30,
  },
  {
    key: "lumbar_30",
    name: "Recovery Pro",
    description: "Log 30 lumbar health checks",
    category: "health",
    icon: "🧘",
    tier: "silver",
    requirement_type: "total_lumbar_checks",
    requirement_value: 30,
    xp_reward: 200,
    sort_order: 31,
  },
  {
    key: "weight_first",
    name: "Scale Step",
    description: "Log your first weight measurement",
    category: "health",
    icon: "⚖️",
    tier: "bronze",
    requirement_type: "total_weight_logs",
    requirement_value: 1,
    xp_reward: 50,
    sort_order: 32,
  },
  {
    key: "weight_30",
    name: "Weight Watcher",
    description: "Log weight 30 times",
    category: "health",
    icon: "📊",
    tier: "silver",
    requirement_type: "total_weight_logs",
    requirement_value: 30,
    xp_reward: 200,
    sort_order: 33,
  },

  // ── Nutrition ───────────────────────────────────────────────
  {
    key: "nutrition_first",
    name: "Fuel Up",
    description: "Log your first meal",
    category: "nutrition",
    icon: "🍎",
    tier: "bronze",
    requirement_type: "total_nutrition_logs",
    requirement_value: 1,
    xp_reward: 50,
    sort_order: 40,
  },
  {
    key: "nutrition_50",
    name: "Macro Tracker",
    description: "Log 50 meals",
    category: "nutrition",
    icon: "🥗",
    tier: "silver",
    requirement_type: "total_nutrition_logs",
    requirement_value: 50,
    xp_reward: 200,
    sort_order: 41,
  },
  {
    key: "nutrition_200",
    name: "Nutrition Master",
    description: "Log 200 meals",
    category: "nutrition",
    icon: "🧬",
    tier: "gold",
    requirement_type: "total_nutrition_logs",
    requirement_value: 200,
    xp_reward: 500,
    sort_order: 42,
  },
  {
    key: "nutrition_streak_7",
    name: "Meal Prep Mind",
    description: "Log meals 7 days in a row",
    category: "nutrition",
    icon: "📋",
    tier: "silver",
    requirement_type: "nutrition_streak_best",
    requirement_value: 7,
    xp_reward: 200,
    sort_order: 43,
  },
  {
    key: "nutrition_streak_30",
    name: "Fuel Machine",
    description: "Log meals 30 days in a row",
    category: "nutrition",
    icon: "🔋",
    tier: "gold",
    requirement_type: "nutrition_streak_best",
    requirement_value: 30,
    xp_reward: 500,
    sort_order: 44,
  },

  // ── Milestones ──────────────────────────────────────────────
  {
    key: "xp_500",
    name: "Rising Star",
    description: "Earn 500 XP",
    category: "milestone",
    icon: "⬆️",
    tier: "bronze",
    requirement_type: "xp",
    requirement_value: 500,
    xp_reward: 0, // no infinite loop
    sort_order: 50,
  },
  {
    key: "xp_2000",
    name: "Dedicated",
    description: "Earn 2,000 XP",
    category: "milestone",
    icon: "🌤️",
    tier: "silver",
    requirement_type: "xp",
    requirement_value: 2000,
    xp_reward: 0,
    sort_order: 51,
  },
  {
    key: "xp_5000",
    name: "Elite",
    description: "Earn 5,000 XP",
    category: "milestone",
    icon: "🌟",
    tier: "gold",
    requirement_type: "xp",
    requirement_value: 5000,
    xp_reward: 0,
    sort_order: 52,
  },
  {
    key: "xp_15000",
    name: "Legend",
    description: "Earn 15,000 XP",
    category: "milestone",
    icon: "👑",
    tier: "diamond",
    requirement_type: "xp",
    requirement_value: 15000,
    xp_reward: 0,
    sort_order: 53,
  },
  {
    key: "achievements_5",
    name: "Collector",
    description: "Unlock 5 achievements",
    category: "milestone",
    icon: "🏅",
    tier: "bronze",
    requirement_type: "achievements_unlocked",
    requirement_value: 5,
    xp_reward: 100,
    sort_order: 54,
  },
  {
    key: "achievements_15",
    name: "Completionist",
    description: "Unlock 15 achievements",
    category: "milestone",
    icon: "🎖️",
    tier: "silver",
    requirement_type: "achievements_unlocked",
    requirement_value: 15,
    xp_reward: 300,
    sort_order: 55,
  },
];

// ── XP constants ──────────────────────────────────────────────
export const XP_PER_SESSION = 50;
export const XP_PER_SET = 5;
export const XP_PER_NUTRITION_LOG = 20;
export const XP_PER_LUMBAR_CHECK = 10;
export const XP_PER_WEIGHT_LOG = 10;
export const XP_PER_WEEKLY_GOAL = 100;

/** Level formula: level = floor(sqrt(xp / 100)) + 1 */
export function xpToLevel(xp: number): number {
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

/** XP needed for next level */
export function xpForLevel(level: number): number {
  return (level - 1) * (level - 1) * 100;
}
