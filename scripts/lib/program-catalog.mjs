/**
 * Metadatos de catálogo de los 15 programas oficiales (issue #615).
 *
 * Es lo que `programs/*.json` NO contiene: cada fichero de contenido trae
 * nombre, descripción, dificultad y duración, pero nada de lo que alimenta el
 * «PARA TI» del onboarding (`packages/core/lib/matchPrograms.ts`) ni los filtros
 * del catálogo — `goal_type`, `skill`, `intensity`, `days_per_week`,
 * `equipment_required` y `contraindications`.
 *
 * Vivía dentro de `scripts/seed-program-catalog.mjs`, donde solo lo veía ese
 * script. Ahora lo leen dos consumidores —el seeder por API y el generador de
 * la migración de siembra— y tener una única copia es lo que impide que la
 * migración y el seeder siembren catálogos distintos.
 *
 * El `slug` es la clave que une esta tabla con el contenido: cada entrada
 * corresponde a `programs/<slug>.json`. `assertCatalogMatchesFiles()` lo
 * comprueba en vez de dejar que un fichero huérfano se sedimente en silencio.
 *
 * «Intermedio – Balance Total» NO está aquí: es un programa preexistente que el
 * seeder reetiqueta en lugar de crear, y no tiene fichero de contenido.
 */

const i18n = (es, en) => ({ es, en })

/**
 * Vocabulario de `equipment_required`.
 *
 * Sale de cruzar el `equipment` del catálogo de ejercicios con lo que cada
 * programa usa de verdad; `scripts/check-program-content.mjs` falla si un
 * programa necesita algo que no declara, que es como catorce de los quince
 * llegaron a declarar menos material del que pedían.
 *
 * `weight` (lastre) es nuevo: lo piden las dominadas lastradas de los roadmaps
 * de muscle-up y planche. Se declara en vez de esconderlo porque el campo va a
 * empezar a consumirse — hoy `matchPrograms.ts` lo ignora (`user.equipment` es
 * un «future field» y la penalización solo se aplica si el usuario ha declarado
 * su material, cosa que todavía no hace nadie), así que quien encienda esa fase
 * necesita la lista completa y no una recortada para que cuadre.
 *
 * Material de casa —pared, toalla, silla, banco, escalón— NO se declara: no
 * excluye a nadie y llenar la lista de obviedades la vuelve inútil.
 */
export const EQUIPMENT_VOCABULARY = ['pull_bar', 'parallel_bars', 'bands', 'rings', 'weight']

/** Los 15 programas del catálogo curado, en el orden en que se siembran. */
export const SKELETONS = [
  // level × goal (8 — Balance Total handles intermediate+maintain)
  { slug: 'principiante-quema-grasa', name: i18n('Principiante · Quema Grasa', 'Beginner · Fat Burn'),
    description: i18n('Rutina suave 4 días/sem para bajar grasa sin perder músculo. Enfocado en movimientos base.', '4-day/week gentle routine to burn fat without losing muscle. Focused on fundamentals.'),
    duration_weeks: 12, difficulty: 'beginner', goal_type: 'fat_loss', intensity: 'light', days_per_week: 4, equipment_required: [], contraindications: [] },
  { slug: 'principiante-ganar-musculo', name: i18n('Principiante · Ganar Músculo', 'Beginner · Muscle Gain'),
    description: i18n('Hipertrofia base 4 días/sem para principiantes. Progresión simple hacia primer pull-up y dip.', 'Beginner hypertrophy 4 days/week. Simple progression toward first pull-up and dip.'),
    duration_weeks: 12, difficulty: 'beginner', goal_type: 'muscle_gain', intensity: 'moderate', days_per_week: 4, equipment_required: ['pull_bar'], contraindications: [] },
  { slug: 'principiante-fundamentos', name: i18n('Principiante · Fundamentos', 'Beginner · Fundamentals'),
    description: i18n('Tu primer programa de calistenia. 3 días/sem, técnica y hábito.', 'Your first calisthenics program. 3 days/week, technique and consistency.'),
    duration_weeks: 8, difficulty: 'beginner', goal_type: 'maintain', intensity: 'light', days_per_week: 3, equipment_required: [], contraindications: [] },
  { slug: 'intermedio-definicion', name: i18n('Intermedio · Definición', 'Intermediate · Cutting'),
    description: i18n('5 días/sem alta intensidad. Para bajar % graso conservando masa magra.', '5 days/week high intensity. Cut body fat while preserving lean mass.'),
    duration_weeks: 12, difficulty: 'intermediate', goal_type: 'fat_loss', intensity: 'intense', days_per_week: 5, equipment_required: ['pull_bar','parallel_bars'], contraindications: [] },
  { slug: 'intermedio-hipertrofia', name: i18n('Intermedio · Hipertrofia', 'Intermediate · Hypertrophy'),
    description: i18n('Ganancia muscular 5 días/sem. Variaciones con más rango y pausa.', 'Muscle gain 5 days/week. Paused variations with extended range of motion.'),
    duration_weeks: 12, difficulty: 'intermediate', goal_type: 'muscle_gain', intensity: 'moderate', days_per_week: 5, equipment_required: ['pull_bar','parallel_bars'], contraindications: [] },
  { slug: 'avanzado-cutting', name: i18n('Avanzado · Cutting Élite', 'Advanced · Elite Cutting'),
    description: i18n('Programa intenso 5 días/sem: cardio + alta frecuencia. Para atletas avanzados.', 'Intense 5 days/week program: cardio plus high-frequency strength. For advanced athletes.'),
    duration_weeks: 12, difficulty: 'advanced', goal_type: 'fat_loss', intensity: 'intense', days_per_week: 5, equipment_required: ['pull_bar','parallel_bars','bands'], contraindications: [] },
  { slug: 'avanzado-volumen', name: i18n('Avanzado · Volumen Máximo', 'Advanced · Max Volume'),
    description: i18n('6 días/sem. Hipertrofia de alta frecuencia con movimientos avanzados (planche, front lever progresiones).', '6 days/week. High-frequency hypertrophy with advanced movements (planche, front-lever progressions).'),
    duration_weeks: 12, difficulty: 'advanced', goal_type: 'muscle_gain', intensity: 'intense', days_per_week: 6, equipment_required: ['pull_bar','parallel_bars','bands'], contraindications: [] },
  { slug: 'avanzado-fuerza-total', name: i18n('Avanzado · Fuerza Total', 'Advanced · Total Strength'),
    description: i18n('6 días/sem para mantener niveles altos de fuerza calisténica. Skills + básicos pesados.', '6 days/week to maintain high calisthenics strength. Skills plus heavy basics.'),
    duration_weeks: 12, difficulty: 'advanced', goal_type: 'maintain', intensity: 'intense', days_per_week: 6, equipment_required: ['pull_bar','parallel_bars','bands'], contraindications: [] },
  // skill tracks (4)
  { slug: 'pull-up-roadmap', name: i18n('Pull-up Roadmap', 'Pull-up Roadmap'),
    description: i18n('De cero a tu primera dominada estricta. 3 días/sem con progresiones y ligas.', 'From zero to your first strict pull-up. 3 days/week with progressions and bands.'),
    duration_weeks: 12, difficulty: 'beginner', goal_type: 'skill', skill: 'pull_up', intensity: 'light', days_per_week: 3, equipment_required: ['pull_bar','bands'], contraindications: [] },
  { slug: 'handstand-roadmap', name: i18n('Handstand Roadmap', 'Handstand Roadmap'),
    description: i18n('Pino libre desde cero. Pared, equilibrio y progresión diaria.', 'Freestanding handstand from zero. Wall, balance, and daily progression.'),
    duration_weeks: 12, difficulty: 'intermediate', goal_type: 'skill', skill: 'handstand', intensity: 'moderate', days_per_week: 3, equipment_required: ['bands'], contraindications: ['wrist','shoulder'] },
  { slug: 'muscle-up-roadmap', name: i18n('Muscle-up Roadmap', 'Muscle-up Roadmap'),
    description: i18n('Tu primer muscle up. Requiere pull-ups estrictos y dips profundos.', 'Your first muscle-up. Requires strict pull-ups and deep dips.'),
    duration_weeks: 12, difficulty: 'intermediate', goal_type: 'skill', skill: 'muscle_up', intensity: 'intense', days_per_week: 4, equipment_required: ['pull_bar','parallel_bars','bands','weight'], contraindications: ['elbow','shoulder'] },
  { slug: 'planche-roadmap', name: i18n('Planche Roadmap', 'Planche Roadmap'),
    description: i18n('Progresión hacia planche. Tuck → straddle → full. Requiere base avanzada.', 'Planche progression. Tuck → straddle → full. Requires advanced baseline.'),
    duration_weeks: 16, difficulty: 'advanced', goal_type: 'skill', skill: 'planche', intensity: 'intense', days_per_week: 4, equipment_required: ['parallel_bars','pull_bar','bands','weight'], contraindications: ['wrist','shoulder','elbow'] },
  // women-focused (3)
  { slug: 'mujer-gluteo-tonificacion', name: i18n('Mujer · Glúteo + Tonificación', 'Women · Glutes + Toning'),
    description: i18n('Programa femenino 4 días/sem. Glúteo, piernas y tonificación de tren superior. Bodyweight + ligas.', '4-day/week program for women. Glutes, legs, and upper-body toning. Bodyweight + bands.'),
    duration_weeks: 12, difficulty: 'beginner', goal_type: 'fat_loss', intensity: 'moderate', days_per_week: 4, equipment_required: ['bands'], contraindications: [] },
  { slug: 'mujer-full-body-toning', name: i18n('Mujer · Full Body Toning', 'Women · Full Body Toning'),
    description: i18n('Tonificación balanceada para mujeres. 4 días/sem, solo peso corporal. Ideal para principiantes.', 'Balanced full-body toning for women. 4 days/week, bodyweight only. Ideal for beginners.'),
    duration_weeks: 12, difficulty: 'beginner', goal_type: 'maintain', intensity: 'light', days_per_week: 4, equipment_required: [], contraindications: [] },
  { slug: 'mujer-fuerza-funcional', name: i18n('Mujer · Fuerza Funcional', 'Women · Functional Strength'),
    description: i18n('Fuerza real para mujeres: dominadas, dips y core fuerte. 4 días/sem. Requiere barra.', 'Real strength for women: pull-ups, dips, strong core. 4 days/week. Requires pull bar.'),
    duration_weeks: 12, difficulty: 'intermediate', goal_type: 'muscle_gain', intensity: 'moderate', days_per_week: 4, equipment_required: ['pull_bar','bands'], contraindications: [] },
]

/** Índice por slug, para cruzar una entrada con su fichero de contenido. */
export const CATALOG_BY_SLUG = new Map(SKELETONS.map(s => [s.slug, s]))

/**
 * Comprueba que la tabla y `programs/` describen exactamente el mismo catálogo.
 *
 * Un fichero sin entrada se sembraría sin metadatos y jamás aparecería en el
 * matching del onboarding; una entrada sin fichero crearía un programa vacío.
 * Ninguno de los dos casos da error por su cuenta, así que se comprueba aquí.
 *
 * @param {string[]} slugsOnDisk slugs derivados de los ficheros de `programs/`
 * @returns {string[]} lista de problemas; vacía si el catálogo casa
 */
export function assertCatalogMatchesFiles(slugsOnDisk) {
  const onDisk = new Set(slugsOnDisk)
  const problems = []
  for (const s of SKELETONS) {
    if (!onDisk.has(s.slug)) problems.push(`catálogo sin contenido: falta programs/${s.slug}.json`)
  }
  for (const slug of onDisk) {
    if (!CATALOG_BY_SLUG.has(slug)) problems.push(`contenido sin catálogo: programs/${slug}.json no está en SKELETONS`)
  }
  return problems
}
