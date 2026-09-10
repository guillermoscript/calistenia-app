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

/**
 * Vocabulario de `contraindications` (#713).
 *
 * Espejo de `INJURY_IDS` en `packages/core/types/onboarding.ts`: es lo que el
 * onboarding recoge en `injuries` y lo que `matchPrograms.ts` cruza con este
 * campo para penalizar un programa con `health_flag`. Un valor fuera de esta
 * lista no da error en ningún sitio — sencillamente no casa con nadie, que es
 * lo mismo que no declararlo. `scripts/program-catalog.test.mjs` comprueba que
 * las dos listas siguen siendo la misma.
 *
 * Las contraindicaciones se DERIVAN del contenido (auditoría 2026-09-08):
 * colgado máximo o alto volumen excéntrico de tracción → `elbow` + `shoulder`;
 * apoyo invertido de manos, planche, crow → `wrist`; pliometría, nordic curl
 * o sentadilla con salto → `knee` (y `ankle` si hay burpees/patinadores);
 * dragon flag y limpiaparabrisas colgado → `lower_back`. Es una penalización
 * blanda: el programa sigue saliendo, pero avisado.
 */
export const CONTRAINDICATION_VOCABULARY = ['shoulder', 'wrist', 'elbow', 'knee', 'ankle', 'lower_back']

/**
 * Los 15 programas del catálogo curado, en el orden en que se siembran.
 *
 * Decisiones de etiquetado de la auditoría de entrenamiento (#713, 2026-09-08).
 * `goal_type` no es una descripción del programa sino la CELDA nivel × objetivo
 * del «PARA TI»: `primaryGoalToProgramGoalType` manda a `maintain` todo lo que
 * no sea «ganar músculo» o «perder grasa» (recomposición, resistencia,
 * habilidades y el usuario sin objetivo), así que cada nivel necesita un
 * programa `maintain` que sea el sitio razonable donde caer.
 *
 * - principiante-fundamentos se QUEDA en `maintain`: es el «empieza por aquí»
 *   del principiante sin objetivo de peso; en `muscle_gain` (#719) dejaría esa
 *   celda vacía y competiría con Ganar Músculo.
 * - avanzado-fuerza-total se QUEDA en `maintain`: es el único avanzado de esa
 *   celda y el contenido (#726) baja el volumen a «sostener» en vez de subir la
 *   etiqueta a un `muscle_gain` que ya ocupa Volumen Máximo. Sí declara
 *   `weight`: el nivel de entrada exige dominada lastrada +20 %.
 * - mujer-gluteo-tonificacion pasa a `muscle_gain`: cero cardio, cero circuitos,
 *   hipertrofia pura de glúteo; ya hay un beginner `fat_loss` de verdad.
 * - mujer-full-body-toning se QUEDA en `maintain` (tonificación = recomposición,
 *   que el onboarding mapea a `maintain`) y sube a `moderate`: sus fases
 *   «Construcción/Definición» no son una rutina suave.
 * - mujer-fuerza-funcional se QUEDA en `muscle_gain`: no existe un `goal_type`
 *   de fuerza y crear uno toca el enum de PB, el onboarding y la UI. El
 *   contenido (#733) lleva los primarios que no sean dominada a 6-12.
 * - principiante-ganar-musculo declara `parallel_bars` ANTES de usarlas: #721
 *   mete `dips_parallel` y no puede tocar este fichero; hasta que se mergee el
 *   validador avisa «declara material que no usa», que es un aviso y no un
 *   error. Lo mismo con `weight` en Fuerza Total.
 * - Banco, silla, mesa, toalla, escalón siguen SIN declararse (ver arriba):
 *   material de casa que no excluye a nadie.
 */
/**
 * `for_women` (#717): variante «Mujer ·» de su celda nivel × objetivo. «PARA
 * TI» la prefiere cuando el onboarding recibió `sex === 'female'`, y prefiere
 * el genérico en cualquier otro caso. Se marca con este campo y no por el
 * prefijo del nombre: el nombre es texto de producto y cambia.
 *
 * `sort_order` (#717): desempate explícito dentro de una celda cuando ni el
 * sexo ni `is_featured` deciden. Hoy ninguna celda lo necesita (cada una tiene
 * un genérico y, como mucho, una variante «Mujer ·»); está para que el día
 * que entre un tercer programa el ganador no dependa del alfabeto inglés.
 * Los valores van de 10 en 10 en el orden de esta tabla; se vuelcan a
 * PocketBase en `1789300000_programs_for_women_sort_order.js`.
 */
export const SKELETONS = [
  // level × goal (8 — Balance Total handles intermediate+maintain)
  { slug: 'principiante-quema-grasa', name: i18n('Principiante · Quema Grasa', 'Beginner · Fat Burn'),
    description: i18n('Bajar grasa en casa 4 días/sem, con objetos de casa. Fuerza para no perder músculo, más cardio y nutrición.', 'Lose fat at home 4 days/week using things you already own. Strength to keep your muscle, plus cardio and nutrition.'),
    duration_weeks: 12, difficulty: 'beginner', goal_type: 'fat_loss', intensity: 'moderate', days_per_week: 4, equipment_required: [], contraindications: ['knee','ankle'],
    for_women: false, sort_order: 10 },
  { slug: 'principiante-ganar-musculo', name: i18n('Principiante · Ganar Músculo', 'Beginner · Muscle Gain'),
    description: i18n('Hipertrofia base 4 días/sem para principiantes. Progresión simple hacia primer pull-up y dip.', 'Beginner hypertrophy 4 days/week. Simple progression toward first pull-up and dip.'),
    duration_weeks: 12, difficulty: 'beginner', goal_type: 'muscle_gain', intensity: 'moderate', days_per_week: 4, equipment_required: ['pull_bar','parallel_bars'], contraindications: ['shoulder','elbow','knee'],
    for_women: false, sort_order: 20 },
  { slug: 'principiante-fundamentos', name: i18n('Principiante · Fundamentos', 'Beginner · Fundamentals'),
    description: i18n('Tu primer programa de calistenia. 3 días/sem, técnica y hábito.', 'Your first calisthenics program. 3 days/week, technique and consistency.'),
    duration_weeks: 8, difficulty: 'beginner', goal_type: 'maintain', intensity: 'light', days_per_week: 3, equipment_required: [], contraindications: [],
    for_women: false, sort_order: 30 },
  { slug: 'intermedio-definicion', name: i18n('Intermedio · Definición', 'Intermediate · Cutting'),
    description: i18n('5 días/sem alta intensidad. Para bajar % graso conservando masa magra.', '5 days/week high intensity. Cut body fat while preserving lean mass.'),
    duration_weeks: 12, difficulty: 'intermediate', goal_type: 'fat_loss', intensity: 'intense', days_per_week: 5, equipment_required: ['pull_bar','parallel_bars'], contraindications: ['wrist','shoulder','elbow'],
    for_women: false, sort_order: 40 },
  { slug: 'intermedio-hipertrofia', name: i18n('Intermedio · Hipertrofia', 'Intermediate · Hypertrophy'),
    description: i18n('Ganancia muscular 5 días/sem. Variaciones con más rango y pausa.', 'Muscle gain 5 days/week. Paused variations with extended range of motion.'),
    duration_weeks: 12, difficulty: 'intermediate', goal_type: 'muscle_gain', intensity: 'moderate', days_per_week: 5, equipment_required: ['pull_bar','parallel_bars'], contraindications: ['shoulder','elbow','wrist','knee'],
    for_women: false, sort_order: 50 },
  { slug: 'avanzado-cutting', name: i18n('Avanzado · Cutting Élite', 'Advanced · Elite Cutting'),
    description: i18n('Programa intenso 5 días/sem: cardio + alta frecuencia. Para atletas avanzados.', 'Intense 5 days/week program: cardio plus high-frequency strength. For advanced athletes.'),
    duration_weeks: 12, difficulty: 'advanced', goal_type: 'fat_loss', intensity: 'intense', days_per_week: 5, equipment_required: ['pull_bar','parallel_bars','bands'], contraindications: ['wrist','shoulder','elbow'],
    for_women: false, sort_order: 60 },
  { slug: 'avanzado-volumen', name: i18n('Avanzado · Volumen Máximo', 'Advanced · Max Volume'),
    description: i18n('6 días/sem. Hipertrofia de alta frecuencia con movimientos avanzados (planche, front lever progresiones).', '6 days/week. High-frequency hypertrophy with advanced movements (planche, front-lever progressions).'),
    duration_weeks: 12, difficulty: 'advanced', goal_type: 'muscle_gain', intensity: 'intense', days_per_week: 6, equipment_required: ['pull_bar','parallel_bars','bands'], contraindications: ['wrist','shoulder','elbow','knee'],
    for_women: false, sort_order: 70 },
  { slug: 'avanzado-fuerza-total', name: i18n('Avanzado · Fuerza Total', 'Advanced · Total Strength'),
    description: i18n('6 días/sem para mantener niveles altos de fuerza calisténica. Skills + básicos pesados.', '6 days/week to maintain high calisthenics strength. Skills plus heavy basics.'),
    duration_weeks: 12, difficulty: 'advanced', goal_type: 'maintain', intensity: 'intense', days_per_week: 6, equipment_required: ['pull_bar','parallel_bars','bands','weight'], contraindications: ['wrist','shoulder','elbow'],
    for_women: false, sort_order: 80 },
  // skill tracks (4)
  { slug: 'pull-up-roadmap', name: i18n('Pull-up Roadmap', 'Pull-up Roadmap'),
    description: i18n('De cero a tu primera dominada estricta. 3 días/sem con progresiones y ligas.', 'From zero to your first strict pull-up. 3 days/week with progressions and bands.'),
    duration_weeks: 12, difficulty: 'beginner', goal_type: 'skill', skill: 'pull_up', intensity: 'light', days_per_week: 3, equipment_required: ['pull_bar','bands'], contraindications: ['elbow','shoulder'],
    for_women: false, sort_order: 90 },
  { slug: 'handstand-roadmap', name: i18n('Handstand Roadmap', 'Handstand Roadmap'),
    description: i18n('Pino libre desde cero. Pared, equilibrio y progresión diaria.', 'Freestanding handstand from zero. Wall, balance, and daily progression.'),
    duration_weeks: 12, difficulty: 'intermediate', goal_type: 'skill', skill: 'handstand', intensity: 'moderate', days_per_week: 3, equipment_required: ['bands'], contraindications: ['wrist','shoulder'],
    for_women: false, sort_order: 100 },
  { slug: 'muscle-up-roadmap', name: i18n('Muscle-up Roadmap', 'Muscle-up Roadmap'),
    description: i18n('Tu primer muscle up. Requiere pull-ups estrictos y dips profundos.', 'Your first muscle-up. Requires strict pull-ups and deep dips.'),
    duration_weeks: 12, difficulty: 'intermediate', goal_type: 'skill', skill: 'muscle_up', intensity: 'intense', days_per_week: 4, equipment_required: ['pull_bar','parallel_bars','bands','weight'], contraindications: ['elbow','shoulder','wrist'],
    for_women: false, sort_order: 110 },
  { slug: 'planche-roadmap', name: i18n('Planche Roadmap', 'Planche Roadmap'),
    description: i18n('Progresión hacia planche. Tuck → straddle → full. Requiere base avanzada.', 'Planche progression. Tuck → straddle → full. Requires advanced baseline.'),
    duration_weeks: 16, difficulty: 'advanced', goal_type: 'skill', skill: 'planche', intensity: 'intense', days_per_week: 4, equipment_required: ['parallel_bars','pull_bar','bands','weight'], contraindications: ['wrist','shoulder','elbow'],
    for_women: false, sort_order: 120 },
  // women-focused (3)
  { slug: 'mujer-gluteo-tonificacion', name: i18n('Mujer · Glúteo + Tonificación', 'Women · Glutes + Toning'),
    description: i18n('Programa femenino 4 días/sem. Glúteo, piernas y tonificación de tren superior. Bodyweight + ligas.', '4-day/week program for women. Glutes, legs, and upper-body toning. Bodyweight + bands.'),
    duration_weeks: 12, difficulty: 'beginner', goal_type: 'muscle_gain', intensity: 'moderate', days_per_week: 4, equipment_required: ['bands'], contraindications: ['knee'],
    for_women: true, sort_order: 130 },
  { slug: 'mujer-full-body-toning', name: i18n('Mujer · Full Body Toning', 'Women · Full Body Toning'),
    description: i18n('Tonificación balanceada para mujeres. 4 días/sem, solo peso corporal. Ideal para principiantes.', 'Balanced full-body toning for women. 4 days/week, bodyweight only. Ideal for beginners.'),
    duration_weeks: 12, difficulty: 'beginner', goal_type: 'maintain', intensity: 'moderate', days_per_week: 4, equipment_required: [], contraindications: ['wrist','knee'],
    for_women: true, sort_order: 140 },
  { slug: 'mujer-fuerza-funcional', name: i18n('Mujer · Fuerza Funcional', 'Women · Functional Strength'),
    description: i18n('Fuerza real para mujeres: dominadas, dips y core fuerte. 4 días/sem. Requiere barra.', 'Real strength for women: pull-ups, dips, strong core. 4 days/week. Requires pull bar.'),
    duration_weeks: 12, difficulty: 'intermediate', goal_type: 'muscle_gain', intensity: 'moderate', days_per_week: 4, equipment_required: ['pull_bar','bands','parallel_bars'], contraindications: ['shoulder','elbow','wrist','knee','lower_back'],
    for_women: true, sort_order: 150 },
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
