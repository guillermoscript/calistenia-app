import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useReferrals } from '../hooks/useReferrals'
import { useReferralPoints, type PointTransaction } from '../hooks/useReferralPoints'
import { useChallengeExpress } from '../hooks/useChallengeExpress'
import { pb } from '../lib/pocketbase'
import { utcToLocalDateStr } from '../lib/dateUtils'
import { ReferralStats } from '../components/referrals/ReferralStats'
import { ReferralList } from '../components/referrals/ReferralList'
import { InviteButton } from '../components/referrals/InviteButton'
import { ChallengeExpressForm } from '../components/referrals/ChallengeExpressForm'
import { Loader } from '../components/ui/loader'
import { cn } from '../lib/utils'
import { Copy, Check, Share2 } from 'lucide-react'

interface ReferralsPageProps {
  userId: string
}

export default function ReferralsPage({ userId }: ReferralsPageProps) {
  const { t } = useTranslation()
  const { referrals, stats, loading: refLoading, getReferrals, getReferralStats } = useReferrals(userId)
  const { transactions, loading: ptsLoading, getTransactions } = useReferralPoints(userId)
  const { createExpress } = useChallengeExpress(userId)
  const [showChallenge, setShowChallenge] = useState(false)
  const [referralCode, setReferralCode] = useState<string | null>(null)
  const [tab, setTab] = useState<'referrals' | 'history'>('referrals')

  useEffect(() => {
    // Load referral code from user record
    const loadCode = async () => {
      try {
        const user = await pb.collection('users').getOne(userId, { $autoCancel: false })
        setReferralCode((user as any).referral_code || null)
      } catch { /* */ }
    }
    loadCode()
    getReferrals()
    getReferralStats()
    getTransactions()
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const loading = refLoading || ptsLoading

  if (loading && referrals.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <Loader label={t('referrals.loading')} />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="font-bebas text-3xl sm:text-4xl leading-none">Mis Referidos</h1>
          <p className="text-xs text-muted-foreground mt-1">Invita amigos y gana puntos</p>
        </div>
        <InviteButton
          referralCode={referralCode}
          onCreateChallenge={() => setShowChallenge(true)}
        />
      </div>

      {/* Invite link */}
      {referralCode && (
        <ReferralLinkCard referralCode={referralCode} />
      )}

      {/* Stats */}
      <div className="mb-6">
        <ReferralStats stats={stats} />
      </div>

      {/* Challenge express form */}
      {showChallenge && (
        <div className="mb-6">
          <ChallengeExpressForm
            referralCode={referralCode}
            userId={userId}
            onCreateChallenge={createExpress}
            onClose={() => setShowChallenge(false)}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-border mb-4">
        {(['referrals', 'history'] as const).map(tabKey => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={cn(
              'flex-1 py-3 text-xs tracking-[0.2em] font-medium transition-colors uppercase border-b-2 -mb-px',
              tab === tabKey
                ? 'text-foreground border-[hsl(var(--lime))]'
                : 'text-muted-foreground border-transparent hover:text-foreground/70'
            )}
          >
            {tabKey === 'referrals' ? 'Referidos' : 'Historial'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'referrals' ? (
        <ReferralList referrals={referrals} />
      ) : (
        <TransactionHistory transactions={transactions} />
      )}
    </div>
  )
}

function ReferralLinkCard({ referralCode }: { referralCode: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const inviteUrl = `https://gym.guille.tech/invite/${referralCode}`

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
      const ta = document.createElement('textarea')
      ta.value = inviteUrl
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [inviteUrl])

  const shareLink = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: t('referrals.shareTitle'),
          text: t('referrals.shareText'),
          url: inviteUrl,
        })
      } catch { /* user cancelled */ }
    } else {
      copyLink()
    }
  }, [inviteUrl, copyLink])

  return (
    <div className="mb-6 p-4 rounded-xl border border-border bg-card">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">Tu link de invitación</div>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 px-3 py-2.5 rounded-lg bg-muted border border-border text-sm text-muted-foreground truncate font-mono select-all">
          {inviteUrl}
        </div>
        <button
          onClick={copyLink}
          className={cn(
            'shrink-0 size-10 rounded-lg border flex items-center justify-center transition-all',
            copied
              ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
              : 'border-border bg-muted text-muted-foreground hover:text-foreground hover:border-border/70'
          )}
          title={t('referrals.copyLink')}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </button>
        <button
          onClick={shareLink}
          className="shrink-0 size-10 rounded-lg border border-border bg-muted text-muted-foreground hover:text-foreground hover:border-border/70 flex items-center justify-center transition-colors"
          title="Compartir"
        >
          <Share2 className="size-4" />
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">Comparte este link y gana 100 puntos por cada amigo que se registre</p>
    </div>
  )
}

function TransactionHistory({ transactions }: { transactions: PointTransaction[] }) {
  const { t } = useTranslation()
  if (transactions.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        {t('referrals.noTransactions')}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {transactions.map(tx => {
        const date = tx.created ? utcToLocalDateStr(tx.created) : ''
        const isPositive = tx.amount > 0
        return (
          <div key={tx.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
            <div className={cn(
              'size-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0',
              isPositive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
            )}>
              {isPositive ? '+' : '-'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{tx.description}</div>
              <div className="text-[10px] text-muted-foreground">{date}</div>
            </div>
            <div className={cn(
              'text-sm font-bebas shrink-0',
              isPositive ? 'text-emerald-400' : 'text-red-400'
            )}>
              {isPositive ? '+' : ''}{tx.amount}
            </div>
          </div>
        )
      })}
    </div>
  )
}
