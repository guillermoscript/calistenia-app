import { useMemo, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import MealLoggerContent from '../components/nutrition/MealLoggerContent'
import { useNutrition } from '../hooks/useNutrition'
import { useBackgroundJobs } from '../hooks/useBackgroundJobs'
import { submitAnalyzeMealJob, fetchJobStatus } from '../lib/ai-jobs-api'
import { migrateLegacyFood } from '../lib/macro-calc'
import type { NutritionEntry, FoodItem } from '../types'

interface MealLoggerPageProps {
  userId: string | null
}

export default function MealLoggerPage({ userId }: MealLoggerPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const {
    goals,
    analyzeMeal,
    saveEntry,
    getDailyTotals,
    getRecentEntries,
  } = useNutrition(userId)
  const { addJob, getJob, clearJob, canSubmit } = useBackgroundJobs()

  const dailyTotals = useMemo(() => getDailyTotals(), [getDailyTotals])

  // Load completed background job result
  const [initialAnalysis, setInitialAnalysis] = useState<{ foods: FoodItem[]; meal_description?: string } | null>(null)
  const [jobLoading, setJobLoading] = useState(false)
  const jobId = searchParams.get('job')

  const loadJobResult = useCallback((result: any) => {
    const analysis = result.analysis ?? result
    setInitialAnalysis({
      foods: (analysis.foods ?? []).map((f: any) =>
        !f.baseCal100 ? migrateLegacyFood(f) : f
      ),
      meal_description: analysis.meal_description || '',
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

    // Not in cache — fetch from server
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
        // Still processing — keep showing loading, poll will catch completion
        setJobLoading(true)
      }
    }).catch(() => {
      setSearchParams({}, { replace: true })
    }).finally(() => {
      // Only clear loading if we got a final result
      setJobLoading(prev => {
        const cached = getJob(jobId)
        return cached?.status === 'pending' || cached?.status === 'processing' ? true : false
      })
    })
  }, [jobId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Watch for job completion via polling when we arrived with a still-processing job
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
  }, [jobId, jobLoading, getJob, clearJob, loadJobResult, setSearchParams])

  const handleAnalyze = useCallback(async (imageFiles: File[], mealType: string, description?: string): Promise<{ foods: FoodItem[]; meal_description?: string }> => {
    const result = await analyzeMeal(imageFiles, mealType, description)
    return { foods: result.foods, meal_description: result.meal_description }
  }, [analyzeMeal])

  const handleSave = useCallback(async (entry: Omit<NutritionEntry, 'id' | 'user'>, photoFiles?: File[]) => {
    await saveEntry({ ...entry, user: userId || undefined }, photoFiles)
  }, [saveEntry, userId])

  const handleSaveSuccess = useCallback(() => {
    setTimeout(() => navigate('/nutrition'), 1200)
  }, [navigate])

  const handleSendToBackground = useCallback((imageFiles: File[], mealType: string, description?: string) => {
    // Check limit BEFORE making the API call to avoid wasting money
    if (!addJob('_pending', 'analyze-meal')) return
    submitAnalyzeMealJob(imageFiles, mealType, description)
      .then(id => {
        // Replace the placeholder ID with the real server ID
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
  }, [addJob, clearJob])

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
        />
      )}
    </div>
  )
}
