import { useEffect, useCallback } from 'react'
import { driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'

const TOUR_DONE_KEY = 'calistenia_tour_done'

export function isTourDone(): boolean {
  return localStorage.getItem(TOUR_DONE_KEY) === 'true'
}

export function resetTour(): void {
  localStorage.removeItem(TOUR_DONE_KEY)
}

const TOUR_STEPS: DriveStep[] = [
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
      description: 'Este es el programa que sigues actualmente. Puedes cambiarlo o crear uno propio en la seccion de Programas.',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '#tour-progress',
    popover: {
      title: 'Progreso del programa',
      description: 'Aqui ves en que fase estas y cuanto llevas del programa total. Avanza semana a semana.',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '#tour-stats',
    popover: {
      title: 'Tus estadisticas',
      description: 'Sesiones completadas, racha de dias consecutivos, meta semanal y porcentaje del programa.',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '#tour-nutrition',
    popover: {
      title: 'Nutricion con IA',
      description: 'Saca una foto de tu comida y la IA analiza calorias y macros automaticamente.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '#tour-weekly-plan',
    popover: {
      title: 'Plan semanal',
      description: 'Tu semana de entrenamiento. Cada dia tiene un enfoque diferente: empuje, tiron, piernas, etc.',
      side: 'top',
      align: 'center',
    },
  },
]

interface AppTourProps {
  /** If true, start the tour automatically (for first-time users after onboarding) */
  autoStart?: boolean
}

export default function AppTour({ autoStart = false }: AppTourProps) {
  const startTour = useCallback(() => {
    // Filter steps to only those whose elements exist in the DOM
    const availableSteps = TOUR_STEPS.filter(
      (step) => !step.element || document.querySelector(step.element as string)
    )
    if (availableSteps.length === 0) return

    const driverObj = driver({
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
      steps: availableSteps,
      onDestroyed: () => {
        localStorage.setItem(TOUR_DONE_KEY, 'true')
      },
    })

    driverObj.drive()
  }, [])

  useEffect(() => {
    if (autoStart && !isTourDone()) {
      // Small delay to let the dashboard render fully
      const timer = setTimeout(startTour, 800)
      return () => clearTimeout(timer)
    }
  }, [autoStart, startTour])

  return null
}

/** Standalone function — call from anywhere to replay the tour */
export function startAppTour() {
  const availableSteps = TOUR_STEPS.filter(
    (step) => !step.element || document.querySelector(step.element as string)
  )
  if (availableSteps.length === 0) return

  const driverObj = driver({
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
    steps: availableSteps,
  })

  driverObj.drive()
}
