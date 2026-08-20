import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { usePublicSessionDetail } from '@calistenia/core/hooks/usePublicSessionDetail'
import { getUserAvatarUrl } from '@calistenia/core/lib/pocketbase'
import { useAuthState } from '../contexts/AuthContext'
import { useExerciseCatalog } from '../hooks/useExerciseCatalog'
import SessionDetailView from '../components/session/SessionDetailView'
import BackLink from '../components/session/BackLink'

/**
 * Detalle de una sesión de fuerza por id de registro.
 *
 * Es la vista a la que enlazan el muro y la actividad reciente: funciona con la
 * sesión de cualquier usuario (reconstruida desde PB por
 * `usePublicSessionDetail`), a diferencia de `/session/:date/:workoutKey`, que
 * solo puede pintar el ProgressMap del usuario logueado.
 */
export default function PublicSessionDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, userId } = useAuthState()
  const catalog = useExerciseCatalog()

  const { session, exercises, owner, loading, notFound } = usePublicSessionDetail(id || null, catalog)

  const isOwn = !!owner && owner.id === userId

  if (!id) return null

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <BackLink onClick={() => navigate(-1)} className="mb-6" />
        <div className="animate-pulse space-y-4">
          <div className="h-3 w-32 bg-muted rounded" />
          <div className="h-9 w-64 bg-muted rounded" />
          <div className="h-3 w-48 bg-muted rounded" />
          <div className="h-24 bg-muted/60 rounded mt-8" />
        </div>
      </div>
    )
  }

  if (notFound || !session) {
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
        date={session.date}
        header={owner && !isOwn ? (
          <button
            onClick={() => navigate(`/u/${owner.id}`)}
            className="flex items-center gap-2.5 mb-4 group"
          >
            {owner.avatarUrl ? (
              <img src={owner.avatarUrl} alt="" className="size-9 rounded-full object-cover" />
            ) : (
              <div className="size-9 rounded-full bg-muted flex items-center justify-center font-bebas text-sm text-muted-foreground">
                {owner.displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-sm font-medium text-foreground group-hover:text-lime transition-colors">
              {owner.displayName}
            </span>
          </button>
        ) : null}
        share={isOwn ? {
          userName: user?.display_name || user?.email?.split('@')[0],
          avatarUrl: user ? getUserAvatarUrl(user, '200x200') : null,
          referralCode: user?.referral_code || null,
        } : undefined}
      />
    </div>
  )
}
