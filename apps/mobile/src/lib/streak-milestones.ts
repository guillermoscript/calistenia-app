import AsyncStorage from '@react-native-async-storage/async-storage'

export const MILESTONES = [7, 14, 30, 60, 100] as const

const storageKey = (userId: string) => `streak_milestones_${userId}`

/** Highest milestone <= streak not yet shown; null if none. */
export function getActiveMilestone(streak: number, shown: number[]): number | null {
  return (
    [...MILESTONES]
      .reverse()
      .find((m) => streak >= m && !shown.includes(m)) ?? null
  )
}

export async function getShownMilestones(userId: string): Promise<number[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId))
    if (!raw) return []
    return JSON.parse(raw) as number[]
  } catch {
    return []
  }
}

export async function markMilestoneShown(userId: string, milestone: number): Promise<void> {
  try {
    const current = await getShownMilestones(userId)
    if (!current.includes(milestone)) {
      await AsyncStorage.setItem(storageKey(userId), JSON.stringify([...current, milestone]))
    }
  } catch {
    // best-effort
  }
}

export async function isMilestoneShown(userId: string, milestone: number): Promise<boolean> {
  const shown = await getShownMilestones(userId)
  return shown.includes(milestone)
}
