import { useTranslation } from 'react-i18next'
import { pb } from '@calistenia/core/lib/pocketbase'
import { utcToLocalDateStr } from '@calistenia/core/lib/dateUtils'
import {
  type Referral,
  REFERRAL_SIGNUP_POINTS,
} from '@calistenia/core/hooks/useReferrals'
import { cn } from '../../lib/utils'

interface ReferralListProps {
  referrals: Referral[]
}

export function ReferralList({ referrals }: ReferralListProps) {
  const { t } = useTranslation()

  if (referrals.length === 0) {
    // Vacío que sigue enseñando el bucle: qué hacer y qué se gana.
    return (
      <div className="text-center py-12 px-4">
        <div className="text-sm font-medium">{t('referrals.emptyTitle')}</div>
        <p className="text-xs text-muted-foreground mt-1.5 max-w-sm mx-auto leading-relaxed">
          {t('referrals.emptyBody', { points: REFERRAL_SIGNUP_POINTS })}
        </p>
      </div>
    )
  }

  const hasPending = referrals.some(ref => ref.rewardStatus === 'pending')

  return (
    <div className="space-y-2">
      {hasPending && (
        <p className="text-[11px] text-amber-400/90 px-1 pb-1">
          {t('referrals.pendingNotice')}
        </p>
      )}
      {referrals.map((ref) => {
        const date = ref.created ? utcToLocalDateStr(ref.created) : ''
        // La cuenta referida puede no ser legible (borrada o no expandible):
        // se muestra como «usuario eliminado» en vez de romper la fila.
        const name = ref.referredDeleted || !ref.referredName
          ? t('referrals.deletedUser')
          : ref.referredName
        const credited = ref.rewardStatus === 'credited'
        return (
          <div
            key={ref.id}
            className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card"
          >
            <div className={cn(
              'size-9 rounded-full bg-muted flex items-center justify-center text-sm font-bebas shrink-0 overflow-hidden',
              ref.referredDeleted ? 'text-muted-foreground' : 'text-foreground',
            )}>
              {ref.referredAvatar && !ref.referredDeleted ? (
                <img
                  src={pb.files.getURL({ id: ref.referred, collectionId: '_pb_users_auth_', collectionName: 'users' } as any, ref.referredAvatar, { thumb: '100x100' })}
                  alt={name}
                  className="size-full object-cover"
                />
              ) : (
                name[0]?.toUpperCase() || '?'
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className={cn(
                'text-sm font-medium truncate',
                ref.referredDeleted && 'italic text-muted-foreground',
              )}>
                {name}
              </div>
              <div className="text-[10px] text-muted-foreground">{date}</div>
            </div>
            <div className="shrink-0 flex items-center gap-1.5">
              {/* Estado de recompensa: derivado de point_transactions, nunca asumido. */}
              <span
                title={credited ? undefined : t('referrals.rewardPendingHint')}
                className={cn(
                  'text-[10px] tracking-widest uppercase px-2 py-1 rounded font-medium',
                  credited
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-amber-500/10 text-amber-400',
                )}
              >
                {credited
                  ? t('referrals.rewardCredited', { points: ref.rewardPoints })
                  : t('referrals.rewardPending')}
              </span>
              <span className="text-[10px] tracking-widest uppercase px-2 py-1 rounded bg-muted text-muted-foreground">
                {ref.source === 'challenge' ? t('referrals.sourceChallenge') : t('referrals.sourceInvite')}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
