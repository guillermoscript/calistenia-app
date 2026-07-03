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

  // — Social / feed —
  follows: (userId: string | null) => ['follows', userId] as const,
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
    catalog: ['programs', 'catalog'] as const,
    activeEnrollment: (userId: string | null) =>
      ['programs', 'activeEnrollment', userId] as const,
    detail: (programId: string | null) =>
      ['programs', 'detail', programId] as const,
  },
  programEditor: (programId: string | null) =>
    ['programEditor', programId] as const,
  progressions: ['exercise_progressions'] as const,
  sessions: (userId: string | null, activeProgramId: string | null) =>
    ['sessions', userId, activeProgramId] as const,
  setsLog: (userId: string | null) => ['sets_log', userId] as const,
  userSettings: (userId: string | null) => ['user_settings', userId] as const,
  restPreferences: (userId: string | null) =>
    ['restPreferences', userId] as const,
  favorites: (userId: string | null) => ['favorites', userId] as const,
  workoutReminders: (userId: string | null) =>
    ['workout_reminders', userId] as const,

  // — Stats / leaderboard / perfil —
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

  // — Cuerpo / salud —
  bodyMeasurements: (userId: string | null) =>
    ['body_measurements', userId] as const,
  bodyPhotos: (userId: string | null) => ['body_photos', userId] as const,
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

  // — Cardio / carreras —
  races: {
    discover: (params: Record<string, unknown>) =>
      ['races', 'discover', params] as const,
    prsFinished: (userId: string | null) =>
      ['race_participants', 'finished', userId] as const,
    wins: (userId: string | null) => ['race_wins', userId] as const,
  },

  // — Contenido —
  blogPosts: (page: number, category: string | null) =>
    ['blog_posts', page, category] as const,
  blogPost: (slug: string, locale: string) =>
    ['blog_post', slug, locale] as const,
} as const
