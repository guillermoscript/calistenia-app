import { getUserAvatarUrl, pb } from '../../lib/pocketbase'
import { utcToLocalDateStr } from '../../lib/dateUtils'
import type { Referral } from '../../hooks/useReferrals'

interface ReferralListProps {
  referrals: Referral[]
}

export function ReferralList({ referrals }: ReferralListProps) {
  if (referrals.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        Aun no tienes referidos. Invita amigos para ganar puntos!
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {referrals.map((ref) => {
        const date = ref.created ? utcToLocalDateStr(ref.created) : ''
        return (
          <div
            key={ref.id}
            className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card"
          >
            <div className="size-9 rounded-full bg-muted flex items-center justify-center text-sm font-bebas text-foreground shrink-0 overflow-hidden">
              {ref.referredAvatar ? (
                <img
                  src={pb.files.getURL({ id: ref.referred, collectionId: '_pb_users_auth_', collectionName: 'users' } as any, ref.referredAvatar, { thumb: '100x100' })}
                  alt={ref.referredName}
                  className="size-full object-cover"
                />
              ) : (
                ref.referredName[0]?.toUpperCase() || '?'
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{ref.referredName}</div>
              <div className="text-[10px] text-muted-foreground">{date}</div>
            </div>
            <div className="shrink-0">
              <span className="text-[10px] tracking-widest uppercase px-2 py-1 rounded bg-muted text-muted-foreground">
                {ref.source === 'challenge' ? 'Challenge' : 'Invitacion'}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
