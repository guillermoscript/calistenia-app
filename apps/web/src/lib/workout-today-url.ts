// Destinos de los avisos de «tu entrenamiento te espera» (#870).
//
// Desde #856 `/workout` sin `?day` es la pestaña Entrenar, no el día de hoy.
// Los avisos que prometen el entreno deben abrir el día concreto, con su
// botón de empezar. Vive fuera de `sw.ts` para poder testearse (allí tocar
// `self` al importar rompe vitest) y recibe el índice del día en vez de
// llamar a `localDay()`: el service worker no comparte el helper de zona
// horaria de core y usa `new Date().getDay()`.
import { DAY_BY_INDEX } from '@calistenia/core/lib/training-day'

/** `/workout?day=<id>` para el índice `getDay()` dado (0 = domingo). */
export function workoutTodayUrl(dayIndex: number): string {
  const id = DAY_BY_INDEX[dayIndex]
  return id ? `/workout?day=${id}` : '/workout'
}

/** Destino de un recordatorio local según su tipo. */
export function reminderUrl(type: string, dayIndex: number): string {
  switch (type) {
    case 'meal': return '/nutrition'
    case 'workout': return workoutTodayUrl(dayIndex)
    // «Pausa activa»: moverse un rato, no empezar el entreno.
    case 'pause': return '/lumbar'
    default: return '/'
  }
}
