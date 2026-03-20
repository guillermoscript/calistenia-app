import { useEffect, useCallback, useRef } from 'react'
import { driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'

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

const DASHBOARD_STEPS: DriveStep[] = [
  {
    element: '#tour-sidebar-nav',
    popover: {
      title: 'Navegacion',
      description: 'Desde aqui accedes a todas las secciones: entrenamientos, progreso, nutricion, programas y mas.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#tour-active-program',
    popover: {
      title: 'Tu programa activo',
      description: 'El programa que sigues actualmente. Puedes cambiarlo o crear uno en Programas.',
      side: 'bottom',
    },
  },
  {
    element: '#tour-progress',
    popover: {
      title: 'Progreso del programa',
      description: 'Tu fase actual y cuanto llevas del programa. Avanza semana a semana.',
      side: 'bottom',
    },
  },
  {
    element: '#tour-stats',
    popover: {
      title: 'Tus estadisticas',
      description: 'Sesiones, racha de dias, meta semanal y porcentaje completado.',
      side: 'bottom',
    },
  },
  {
    element: '#tour-nutrition',
    popover: {
      title: 'Nutricion con IA',
      description: 'Saca foto de tu comida y la IA calcula calorias y macros.',
      side: 'top',
    },
  },
  {
    element: '#tour-weekly-plan',
    popover: {
      title: 'Plan semanal',
      description: 'Tu semana: cada dia tiene un enfoque (empuje, tiron, piernas...). Los completados se marcan.',
      side: 'top',
    },
  },
]

const WORKOUT_STEPS: DriveStep[] = [
  {
    element: '#tour-phase-selector',
    popover: {
      title: 'Selector de fase',
      description: 'Elige la fase del programa. Cada fase dura varias semanas y aumenta en dificultad.',
      side: 'bottom',
    },
  },
  {
    element: '#tour-day-selector',
    popover: {
      title: 'Dia de entrenamiento',
      description: 'Cada dia tiene un enfoque diferente (empuje, tiron, piernas...). Puedes hacer cualquier entrenamiento en cualquier dia real — no estas limitado al calendario. Punto verde = hoy.',
      side: 'bottom',
    },
  },
  {
    element: '#tour-workout-header',
    popover: {
      title: 'Resumen del entrenamiento',
      description: 'Titulo, numero de ejercicios y duracion estimada del entrenamiento de hoy.',
      side: 'bottom',
    },
  },
  {
    element: '#tour-first-exercise',
    popover: {
      title: 'Tarjeta de ejercicio',
      description: 'Cada ejercicio muestra series x repeticiones, descanso, prioridad y musculos. La barra de color indica la prioridad.',
      side: 'bottom',
    },
  },
  {
    element: '#tour-exercise-list',
    popover: {
      title: 'Registro rapido',
      description: 'Toca "+ SERIE" para registrar cada serie. El contador sube automaticamente. Al completar todas las series, se inicia el descanso.',
      side: 'top',
    },
  },
  {
    element: '#tour-edit-set',
    popover: {
      title: 'Lastre y detalles',
      description: 'Toca el icono ✏ para abrir el formulario detallado. Ahi puedes registrar reps personalizadas, lastre en kg (ej: chaleco, mancuerna, banda), RPE (esfuerzo del 1-10) y una nota. El lastre se guarda en tu historial para trackear progresion.',
      side: 'bottom',
    },
  },
  {
    element: '#tour-start-session',
    popover: {
      title: 'Sesion guiada',
      description: 'Inicia el entrenamiento paso a paso. La app te guia ejercicio por ejercicio con temporizadores de descanso, sonidos y notificaciones.',
      side: 'top',
    },
  },
]

const PROGRAMS_STEPS: DriveStep[] = [
  {
    element: '#tour-programs-filters',
    popover: {
      title: 'Filtrar programas',
      description: 'Oficiales son los curados por coaches. Comunidad son los creados por usuarios. Mis Programas son los tuyos.',
      side: 'bottom',
    },
  },
  {
    element: '#tour-programs-search',
    popover: {
      title: 'Buscar',
      description: 'Busca programas por nombre o descripcion.',
      side: 'bottom',
    },
  },
  {
    element: '#tour-create-program',
    popover: {
      title: 'Crear programa',
      description: 'Crea tu propio programa con fases, dias y ejercicios personalizados.',
      side: 'left',
    },
  },
]

const NUTRITION_STEPS: DriveStep[] = [
  {
    element: '#tour-nutrition-date',
    popover: {
      title: 'Fecha',
      description: 'Navega entre dias para ver o registrar comidas de cualquier fecha.',
      side: 'bottom',
    },
  },
  {
    element: '#tour-nutrition-dashboard',
    popover: {
      title: 'Resumen nutricional',
      description: 'Tus macros del dia: calorias, proteina, carbohidratos y grasa vs tus objetivos.',
      side: 'bottom',
    },
  },
  {
    element: '#tour-meal-logger',
    popover: {
      title: 'Registrar comida',
      description: 'Saca una foto de tu comida y la IA analiza los nutrientes automaticamente.',
      side: 'top',
    },
  },
]

const PROGRESS_STEPS: DriveStep[] = [
  {
    element: '#tour-progress-summary',
    popover: {
      title: 'Resumen de progreso',
      description: 'Vision general: sesiones, rachas, semanas activas y mas.',
      side: 'bottom',
    },
  },
  {
    element: '#tour-exercise-charts',
    popover: {
      title: 'Graficas por ejercicio',
      description: 'Ve como evolucionan tus repeticiones y volumen en cada ejercicio a lo largo del tiempo.',
      side: 'bottom',
    },
  },
  {
    element: '#tour-session-history',
    popover: {
      title: 'Historial de sesiones',
      description: 'Todas tus sesiones completadas con fecha, fase y detalles.',
      side: 'top',
    },
  },
]

const EXERCISES_STEPS: DriveStep[] = [
  {
    element: '#tour-exercises-search',
    popover: {
      title: 'Buscar ejercicios',
      description: 'Busca por nombre entre todos los ejercicios disponibles.',
      side: 'bottom',
    },
  },
  {
    element: '#tour-category-filters',
    popover: {
      title: 'Filtrar por categoria',
      description: 'Filtra por tipo: empuje, tiron, piernas, core, movilidad y mas.',
      side: 'bottom',
    },
  },
  {
    element: '#tour-exercise-grid',
    popover: {
      title: 'Catalogo de ejercicios',
      description: 'Toca un ejercicio para ver videos, descripcion y como se ejecuta.',
      side: 'top',
    },
  },
]

const PROFILE_STEPS: DriveStep[] = [
  {
    element: '#tour-personal-info',
    popover: {
      title: 'Informacion personal',
      description: 'Tu nombre, peso y altura. Estos datos se usan para calculos de nutricion y objetivos.',
      side: 'bottom',
    },
  },
  {
    element: '#tour-level-selector',
    popover: {
      title: 'Nivel de experiencia',
      description: 'Indica tu nivel para que las recomendaciones se ajusten a tu experiencia.',
      side: 'bottom',
    },
  },
]

// Map page paths to their tour steps
const PAGE_TOURS: Record<string, { page: string; steps: DriveStep[] }> = {
  '/': { page: 'dashboard', steps: DASHBOARD_STEPS },
  '/workout': { page: 'workout', steps: WORKOUT_STEPS },
  '/programs': { page: 'programs', steps: PROGRAMS_STEPS },
  '/nutrition': { page: 'nutrition', steps: NUTRITION_STEPS },
  '/progress': { page: 'progress', steps: PROGRESS_STEPS },
  '/exercises': { page: 'exercises', steps: EXERCISES_STEPS },
  '/profile': { page: 'profile', steps: PROFILE_STEPS },
}

// ── Driver.js runner ──────────────────────────────────────────────────────────

function runTour(steps: DriveStep[], onDone?: () => void) {
  const available = steps.filter(
    s => !s.element || document.querySelector(s.element as string)
  )
  if (available.length === 0) return

  const d = driver({
    showProgress: true,
    animate: true,
    overlayColor: 'rgba(0, 0, 0, 0.75)',
    stagePadding: 8,
    stageRadius: 12,
    popoverClass: 'calistenia-tour-popover',
    nextBtnText: 'Siguiente',
    prevBtnText: 'Anterior',
    doneBtnText: 'Listo',
    progressText: '{{current}} de {{total}}',
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
  const hasRun = useRef(false)

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
      runTour(tourDef.steps, () => markPageTourDone(tourDef.page, userId))
    }, 800)

    return () => clearTimeout(timer)
  }, [pathname, userId, autoStart])

  return null
}

/** Replay tour for the current page — called from the "?" button */
export function replayTourForPage(pathname: string) {
  const tourDef = PAGE_TOURS[pathname]
  if (!tourDef) return
  runTour(tourDef.steps)
}

// ── Workout detail tour (triggered from WorkoutPage when content loads) ───────

const WORKOUT_DETAIL_STEPS: DriveStep[] = [
  {
    element: '#tour-workout-header',
    popover: {
      title: 'Tu entrenamiento',
      description: 'Aqui ves la fase, dia, numero de ejercicios y duracion estimada.',
      side: 'bottom',
    },
  },
  {
    element: '#tour-first-exercise',
    popover: {
      title: 'Tarjeta de ejercicio',
      description: 'Series x repeticiones, descanso entre series, prioridad (color) y musculos trabajados.',
      side: 'bottom',
    },
  },
  {
    element: '#tour-exercise-list',
    popover: {
      title: 'Registro rapido',
      description: 'Toca "+ SERIE" para registrar cada serie. El contador sube automaticamente y al completar se inicia el temporizador de descanso.',
      side: 'top',
    },
  },
  {
    element: '#tour-start-session',
    popover: {
      title: 'Sesion guiada',
      description: 'O inicia la sesion guiada: la app te lleva ejercicio por ejercicio con descansos, sonidos y notificaciones.',
      side: 'top',
    },
  },
]

/**
 * Trigger the workout detail tour (when a day is selected for the first time).
 * Call from WorkoutPage when workout content renders.
 */
export function triggerWorkoutDetailTour(userId?: string) {
  if (isPageTourDone('workout-detail', userId)) return
  setTimeout(() => {
    runTour(WORKOUT_DETAIL_STEPS, () => markPageTourDone('workout-detail', userId))
  }, 500)
}
