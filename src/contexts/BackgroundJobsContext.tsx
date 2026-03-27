/**
 * Shared context for background AI jobs.
 *
 * Single polling interval and SW listener shared across all consumers.
 * Wrap the app in <BackgroundJobsProvider> and use useBackgroundJobs() anywhere.
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { fetchJobStatus, type AIJob } from '../lib/ai-jobs-api'

const LS_KEY = 'ai_background_jobs'
const POLL_INTERVAL = 5000
const MAX_PENDING = 2

interface PendingJob {
  id: string
  type: AIJob['type']
  createdAt: number
}

function loadPending(): PendingJob[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const jobs: PendingJob[] = JSON.parse(raw)
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    return jobs.filter(j => j.createdAt > cutoff)
  } catch {
    return []
  }
}

function savePending(jobs: PendingJob[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(jobs))
}

const TYPE_LABEL_KEYS: Record<string, string> = {
  'analyze-meal': 'bgJobs.analyzeMealDone',
  'lookup-food': 'bgJobs.lookupFoodDone',
  'generate-meal-plan': 'bgJobs.mealPlanDone',
}

const TYPE_LABEL_PENDING_KEYS: Record<string, string> = {
  'analyze-meal': 'bgJobs.analyzingMeal',
  'lookup-food': 'bgJobs.lookingUpFood',
  'generate-meal-plan': 'bgJobs.generatingPlan',
}

interface BackgroundJobsContextValue {
  addJob: (id: string, type: AIJob['type']) => boolean
  getJob: (id: string) => AIJob | undefined
  clearJob: (id: string) => void
  canSubmit: boolean
  pendingCount: number
  pending: PendingJob[]
  pendingLabels: Record<string, string>
}

const BackgroundJobsContext = createContext<BackgroundJobsContextValue | null>(null)

export function BackgroundJobsProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [pending, setPending] = useState<PendingJob[]>(loadPending)
  const [completedJobs, setCompletedJobs] = useState<Map<string, AIJob>>(new Map())
  const pendingRef = useRef(pending)
  pendingRef.current = pending

  useEffect(() => {
    savePending(pending)
  }, [pending])

  const canSubmit = pending.length < MAX_PENDING

  const addJob = useCallback((id: string, type: AIJob['type']): boolean => {
    if (pendingRef.current.length >= MAX_PENDING) {
      toast.warning(t('bgJobs.limitReached'), {
        description: t('bgJobs.limitReachedDesc', { max: MAX_PENDING }),
        duration: 5000,
      })
      return false
    }
    setPending(prev => [...prev, { id, type, createdAt: Date.now() }])
    return true
  }, [])

  const clearJob = useCallback((id: string) => {
    setPending(prev => prev.filter(j => j.id !== id))
    setCompletedJobs(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  const getJob = useCallback((id: string): AIJob | undefined => {
    return completedJobs.get(id)
  }, [completedJobs])

  const handleCompletion = useCallback((job: AIJob) => {
    setPending(prev => prev.filter(j => j.id !== job.id))
    setCompletedJobs(prev => new Map(prev).set(job.id, job))

    const labelKey = TYPE_LABEL_KEYS[job.type] || 'bgJobs.processing'
    const label = t(labelKey)

    if (job.status === 'completed') {
      const descKey = job.type === 'analyze-meal'
        ? 'bgJobs.tapToReviewFoods'
        : job.type === 'lookup-food'
          ? 'bgJobs.tapToViewNutrition'
          : 'bgJobs.tapToViewMeals'
      toast.success(label, {
        description: t(descKey),
        action: {
          label: t('bgJobs.viewResult'),
          onClick: () => {
            const url = job.type === 'generate-meal-plan'
              ? '/nutrition'
              : `/nutrition/log?job=${job.id}`
            window.dispatchEvent(new CustomEvent('app:navigate', { detail: url }))
          },
        },
        duration: 10000,
      })
    } else if (job.status === 'failed') {
      toast.error(t('bgJobs.analysisFailed'), {
        description: job.error || t('bgJobs.tryAgainWithPhoto'),
        duration: 8000,
      })
    }
  }, [t])

  // Single polling interval for all consumers
  useEffect(() => {
    if (pending.length === 0) return

    const poll = async () => {
      if (document.visibilityState !== 'visible') return
      if (pendingRef.current.length === 0) return

      const results = await Promise.allSettled(
        pendingRef.current.map(pj => fetchJobStatus(pj.id))
      )

      for (const result of results) {
        if (result.status === 'fulfilled') {
          const job = result.value
          if (job.status === 'completed' || job.status === 'failed') {
            handleCompletion(job)
          }
        }
      }
    }

    const timer = setInterval(poll, POLL_INTERVAL)
    poll()

    return () => clearInterval(timer)
  }, [pending.length, handleCompletion])

  // Single SW listener for all consumers
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'AI_JOB_COMPLETE' && event.data?.job_id) {
        fetchJobStatus(event.data.job_id)
          .then(job => {
            if (job.status === 'completed' || job.status === 'failed') {
              handleCompletion(job)
            }
          })
          .catch(() => {})
      }
    }

    navigator.serviceWorker?.addEventListener('message', handler)
    return () => navigator.serviceWorker?.removeEventListener('message', handler)
  }, [handleCompletion])

  const pendingLabels: Record<string, string> = {}
  for (const [key, tKey] of Object.entries(TYPE_LABEL_PENDING_KEYS)) {
    pendingLabels[key] = t(tKey)
  }

  const value: BackgroundJobsContextValue = {
    addJob,
    getJob,
    clearJob,
    canSubmit,
    pendingCount: pending.length,
    pending,
    pendingLabels,
  }

  return (
    <BackgroundJobsContext.Provider value={value}>
      {children}
    </BackgroundJobsContext.Provider>
  )
}

export function useBackgroundJobs(): BackgroundJobsContextValue {
  const ctx = useContext(BackgroundJobsContext)
  if (!ctx) throw new Error('useBackgroundJobs must be used within BackgroundJobsProvider')
  return ctx
}
