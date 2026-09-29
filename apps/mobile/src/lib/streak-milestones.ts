/**
 * Hitos de racha SEMANAL (4, 8, 12, 26 y 52 semanas cumpliendo el objetivo)
 * del inicio móvil (#858). Cuál toca lo decide core (`pickActiveMilestone`);
 * aquí solo se apunta, por usuario y dispositivo, cuáles ya se enseñaron.
 *
 * Clave nueva a propósito: la vieja (`streak_milestones_<uid>`) guardaba los
 * hitos en DÍAS, y un «14» ya enseñado no dice nada de las semanas.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { pickActiveMilestone } from '@calistenia/core/lib/streak-milestones'
import { WEEKLY_STREAK_MILESTONES } from '@calistenia/core/lib/weeklyStreak'

const storageKey = (userId: string) => `streak_week_milestones_${userId}`

/** Hito semanal más alto ya alcanzado y sin enseñar, o null. */
export function getActiveWeeklyMilestone(weeks: number, shown: number[]): number | null {
  return pickActiveMilestone(weeks, (m) => shown.includes(m), WEEKLY_STREAK_MILESTONES)
}

export async function getShownWeeklyMilestones(userId: string): Promise<number[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId))
    return raw ? (JSON.parse(raw) as number[]) : []
  } catch {
    return []
  }
}

export async function markWeeklyMilestoneShown(userId: string, milestone: number): Promise<void> {
  try {
    const current = await getShownWeeklyMilestones(userId)
    if (!current.includes(milestone)) {
      await AsyncStorage.setItem(storageKey(userId), JSON.stringify([...current, milestone]))
    }
  } catch {
    // best-effort
  }
}
