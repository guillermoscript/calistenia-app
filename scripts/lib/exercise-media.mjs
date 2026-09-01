/**
 * exercise-media.mjs — vocabulario compartido de la media estática de ejercicios (#619).
 *
 * Hasta ahora registrar una imagen exigía DOS pasos que nadie recordaba juntos:
 * soltar el fichero en `seeds/exercises/media/<slug>/` **y** editar a mano el
 * bloque `media` del seed JSON correspondiente. Olvidar el segundo fallaba en
 * silencio —el fichero se quedaba en disco y ninguna pantalla lo pedía—, que es
 * exactamente por lo que a día de hoy solo `strict-pull-up` tiene media pese a
 * que el pipeline lleva meses montado.
 *
 * Este módulo es la fuente única de verdad de tres cosas que antes estaban
 * duplicadas o implícitas:
 *
 *   1. Qué nombres de fichero cuentan como media y en qué hueco caen
 *      (`sequence` / `muscles` / `thumbnail` / `video`).
 *   2. Qué carpeta le toca a cada ejercicio del catálogo (`buildMediaSlugIndex`).
 *   3. Cómo se descubre lo que hay realmente en disco (`discoverMediaFiles`).
 *
 * Lo consumen el constructor del catálogo (`build-exercise-catalog.mjs`, que
 * engancha lo descubierto) y el informe de cobertura
 * (`exercise-media-status.mjs`, que dice qué falta y dónde dejarlo).
 */

import { readdirSync, existsSync, readFileSync } from 'fs'
import { resolve, join, extname, basename } from 'path'

export const ROOT = resolve(import.meta.dirname, '../..')

/** Dónde se sueltan los ficheros. `sync-exercise-media.mjs` los copia a public/. */
export const MEDIA_SRC_DIR = join(ROOT, 'seeds/exercises/media')

/** Los 15 programas oficiales, en su forma de origen (la migración se genera de aquí). */
export const PROGRAMS_DIR = join(ROOT, 'programs')

/**
 * Los cuatro huecos de media, y qué extensiones acepta cada uno.
 *
 * El nombre del fichero SIN extensión es lo que decide el hueco: `sequence.webp`
 * es la secuencia, `muscles.png` el mapa muscular. Cualquier otro nombre se
 * ignora a propósito, para que se puedan dejar originales al lado
 * (`sequence.psd`, `_raw.mov`) sin que acaben en el bundle.
 */
export const MEDIA_ROLES = {
  sequence: ['.webp', '.avif', '.png', '.jpg', '.jpeg', '.gif'],
  muscles: ['.webp', '.avif', '.png', '.jpg', '.jpeg'],
  thumbnail: ['.webp', '.avif', '.png', '.jpg', '.jpeg'],
  video: ['.webm', '.mp4'],
}

/** Orden estable para informes y salida por consola. */
export const ROLE_ORDER = ['sequence', 'muscles', 'thumbnail', 'video']

/**
 * La carpeta que le tocaría a un ejercicio si no tuviera `seed_slug`.
 *
 * Los ~20 ejercicios que los programas oficiales usan pero que solo existen en
 * la base congelada (sin entrada en `seeds/exercises/*.json`) no tienen slug, y
 * sin slug no hay carpeta donde soltarles nada. Derivarlo del id les abre la
 * puerta sin obligar a inventarles un seed entero.
 */
export function derivedMediaSlug(id) {
  return String(id).replace(/_/g, '-')
}

/**
 * Mapa id → carpeta de media, resuelto para TODO el catálogo.
 *
 * Regla de precedencia: un `seed_slug` explícito siempre gana. Un slug derivado
 * que choque con cualquier otro (explícito o derivado) se descarta y se avisa,
 * en vez de dejar que dos ejercicios se peleen por la misma carpeta —hoy pasa
 * con los pares duplicados `chinup`/`chin_up` y `box_jump_2`/`box_jump`, donde
 * el gemelo con seed es el dueño legítimo de la carpeta.
 *
 * @returns {{ slugById: Map<string,string>, idBySlug: Map<string,string>, conflicts: Array }}
 */
export function buildMediaSlugIndex(exercises) {
  const slugById = new Map()
  const idBySlug = new Map()
  const conflicts = []

  // Pasada 1: slugs explícitos. Son los que manda el seed, y no se discuten.
  for (const ex of exercises) {
    if (!ex.seed_slug) continue
    const prev = idBySlug.get(ex.seed_slug)
    if (prev) {
      conflicts.push({ slug: ex.seed_slug, kept: prev, dropped: ex.id, kind: 'explicit' })
      continue
    }
    idBySlug.set(ex.seed_slug, ex.id)
    slugById.set(ex.id, ex.seed_slug)
  }

  // Pasada 2: slugs derivados, solo si la carpeta sigue libre.
  for (const ex of exercises) {
    if (slugById.has(ex.id)) continue
    const slug = derivedMediaSlug(ex.id)
    const prev = idBySlug.get(slug)
    if (prev) {
      conflicts.push({ slug, kept: prev, dropped: ex.id, kind: 'derived' })
      continue
    }
    idBySlug.set(slug, ex.id)
    slugById.set(ex.id, slug)
  }

  return { slugById, idBySlug, conflicts }
}

/**
 * Qué media hay realmente en `seeds/exercises/media/<slug>/`.
 *
 * Devuelve un objeto con los huecos encontrados, con el nombre de fichero tal
 * cual (no la ruta): es la misma forma que ya tiene el bloque `media` de los
 * seeds, para que el constructor no tenga que distinguir el origen.
 *
 * Ficheros que empiezan por `_` o `.` se saltan, igual que hace
 * `sync-exercise-media.mjs` — así se pueden guardar borradores al lado.
 */
export function discoverMediaFiles(slug, srcDir = MEDIA_SRC_DIR) {
  const dir = join(srcDir, slug)
  if (!existsSync(dir)) return {}

  const found = {}
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return {}
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue

    const ext = extname(entry.name).toLowerCase()
    const stem = basename(entry.name, extname(entry.name)).toLowerCase()

    const accepted = MEDIA_ROLES[stem]
    if (!accepted || !accepted.includes(ext)) continue

    // Si alguien deja `sequence.webp` y `sequence.png`, el build no puede
    // depender del orden que devuelva el sistema de ficheros: gana el primero
    // en orden alfabético, siempre el mismo en cualquier máquina.
    if (found[stem] && found[stem] <= entry.name) continue
    found[stem] = entry.name
  }

  return found
}

/**
 * Los ids de ejercicio que usan los 15 programas oficiales, y cuánto.
 *
 * Es la lista que el issue #619 manda priorizar: no tiene sentido producir media
 * para los 1.578 del catálogo cuando los programas que la gente sigue de verdad
 * tocan una fracción.
 *
 * @returns {Map<string, { count: number, programs: Set<string> }>}
 */
export function programExerciseUsage(programsDir = PROGRAMS_DIR) {
  const usage = new Map()
  const files = readdirSync(programsDir).filter(f => f.endsWith('.json')).sort()

  for (const file of files) {
    const program = JSON.parse(readFileSync(join(programsDir, file), 'utf8'))
    const slug = basename(file, '.json')

    // Los programas son un árbol (fases → días → ejercicios) y su forma exacta
    // ha cambiado entre issues; recorrerlo entero es más barato que perseguir el
    // esquema de turno.
    const walk = node => {
      if (!node || typeof node !== 'object') return
      if (Array.isArray(node)) return node.forEach(walk)
      if (typeof node.exercise_id === 'string') {
        let e = usage.get(node.exercise_id)
        if (!e) usage.set(node.exercise_id, (e = { count: 0, programs: new Set() }))
        e.count++
        e.programs.add(slug)
      }
      Object.values(node).forEach(walk)
    }
    walk(program)
  }

  return usage
}

/** Aplana el catálogo agrupado por categoría a una lista. */
export function flattenCatalog(catalog) {
  const out = []
  for (const key of Object.keys(catalog.categories || {})) {
    out.push(...(catalog.categories[key].exercises || []))
  }
  return out
}
