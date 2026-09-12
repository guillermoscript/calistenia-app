/**
 * normalizeRestoredWorkout — repasar el ENTRENO CONGELADO de una sesión a
 * medias cada vez que se restaura (#690).
 *
 * Por qué hace falta: una sesión en curso no es una consulta, es un snapshot.
 * `useActiveSessionState` persiste el objeto `Workout` entero (storage local +
 * el registro `active_sessions` de PocketBase) y lo relee tal cual al montar;
 * durante toda la sesión NADIE vuelve a pasar por `usePrograms`. Así que las
 * dos reparaciones del #690 —el nombre de catálogo en vez del slug
 * («arm_circles» → «Arm Circles») y el cronómetro deducido de un `reps` que es
 * una duración («30-45 seg»)— sólo llegan a los entrenos que se construyen
 * DESPUÉS del despliegue. Una sesión empezada antes se queda con los nombres
 * crudos y sin cronómetro hasta que se termina o caduca a las 24 h, en
 * cualquier dispositivo y con el bundle nuevo.
 *
 * La cura es barata: al restaurar (del storage o del server) se vuelve a pasar
 * el snapshot por los mismos dos resolutores que usa `buildWorkoutsMap`. Es
 * puro, síncrono y no depende de la red.
 *
 * **`id` NO se toca, nunca.** Es la clave con la que se registran series, PRs y
 * overrides de descanso; cambiarlo partiría el historial de la sesión en curso.
 * Aquí sólo se corrige lo que se PINTA (`name`) y lo que decide si sale el
 * cronómetro (`isTimer`/`timerSeconds`), exactamente igual que en
 * `usePrograms.buildWorkoutsMap`.
 *
 * Cuando no hay nada que corregir se devuelve **la misma referencia** de
 * entrada: el `workout` va en el `useMemo` del contexto y en las deps del
 * efecto que persiste, así que un objeto nuevo en cada montaje re-renderizaría
 * media app y reescribiría el storage sin motivo.
 */
import i18n from 'i18next'
import type { CircuitDefinition, CircuitExercise, Exercise, Workout } from '../../types'
import { resolveExerciseDisplayName, resolveExerciseNameField } from '../../lib/exercise-resolver'
import { inferTimerFromReps } from '../../lib/exercise-timer-inference'

/**
 * Un ejercicio del snapshot, repasado. Devuelve el MISMO objeto si ya estaba
 * bien, que es el caso normal.
 *
 * `ex.name` aquí ya es un string localizado (así lo deja `buildWorkoutsMap`),
 * no el campo `{es,en}` de PocketBase; `resolveExerciseDisplayName` acepta las
 * dos formas y deja intacto cualquier nombre escrito por una persona.
 */
function normalizeExercise(ex: Exercise, locale: string): Exercise {
  const name = resolveExerciseDisplayName(ex.name, ex.id, locale)
  // Mismo cinturón que en `buildWorkoutsMap`: sólo se deduce cuando la fila
  // dice que NO es por tiempo. Un `timerSeconds` ya guardado manda sobre lo
  // deducido — el snapshot puede traer una duración editada a mano.
  const inferred = ex.isTimer ? null : inferTimerFromReps(ex.reps)
  const isTimer = ex.isTimer || !!inferred
  const timerSeconds = inferred ? (ex.timerSeconds || inferred.timerSeconds) : ex.timerSeconds

  if (name === ex.name && isTimer === !!ex.isTimer && timerSeconds === ex.timerSeconds) return ex
  return { ...ex, name, isTimer, timerSeconds }
}

/**
 * El `Workout` de una sesión de fuerza restaurada, con nombres y cronómetros
 * al día. Misma referencia si ningún ejercicio cambió.
 */
export function normalizeRestoredWorkout(workout: Workout, locale: string = i18n.language): Workout {
  const exercises = workout.exercises
  if (!Array.isArray(exercises) || exercises.length === 0) return workout
  let changed = false
  const next = exercises.map(ex => {
    const norm = normalizeExercise(ex, locale)
    if (norm !== ex) changed = true
    return norm
  })
  return changed ? { ...workout, exercises: next } : workout
}

/** `normalizeRestoredWorkout` tolerante a un snapshot ausente. */
export function normalizeRestoredWorkoutOrNull(
  workout: Workout | null | undefined,
  locale: string = i18n.language,
): Workout | null {
  if (!workout) return null
  return normalizeRestoredWorkout(workout, locale)
}

/**
 * Lo mismo para el circuito activo, que persiste una `CircuitDefinition`
 * entera y sufre el #690 por la misma vía.
 *
 * Dos diferencias con el entreno de fuerza: aquí `name` sigue siendo el campo
 * `{es,en}` sin localizar (así lo deja `toCircuitExercises`, para que el idioma
 * no se congele), y el trabajo por estación no es `timerSeconds` sino
 * `workSecondsOverride`. Una estación que ya trae override se deja como está.
 */
function normalizeCircuitExercise(ex: CircuitExercise): CircuitExercise {
  const name = resolveExerciseNameField(ex.name, ex.exerciseId)
  const inferred = ex.workSecondsOverride ? null : inferTimerFromReps(ex.reps)
  if (name === ex.name && !inferred) return ex
  const next: CircuitExercise = { ...ex, name }
  if (inferred) next.workSecondsOverride = inferred.timerSeconds
  return next
}

/** La `CircuitDefinition` restaurada, repasada. Misma referencia si no cambió. */
export function normalizeRestoredCircuit(circuit: CircuitDefinition): CircuitDefinition {
  const exercises = circuit.exercises
  if (!Array.isArray(exercises) || exercises.length === 0) return circuit
  let changed = false
  const next = exercises.map(ex => {
    const norm = normalizeCircuitExercise(ex)
    if (norm !== ex) changed = true
    return norm
  })
  return changed ? { ...circuit, exercises: next } : circuit
}
