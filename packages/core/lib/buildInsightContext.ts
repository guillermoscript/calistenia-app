/**
 * buildInsightContext — fachada de CLIENTE (web/mobile) sobre
 * `insightContext.ts`, que es la implementación única del rollup (#480).
 *
 * Aquí sólo se inyecta lo que la app tiene fijado en el login: el singleton
 * `pb`, la zona horaria de dateUtils y la lectura de calendario mes a mes
 * (`fetchMonthActivity`, la misma fuente que el calendario). El servidor
 * inyecta lo suyo desde mcp-server/src/api/insight-context-server.ts.
 *
 * Los tipos (InsightContext/InsightDayRow/InsightSummary/...) viven en
 * insightContext.ts y se re-exportan para no romper a los hooks.
 */

import { pb } from './pocketbase'
import { getTimezone } from './dateUtils'
import { fetchMonthActivity } from './monthActivity'
import {
  buildInsightContext as buildInsightContextWith,
  emptyInsightActivity,
  mergeInsightActivity,
  monthsInRange,
  type BuildInsightContextOptions,
  type InsightActivity,
  type InsightContext,
} from './insightContext'

export type {
  InsightBodyProfile,
  InsightDayRow,
  InsightSummary,
  InsightContext,
  InsightActivity,
  InsightDeps,
  BuildInsightContextOptions,
} from './insightContext'
export {
  monthsInRange,
  mergeInsightActivity,
  previousWindow,
  buildDayRows,
  summarizeRows,
  emptyInsightActivity,
} from './insightContext'

/**
 * Calendario en [start, end]: un fetch por mes calendario que la ventana toca,
 * combinados en uno solo.
 * SECUENCIAL a propósito: una ventana trailing puede tocar 2 meses; llamar a
 * fetchMonthActivity concurrentemente dispararía requests idénticos por
 * colección (mismo path) que el SDK de PocketBase auto-cancela
 * (ClientResponseError 0) → todas las métricas vacías. Awaitar cada mes evita
 * la colisión.
 */
async function fetchActivityByMonths(userId: string, start: string, end: string): Promise<InsightActivity> {
  const activities: InsightActivity[] = []
  for (const { year, month0 } of monthsInRange(start, end)) {
    try {
      activities.push(await fetchMonthActivity(userId, year, month0))
    } catch (err) {
      console.warn('buildInsightContext: fetchMonthActivity failed', year, month0, err)
      activities.push(emptyInsightActivity())
    }
  }
  return mergeInsightActivity(activities)
}

/**
 * Agrega la actividad de `userId` en los últimos `days` (7 o 30) días en un
 * InsightContext compacto para alimentar un LLM, con el `pb` y la zona horaria
 * de la sesión actual. Ver `insightContext.ts` para el contrato completo.
 */
export function buildInsightContext(userId: string, opts: BuildInsightContextOptions): Promise<InsightContext> {
  return buildInsightContextWith({ pb, tz: getTimezone(), fetchActivity: fetchActivityByMonths }, userId, opts)
}
