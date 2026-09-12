import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { storage } from '../platform'
import { todayStr } from './dateUtils'
import type { ProgressMap, Settings } from '../types'

/**
 * Caché compartida de progreso: localStorage (autoritativo, arranque offline) +
 * la query de TanStack (`qk.sessions(userId, activeProgramId)`).
 *
 * Vive en lib para que `useProgress` (lectura), `useProgressMutations` y
 * `usePRs` escriban EXACTAMENTE el mismo blob local y la misma entrada de
 * caché, sin depender unos de otros.
 */

export const PROGRESS_LS_KEY = 'calistenia_progress'
export const SETTINGS_LS_KEY = 'calistenia_settings'

export const DEFAULT_SETTINGS: Settings = { phase: 1, startDate: null, weeklyGoal: 5 }

/** Shape de la query combinada: progreso + settings derivados de PB/LS. */
export interface ProgressData { progress: ProgressMap; settings: Settings }

export const lsGetProgress = (): ProgressMap => {
  try { return JSON.parse(storage.getItem(PROGRESS_LS_KEY) || '{}') } catch { return {} }
}
export const lsSetProgress = (d: ProgressMap): void => { storage.setItem(PROGRESS_LS_KEY, JSON.stringify(d)) }

export const lsGetSettings = (): Settings => {
  try { return JSON.parse(storage.getItem(SETTINGS_LS_KEY) || '{"phase":1,"startDate":null,"weeklyGoal":5}') }
  catch { return { ...DEFAULT_SETTINGS } }
}
export const lsSetSettings = (d: Settings): void => { storage.setItem(SETTINGS_LS_KEY, JSON.stringify(d)) }

/** Garantiza startDate en settings local (igual que loadFromLS previo). */
const YMD = /^\d{4}-\d{2}-\d{2}$/

/**
 * Garantiza un `startDate` YYYY-MM-DD válido. También REPARA uno inválido:
 * la v1.12.1 (vc37) corría con un dayjs que devolvía «Invalid Date» en Hermes
 * y lo dejó persistido en localStorage y en la caché de React Query; al
 * rehidratarlo, `diffDays(todayStr(), 'Invalid Date')` tumbaba la Home.
 */
export const ensureStartDate = (s: Settings): Settings => {
  if (!s.startDate || !YMD.test(s.startDate)) {
    const today = todayStr()
    s.startDate = YMD.test(today) ? today : new Date().toISOString().slice(0, 10)
    lsSetSettings(s)
  }
  return s
}

/** Aplica `updater` al progreso en la caché de la query Y en localStorage. */
export function patchProgressData(qc: QueryClient, key: QueryKey, updater: (prev: ProgressMap) => ProgressMap): void {
  qc.setQueryData<ProgressData>(key, (old) => {
    const prevProg = old?.progress ?? lsGetProgress()
    const newProg = updater(prevProg)
    lsSetProgress(newProg)
    return { progress: newProg, settings: old?.settings ?? lsGetSettings() }
  })
}

/** Aplica `updater` a los settings en la caché de la query Y en localStorage. */
export function patchSettingsData(qc: QueryClient, key: QueryKey, updater: (prev: Settings) => Settings): Settings {
  let updated!: Settings
  qc.setQueryData<ProgressData>(key, (old) => {
    const prev = old?.settings ?? lsGetSettings()
    updated = updater(prev)
    lsSetSettings(updated)
    return { progress: old?.progress ?? lsGetProgress(), settings: updated }
  })
  return updated
}
