/**
 * Output schema of `cal_get_achievements` — the props the `achievements-grid`
 * View renders.
 */
import { z } from "zod";

const achievementSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  description: z.string(),
  category: z.string(),
  tier: z.string(),
  xp_reward: z.number(),
  unlocked: z.boolean(),
  progress_pct: z.number(),
  unlocked_at: z.string().nullable(),
});

export const achievementsGridPropsSchema = z.object({
  total_unlocked: z.number(),
  total: z.number(),
  xp: z.number().optional(),
  level: z.number().optional(),
  xp_to_next_level: z.number().optional(),
  level_progress_pct: z.number().optional(),
  achievements: z.array(achievementSchema),
});

export type AchievementsGridProps = z.infer<typeof achievementsGridPropsSchema>;
