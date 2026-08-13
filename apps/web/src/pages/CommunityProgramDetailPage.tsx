import { useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  useCommunityProgramDetail,
  useCommunityPrograms,
  type MilestoneChallengeLink,
} from '@calistenia/core/hooks/useCommunityPrograms'
import { useChallenges } from '@calistenia/core/hooks/useChallenges'
import {
  getMilestoneState,
  type MilestoneProgress,
  type MilestoneState,
} from '@calistenia/core/lib/community-programs'
import { formatDateRange, todayStr } from '@calistenia/core/lib/dateUtils'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/button'

interface CommunityProgramDetailPageProps {
  userId: string
}

/** Colores por estado del hito. Un único sitio para los dos usos (fila + chip). */
const STATE_STYLES: Record<MilestoneState, { border: string; label: string }> = {
  complete: { border: 'border-lime/40', label: 'text-lime' },
  active: { border: 'border-border', label: 'text-amber-400' },
  locked: { border: 'border-border/60', label: 'text-muted-foreground' },
  missed: { border: 'border-border/60', label: 'text-muted-foreground' },
  unavailable: { border: 'border-border/60', label: 'text-muted-foreground' },
}

export default function CommunityProgramDetailPage({ userId }: CommunityProgramDetailPageProps) {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { program, milestones, membership, progress, challengeLinks, loading, refetch } =
    useCommunityProgramDetail(id, userId)
  const { join, leave, joining, leaving } = useCommunityPrograms(userId)
  // Los hitos de tipo reto se unen con la maquinaria de presets ya existente
  // (#350), que es idempotente y a prueba de carreras; no se duplica aquí.
  const { joinPreset } = useChallenges(userId)

  const handleJoinChallenge = useCallback(async (presetKey: string) => {
    try {
      const result = await joinPreset(presetKey)
      await refetch()
      navigate(`/challenges/${result.challengeId}`)
    } catch {
      toast.error(t('communityProgram.joinError'))
    }
  }, [joinPreset, refetch, navigate, t])

  const handleJoin = useCallback(async () => {
    try {
      await join(id, 'community_program_detail')
    } catch {
      toast.error(t('communityProgram.joinError'))
    }
  }, [join, id, t])

  const handleLeave = useCallback(async () => {
    try {
      await leave(id, 'community_program_detail')
    } catch {
      toast.error(t('communityProgram.joinError'))
    }
  }, [leave, id, t])

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6" aria-busy="true">
        <div className="h-24 rounded-lg border border-border bg-card animate-pulse" />
      </div>
    )
  }

  // Programa despublicado, borrado o id inventado: estado seguro, no un crash.
  if (!program) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <p className="rounded-lg border border-border bg-card px-4 py-8 text-center text-xs text-muted-foreground">
          {t('communityProgram.notFound')}
        </p>
        <Button
          type="button"
          size="sm"
          onClick={() => navigate('/community-programs')}
          className="mt-4 h-9 text-[10px] tracking-widest"
        >
          {t('communityProgram.discoverCta')}
        </Button>
      </div>
    )
  }

  const isMember = membership?.status === 'active'
  const today = todayStr()

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">
        {t('communityProgram.kicker')}
      </div>
      <h1 className="font-bebas text-3xl mb-1">{t(program.title_key)}</h1>
      <p className="text-xs text-muted-foreground mb-4">{t(program.description_key)}</p>

      <div className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
        <span className="text-lime">{t(`communityProgram.difficulty.${program.difficulty}`)}</span>
        <span>·</span>
        <span>{t('communityProgram.durationDays', { count: program.duration_days })}</span>
        <span>·</span>
        <span>{t('communityProgram.milestoneCount', { count: milestones.length })}</span>
      </div>

      {progress ? (
        <ProgressSummary progress={progress} />
      ) : (
        <p className="mb-6 rounded-lg border border-border bg-card px-4 py-4 text-xs text-muted-foreground">
          {membership?.status === 'left'
            ? t('communityProgram.leftNotice')
            : t('communityProgram.notJoined')}
        </p>
      )}

      {milestones.length === 0 ? (
        <p className="rounded-lg border border-border bg-card px-4 py-8 text-center text-xs text-muted-foreground">
          {t('communityProgram.emptyMilestones')}
        </p>
      ) : (
        <ol className="flex flex-col gap-2" data-testid="community-program-milestones">
          {progress
            ? progress.milestones.map(item => (
                <MilestoneRow
                  key={item.milestone.id}
                  item={item}
                  state={getMilestoneState(item, today)}
                  link={challengeLinks[item.milestone.id]}
                  onOpenChallenge={(challengeId) => navigate(`/challenges/${challengeId}`)}
                  onJoinChallenge={handleJoinChallenge}
                />
              ))
            : milestones.map(milestone => (
                <li
                  key={milestone.id}
                  className="rounded-lg border border-border/60 bg-card px-4 py-3.5"
                >
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {t('communityProgram.currentWeek', { week: milestone.week })}
                  </div>
                  <div className="mt-1 text-sm font-medium">{t(milestone.title_key)}</div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {t('communityProgram.milestoneProgress', { done: 0, target: milestone.target })}
                  </div>
                </li>
              ))}
        </ol>
      )}

      <div className="mt-6">
        {isMember ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={leaving}
            onClick={() => void handleLeave()}
            className="h-9 text-[10px] tracking-widest"
          >
            {t('communityProgram.leave')}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={joining}
            onClick={() => void handleJoin()}
            className="h-9 bg-lime text-[10px] tracking-widest text-lime-foreground hover:bg-lime/90"
          >
            {membership?.status === 'left' ? t('communityProgram.resume') : t('communityProgram.join')}
          </Button>
        )}
      </div>
    </div>
  )
}

function ProgressSummary({ progress }: { progress: NonNullable<ReturnType<typeof useCommunityProgramDetail>['progress']> }) {
  const { t } = useTranslation()
  const totalWeeks = progress.milestones.length

  return (
    <section className="mb-6 rounded-lg border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {t('communityProgram.overall')}
        </span>
        <span className="font-bebas text-2xl text-lime">{progress.percent}%</span>
      </div>

      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-lime" style={{ width: `${progress.percent}%` }} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
        <span className="text-amber-400">
          {progress.currentWeek === null
            ? progress.isComplete
              ? t('communityProgram.completed')
              : t('communityProgram.finished')
            : progress.currentWeek > totalWeeks
              ? t('communityProgram.finalStretch')
              : t('communityProgram.weekOf', { week: progress.currentWeek, total: totalWeeks })}
        </span>
        <span>·</span>
        <span>{t('communityProgram.daysRemaining', { count: progress.daysRemaining })}</span>
      </div>

      {progress.nextMilestone ? (
        <p className="mt-2 text-[10px] text-muted-foreground">
          <span className="uppercase tracking-widest">{t('communityProgram.nextMilestone')}</span>
          {': '}
          {t(progress.nextMilestone.milestone.title_key)}
        </p>
      ) : null}
    </section>
  )
}

function MilestoneRow({
  item,
  state,
  link,
  onOpenChallenge,
  onJoinChallenge,
}: {
  item: MilestoneProgress
  state: MilestoneState
  link?: MilestoneChallengeLink
  onOpenChallenge: (challengeId: string) => void
  onJoinChallenge: (presetKey: string) => void
}) {
  const { t } = useTranslation()
  const styles = STATE_STYLES[state]

  return (
    <li className={cn('rounded-lg border bg-card px-4 py-3.5', styles.border)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {t('communityProgram.currentWeek', { week: item.milestone.week })}
          </div>
          <div className="mt-1 text-sm font-medium">{t(item.milestone.title_key)}</div>
          {item.milestone.description_key ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t(item.milestone.description_key)}
            </p>
          ) : null}
        </div>
        <span className={cn('shrink-0 text-[10px] uppercase tracking-widest', styles.label)}>
          <MilestoneStateLabel state={state} item={item} />
        </span>
      </div>

      {state === 'unavailable' ? null : (
        <div className="mt-2">
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full', state === 'complete' ? 'bg-lime' : 'bg-muted-foreground/50')}
              style={{ width: `${item.target > 0 ? Math.min(100, Math.round((item.completed / item.target) * 100)) : 0}%` }}
            />
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">
            {t('communityProgram.milestoneProgress', { done: item.completed, target: item.target })}
          </div>
        </div>
      )}

      {/*
        Hito de reto: si ya está unido se abre; si el preset existe pero aún no
        se ha unido, se ofrece unirse. Sin este segundo caso el hito enlazaba a
        un reto al que el usuario no tenía forma de entrar desde aquí.
      */}
      {link?.presetKnown && link.challengeId ? (
        <button
          type="button"
          onClick={() => onOpenChallenge(link.challengeId!)}
          className="mt-2 text-[10px] uppercase tracking-widest text-lime hover:underline"
        >
          {t('communityProgram.openChallenge')}
        </button>
      ) : link?.presetKnown && item.milestone.preset_key ? (
        <button
          type="button"
          onClick={() => onJoinChallenge(item.milestone.preset_key!)}
          className="mt-2 text-[10px] uppercase tracking-widest text-lime hover:underline"
        >
          {t('communityProgram.joinChallenge')}
        </button>
      ) : null}
    </li>
  )
}

/** Variantes explícitas por estado, en vez de encadenar booleanos en el JSX. */
function MilestoneStateLabel({ state, item }: { state: MilestoneState; item: MilestoneProgress }) {
  const { t } = useTranslation()
  switch (state) {
    case 'complete':
      return <>{t('communityProgram.milestoneComplete')}</>
    case 'missed':
      return <>{t('communityProgram.milestoneMissed')}</>
    case 'unavailable':
      return <>{t('communityProgram.milestoneUnavailable')}</>
    case 'locked':
      return (
        <>
          {item.window
            ? t('communityProgram.milestoneLocked', {
                date: formatDateRange(item.window.startDay, item.window.endDay),
              })
            : t('communityProgram.notStarted')}
        </>
      )
    default:
      return <>{t('communityProgram.currentWeek', { week: item.milestone.week })}</>
  }
}
