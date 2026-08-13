import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useCommunityPrograms, type CommunityProgramCard } from '@calistenia/core/hooks/useCommunityPrograms'
import { toast } from 'sonner'
import { Button } from '../components/ui/button'

interface CommunityProgramsPageProps {
  userId: string
}

/**
 * Descubrimiento de programas de comunidad (#353).
 *
 * Ojo: NO son los programas de entrenamiento de `/programs`. Aquí se listan
 * cohortes con hitos semanales; la ruta y las claves i18n llevan `community`
 * para que no se confundan.
 */
export default function CommunityProgramsPage({ userId }: CommunityProgramsPageProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { programs, loading, join, joining } = useCommunityPrograms(userId)

  const openProgram = useCallback(
    (programId: string) => navigate(`/community-programs/${programId}`),
    [navigate],
  )

  const handleJoin = useCallback(async (programId: string) => {
    try {
      await join(programId, 'community_program_list')
      navigate(`/community-programs/${programId}`)
    } catch {
      toast.error(t('communityProgram.joinError'))
    }
  }, [join, navigate, t])

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="text-[10px] text-muted-foreground tracking-[0.3em] mb-2 uppercase">
        {t('communityProgram.kicker')}
      </div>
      <h1 className="font-bebas text-3xl mb-1">{t('communityProgram.title')}</h1>
      <p className="text-xs text-muted-foreground mb-6">{t('communityProgram.subtitle')}</p>

      {loading ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[0, 1].map(i => (
            <div key={i} className="h-28 rounded-lg border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : programs.length === 0 ? (
        <p className="rounded-lg border border-border bg-card px-4 py-8 text-center text-xs text-muted-foreground">
          {t('communityProgram.empty')}
        </p>
      ) : (
        <div className="grid gap-2 md:grid-cols-2" data-testid="community-programs">
          {programs.map(program => (
            <ProgramCard
              key={program.id}
              program={program}
              joining={joining}
              onOpen={openProgram}
              onJoin={handleJoin}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ProgramCard({
  program,
  joining,
  onOpen,
  onJoin,
}: {
  program: CommunityProgramCard
  joining: boolean
  onOpen: (programId: string) => void
  onJoin: (programId: string) => void
}) {
  const { t } = useTranslation()
  const status = program.membership?.status
  const isMember = status === 'active'
  const hasLeft = status === 'left'

  return (
    <article
      data-testid={`community-program-${program.slug}`}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">{t(program.title_key)}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t(program.description_key)}</p>
        </div>
        {isMember ? (
          <span className="shrink-0 rounded border border-lime/30 bg-lime/10 px-2 py-1 text-[9px] uppercase tracking-widest text-lime">
            {t('communityProgram.joined')}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
        <span className="text-lime">{t(`communityProgram.difficulty.${program.difficulty}`)}</span>
        <span>·</span>
        <span>{t('communityProgram.durationDays', { count: program.duration_days })}</span>
      </div>

      {hasLeft ? (
        <p className="text-[10px] text-amber-400">{t('communityProgram.leftNotice')}</p>
      ) : null}

      <Button
        type="button"
        size="sm"
        disabled={joining}
        onClick={() => (isMember ? onOpen(program.id) : onJoin(program.id))}
        className="h-9 bg-lime text-[10px] tracking-widest text-lime-foreground hover:bg-lime/90"
      >
        {isMember
          ? t('challenge.preset.open')
          : hasLeft
            ? t('communityProgram.resume')
            : t('communityProgram.join')}
      </Button>
    </article>
  )
}
