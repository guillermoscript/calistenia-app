import { useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../lib/i18n'
import type { DriveStep } from 'driver.js'

const TOUR_KEY_PREFIX = 'calistenia_tour'

function tourKey(page: string, userId?: string): string {
  return userId ? `${TOUR_KEY_PREFIX}_${page}_${userId}` : `${TOUR_KEY_PREFIX}_${page}`
}

export function isPageTourDone(page: string, userId?: string): boolean {
  return localStorage.getItem(tourKey(page, userId)) === 'true'
}

function markPageTourDone(page: string, userId?: string): void {
  localStorage.setItem(tourKey(page, userId), 'true')
}

export function resetAllTours(userId?: string): void {
  const prefix = userId ? `${TOUR_KEY_PREFIX}_` : TOUR_KEY_PREFIX
  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(prefix)) keysToRemove.push(key)
  }
  keysToRemove.forEach(k => localStorage.removeItem(k))
}

// ── Tour definitions per page ─────────────────────────────────────────────────
// Each returns a fresh array so i18n.t() resolves with the current language.

function getDashboardSteps(): DriveStep[] {
  return [
    {
      element: '#tour-sidebar-nav',
      popover: {
        title: i18n.t('tour.dashboard.sidebar.title'),
        description: i18n.t('tour.dashboard.sidebar.desc'),
        side: 'right',
        align: 'start',
      },
    },
    {
      element: '#tour-active-program',
      popover: {
        title: i18n.t('tour.dashboard.activeProgram.title'),
        description: i18n.t('tour.dashboard.activeProgram.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-progress',
      popover: {
        title: i18n.t('tour.dashboard.progress.title'),
        description: i18n.t('tour.dashboard.progress.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-stats',
      popover: {
        title: i18n.t('tour.dashboard.stats.title'),
        description: i18n.t('tour.dashboard.stats.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-nutrition',
      popover: {
        title: i18n.t('tour.dashboard.nutrition.title'),
        description: i18n.t('tour.dashboard.nutrition.desc'),
        side: 'top',
      },
    },
    {
      element: '#tour-weekly-plan',
      popover: {
        title: i18n.t('tour.dashboard.weeklyPlan.title'),
        description: i18n.t('tour.dashboard.weeklyPlan.desc'),
        side: 'top',
      },
    },
  ]
}

function getWorkoutSteps(): DriveStep[] {
  return [
    {
      element: '#tour-phase-selector',
      popover: {
        title: i18n.t('tour.workout.phaseSelector.title'),
        description: i18n.t('tour.workout.phaseSelector.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-day-selector',
      popover: {
        title: i18n.t('tour.workout.daySelector.title'),
        description: i18n.t('tour.workout.daySelector.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-workout-header',
      popover: {
        title: i18n.t('tour.workout.header.title'),
        description: i18n.t('tour.workout.header.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-first-exercise',
      popover: {
        title: i18n.t('tour.workout.exerciseCard.title'),
        description: i18n.t('tour.workout.exerciseCard.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-exercise-list',
      popover: {
        title: i18n.t('tour.workout.quickLog.title'),
        description: i18n.t('tour.workout.quickLog.desc'),
        side: 'top',
      },
    },
    {
      element: '#tour-edit-set',
      popover: {
        title: i18n.t('tour.workout.editSet.title'),
        description: i18n.t('tour.workout.editSet.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-start-session',
      popover: {
        title: i18n.t('tour.workout.guidedSession.title'),
        description: i18n.t('tour.workout.guidedSession.desc'),
        side: 'top',
      },
    },
  ]
}

function getProgramsSteps(): DriveStep[] {
  return [
    {
      element: '#tour-programs-filters',
      popover: {
        title: i18n.t('tour.programs.filters.title'),
        description: i18n.t('tour.programs.filters.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-programs-search',
      popover: {
        title: i18n.t('tour.programs.search.title'),
        description: i18n.t('tour.programs.search.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-create-program',
      popover: {
        title: i18n.t('tour.programs.create.title'),
        description: i18n.t('tour.programs.create.desc'),
        side: 'left',
      },
    },
  ]
}

function getNutritionSteps(): DriveStep[] {
  return [
    {
      element: '#tour-nutrition-date',
      popover: {
        title: i18n.t('tour.nutrition.date.title'),
        description: i18n.t('tour.nutrition.date.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-nutrition-dashboard',
      popover: {
        title: i18n.t('tour.nutrition.dashboard.title'),
        description: i18n.t('tour.nutrition.dashboard.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-nutrition-score',
      popover: {
        title: i18n.t('tour.nutrition.score.title'),
        description: i18n.t('tour.nutrition.score.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-meal-logger',
      popover: {
        title: i18n.t('tour.nutrition.mealLogger.title'),
        description: i18n.t('tour.nutrition.mealLogger.desc'),
        side: 'top',
      },
    },
  ]
}

function getProgressSteps(): DriveStep[] {
  return [
    {
      element: '#tour-progress-summary',
      popover: {
        title: i18n.t('tour.progress.summary.title'),
        description: i18n.t('tour.progress.summary.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-exercise-charts',
      popover: {
        title: i18n.t('tour.progress.charts.title'),
        description: i18n.t('tour.progress.charts.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-session-history',
      popover: {
        title: i18n.t('tour.progress.history.title'),
        description: i18n.t('tour.progress.history.desc'),
        side: 'top',
      },
    },
  ]
}

function getExercisesSteps(): DriveStep[] {
  return [
    {
      element: '#tour-exercises-search',
      popover: {
        title: i18n.t('tour.exercises.search.title'),
        description: i18n.t('tour.exercises.search.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-category-filters',
      popover: {
        title: i18n.t('tour.exercises.categoryFilters.title'),
        description: i18n.t('tour.exercises.categoryFilters.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-exercise-grid',
      popover: {
        title: i18n.t('tour.exercises.catalog.title'),
        description: i18n.t('tour.exercises.catalog.desc'),
        side: 'top',
      },
    },
  ]
}

function getProfileSteps(): DriveStep[] {
  return [
    {
      element: '#tour-personal-info',
      popover: {
        title: i18n.t('tour.profile.personalInfo.title'),
        description: i18n.t('tour.profile.personalInfo.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-level-selector',
      popover: {
        title: i18n.t('tour.profile.level.title'),
        description: i18n.t('tour.profile.level.desc'),
        side: 'bottom',
      },
    },
  ]
}

function getFeedSteps(): DriveStep[] {
  return [
    {
      element: '#tour-feed-list',
      popover: {
        title: i18n.t('tour.feed.list.title'),
        description: i18n.t('tour.feed.list.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-feed-reaction',
      popover: {
        title: i18n.t('tour.feed.reaction.title'),
        description: i18n.t('tour.feed.reaction.desc'),
        side: 'top',
      },
    },
  ]
}

function getFriendsSteps(): DriveStep[] {
  return [
    {
      element: '#tour-friends-tabs',
      popover: {
        title: i18n.t('tour.friends.tabs.title'),
        description: i18n.t('tour.friends.tabs.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-friends-search',
      popover: {
        title: i18n.t('tour.friends.search.title'),
        description: i18n.t('tour.friends.search.desc'),
        side: 'bottom',
      },
    },
  ]
}

function getLeaderboardSteps(): DriveStep[] {
  return [
    {
      element: '#tour-leaderboard-categories',
      popover: {
        title: i18n.t('tour.leaderboard.categories.title'),
        description: i18n.t('tour.leaderboard.categories.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-leaderboard-list',
      popover: {
        title: i18n.t('tour.leaderboard.ranking.title'),
        description: i18n.t('tour.leaderboard.ranking.desc'),
        side: 'top',
      },
    },
  ]
}

function getChallengesSteps(): DriveStep[] {
  return [
    {
      element: '#tour-challenges-create',
      popover: {
        title: i18n.t('tour.challenges.create.title'),
        description: i18n.t('tour.challenges.create.desc'),
        side: 'left',
      },
    },
    {
      element: '#tour-challenges-filters',
      popover: {
        title: i18n.t('tour.challenges.filters.title'),
        description: i18n.t('tour.challenges.filters.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-challenges-list',
      popover: {
        title: i18n.t('tour.challenges.list.title'),
        description: i18n.t('tour.challenges.list.desc'),
        side: 'top',
      },
    },
  ]
}

function getCardioSteps(): DriveStep[] {
  return [
    {
      element: '#tour-cardio-activity',
      popover: {
        title: i18n.t('tour.cardio.activity.title'),
        description: i18n.t('tour.cardio.activity.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-cardio-start',
      popover: {
        title: i18n.t('tour.cardio.start.title'),
        description: i18n.t('tour.cardio.start.desc'),
        side: 'top',
      },
    },
    {
      element: '#tour-cardio-history',
      popover: {
        title: i18n.t('tour.cardio.history.title'),
        description: i18n.t('tour.cardio.history.desc'),
        side: 'top',
      },
    },
    {
      element: '#tour-cardio-stats',
      popover: {
        title: i18n.t('tour.cardio.stats.title'),
        description: i18n.t('tour.cardio.stats.desc'),
        side: 'top',
      },
    },
  ]
}

function getFreeSessionSteps(): DriveStep[] {
  return [
    {
      element: '#tour-free-search',
      popover: {
        title: i18n.t('tour.freeSession.search.title'),
        description: i18n.t('tour.freeSession.search.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-free-categories',
      popover: {
        title: i18n.t('tour.freeSession.categories.title'),
        description: i18n.t('tour.freeSession.categories.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-free-catalog',
      popover: {
        title: i18n.t('tour.freeSession.catalog.title'),
        description: i18n.t('tour.freeSession.catalog.desc'),
        side: 'top',
      },
    },
    {
      element: '#tour-free-bar',
      popover: {
        title: i18n.t('tour.freeSession.bar.title'),
        description: i18n.t('tour.freeSession.bar.desc'),
        side: 'top',
      },
    },
  ]
}

function getCalendarSteps(): DriveStep[] {
  return [
    {
      element: '#tour-calendar-nav',
      popover: {
        title: i18n.t('tour.calendar.nav.title'),
        description: i18n.t('tour.calendar.nav.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-calendar-grid',
      popover: {
        title: i18n.t('tour.calendar.grid.title'),
        description: i18n.t('tour.calendar.grid.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-calendar-detail',
      popover: {
        title: i18n.t('tour.calendar.detail.title'),
        description: i18n.t('tour.calendar.detail.desc'),
        side: 'top',
      },
    },
  ]
}

function getMealLoggerSteps(): DriveStep[] {
  return [
    {
      element: '#tour-meallog-type',
      popover: {
        title: i18n.t('tour.mealLogger.type.title'),
        description: i18n.t('tour.mealLogger.type.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-meallog-input',
      popover: {
        title: i18n.t('tour.mealLogger.input.title'),
        description: i18n.t('tour.mealLogger.input.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-meallog-barcode',
      popover: {
        title: i18n.t('tour.mealLogger.barcode.title'),
        description: i18n.t('tour.mealLogger.barcode.desc'),
        side: 'top',
      },
    },
  ]
}

function getRemindersSteps(): DriveStep[] {
  return [
    {
      element: '#tour-reminders-add',
      popover: {
        title: i18n.t('tour.reminders.add.title'),
        description: i18n.t('tour.reminders.add.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-reminders-timeline',
      popover: {
        title: i18n.t('tour.reminders.timeline.title'),
        description: i18n.t('tour.reminders.timeline.desc'),
        side: 'top',
      },
    },
  ]
}

function getCircuitSteps(): DriveStep[] {
  return [
    {
      element: '#tour-circuit-presets',
      popover: {
        title: i18n.t('tour.circuit.presets.title'),
        description: i18n.t('tour.circuit.presets.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-circuit-custom',
      popover: {
        title: i18n.t('tour.circuit.custom.title'),
        description: i18n.t('tour.circuit.custom.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-circuit-mode',
      popover: {
        title: i18n.t('tour.circuit.mode.title'),
        description: i18n.t('tour.circuit.mode.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-circuit-config',
      popover: {
        title: i18n.t('tour.circuit.config.title'),
        description: i18n.t('tour.circuit.config.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-circuit-add',
      popover: {
        title: i18n.t('tour.circuit.add.title'),
        description: i18n.t('tour.circuit.add.desc'),
        side: 'top',
      },
    },
    {
      element: '#tour-circuit-start',
      popover: {
        title: i18n.t('tour.circuit.start.title'),
        description: i18n.t('tour.circuit.start.desc'),
        side: 'top',
      },
    },
  ]
}

// Map page paths to their tour steps
const PAGE_TOURS: Record<string, { page: string; getSteps: () => DriveStep[] }> = {
  '/': { page: 'dashboard', getSteps: getDashboardSteps },
  '/workout': { page: 'workout', getSteps: getWorkoutSteps },
  '/programs': { page: 'programs', getSteps: getProgramsSteps },
  '/nutrition': { page: 'nutrition', getSteps: getNutritionSteps },
  '/progress': { page: 'progress', getSteps: getProgressSteps },
  '/exercises': { page: 'exercises', getSteps: getExercisesSteps },
  '/profile': { page: 'profile', getSteps: getProfileSteps },
  '/feed': { page: 'feed', getSteps: getFeedSteps },
  '/friends': { page: 'friends', getSteps: getFriendsSteps },
  '/leaderboard': { page: 'leaderboard', getSteps: getLeaderboardSteps },
  '/challenges': { page: 'challenges', getSteps: getChallengesSteps },
  '/cardio': { page: 'cardio', getSteps: getCardioSteps },
  '/free-session': { page: 'free-session', getSteps: getFreeSessionSteps },
  '/calendar': { page: 'calendar', getSteps: getCalendarSteps },
  '/nutrition/log': { page: 'meal-logger', getSteps: getMealLoggerSteps },
  '/reminders': { page: 'reminders', getSteps: getRemindersSteps },
  '/circuit': { page: 'circuit', getSteps: getCircuitSteps },
}

// ── Driver.js runner ──────────────────────────────────────────────────────────

interface TourLabels {
  next: string
  prev: string
  done: string
  progress: string
}

async function runTour(steps: DriveStep[], onDone?: () => void, labels?: TourLabels) {
  const available = steps.filter(
    s => !s.element || document.querySelector(s.element as string)
  )
  if (available.length === 0) return

  const [{ driver: createDriver }] = await Promise.all([
    import('driver.js'),
    import('driver.js/dist/driver.css'),
  ])

  const d = createDriver({
    showProgress: true,
    animate: true,
    overlayColor: 'rgba(0, 0, 0, 0.75)',
    stagePadding: 8,
    stageRadius: 12,
    popoverClass: 'calistenia-tour-popover',
    nextBtnText: labels?.next || 'Next',
    prevBtnText: labels?.prev || 'Previous',
    doneBtnText: labels?.done || 'Done',
    progressText: labels?.progress || '{{current}} of {{total}}',
    steps: available,
    onDestroyed: onDone,
  })

  d.drive()
}

// ── Component ─────────────────────────────────────────────────────────────────

interface AppTourProps {
  pathname: string
  userId?: string
  autoStart?: boolean
}

export default function AppTour({ pathname, userId, autoStart = false }: AppTourProps) {
  const { t } = useTranslation()
  const hasRun = useRef(false)

  const tourLabels: TourLabels = {
    next: t('tour.next'),
    prev: t('tour.prev'),
    done: t('tour.done'),
    progress: t('tour.progress', { current: '{{current}}', total: '{{total}}' }),
  }

  useEffect(() => {
    hasRun.current = false
  }, [pathname])

  useEffect(() => {
    if (!autoStart || hasRun.current) return

    const tourDef = PAGE_TOURS[pathname]
    if (!tourDef) return
    if (isPageTourDone(tourDef.page, userId)) return

    hasRun.current = true
    const timer = setTimeout(() => {
      runTour(tourDef.getSteps(), () => markPageTourDone(tourDef.page, userId), tourLabels)
    }, 800)

    return () => clearTimeout(timer)
  }, [pathname, userId, autoStart]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

/** Replay tour for the current page — called from the "?" button */
export function replayTourForPage(pathname: string) {
  const tourDef = PAGE_TOURS[pathname]
  if (!tourDef) return
  runTour(tourDef.getSteps())
}

// ── Workout detail tour (triggered from WorkoutPage when content loads) ───────

function getWorkoutDetailSteps(): DriveStep[] {
  return [
    {
      element: '#tour-workout-header',
      popover: {
        title: i18n.t('tour.workoutDetail.header.title'),
        description: i18n.t('tour.workoutDetail.header.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-first-exercise',
      popover: {
        title: i18n.t('tour.workoutDetail.exerciseCard.title'),
        description: i18n.t('tour.workoutDetail.exerciseCard.desc'),
        side: 'bottom',
      },
    },
    {
      element: '#tour-exercise-list',
      popover: {
        title: i18n.t('tour.workoutDetail.quickLog.title'),
        description: i18n.t('tour.workoutDetail.quickLog.desc'),
        side: 'top',
      },
    },
    {
      element: '#tour-start-session',
      popover: {
        title: i18n.t('tour.workoutDetail.guidedSession.title'),
        description: i18n.t('tour.workoutDetail.guidedSession.desc'),
        side: 'top',
      },
    },
  ]
}

/**
 * Trigger the workout detail tour (when a day is selected for the first time).
 * Call from WorkoutPage when workout content renders.
 */
export function triggerWorkoutDetailTour(userId?: string) {
  if (isPageTourDone('workout-detail', userId)) return
  setTimeout(() => {
    runTour(getWorkoutDetailSteps(), () => markPageTourDone('workout-detail', userId))
  }, 500)
}
