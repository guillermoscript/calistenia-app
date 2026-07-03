/**
 * useCrossInsights — puente cliente entre datos, AI y UI para los insights
 * cross-métrica (épica #128 Fase 2).
 *
 * - Lee el último insight del usuario desde `user_insights`.
 * - `generate()` construye el contexto (buildInsightContext), lo envía a
 *   `/api/generate-cross-insight`, persiste el resultado en `user_insights` y
 *   actualiza la caché — mismo patrón que useNutritionCoach para el weekly.
 * - Gate de 24h: si ya hay un insight fresco (<24h) del mismo tipo de periodo,
 *   NO regenera (ahorra tokens AI). Este gate NO existe en el codebase — se
 *   construye aquí desde `generated_at`.
 * - `needsMoreData`: si la ventana tiene menos de MIN_INSIGHT_DAYS días con
 *   datos, no llama al AI y expone el estado para que la UI muestre un nudge.
 * - Degradación: consume el contexto aunque falten datos de reloj (lo maneja
 *   buildInsightContext).
 */

import { useCallback, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { AI_API_URL } from '../lib/ai-api'
import { qk } from '../lib/query-keys'
import { buildInsightContext } from '../lib/buildInsightContext'
import { getPlatform } from '../platform'

export type InsightPeriodType = 'weekly' | 'monthly'

/** Mínimo de días con datos en la ventana para que valga la pena generar. */
export const MIN_INSIGHT_DAYS = 3
const CACHE_MS = 24 * 60 * 60 * 1000

export interface CrossInsightCorrelation {
  observation: string
  metrics: string[]
  strength: 'weak' | 'moderate' | 'strong'
}

export type CrossInsightActionType =
  | 'reminder_sleep'
  | 'reminder_water'
  | 'log_nutrition'
  | 'start_free_session'
  | 'none'

export interface CrossInsightAction {
  type: CrossInsightActionType
  label: string
}

export interface CrossInsightPayload {
  headline: string
  correlations: CrossInsightCorrelation[]
  wins: string[]
  watchouts: string[]
  suggestion: string
  period: string
  model_used?: string
  suggestedAction?: CrossInsightAction
  trend?: 'improving' | 'steady' | 'declining'
}

export interface CrossInsight {
  id?: string
  periodType: InsightPeriodType
  periodStart: string // YYYY-MM-DD local
  payload: CrossInsightPayload
  generatedAt?: string // ISO
}

// PB `period_start` se guarda como "YYYY-MM-DD 00:00:00.000Z" (igual que
// nutrition_coach_insights) — hay que reproducir esa cadena exacta al filtrar.
const pbPeriodStart = (date: string): string => `${date} 00:00:00.000Z`
const dateOnly = (raw: string): string => String(raw).split(' ')[0].split('T')[0]

function mapInsight(rec: any): CrossInsight {
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
function reportInsightError(op: string, periodType: InsightPeriodType, err: unknown) {
  // Sin PII: solo op + periodType + código de estado PB.
  if ((err as any)?.isAbort) return
  const status = (err as any)?.status ?? (err as any)?.response?.status
  const wrapped = new Error(
    `[cross-insights] ${op} failed (period=${periodType}${status != null ? `, pbStatus=${status}` : ''})`,
  )
  ;(wrapped as any).cause = err
  getPlatform().reportError?.(wrapped)
}

// Fuera del hook para estabilidad referencial (igual que useNutritionCoach).
async function fetchLatestInsight(
  userId: string,
  periodType: InsightPeriodType,
): Promise<CrossInsight | null> {
  try {
    const rec = await pb.collection('user_insights').getFirstListItem(
      pb.filter('user = {:uid} && period_type = {:pt}', { uid: userId, pt: periodType }),
      { sort: '-generated_at', $autoCancel: false },
    )
    return mapInsight(rec)
  } catch (err) {
    // 404 = sin insight todavía (esperado, no reportar). Cualquier otro
    // status/error sí es una lectura fallida real.
    if ((err as any)?.status !== 404) reportInsightError('fetch-latest', periodType, err)
    return null
  }
}

export function useCrossInsights(
  userId: string | null,
  periodType: InsightPeriodType = 'weekly',
) {
  const qc = useQueryClient()
  const [needsMoreData, setNeedsMoreData] = useState(false)
  const [notSaved, setNotSaved] = useState(false)

  const insightQuery = useQuery({
    queryKey: qk.insights.cross(userId, periodType),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchLatestInsight(userId!, periodType),
  })

  const generateMutation = useMutation({
    mutationFn: async (): Promise<CrossInsight | null> => {
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
      const context = await buildInsightContext(userId, { days, withPrevious: true })

      if (context.summary.daysWithAnyData < MIN_INSIGHT_DAYS) {
        setNeedsMoreData(true)
        return null
      }
      setNeedsMoreData(false)
      setNotSaved(false) // nos comprometemos a generar — resetea el estado de guardado previo

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (pb.authStore.token) headers['Authorization'] = `Bearer ${pb.authStore.token}`

      const res = await fetch(`${AI_API_URL}/api/generate-cross-insight`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ context }),
      })
      if (!res.ok) return null
      const data = await res.json()

      const payload: CrossInsightPayload = {
        headline: data.headline ?? '',
        correlations: Array.isArray(data.correlations) ? data.correlations : [],
        wins: Array.isArray(data.wins) ? data.wins : [],
        watchouts: Array.isArray(data.watchouts) ? data.watchouts : [],
        suggestion: data.suggestion ?? '',
        period: data.period ?? '',
        model_used: data.model_used,
        ...(data.suggestedAction ? { suggestedAction: data.suggestedAction } : {}),
        ...(data.trend ? { trend: data.trend } : {}),
      }

      const periodStart = context.period.start
      const record = {
        user: userId,
        period_type: periodType,
        period_start: pbPeriodStart(periodStart),
        payload,
      }

      const insight: CrossInsight = { periodType, periodStart, payload }

      // Persiste en PB: intenta actualizar el registro del mismo periodo (índice
      // único user+period_type+period_start), si no existe lo crea. Espeja el
      // patrón de useNutritionCoach.
      try {
        const prev = await pb.collection('user_insights').getFirstListItem(
          pb.filter('user = {:uid} && period_type = {:pt} && period_start = {:ps}', {
            uid: userId,
            pt: periodType,
            ps: pbPeriodStart(periodStart),
          }),
          { $autoCancel: false },
        )
        const rec = await pb.collection('user_insights').update(prev.id, record)
        insight.id = rec.id
        insight.generatedAt = (rec as any).generated_at
      } catch {
        // No existía fila (404 esperado) → crear.
        try {
          const rec = await pb.collection('user_insights').create(record)
          insight.id = rec.id
          insight.generatedAt = (rec as any).generated_at
        } catch (createErr) {
          // ¿carrera del índice único? Re-lee: si ya existe, otro proceso la creó → actualiza (recuperación silenciosa).
          try {
            const raced = await pb.collection('user_insights').getFirstListItem(
              pb.filter('user = {:uid} && period_type = {:pt} && period_start = {:ps}', {
                uid: userId,
                pt: periodType,
                ps: pbPeriodStart(periodStart),
              }),
              { $autoCancel: false },
            )
            const rec = await pb.collection('user_insights').update(raced.id, record)
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
      qc.setQueryData(qk.insights.cross(userId, periodType), insight)
    },
  })

  const generate = useCallback(async (): Promise<CrossInsight | null> => {
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

/**
 * useInsightHistory — historial de insights cross-métrica ya generados
 * (épica #128 Fase 3, #132), más recientes primero. Solo lectura: no genera
 * nada nuevo (eso es responsabilidad de useCrossInsights.generate).
 */
export function useInsightHistory(
  userId: string | null,
  periodType: InsightPeriodType = 'weekly',
) {
  return useQuery({
    queryKey: qk.insights.history(userId, periodType),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CrossInsight[]> => {
      try {
        const res = await pb.collection('user_insights').getList(1, 30, {
          filter: pb.filter('user = {:uid} && period_type = {:pt}', { uid: userId, pt: periodType }),
          sort: '-period_start',
          $autoCancel: false,
        })
        return res.items.map(mapInsight)
      } catch (err) {
        reportInsightError('history', periodType, err)
        throw err
      }
    },
  })
}
