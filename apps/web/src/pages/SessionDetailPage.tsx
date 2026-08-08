import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSessionDetail } from '@calistenia/core/hooks/useSessionDetail'
import { getUserAvatarUrl } from '@calistenia/core/lib/pocketbase'
import type { TranslatableField } from '@calistenia/core/lib/i18n-db'
import { useWorkoutState, useWorkoutActions } from '../contexts/WorkoutContext'
import { useAuthState } from '../contexts/AuthContext'
import { useExerciseCatalog } from '../hooks/useExerciseCatalog'
import SessionDetailView from '../components/session/SessionDetailView'
import BackLink from '../components/session/BackLink'

// ── Session Detail Page ──────────────────────────────────────────────────────

export default function SessionDetailPage() {
  const { t } = useTranslation()
  const { progress } = useWorkoutState()
  const { getWorkout } = useWorkoutActions()
  const { date, workoutKey } = useParams<{ date: string; workoutKey: string }>()
  const navigate = useNavigate()
  const { user } = useAuthState()

  // Program exercises log under slot keys ("lun_1_2"), not catalog ids — their
  // readable names live only in the program (PB program_exercises). Resolve them
  // from the active program's loaded WorkoutsMap for this workoutKey ("p1_lun").
  const programCatalog = useMemo(() => {
    const m = /^p(\d+)_(.+)$/.exec(workoutKey || '')
    if (!m) return {} as Record<string, { name: TranslatableField; muscles: TranslatableField }>
    const w = getWorkout(parseInt(m[1], 10), m[2])
    if (!w) return {} as Record<string, { name: TranslatableField; muscles: TranslatableField }>
    const out: Record<string, { name: TranslatableField; muscles: TranslatableField }> = {}
    w.exercises.forEach(ex => { out[ex.id] = { name: ex.name, muscles: ex.muscles } })
    return out
  }, [workoutKey, getWorkout])

  const catalog = useExerciseCatalog()

  // Program names take precedence over static/PB for slot keys only it knows.
  const mergedCatalog = useMemo(() => ({ ...catalog, ...programCatalog }), [catalog, programCatalog])

  const { session, exercises } = useSessionDetail(
    progress,
    date || '',
    workoutKey || '',
    mergedCatalog,
  )

  if (!date || !workoutKey) return null

  if (!session) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <BackLink onClick={() => navigate(-1)} className="mb-6" />
        <div className="text-center py-16">
          <div className="text-muted-foreground text-sm">{t('session.notFound')}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8">
      <BackLink onClick={() => navigate(-1)} className="mb-4" />
      <SessionDetailView
        session={session}
        exercises={exercises}
        date={date}
        share={{
          userName: (user as any)?.display_name || user?.email?.split('@')[0],
          avatarUrl: user ? getUserAvatarUrl(user as any, '200x200') : null,
          referralCode: (user as any)?.referral_code || null,
        }}
      />
    </div>
  )
}
