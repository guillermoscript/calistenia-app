import { useTranslation } from 'react-i18next'
import { useCommunityPrograms } from '@calistenia/core/hooks/useCommunityPrograms'

interface CommunityProgramHomeCardProps {
  userId: string | null
  onNavigate: (path: string) => void
}

/**
 * Entrada de descubrimiento a los programas de comunidad (#353) en Home.
 *
 * Muestra el programa en el que ya está el usuario y, si no está en ninguno, el
 * primero publicado. A propósito NO calcula el progreso: eso exige consultar
 * las sesiones de toda la ventana del programa y Home ya hace bastantes
 * consultas. El detalle es un toque de distancia y ahí sí se calcula.
 */
export default function CommunityProgramHomeCard({ userId, onNavigate }: CommunityProgramHomeCardProps) {
  const { t } = useTranslation()
  const { programs, loading } = useCommunityPrograms(userId)

  if (loading || programs.length === 0) return null

  const joined = programs.find(p => p.membership?.status === 'active')
  const program = joined ?? programs[0]

  return (
    <button
      type="button"
      onClick={() => onNavigate(`/community-programs/${program.id}`)}
      data-testid="community-program-home-card"
      className="w-full rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-lime/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
        {t('communityProgram.kicker')}
      </div>
      <div className="mt-1 text-sm font-medium">{t(program.title_key)}</div>
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
        {t(program.description_key)}
      </p>
      <div className="mt-3 text-[10px] uppercase tracking-widest text-lime">
        {joined ? t('challenge.preset.open') : t('communityProgram.discoverCta')}
      </div>
    </button>
  )
}
