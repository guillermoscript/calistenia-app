/**
 * Saneado de `day_id` en las filas de un programa (#575).
 *
 * La app modela la semana con `DayId` (`lun..dom`). Doce de los trece programas
 * oficiales se subieron con `day_id` abstractos (`d1..d6`); `buildWeekDays`
 * los descartaba en silencio y el usuario veía una semana de solo sáb/dom de
 * descanso, sin nada que entrenar. Los datos ya están normalizados en
 * `programs/*.json` (`scripts/normalize-program-days.mjs`), pero la app no
 * puede depender de que prod esté al día: aquí se remapea en lectura, por
 * fase, a la misma distribución que usa el script, y se avisa para que el
 * dato se arregle en origen.
 */

export const DAY_IDS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'] as const
export type KnownDayId = (typeof DAY_IDS)[number]

/** Distribución semanal por nº de días entrenables. Igual que en el script. */
export const DAY_LAYOUT: Record<number, readonly KnownDayId[]> = {
  1: ['lun'],
  2: ['lun', 'jue'],
  3: ['lun', 'mie', 'vie'],
  4: ['lun', 'mar', 'jue', 'vie'],
  5: ['lun', 'mar', 'mie', 'jue', 'vie'],
  6: ['lun', 'mar', 'mie', 'jue', 'vie', 'sab'],
  7: DAY_IDS,
}

export interface DayRowLike {
  day_id: string
  phase_number: number
  sort_order?: number
}

export interface NormalizeResult<E, D> {
  exercises: E[]
  dayConfigs: D[]
  /** `phase → { legacyId → DayId }` de lo que hubo que remapear. Vacío si todo estaba bien. */
  remapped: Record<number, Record<string, KnownDayId>>
}

export function isKnownDayId(id: string): id is KnownDayId {
  return (DAY_IDS as readonly string[]).includes(id)
}

/** Orden natural de ids legacy: `d1 < d2 < d10`; si no son `dN`, por primera aparición. */
function legacyOrder(a: string, b: string): number {
  const na = /^d(\d+)$/.exec(a)
  const nb = /^d(\d+)$/.exec(b)
  if (na && nb) return Number(na[1]) - Number(nb[1])
  return 0
}

/**
 * Devuelve copias de las filas con `day_id` válido. No muta la entrada.
 * Las filas con ids ya válidos no se tocan; por fase, los ids desconocidos se
 * ordenan y se asignan a `DAY_LAYOUT[n]` saltando los días que la fase ya use.
 */
export function normalizeProgramDayIds<E extends DayRowLike, D extends DayRowLike>(
  exercises: E[],
  dayConfigs: D[],
): NormalizeResult<E, D> {
  const byPhase = new Map<number, { known: Set<string>; legacy: string[] }>()
  const visit = (r: DayRowLike) => {
    let p = byPhase.get(r.phase_number)
    if (!p) { p = { known: new Set(), legacy: [] }; byPhase.set(r.phase_number, p) }
    if (isKnownDayId(r.day_id)) p.known.add(r.day_id)
    else if (!p.legacy.includes(r.day_id)) p.legacy.push(r.day_id)
  }
  dayConfigs.forEach(visit)
  exercises.forEach(visit)

  const remapped: Record<number, Record<string, KnownDayId>> = {}
  for (const [phase, { known, legacy }] of byPhase) {
    if (!legacy.length) continue
    const sorted = [...legacy].sort(legacyOrder)
    const wanted = Math.min(7, sorted.length + known.size)
    const layout = (DAY_LAYOUT[wanted] ?? DAY_IDS).filter(id => !known.has(id))
    const free = layout.length >= sorted.length ? layout : DAY_IDS.filter(id => !known.has(id))
    const map: Record<string, KnownDayId> = {}
    sorted.forEach((legacyId, i) => { if (free[i]) map[legacyId] = free[i] })
    remapped[phase] = map
  }

  if (!Object.keys(remapped).length) return { exercises, dayConfigs, remapped }

  const fix = <R extends DayRowLike>(r: R): R => {
    const to = remapped[r.phase_number]?.[r.day_id]
    return to ? { ...r, day_id: to } : r
  }
  return { exercises: exercises.map(fix), dayConfigs: dayConfigs.map(fix), remapped }
}
