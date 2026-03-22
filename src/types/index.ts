// ─── Workout & Program Data ──────────────────────────────────────────────────

export type DayId = 'lun' | 'mar' | 'mie' | 'jue' | 'vie' | 'sab' | 'dom'

export type DayType = 'push' | 'pull' | 'lumbar' | 'legs' | 'full' | 'rest'

export type Priority = 'high' | 'med' | 'low'

export interface Exercise {
  id: string
  name: string
  /** Usually a number, but can be a string like "m\u00FAltiples" or "intentos" */
  sets: number | string
  reps: string
  rest: number
  muscles: string
  note: string
  youtube: string
  priority: Priority
  isTimer?: boolean
  timerSeconds?: number
  pbRecordId?: string
  demoImages?: string[]
  demoVideo?: string
  supersetGroup?: string  // exercises with same group ID are done back-to-back
  equipment?: string[]
}

export interface Workout {
  phase: number
  day: DayId
  title: string
  exercises: Exercise[]
}

/** Keyed as `p${phase}_${day}`, e.g. "p1_lun" */
export type WorkoutsMap = Record<string, Workout>

export interface Phase {
  id: number
  name: string
  weeks: string
  color: string
  bg: string
}

export interface WeekDay {
  id: DayId
  name: string
  focus: string
  type: DayType
  color: string
}

// ─── Progress & Sessions ─────────────────────────────────────────────────────

export interface SetData {
  reps: string
  note: string
  weight?: number
  rpe?: number  // Rate of Perceived Exertion 1-10
  timestamp: number
}

export interface ExerciseLog {
  sets: SetData[]
  date: string
  workoutKey: string
  exerciseId: string
}

export interface SessionDone {
  done: true
  date: string
  workoutKey: string
  completedAt?: number
  note: string
}

/** The progress map stores both exercise logs and session-done markers */
export type ProgressMap = Record<string, ExerciseLog | SessionDone>

export interface Settings {
  phase: number
  startDate: string | null
  weeklyGoal: number
  pr_pullups?: number
  pr_pushups?: number
  pr_lsit?: number
  pr_pistol?: number
  pr_handstand?: number
}

// ─── Auth ────────────────────────────────────────────────────────────────────

/**
 * PocketBase user record shape.
 * The exact fields depend on the PB `users` collection schema;
 * these are the ones used throughout the app.
 */
export interface User {
  id: string
  email: string
  name?: string
  avatar?: string
  created?: string
  updated?: string
}

// ─── Work Day ────────────────────────────────────────────────────────────────

export type PauseType = '25' | '60'

export interface Pause {
  at: string   // ISO timestamp
  type: PauseType
}

export interface WorkDay {
  workStart: string | null   // ISO timestamp
  workEnd: string | null     // ISO timestamp
  pauses: Pause[]
  date: string               // YYYY-MM-DD
}

// ─── Lumbar Page ─────────────────────────────────────────────────────────────

export interface ProtocolExercise {
  name: string
  time: number | null
  reps: string
  note: string
  youtube: string
  isTimer?: boolean
}

export interface Protocol {
  id: string
  name: string
  desc: string
  accent: string
  border: string
  badge: string
  dot: string
  duration: string
  exercises: ProtocolExercise[]
}

export interface LumbarCheck {
  date: string
  lumbar_score: number       // 1-5
  slept_well?: boolean       // derived from sleep_entries when available
  sitting_hours: number
  created_at: string         // ISO timestamp
}

// ─── Exercise Media ─────────────────────────────────────────────────────────

export interface ExerciseMedia {
  pbRecordId?: string
  demoImages?: string[]
  demoVideo?: string
}

// ─── Programs ────────────────────────────────────────────────────────────────

export type UserRole = 'user' | 'editor' | 'admin'
export type UserTier = 'free' | 'premium'
export type ProgramDifficulty = 'beginner' | 'intermediate' | 'advanced'

export interface ProgramMeta {
  id: string
  name: string
  description: string
  duration_weeks: number
  created_by?: string
  created_by_name?: string
  is_official?: boolean
  is_featured?: boolean
  difficulty?: ProgramDifficulty
  cover_image?: string
  /** Resolved cover image URL (built from PB file service) */
  cover_image_url?: string
}

// ─── Nutrition ──────────────────────────────────────────────────────────────

export type FoodCategory =
  | 'proteinas'
  | 'carbohidratos'
  | 'frutas'
  | 'verduras'
  | 'lacteos'
  | 'grasas'
  | 'legumbres'
  | 'bebidas'
  | 'procesados'
  | 'otros'

export type PortionUnit = 'g' | 'kg' | 'ml' | 'L' | 'oz' | 'unidad'

export const UNIT_WEIGHT_GRAMS: Record<PortionUnit, number> = {
  g: 1,
  kg: 1000,
  ml: 1,
  L: 1000,
  oz: 28.35,
  unidad: 100,
}

export interface FoodItem {
  name: string
  portionAmount: number
  portionUnit: PortionUnit
  unitWeightInGrams: number
  calories: number
  protein: number
  carbs: number
  fat: number
  baseCal100: number
  baseProt100: number
  baseCarbs100: number
  baseFat100: number
  category?: FoodCategory
  tags?: string[]
  portionNote?: string
}

export type MealType = 'desayuno' | 'almuerzo' | 'cena' | 'snack'

export interface MealTemplate {
  id?: string
  user?: string
  name: string
  foods: FoodItem[]
  mealType: MealType
  usageCount: number
  lastUsedAt: string
}

export interface FoodHistoryItem {
  id?: string
  user?: string
  foodData: FoodItem
  mealType: MealType
  loggedHour: number
  usageCount: number
  lastUsedAt: string
}

export interface MealReminder {
  id?: string
  user?: string
  mealType: MealType
  hour: number
  minute: number
  enabled: boolean
  daysOfWeek: number[]
}

export interface NutritionEntry {
  id?: string
  user?: string
  /** @deprecated Use photoUrls instead */
  photoUrl?: string
  photoUrls?: string[]
  mealType: 'desayuno' | 'almuerzo' | 'cena' | 'snack'
  foods: FoodItem[]
  totalCalories: number
  totalProtein: number
  totalCarbs: number
  totalFat: number
  aiModel?: string
  loggedAt: string
}

export type NutritionGoalType = 'muscle_gain' | 'fat_loss' | 'recomp' | 'maintain'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
export type Sex = 'male' | 'female'

export interface NutritionGoal {
  id?: string
  user?: string
  dailyCalories: number
  dailyProtein: number
  dailyCarbs: number
  dailyFat: number
  goal: NutritionGoalType
  weight: number
  height: number
  age: number
  sex: Sex
  activityLevel: ActivityLevel
}

export interface DailyTotals {
  calories: number
  protein: number
  carbs: number
  fat: number
}

// ─── Exercise Progressions ─────────────────────────────────────────────────

export interface ExerciseProgression {
  id?: string
  exerciseId: string
  exerciseName: string
  category: string
  difficultyOrder: number
  nextExerciseId?: string
  prevExerciseId?: string
  targetRepsToAdvance: number
  sessionsAtTarget: number
}

// ─── Cardio / GPS ─────────────────────────────────────────────────────────
export type CardioActivityType = 'running' | 'walking' | 'cycling'

export interface GpsPoint {
  lat: number
  lng: number
  alt?: number
  timestamp: number
  speed?: number
  accuracy?: number
}

export interface KmSplit {
  km: number
  time_seconds: number
  pace: number // min/km
}

export interface CardioSession {
  id?: string
  user?: string
  activity_type: CardioActivityType
  gps_points: GpsPoint[]
  distance_km: number
  duration_seconds: number
  avg_pace: number
  elevation_gain: number
  started_at: string
  finished_at: string
  note?: string
  calories_burned?: number
  max_pace?: number
  avg_speed_kmh?: number
  max_speed_kmh?: number
  splits?: KmSplit[]
}

// ─── Challenges ──────────────────────────────────────────────────────────────

export type ChallengeMetric = 'most_sessions' | 'most_pullups' | 'most_pushups' | 'longest_streak' | 'most_lsit' | 'most_handstand' | 'custom'
export type ChallengeStatus = 'active' | 'ended'

export interface Challenge {
  id: string
  creator: string
  title: string
  metric: ChallengeMetric
  custom_metric?: string
  description?: string
  goal?: number
  starts_at: string
  ends_at: string
  status: ChallengeStatus
}

export interface ChallengeParticipant {
  id: string
  challenge: string
  user: string
}

// ─── Sleep Tracking ──────────────────────────────────────────────────────────

export interface SleepEntry {
  id: string
  user: string
  date: string
  bedtime: string
  wake_time: string
  awakenings: number
  quality: number
  duration_minutes: number
  caffeine?: boolean
  screen_before_bed?: boolean
  stress_level?: number
  note?: string
  created: string
  updated: string
}
