import { useMemo, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import * as Sentry from '@sentry/react'
import MealLoggerContent from '../components/nutrition/MealLoggerContent'
import { usePantryDepletion } from '@calistenia/core/hooks/usePantryDepletion'
import { PantryDepleteDialog } from '../components/pantry/PantryDepleteDialog'
import { useNutrition } from '@calistenia/core/hooks/useNutrition'
import type { FoodItem } from '@calistenia/core/types'
import { useMealLoggerActions } from '@calistenia/core/hooks/useMealLoggerActions'
import { useBackgroundJobs } from '../hooks/useBackgroundJobs'
import { submitAnalyzeMealJob, fetchJobStatus } from '@calistenia/core/lib/ai-jobs-api'
import { migrateLegacyFood } from '@calistenia/core/lib/macro-calc'
import type { AnalyzeResult } from '@calistenia/core/hooks/useMealLoggerActions'

interface MealLoggerPageProps {
  userId: string | null
}

/** La comida analizada que devuelve un job de IA. Antiguos y nuevos jobs difieren:
 *  unos anidan el análisis bajo `analysis` y otros lo devuelven plano. */
type LegacyOrCurrentFood = Parameters<typeof migrateLegacyFood>[0] & { baseCal100?: number }
type AnalyzedMeal = {
  foods?: LegacyOrCurrentFood[]
  meal_description?: string
  quality?: AnalyzeResult['quality']
}
type AnalyzeJobResult = AnalyzedMeal & { analysis?: AnalyzedMeal }

/** El paso de éxito se queda visible un momento antes de volver a /nutrition. */
const SUCCESS_DWELL_MS = 1200

export default function MealLoggerPage({ userId }: MealLoggerPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const {
    goals,
    entries,
    analyzeMeal,
    scoreMealQuality,
    saveEntry,
    updateEntry,
    getDailyTotals,
    getRemainingMacros,
    getRecentEntries,
  } = useNutrition(userId)

  const { handleAnalyze, handleSave } = useMealLoggerActions({
    userId, goals, entries, analyzeMeal, scoreMealQuality, saveEntry, updateEntry, getRemainingMacros,
  })

  const dailyTotals = useMemo(() => getDailyTotals(), [getDailyTotals])
  const { addJob, getJob, clearJob, canSubmit } = useBackgroundJobs()

  // ─── Background job handling ───────────────────────────────────────────────
  const [initialAnalysis, setInitialAnalysis] = useState<AnalyzeResult | null>(null)
  const [jobLoading, setJobLoading] = useState(false)
  const jobId = searchParams.get('job')

  const loadJobResult = useCallback((result: AnalyzeJobResult) => {
    const analysis = 'analysis' in result && result.analysis ? result.analysis : result
    setInitialAnalysis({
      foods: (analysis.foods ?? []).map(f =>
        !f.baseCal100 ? migrateLegacyFood(f) : f as FoodItem
      ),
      meal_description: analysis.meal_description || '',
      quality: analysis.quality || undefined,
    })
  }, [])

  useEffect(() => {
    if (!jobId) return

    const cached = getJob(jobId)
    if (cached?.status === 'completed' && cached.result) {
      loadJobResult(cached.result)
      clearJob(jobId)
      setSearchParams({}, { replace: true })
      return
    }

    setJobLoading(true)
    fetchJobStatus(jobId).then(job => {
      if (job.status === 'completed' && job.result) {
        loadJobResult(job.result)
        clearJob(jobId)
        setSearchParams({}, { replace: true })
      } else if (job.status === 'failed') {
        toast.error(t('nutrition.analysisError'), { description: job.error || t('nutrition.analysisErrorDesc') })
        setSearchParams({}, { replace: true })
      } else {
        setJobLoading(true)
      }
    }).catch(() => {
      setSearchParams({}, { replace: true })
    }).finally(() => {
      setJobLoading(() => {
        const cached = getJob(jobId)
        return cached?.status === 'pending' || cached?.status === 'processing' ? true : false
      })
    })
  }, [jobId]) // eslint-disable-line react-hooks/exhaustive-deps -- se resuelve un job por id; reejecutar al recrearse los getters relanzaría el toast

  useEffect(() => {
    if (!jobId || !jobLoading) return
    const cached = getJob(jobId)
    if (cached?.status === 'completed' && cached.result) {
      loadJobResult(cached.result)
      clearJob(jobId)
      setJobLoading(false)
      setSearchParams({}, { replace: true })
    } else if (cached?.status === 'failed') {
      toast.error(t('nutrition.analysisError'), { description: cached.error || t('nutrition.analysisErrorDesc') })
      setJobLoading(false)
      setSearchParams({}, { replace: true })
    }
  }, [jobId, jobLoading, getJob, clearJob, loadJobResult, setSearchParams, t])

  // ─── Background send ──────────────────────────────────────────────────────
  const handleSendToBackground = useCallback((imageFiles: File[], mealType: string, description?: string) => {
    if (!addJob('_pending', 'analyze-meal')) return
    submitAnalyzeMealJob(imageFiles, mealType, description)
      .then(id => {
        clearJob('_pending')
        addJob(id, 'analyze-meal')
        toast.info(t('nutrition.analyzingBackground'), {
          description: t('nutrition.analyzingBackgroundDesc'),
          duration: 4000,
        })
      })
      .catch(() => {
        clearJob('_pending')
        toast.error(t('nutrition.analysisError'), { description: t('nutrition.analysisErrorDesc') })
      })
  }, [addJob, clearJob, t])

  // ── F4 (#173): depleción de despensa post-log ──────────────────────────────
  // La página navega a /nutrition tras guardar; si hay match en vuelo o filas
  // pendientes, la navegación espera a que el usuario confirme/omita el dialog
  // (si no, el dialog se desmontaría antes de mostrarse).
  const pantryDepletion = usePantryDepletion(userId, {
    captureException: (e, op) => Sentry.captureException(e, { tags: { feature: 'pantry', op } }),
  })
  const [matchPending, setMatchPending] = useState(false)
  const [wantNav, setWantNav] = useState(false)

  const handleSaved = useCallback((entryId: string, foods: FoodItem[]) => {
    setMatchPending(true)
    pantryDepletion.runMatch(entryId, foods).finally(() => setMatchPending(false))
  }, [pantryDepletion])

  const handleSaveSuccess = useCallback(() => {
    setTimeout(() => setWantNav(true), SUCCESS_DWELL_MS)
  }, [])

  useEffect(() => {
    if (wantNav && !matchPending && !pantryDepletion.rows) navigate('/nutrition')
  }, [wantNav, matchPending, pantryDepletion.rows, navigate])

  return (
    <div className="max-w-lg mx-auto px-4 md:px-6 py-6 md:py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-1 uppercase">Nutricion</div>
          <div className="font-bebas text-3xl md:text-4xl">REGISTRAR COMIDA</div>
        </div>
        <button
          onClick={() => navigate('/nutrition')}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('common.cancel')}
        </button>
      </div>

      {jobLoading ? (
        <div className="space-y-4 py-8 motion-safe:animate-fade-in" role="status">
          <div className="text-center">
            <div className="inline-block size-6 border-2 border-lime-400/30 border-t-lime-400 rounded-full animate-spin mb-3" />
            <div className="text-sm text-foreground font-medium">Todavia procesando...</div>
            <div className="text-[10px] text-muted-foreground mt-1">Te avisaremos cuando termine</div>
          </div>
          {[0, 1, 2].map(i => (
            <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
          <button
            onClick={() => { setJobLoading(false); setSearchParams({}, { replace: true }) }}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-2"
          >
            Registrar otra comida
          </button>
        </div>
      ) : (
        <MealLoggerContent
          onAnalyze={handleAnalyze}
          onSave={handleSave}
          userId={userId}
          dailyTotals={dailyTotals}
          goals={goals}
          getRecentEntries={getRecentEntries}
          onSaveSuccess={handleSaveSuccess}
          onSendToBackground={canSubmit ? handleSendToBackground : undefined}
          initialAnalysis={initialAnalysis}
          onSaved={handleSaved}
        />
      )}

      {/* F4 (#173): confirmación de descuento de despensa post meal-log */}
      <PantryDepleteDialog
        rows={pantryDepletion.rows}
        onConfirm={pantryDepletion.confirm}
        onDismiss={pantryDepletion.dismiss}
      />
    </div>
  )
}
