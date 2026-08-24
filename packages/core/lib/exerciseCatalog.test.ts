import { describe, it, expect } from 'vitest'
import {
  catalogExerciseIdentity,
  countSetsLoggedFor,
  inferCategory,
  mapCatalogIndexEntry,
  mapCatalogRecord,
  mapWorkoutExercise,
  mergeCatalogRecords,
} from './exerciseCatalog'
import type { ExerciseLog } from '../types'

/**
 * `exercises_catalog` tiene un campo `difficulty_level` desde la migración
 * `1774378000_add_difficulty_level_to_exercises_catalog.js`. La copia del mapper
 * que vivía en `ExerciseLibraryPage.tsx:269` lo leía; la de
 * `ExerciseDetailPage.tsx:210-228` no, y su tipo `CatalogExercise` ni siquiera
 * declaraba el campo — así que en la página de detalle el dato se perdía en
 * silencio. Estos dos tests son los que fallaban antes del arreglo (#474).
 */
describe('mapCatalogRecord — difficulty (regresión #474)', () => {
  it('conserva difficulty_level del registro de PocketBase', () => {
    const mapped = mapCatalogRecord({
      id: 'pb_rand_id_0001',
      slug: 'pull_ups',
      name: { es: 'Dominadas', en: 'Pull-ups' },
      difficulty_level: 'advanced',
    })

    expect(mapped.difficulty).toBe('advanced')
  })

  it('deja difficulty sin definir cuando el registro no lo trae', () => {
    const mapped = mapCatalogRecord({ id: 'x', slug: 'x', name: 'X' })

    expect(mapped.difficulty).toBeUndefined()
  })
})

describe('mapCatalogRecord', () => {
  it('mapea los campos default_* a sets/reps/rest', () => {
    const mapped = mapCatalogRecord({
      id: 'a', slug: 'a', name: 'A',
      default_sets: 5, default_reps: '3-5', default_rest_seconds: 120,
    })

    expect(mapped.sets).toBe(5)
    expect(mapped.reps).toBe('3-5')
    expect(mapped.rest).toBe(120)
  })

  it('aplica los valores por defecto cuando faltan los default_*', () => {
    const mapped = mapCatalogRecord({ id: 'a', slug: 'a', name: 'A' })

    expect(mapped.sets).toBe(3)
    expect(mapped.reps).toBe('8-12')
    expect(mapped.rest).toBe(90)
    expect(mapped.priority).toBe('med')
  })

  it('respeta un default_sets de 0 en vez de tratarlo como ausente', () => {
    const mapped = mapCatalogRecord({ id: 'a', slug: 'a', name: 'A', default_sets: 0, default_rest_seconds: 0 })

    expect(mapped.sets).toBe(0)
    expect(mapped.rest).toBe(0)
  })

  // Antes: `note: rec.note ?? ''` en el detalle hacía que un note vacío ganase
  // sobre description; en la librería la precedencia era la contraria.
  it('cae de note a description y al contrario, sin que un vacío gane', () => {
    const soloDescription = mapCatalogRecord({ id: 'a', slug: 'a', name: 'A', note: '', description: 'Desde muerto' })
    expect(soloDescription.note).toBe('Desde muerto')
    expect(soloDescription.description).toBe('Desde muerto')

    const soloNote = mapCatalogRecord({ id: 'a', slug: 'a', name: 'A', note: 'Codos pegados' })
    expect(soloNote.note).toBe('Codos pegados')
    expect(soloNote.description).toBe('Codos pegados')

    const ambos = mapCatalogRecord({ id: 'a', slug: 'a', name: 'A', note: 'Nota', description: 'Descripción' })
    expect(ambos.note).toBe('Nota')
    expect(ambos.description).toBe('Descripción')
  })

  it('normaliza default_images escalar y array a demoImages', () => {
    expect(mapCatalogRecord({ id: 'a', slug: 'a', name: 'A', default_images: 'uno.png' }).demoImages).toEqual(['uno.png'])
    expect(mapCatalogRecord({ id: 'a', slug: 'a', name: 'A', default_images: ['uno.png', 'dos.png'] }).demoImages)
      .toEqual(['uno.png', 'dos.png'])
    expect(mapCatalogRecord({ id: 'a', slug: 'a', name: 'A' }).demoImages).toBeUndefined()
  })

  it('deduce la categoría cuando el registro no la trae, en vez de asumir full', () => {
    const mapped = mapCatalogRecord({ id: 'a', slug: 'a', name: { es: 'Dominadas australianas', en: 'Australian pull-ups' } })

    expect(mapped.category).toBe('pull')
  })

  it('respeta la categoría explícita del registro', () => {
    const mapped = mapCatalogRecord({ id: 'a', slug: 'a', name: 'Dominadas', category: 'skill' })

    expect(mapped.category).toBe('skill')
  })

  // Un array vacío es «no hay dato», no «este ejercicio no usa material»: si se
  // propaga, getExerciseEquipment() lo da por bueno y se salta su detección.
  it('ignora equipment y muscle_groups vacíos', () => {
    const vacios = mapCatalogRecord({ id: 'a', slug: 'a', name: 'A', equipment: [], muscle_groups: [] })
    expect(vacios.equipment).toBeUndefined()
    expect(vacios.muscle_groups).toBeUndefined()

    const conDatos = mapCatalogRecord({ id: 'a', slug: 'a', name: 'A', equipment: ['barra'], muscle_groups: ['lats'] })
    expect(conDatos.equipment).toEqual(['barra'])
    expect(conDatos.muscle_groups).toEqual(['lats'])
  })

  it('conserva el id de PocketBase aparte de la identidad canónica', () => {
    const mapped = mapCatalogRecord({ id: 'pb_rand_id_0001', slug: 'un_slug_no_catalogado', name: 'X' })

    expect(mapped.id).toBe('pb_rand_id_0001')
    expect(mapped.slug).toBe('un_slug_no_catalogado')
  })
})

describe('inferCategory', () => {
  it('clasifica skills antes que cualquier otra regla', () => {
    expect(inferCategory({ name: 'Front lever progression', muscles: 'dorsal, core' })).toBe('skill')
    expect(inferCategory({ name: 'Handstand push-up', muscles: 'hombro' })).toBe('skill')
  })

  // La copia de ExerciseLibraryPage mandaba los nombres con «yoga» a movilidad,
  // así que su botón «Yoga» no podía casar nada. Cambio deliberado.
  it('clasifica yoga como yoga y no como movilidad', () => {
    expect(inferCategory({ name: 'Surya Namaskar A' })).toBe('yoga')
    expect(inferCategory({ name: 'Yoga flow matutino' })).toBe('yoga')
    expect(inferCategory({ name: 'Savasana' })).toBe('yoga')
  })

  it('clasifica movilidad', () => {
    expect(inferCategory({ name: "World's greatest stretch" })).toBe('movilidad')
    expect(inferCategory({ name: 'Cat-cow' })).toBe('movilidad')
    expect(inferCategory({ name: 'Thoracic rotation' })).toBe('movilidad')
  })

  it('clasifica core por músculo y por nombre', () => {
    expect(inferCategory({ name: 'Hollow hold' })).toBe('core')
    expect(inferCategory({ name: 'Ejercicio raro', muscles: 'core, oblicuos' })).toBe('core')
  })

  it('clasifica lumbar por dayType, músculo, nombre o nota', () => {
    expect(inferCategory({ name: 'Ejercicio raro' }, 'lumbar')).toBe('lumbar')
    expect(inferCategory({ name: 'Bird-dog' })).toBe('lumbar')
    expect(inferCategory({ name: 'Ejercicio raro', muscles: 'columna' })).toBe('lumbar')
    expect(inferCategory({ name: 'Ejercicio raro', note: 'protocolo lumbar' })).toBe('lumbar')
  })

  // Reglas que sólo tenía ExerciseCatalogPicker: nombres de músculo en español.
  // Con acentos, para comprobar que la normalización los absorbe.
  it('clasifica por nombres de músculo en español, con acentos', () => {
    expect(inferCategory({ name: 'Ejercicio raro', muscles: 'pecho, tríceps' })).toBe('push')
    expect(inferCategory({ name: 'Ejercicio raro', muscles: 'dorsal, bíceps' })).toBe('pull')
    expect(inferCategory({ name: 'Ejercicio raro', muscles: 'cuádriceps, glúteo' })).toBe('legs')
    expect(inferCategory({ name: 'Ejercicio raro', muscles: 'pantorrilla' })).toBe('legs')
  })

  it('clasifica push, pull y legs por nombre', () => {
    expect(inferCategory({ name: 'Diamond push-ups' })).toBe('push')
    expect(inferCategory({ name: 'Fondos en paralelas', muscles: 'pecho' })).toBe('push')
    expect(inferCategory({ name: 'Chin-ups' })).toBe('pull')
    expect(inferCategory({ name: 'Pistol squat' })).toBe('legs')
  })

  it('clasifica full body', () => {
    expect(inferCategory({ name: 'Burpees' })).toBe('full')
    expect(inferCategory({ name: 'Ejercicio raro' }, 'full')).toBe('full')
  })

  it('usa dayType como último recurso y full como fallback final', () => {
    expect(inferCategory({ name: 'Ejercicio raro' }, 'cardio')).toBe('cardio')
    expect(inferCategory({ name: 'Ejercicio raro' })).toBe('full')
    expect(inferCategory({})).toBe('full')
  })

  // Las tres copias mezclaban criterios: dos buscaban palabras inglesas tras
  // localize(field, 'en'), la del picker nombres de músculo en español sobre el
  // string crudo. Con campos {es, en} cada una se quedaba ciega a la mitad.
  it('lee todos los idiomas de un campo traducible, no sólo uno', () => {
    expect(inferCategory({ name: { es: 'Dominadas', en: 'Pull-ups' } })).toBe('pull')
    expect(inferCategory({ name: { en: 'Bulgarian split squat', es: 'Zancada búlgara' } })).toBe('legs')
    expect(inferCategory({ name: { es: 'Ejercicio raro' }, muscles: { es: 'pecho', en: 'chest' } })).toBe('push')
  })

  it('acepta la misma firma que necesitaban los tres llamantes', () => {
    // ExerciseDetailPage / ExerciseLibraryPage: (exercise, dayType)
    expect(inferCategory({ name: 'Ejercicio raro', muscles: '', note: '' }, 'legs')).toBe('legs')
    // ExerciseCatalogPicker: sólo músculos y nombre, sin dayType
    expect(inferCategory({ muscles: 'pecho, tríceps', name: 'Ejercicio raro' })).toBe('push')
  })
})

describe('catalogExerciseIdentity', () => {
  it('prefiere el slug al id aleatorio de PocketBase', () => {
    expect(catalogExerciseIdentity({ id: 'pb_rand_id_0001', slug: 'un_slug_no_catalogado' }))
      .toBe('un_slug_no_catalogado')
  })

  it('cae al id cuando no hay slug', () => {
    expect(catalogExerciseIdentity({ id: 'pb_rand_id_0001' })).toBe('pb_rand_id_0001')
  })

  it('devuelve cadena vacía sin slug ni id', () => {
    expect(catalogExerciseIdentity({})).toBe('')
    expect(catalogExerciseIdentity({ slug: '', id: '' })).toBe('')
  })

  // `exercise_id` no existe en exercises_catalog (no aparece en ninguna
  // migración), así que el `r.exercise_id || r.id` de CircuitBuilder y del
  // picker caía siempre al id aleatorio. Aquí ya no participa.
  it('ignora un exercise_id inventado y usa el slug', () => {
    const rec = { id: 'pb_rand_id_0001', slug: 'un_slug_no_catalogado', exercise_id: 'basura' } as any
    expect(catalogExerciseIdentity(rec)).toBe('un_slug_no_catalogado')
  })

  it('pasa el resultado por resolveExerciseId', () => {
    // resolveExerciseId es conservador: sin coincidencia segura devuelve la
    // entrada intacta, nunca una aproximación.
    expect(catalogExerciseIdentity({ slug: 'esto_no_esta_en_el_catalogo_xyz' }))
      .toBe('esto_no_esta_en_el_catalogo_xyz')
  })
})

describe('countSetsLoggedFor', () => {
  const log = (date: string, workoutKey: string, sets: number): ExerciseLog => ({
    date,
    workoutKey,
    exerciseId: 'pull_ups',
    sets: Array.from({ length: sets }, () => ({ reps: '8', note: '', timestamp: 0 })),
  })

  it('cuenta las series de hoy para este workout', () => {
    expect(countSetsLoggedFor([log('2026-08-17', 'p1_lun', 3)], 'p1_lun', '2026-08-17')).toBe(3)
  })

  it('ignora el histórico de otras fechas', () => {
    const logs = [log('2026-08-17', 'p1_lun', 2), log('2026-08-10', 'p1_lun', 4)]
    expect(countSetsLoggedFor(logs, 'p1_lun', '2026-08-17')).toBe(2)
  })

  it('ignora otros workouts del mismo día', () => {
    const logs = [log('2026-08-17', 'p1_lun', 2), log('2026-08-17', 'p1_mar', 4)]
    expect(countSetsLoggedFor(logs, 'p1_mar', '2026-08-17')).toBe(4)
  })

  it('devuelve 0 sin logs', () => {
    expect(countSetsLoggedFor([], 'p1_lun', '2026-08-17')).toBe(0)
    expect(countSetsLoggedFor(undefined, 'p1_lun', '2026-08-17')).toBe(0)
  })

  it('suma varios logs de la misma fecha y workout', () => {
    const logs = [log('2026-08-17', 'p1_lun', 2), log('2026-08-17', 'p1_lun', 1)]
    expect(countSetsLoggedFor(logs, 'p1_lun', '2026-08-17')).toBe(3)
  })
})

/**
 * Los nombres de columna de `exercises_catalog` salen del esquema real
 * (`pb_migrations/1774000001_created_exercises_catalog.js`). El mapper leía tres
 * con el nombre equivocado —`default_rest`, `timer_seconds` y `demo_video`—, así
 * que **ningún** ejercicio de PB traía descanso ni duración de temporizador: el
 * picker web pintaba el mismo 3×10 · 60s para los 1.578, y la biblioteca y el
 * detalle caían al 90 por defecto (#609).
 */
describe('mapCatalogRecord — nombres reales del esquema (regresión #609)', () => {
  it('lee el descanso de default_rest_seconds', () => {
    const mapped = mapCatalogRecord({ id: 'a', slug: 'a', name: 'A', default_rest_seconds: 45 })

    expect(mapped.rest).toBe(45)
  })

  it('lee la duración del temporizador de default_timer_seconds', () => {
    const mapped = mapCatalogRecord({
      id: 'a', slug: 'a', name: 'A', is_timer: true, default_timer_seconds: 40,
    })

    expect(mapped.isTimer).toBe(true)
    expect(mapped.timerSeconds).toBe(40)
  })

  it('lee el vídeo de demostración de default_video', () => {
    const mapped = mapCatalogRecord({ id: 'a', slug: 'a', name: 'A', default_video: 'demo.mp4' })

    expect(mapped.demoVideo).toBe('demo.mp4')
  })

  it('no se inventa valores desde los nombres viejos', () => {
    const mapped = mapCatalogRecord({
      id: 'a', slug: 'a', name: 'A', default_rest: 45, timer_seconds: 40, demo_video: 'viejo.mp4',
    })

    expect(mapped.rest).toBe(90)
    expect(mapped.timerSeconds).toBeUndefined()
    expect(mapped.demoVideo).toBeUndefined()
  })
})

describe('mapCatalogIndexEntry', () => {
  it('usa el id de la entrada como identidad: el bundle no trae slug', () => {
    const mapped = mapCatalogIndexEntry({ id: 'ab_wheel_rollout', name: 'Ab Wheel Rollout' })

    expect(mapped.id).toBe('ab_wheel_rollout')
    expect(mapped.slug).toBe('ab_wheel_rollout')
  })

  it('aplana youtube_search/youtube_query al único campo youtube', () => {
    const conUrl = mapCatalogIndexEntry({
      id: 'a', name: 'A', youtube_search: 'https://youtube.com/x', youtube_query: 'a tutorial',
    })
    expect(conUrl.youtube).toBe('https://youtube.com/x')

    const soloQuery = mapCatalogIndexEntry({ id: 'a', name: 'A', youtube_query: 'a tutorial' })
    expect(soloQuery.youtube).toBe('a tutorial')
  })

  it('cae a la categoría del fichero cuando la entrada no la trae', () => {
    expect(mapCatalogIndexEntry({ id: 'a', name: 'A' }, 'movilidad').category).toBe('movilidad')
    expect(mapCatalogIndexEntry({ id: 'a', name: 'A', category: 'skill' }, 'core').category).toBe('skill')
  })

  it('conserva series, reps y descanso de la entrada', () => {
    const mapped = mapCatalogIndexEntry({ id: 'a', name: 'A', sets: 4, reps: '8-10', rest: 120 })

    expect(mapped.sets).toBe(4)
    expect(mapped.reps).toBe('8-10')
    expect(mapped.rest).toBe(120)
  })
})

describe('mapWorkoutExercise', () => {
  it('clasifica el ejercicio de WORKOUTS y conserva su identidad', () => {
    const mapped = mapWorkoutExercise({
      id: 'hollow_hold', name: 'Hollow Body Hold', sets: 3, reps: '20-30s', rest: 60,
      muscles: 'Core profundo, TvA', note: 'Lumbar pegada al suelo.',
      youtube: 'hollow body hold tutorial', priority: 'high', isTimer: true, timerSeconds: 25,
    })

    expect(mapped.slug).toBe('hollow_hold')
    expect(mapped.category).toBe('core')
    expect(mapped.isTimer).toBe(true)
    expect(mapped.timerSeconds).toBe(25)
  })
})

/**
 * La fusión es lo que arregla el #609: el móvil leía sólo el bundle (sin los
 * privados del usuario) y el web sólo PB (sin los 1.578 si PB no respondía).
 */
describe('mergeCatalogRecords', () => {
  const bundle = [
    mapCatalogIndexEntry({ id: 'pull_ups', name: { es: 'Dominadas', en: 'Pull-ups' } }, 'pull'),
  ]

  it('añade el ejercicio privado que sólo existe en PB', () => {
    const merged = mergeCatalogRecords(bundle, [
      { id: 'pb_rand_id_0001', slug: 'mi_ejercicio_privado', name: 'Mi ejercicio', status: 'private' },
    ])

    expect(merged).toHaveLength(2)
    expect(merged[1].slug).toBe('mi_ejercicio_privado')
  })

  it('no deja que PB pise el nombre revisado del bundle', () => {
    const merged = mergeCatalogRecords(bundle, [
      { id: 'pb_rand_id_0002', slug: 'pull_ups', name: 'PULL UPS (sin traducir)' },
    ])

    expect(merged).toHaveLength(1)
    expect(merged[0].name).toEqual({ es: 'Dominadas', en: 'Pull-ups' })
  })

  it('dedupea por identidad canónica, no por el id aleatorio de PB', () => {
    const merged = mergeCatalogRecords(bundle, [
      { id: 'pb_rand_id_0003', slug: 'sentadilla_bulgara', name: 'Sentadilla búlgara' },
      { id: 'pb_rand_id_0004', slug: 'sentadilla_bulgara', name: 'Sentadilla búlgara (copia)' },
    ])

    expect(merged.filter(ex => ex.slug === 'sentadilla_bulgara')).toHaveLength(1)
  })

  it('descarta el registro sin identidad en vez de colarlo', () => {
    const merged = mergeCatalogRecords(bundle, [{ name: 'Sin id ni slug' }])

    expect(merged).toHaveLength(1)
  })
})
