/**
 * Canonical muscle-group taxonomy.
 *
 * Every catalog entry carries `muscle_groups: string[]` (baked at build time
 * by scripts/build-exercise-catalog.mjs from target_muscle/secondary_muscles
 * enums plus the free-text `muscles` field). Apps filter on these ids and
 * label them via i18n — use t(getMuscleGroupLabelKey(id)) in consumers.
 *
 * Keep the id list in sync with MUSCLE_GROUP_ORDER in the build script.
 */

export const MUSCLE_GROUPS = [
  'pecho', 'hombros', 'triceps', 'biceps', 'antebrazos', 'espalda', 'core',
  'lumbar', 'gluteos', 'cuadriceps', 'isquios', 'pantorrillas', 'cadera',
  'cuello', 'cardio',
] as const

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

export function getMuscleGroupLabelKey(id: string): string {
  return `muscleGroup.${id}`
}

/** muscle_groups of a catalog entry, [] when the field is absent (e.g. old
 *  PB records or user-created exercises). */
export function getMuscleGroups(exercise: { muscle_groups?: string[] }): string[] {
  return Array.isArray(exercise.muscle_groups) ? exercise.muscle_groups : []
}

// ── Texto libre → taxonomía ──────────────────────────────────────────────────

/**
 * Diccionario token → grupo canónico, ES/EN, sin acentos (el texto se
 * normaliza antes de comparar). Un token casa si EMPIEZA por la clave
 * («pectorales» → «pectoral», «hamstrings» → «hamstring»). Las claves con
 * `exact: true` sólo casan el token entero: «lat» no puede tragarse
 * «lateral» (deltoide lateral no es espalda) ni «abs» a «absoluto».
 */
const MUSCLE_TOKEN_MAP: ReadonlyArray<readonly [string, MuscleGroup, boolean?]> = [
  ['pectoral', 'pecho'], ['pecho', 'pecho'], ['chest', 'pecho'],
  ['dorsal', 'espalda'], ['espalda', 'espalda'], ['back', 'espalda'], ['lat', 'espalda', true], ['lats', 'espalda', true], ['latissimus', 'espalda'], ['romboide', 'espalda'], ['rhomboid', 'espalda'],
  ['hombro', 'hombros'], ['deltoid', 'hombros'], ['deltoide', 'hombros'], ['shoulder', 'hombros'],
  ['tricep', 'triceps'],
  ['bicep', 'biceps'],
  ['antebrazo', 'antebrazos'], ['forearm', 'antebrazos'], ['grip', 'antebrazos'], ['agarre', 'antebrazos'],
  ['abdominal', 'core'], ['abs', 'core', true], ['oblicuo', 'core'], ['oblique', 'core'], ['core', 'core'],
  ['lumbar', 'lumbar'], ['erector', 'lumbar'],
  ['gluteo', 'gluteos'], ['glute', 'gluteos'],
  ['cuadricep', 'cuadriceps'], ['quad', 'cuadriceps'],
  ['isquio', 'isquios'], ['hamstring', 'isquios'], ['femoral', 'isquios'],
  ['pantorrilla', 'pantorrillas'], ['calf', 'pantorrillas'], ['calves', 'pantorrillas'], ['soleo', 'pantorrillas'], ['gemelo', 'pantorrillas'],
  ['cadera', 'cadera'], ['hip', 'cadera'], ['flexor', 'cadera'],
  ['cuello', 'cuello'], ['neck', 'cuello'], ['trapecio', 'cuello'], ['trapez', 'cuello'], ['trap', 'cuello', true], ['traps', 'cuello', true],
  ['cardio', 'cardio'], ['aerobic', 'cardio'], ['aerobico', 'cardio'],
]

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Grupos canónicos mencionados en un texto libre de músculos («Pecho, tríceps
 * (cabeza larga)», «Lats / biceps»). Devuelve ids únicos en el orden de
 * `MUSCLE_GROUPS`; [] si no reconoce nada. Es el último recurso del resolver
 * de ejercicios para las series de programa, cuyo ejercicio no está en el
 * catálogo y sólo trae `muscles` como texto.
 */
export function muscleTokensToGroups(text: string | null | undefined): MuscleGroup[] {
  if (!text) return []
  const found = new Set<MuscleGroup>()
  // «lower back» son dos palabras y «back» solo diría espalda: se colapsa antes.
  const clean = stripAccents(text.toLowerCase()).replace(/lower\s+back/g, 'lumbar')
  for (const token of clean.split(/[,\s/()+;.·]+/)) {
    if (!token) continue
    for (const [needle, group, exact] of MUSCLE_TOKEN_MAP) {
      if (exact ? token === needle : token.startsWith(needle)) { found.add(group); break }
    }
  }
  return MUSCLE_GROUPS.filter(g => found.has(g))
}
