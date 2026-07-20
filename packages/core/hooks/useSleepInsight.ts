/**
 * useSleepInsight — puente cliente entre datos, AI y UI para el resumen de
 * patrones de sueño (issue #244, Fase 5). Mismo patrón que useCrossInsights
 * (épica #128 Fase 2), simplificado a un solo periodo semanal y sin
 * comparación con el periodo anterior (el endpoint de sueño no la necesita).
 *
 * - Lee el último insight del usuario desde `sleep_insights`.
 * - `generate()` construye el contexto (buildInsightContext), lo envía a
 *   `/api/generate-sleep-insight`, persiste el resultado en `sleep_insights`
 *   y actualiza la caché.
 * - Gate de 24h: si ya hay un insight fresco (<24h) del mismo tipo de
 *   periodo, NO regenera (ahorra tokens AI). Se construye desde `generated_at`
 *   igual que useCrossInsights.
 * - `needsMoreData`: si la ventana tiene menos de MIN_INSIGHT_DAYS noches con
 *   datos de sueño, no llama al AI y expone el estado para que la UI muestre
 *   un nudge.
 * - Degradación: consume el contexto aunque falten datos de otras métricas
 *   (lo maneja buildInsightContext).
 */

import { useCallback, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { AI_API_URL } from '../lib/ai-api'
import { qk } from '../lib/query-keys'
import { buildInsightContext } from '../lib/buildInsightContext'
import { getPlatform } from '../platform'
import type { SleepInsightPayload } from '../types'

export type SleepInsightPeriodType = 'weekly' | 'monthly'

/** Mínimo de noches con datos de sueño en la ventana para que valga la pena generar. */
export const MIN_SLEEP_INSIGHT_DAYS = 3
const CACHE_MS = 24 * 60 * 60 * 1000

// Contrato compartido (issue #244): fuente única en packages/core/types.
// mcp-server/src/api/sleep-insight-generator.ts SleepInsightSchema DEBE coincidir.
export type { SleepInsightPayload }

export interface SleepInsight {
  id?: string
  periodType: SleepInsightPeriodType
  periodStart: string // YYYY-MM-DD local
  payload: SleepInsightPayload
  generatedAt?: string // ISO
}

// PB `period_start` se guarda como "YYYY-MM-DD 00:00:00.000Z" (igual que
// user_insights) — hay que reproducir esa cadena exacta al filtrar.
const pbPeriodStart = (date: string): string => `${date} 00:00:00.000Z`
const dateOnly = (raw: string): string => String(raw).split(' ')[0].split('T')[0]

function mapInsight(rec: any): SleepInsight {
  return {
    id: rec.id,
    periodType: rec.period_type,
    periodStart: dateOnly(rec.period_start),
    payload: rec.payload,
    generatedAt: rec.generated_at,
  }
}

/**
 * Reporta a Sentry (vía facade de plataforma) sin PII: solo la operación, el
 * tipo de periodo y el código de status de PB (si lo hay). El error original
 * se anexa como `cause` para que Sentry pueda inspeccionarlo, pero el mensaje
 * visible nunca incluye datos de usuario.
 */
function reportInsightError(op: string, periodType: SleepInsightPeriodType, err: unknown) {
  if ((err as any)?.isAbort) return
  const status = (err as any)?.status ?? (err as any)?.response?.status
  const wrapped = new Error(
    `[sleep-insight] ${op} failed (period=${periodType}${status != null ? `, pbStatus=${status}` : ''})`,
  )
  ;(wrapped as any).cause = err
  getPlatform().reportError?.(wrapped)
}

// Fuera del hook para estabilidad referencial (igual que useCrossInsights).
async function fetchLatestInsight(
  userId: string,
  periodType: SleepInsightPeriodType,
): Promise<SleepInsight | null> {
  try {
    const rec = await pb.collection('sleep_insights').getFirstListItem(
      pb.filter('user = {:uid} && period_type = {:pt}', { uid: userId, pt: periodType }),
      { sort: '-period_start', $autoCancel: false },
    )
    return mapInsight(rec)
  } catch (err) {
    // 404 = sin insight todavía (esperado, no reportar). Cualquier otro
    // status/error sí es una lectura fallida real.
    if ((err as any)?.status !== 404) reportInsightError('fetch-latest', periodType, err)
    return null
  }
}

export function useSleepInsight(
  userId: string | null,
  periodType: SleepInsightPeriodType = 'weekly',
) {
  const qc = useQueryClient()
  const [needsMoreData, setNeedsMoreData] = useState(false)
  const [notSaved, setNotSaved] = useState(false)

  const insightQuery = useQuery({
    queryKey: qk.insights.sleep(userId, periodType),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchLatestInsight(userId!, periodType),
  })

  const generateMutation = useMutation({
    mutationFn: async (): Promise<SleepInsight | null> => {
      if (!userId) return null

      // Gate de 24h: relee la fuente autoritativa (no la caché, que puede estar
      // stale) y si hay insight fresco del mismo periodo, no regenera.
      const existing = await fetchLatestInsight(userId, periodType)
      if (
        existing?.generatedAt &&
        Date.now() - new Date(existing.generatedAt).getTime() < CACHE_MS
      ) {
        setNeedsMoreData(false)
        return existing
      }

      const days = periodType === 'weekly' ? 7 : 30
      const context = await buildInsightContext(userId, { days, withPrevious: false })

      if (context.summary.sleep.daysLogged < MIN_SLEEP_INSIGHT_DAYS) {
        setNeedsMoreData(true)
        return null
      }
      setNeedsMoreData(false)
      setNotSaved(false) // nos comprometemos a generar — resetea el estado de guardado previo

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (pb.authStore.token) headers['Authorization'] = `Bearer ${pb.authStore.token}`

      const res = await fetch(`${AI_API_URL}/api/generate-sleep-insight`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ context }),
      })
      if (!res.ok) return null
      const data = await res.json()

      const payload: SleepInsightPayload = {
        headline: data.headline ?? '',
        avgDurationMin: data.avgDurationMin ?? 0,
        avgQuality: data.avgQuality ?? 0,
        bedtimeConsistency: data.bedtimeConsistency ?? 'variable',
        patterns: Array.isArray(data.patterns) ? data.patterns : [],
        suggestion: data.suggestion ?? '',
        trend: data.trend ?? 'stable',
        model_used: data.model_used,
      }

      const periodStart = context.period.start
      const record = {
        user: userId,
        period_type: periodType,
        period_start: pbPeriodStart(periodStart),
        payload,
      }

      const insight: SleepInsight = { periodType, periodStart, payload }

      // Persiste en PB: intenta actualizar el registro del mismo periodo (índice
      // único user+period_type+period_start), si no existe lo crea. Espeja el
      // patrón de useCrossInsights.
      try {
        const prev = await pb.collection('sleep_insights').getFirstListItem(
          pb.filter('user = {:uid} && period_type = {:pt} && period_start = {:ps}', {
            uid: userId,
            pt: periodType,
            ps: pbPeriodStart(periodStart),
          }),
          { $autoCancel: false },
        )
        const rec = await pb.collection('sleep_insights').update(prev.id, record)
        insight.id = rec.id
        insight.generatedAt = (rec as any).generated_at
      } catch {
        // No existía fila (404 esperado) → crear.
        try {
          const rec = await pb.collection('sleep_insights').create(record)
          insight.id = rec.id
          insight.generatedAt = (rec as any).generated_at
        } catch (createErr) {
          // ¿carrera del índice único? Re-lee: si ya existe, otro proceso la creó → actualiza (recuperación silenciosa).
          try {
            const raced = await pb.collection('sleep_insights').getFirstListItem(
              pb.filter('user = {:uid} && period_type = {:pt} && period_start = {:ps}', {
                uid: userId,
                pt: periodType,
                ps: pbPeriodStart(periodStart),
              }),
              { $autoCancel: false },
            )
            const rec = await pb.collection('sleep_insights').update(raced.id, record)
            insight.id = rec.id
            insight.generatedAt = (rec as any).generated_at
          } catch {
            // Error real e irrecuperable de persistencia.
            reportInsightError('persist', periodType, createErr)
            setNotSaved(true)
          }
        }
      }

      return insight
    },
    onSuccess: (insight) => {
      if (!insight || !userId) return
      qc.setQueryData(qk.insights.sleep(userId, periodType), insight)
    },
  })

  const generate = useCallback(async (): Promise<SleepInsight | null> => {
    if (!userId) return null
    return generateMutation.mutateAsync().catch(() => null)
  }, [userId, generateMutation])

  return {
    insight: insightQuery.data ?? null,
    isLoading: insightQuery.isLoading,
    isGenerating: generateMutation.isPending && !generateMutation.isPaused,
    generate,
    needsMoreData,
    periodType,
    notSaved,
  }
}
