/**
 * Fábrica central de query keys para TanStack Query.
 *
 * Todas las keys salen de aquí — evita strings sueltos en los hooks y hace que
 * invalidar por dominio sea trivial (p.ej. `qk.nutrition.all` invalida todo
 * nutrición). Convención: cada dominio expone `all` (raíz para invalidación
 * amplia) y constructores tipados para las keys concretas.
 *
 * `as const` en cada retorno preserva la tupla literal que React Query usa para
 * comparar por igualdad estructural.
 */

export const qk = {
  // — Auth / usuario —
  authReady: ['auth', 'ready'] as const,
  pbAvailable: ['pb', 'available'] as const,

  // — Version gate + feature flags remotos —
  // Sin userId: es config del dispositivo, no del usuario, y tiene que
  // resolverse aunque no haya sesión (un cliente bloqueado no llega a loguearse).
  appConfig: ['app-config'] as const,

  // — Social / feed —
  follows: (userId: string | null) => ['follows', userId] as const,
  blocks: (userId: string | null) => ['blocks', userId] as const,
  feed: {
    all: ['feed'] as const,
    meta: (userId: string | null) => ['feed', 'meta', userId] as const,
    sessions: (userId: string | null, followedIds: string[]) =>
      ['feed', 'sessions', userId, followedIds] as const,
    users: (userIds: string[]) => ['feed', 'users', userIds] as const,
  },
  comments: {
    all: ['comments'] as const,
    list: (sessionId: string, userId: string | null) =>
      ['comments', sessionId, userId] as const,
    counts: (sessionIds: string[], userId: string | null) =>
      ['comments', 'counts', sessionIds, userId] as const,
  },
  commentReactions: (commentId: string, userId: string | null) =>
    ['comment-reactions', commentId, userId] as const,
  reactions: (userId: string | null, sessionIds: string[]) =>
    ['reactions', userId, sessionIds] as const,
  notifications: {
    all: ['notifications'] as const,
    list: (userId: string | null, limit: number) =>
      ['notifications', userId, limit] as const,
    unreadCount: (userId: string | null) =>
      ['notifications', 'unreadCount', userId] as const,
  },
  notificationPrefs: (userId: string | null) =>
    ['notification_prefs', userId] as const,
  referrals: {
    all: ['referrals'] as const,
    list: (userId: string | null) => ['referrals', 'list', userId] as const,
    stats: (userId: string | null) => ['referrals', 'stats', userId] as const,
  },
  points: {
    balance: (userId: string | null) => ['points', 'balance', userId] as const,
    transactions: (userId: string | null, limit: number) =>
      ['points', 'transactions', userId, limit] as const,
  },

  // — Programas / progreso —
  programs: {
    all: ['programs'] as const,
    // Lleva `userId` desde #603: el catálogo ya no es el mismo para todo el
    // mundo — incluye los borradores PRIVADOS de quien pregunta. Con la clave
    // compartida, el caché de disco (24h) podía servirle a la siguiente cuenta
    // del mismo dispositivo los programas privados de la anterior.
    catalog: (userId: string | null) => ['programs', 'catalog', userId] as const,
    /**
     * `usePrograms`: el REGISTRO de `user_programs` activo (o null), no solo su
     * `program`. La clave cambió de `activeEnrollment` a `enrollment` en #616
     * justamente porque cambió la forma del valor: el persister guarda la caché
     * en disco hasta 24h, y una entrada vieja con la forma antigua (un string
     * con el id del programa) se leería como un registro sin `program` — el
     * usuario aparecería sin programa activo hasta que la query refrescara.
     */
    enrollment: (userId: string | null) =>
      ['programs', 'enrollment', userId] as const,
    // OJO: `detail` y `detailView` son el MISMO programa visto por dos hooks
    // que cachean formas incompatibles. Compartieron clave hasta #606 y se
    // pisaban entre sí: cada uno leía del objeto del otro y caía a su fallback
    // en silencio. Si añades un tercer consumidor, dale su propia clave.
    /** `usePrograms`: `{ phases, weekDays, workoutsMap, cardioDayConfigs }` del programa ACTIVO. */
    detail: (programId: string | null) =>
      ['programs', 'detail', programId] as const,
    /** `useProgramDetail`: `{ program, days }` de CUALQUIER programa (ficha / deep-link). */
    detailView: (programId: string | null) =>
      ['programs', 'detailView', programId] as const,
    /**
     * `usePublicProgramPreview`: la vista previa ANÓNIMA de `/shared/:id` (#604).
     * Es el tercer consumidor del mismo programa y por eso lleva clave propia,
     * como avisa el comentario de arriba: viene de otro endpoint
     * (`/api/programs/{id}/public`, no de la colección), trae menos campos y la
     * pide gente sin sesión. Compartir clave con `detailView` haría que la ficha
     * completa de quien sí ha entrado se sirviera desde el recorte público.
     */
    publicPreview: (programId: string | null) =>
      ['programs', 'publicPreview', programId] as const,
  },
  programEditor: (programId: string | null) =>
    ['programEditor', programId] as const,
  progressions: ['exercise_progressions'] as const,
  sessions: (userId: string | null, activeProgramId: string | null) =>
    ['sessions', userId, activeProgramId] as const,
  setsLog: (userId: string | null) => ['sets_log', userId] as const,
  // Detalle de una sesión de fuerza por id de registro (propia o de otro
  // usuario, abierta desde el muro / actividad reciente).
  publicSession: (sessionId: string | null) =>
    ['public-session', sessionId] as const,
  userSettings: (userId: string | null) => ['user_settings', userId] as const,
  restPreferences: (userId: string | null) =>
    ['restPreferences', userId] as const,
  favorites: (userId: string | null) => ['favorites', userId] as const,
  workoutReminders: (userId: string | null) =>
    ['workout_reminders', userId] as const,

  // Catálogo de ejercicios de PB (`exercises_catalog`), fusionado con el estático
  // del bundle y de WORKOUTS. Sin userId: es un catálogo global, igual para todo
  // el mundo. Guarda la lista completa (`CatalogExercise[]`), que es de lo que
  // tiran tanto los pickers como el mapa de nombres de las vistas de detalle
  // (#609): una sola consulta a la colección para las dos cosas.
  exerciseCatalog: ['exercise-catalog'] as const,
  // Frecuencia cardiaca / calorías que el reloj dejó en la sesión de ese día.
  sessionHrMetrics: (userId: string | null, date: string, workoutKey: string) =>
    ['session-hr-metrics', userId, date, workoutKey] as const,

  // — Stats / leaderboard / perfil —
  // Perfil público de otro usuario (o el propio visto como público): stats, PRs,
  // calendario del mes, últimas sesiones y programa activo en una sola query.
  publicProfile: (userId: string | null, yearMonth: string) =>
    ['public-profile', userId, yearMonth] as const,
  // Rutina completa del programa activo de un usuario (fases × días × ejercicios).
  routineView: (userId: string | null) => ['routine-view', userId] as const,
  // Landing de invitación: quien invita + su programa, o la vista previa del reto.
  inviteLanding: (code: string | null, challengeId: string | null) =>
    ['invite-landing', code, challengeId] as const,
  leaderboard: (userId: string | null, weekStart: string, monthStart: string) =>
    ['leaderboard', userId, weekStart, monthStart] as const,
  profileCompare: (userId: string | null, weekStart: string, monthYYYYMM: string) =>
    ['profileCompare', userId, weekStart, monthYYYYMM] as const,
  // Lista cruda de sesiones cardio (por usuario). Fuente única que comparten
  // useCardioStats, useCardioSessions y las invalidaciones tras guardar/borrar.
  cardioSessions: (userId: string | null) => ['cardio-sessions', userId] as const,

  // — Retos —
  challenges: (userId: string | null) => ['challenges', userId] as const,
  challenge: (id: string) => ['challenge', id] as const,
  challengeLeaderboard: (id: string, currentUserId: string | null) =>
    ['challenge-leaderboard', id, currentUserId] as const,
  expressProgress: (challengeId: string) =>
    ['express-progress', challengeId] as const,
  // Reto destacado en Home (#351): depende del usuario por el estado de participación
  featuredChallenge: (userId: string | null) => ['featured-challenge', userId] as const,

  // — Programas de comunidad (#353) —
  // Ojo: NO son los programas de entrenamiento de `qk.programs`. Aquí van las
  // cohortes con hitos semanales; las claves llevan `community-` para que
  // invalidar una familia no toque la otra.
  communityPrograms: (userId: string | null) => ['community-programs', userId] as const,
  communityProgram: (programId: string, userId: string | null) =>
    ['community-program', programId, userId] as const,

  // — Cuerpo / salud —
  bodyMeasurements: (userId: string | null) =>
    ['body_measurements', userId] as const,
  // Sexo + altura + peso actuales para cálculos de composición corporal (#227)
  bodyProfile: (userId: string | null) => ['body_profile', userId] as const,
  bodyPhotos: (userId: string | null) => ['body_photos', userId] as const,
  // Condiciones médicas + lesiones (colección user_health, #247)
  userHealth: (userId: string | null) => ['user_health', userId] as const,
  weight: (userId: string | null) => ['weight', userId] as const,
  sleep: (userId: string | null) => ['sleepEntries', userId] as const,
  // — Integración smartwatch / health hub (Health Connect / HealthKit) —
  health: {
    all: ['health'] as const,
    status: (userId: string | null) => ['health', 'status', userId] as const,
    daily: (userId: string | null, date: string) =>
      ['health', 'daily', userId, date] as const,
    dailyRange: (userId: string | null, from: string, to: string) =>
      ['health', 'daily', 'range', userId, from, to] as const,
  },
  water: {
    day: (userId: string | null, date: string) =>
      ['water', userId, 'day', date] as const,
    goal: (userId: string | null) => ['water', userId, 'goal'] as const,
  },
  // — Insights cross-métrica (épica #128 Fase 2) —
  insights: {
    all: ['insights'] as const,
    cross: (userId: string | null, periodType: string) =>
      ['insights', 'cross', userId, periodType] as const,
    history: (userId: string | null, periodType: string) =>
      ['insights', 'history', userId, periodType] as const,
    // — Insight de sueño (issue #244 F5) —
    sleep: (userId: string | null, periodType: string) =>
      ['insights', 'sleep', userId, periodType] as const,
  },

  // — Nutrición —
  nutrition: {
    all: ['nutrition'] as const,
    today: (userId: string | null) => ['nutrition', 'today', userId] as const,
    byDate: (userId: string | null, date: string) =>
      ['nutrition', 'date', userId, date] as const,
    range: (userId: string | null, from: string, to: string) =>
      ['nutrition', 'range', userId, from, to] as const,
    goals: (userId: string | null) => ['nutrition', 'goals', userId] as const,
    badges: (userId: string | null) =>
      ['nutrition', 'badges', userId] as const,
    insightDaily: (userId: string | null, date: string) =>
      ['nutrition', 'insight', 'daily', userId, date] as const,
    insightWeekly: (userId: string | null, weekStart: string) =>
      ['nutrition', 'insight', 'weekly', userId, weekStart] as const,
  },
  foods: {
    search: (query: string) => ['foods', 'search', query] as const,
    barcode: (barcode: string) => ['foods', 'barcode', barcode] as const,
  },
  wgerSearch: (term: string, language: string) =>
    ['wger', 'search', term, language] as const,
  foodHistory: {
    recent: (userId: string | null, limit: number) =>
      ['food_history', 'recent', userId, limit] as const,
    hour: (userId: string | null, hour: number) =>
      ['food_history', 'hour', userId, hour] as const,
  },
  mealTemplates: (userId: string | null) => ['meal_templates', userId] as const,
  freeSessionTemplates: (userId: string | null) =>
    ['free_session_templates', userId] as const,
  mealReminders: (userId: string | null) => ['meal_reminders', userId] as const,
  weeklyMealPlan: {
    active: (userId: string | null) =>
      ['weekly_meal_plans', 'active', userId] as const,
    days: (planId: string) => ['weekly_meal_plans', 'days', planId] as const,
  },
  // Planes de UN día (colección meal_day_plans). Separada de weeklyMealPlan a
  // propósito: son colecciones distintas y se invalidan por separado.
  mealDayPlans: {
    all: ['meal_day_plans'] as const,
    active: (userId: string | null) =>
      ['meal_day_plans', 'active', userId] as const,
  },
  // "¿Cuántas comidas me alcanzan?" — derivado de la despensa, no de un plan.
  pantryCoverage: (userId: string | null, signature: string) =>
    ['pantry', 'coverage', userId, signature] as const,

  // — Cardio / carreras —
  races: {
    all: ['races'] as const,
    discover: (params: Record<string, unknown>) =>
      ['races', 'discover', params] as const,
    prsFinished: (userId: string | null) =>
      ['races', 'prs', 'finished', userId] as const,
    wins: (userId: string | null) => ['races', 'wins', userId] as const,
  },

  // Nota: el blog ya no usa React Query — los artículos son ficheros MDX
  // compilados en el bundle (`apps/web/src/lib/blog-content.ts`).

  // — Despensa (pantry, épica #153/#170) —
  pantry: {
    list: (userId: string | null) => ['pantry', 'list', userId] as const,
    history: (userId: string | null) => ['pantry', 'history', userId] as const,
    spend: (userId: string | null, weekStart: string) =>
      ['pantry', 'spend', userId, weekStart] as const,
    currency: (userId: string | null) => ['pantry', 'currency', userId] as const,
  },

  // — Shopping list (F3, issue #172) —
  shopping: {
    active: (userId: string | null) => ['shopping', 'active', userId] as const,
    lastDone: (userId: string | null) => ['shopping', 'lastDone', userId] as const,
    cadence: (userId: string | null) => ['shopping', 'cadence', userId] as const,
  },

  // — Recetas guardadas (issue #179) —
  savedRecipes: {
    list: (userId: string | null) => ['savedRecipes', 'list', userId] as const,
  },

  // — Batallas de circuito (issue #356) —
  battles: {
    // La barra flotante de las tabs; se invalida al terminar o salir de una batalla.
    active: () => ['battle', 'active'] as const,
    history: (userId: string | null) => ['battle', 'history', userId] as const,
  },
} as const
