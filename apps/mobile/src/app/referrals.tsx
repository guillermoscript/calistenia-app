/**
 * ReferralsScreen — estado de referidos en nativo (issue #354).
 *
 * Paridad con `apps/web/src/pages/ReferralsPage.tsx`, y además el destino real
 * del deep link `/referrals` que ya usaba el push de
 * `pb_hooks/referral_side_effects.pb.js` (antes caía en `/friends`).
 *
 * Regla de honestidad del dato: el estado de recompensa de cada referido sale
 * SIEMPRE de una fila de `point_transactions` (ver `useReferrals`). Los tres
 * efectos del hook de servidor fallan en silencio y por separado, así que
 * «existe el referido» no implica «se acreditaron los puntos»: `pendiente` es
 * un estado real que se pinta tal cual.
 *
 * Privacidad: solo se muestran nombre, avatar, fecha y origen del referido.
 * Nada de su entrenamiento ni de su salud.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, ScrollView, Pressable, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  ChevronLeft,
  Copy,
  Share2,
  Users,
  AlertTriangle,
  RotateCw,
} from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Kicker } from '@/components/ui/kicker'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { COLORS } from '@/lib/theme'
import { useAuthUser } from '@/lib/use-auth-user'
import { inviteUrl, shareReferralInviteByChannel } from '@/lib/share'

import {
  useReferrals,
  REFERRAL_SIGNUP_POINTS,
  REFERRAL_BONUS_POINTS,
  type Referral,
  type ReferralDataError,
} from '@calistenia/core/hooks/useReferrals'
import {
  useReferralPoints,
  type PointTransaction,
} from '@calistenia/core/hooks/useReferralPoints'
import { utcToLocalDateStr } from '@calistenia/core/lib/dateUtils'
import {
  CANONICAL_ANALYTICS_EVENTS,
  trackCanonicalEvent,
} from '@calistenia/core/lib/analytics'

type Tab = 'referrals' | 'history'

export default function ReferralsScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const user = useAuthUser()
  const userId = user?.id ?? null

  const {
    referrals,
    stats,
    loading: refLoading,
    error: refError,
    refresh: refreshReferrals,
    generateReferralCode,
  } = useReferrals(userId)
  const {
    transactions,
    loading: ptsLoading,
    error: ptsError,
    refresh: refreshPoints,
  } = useReferralPoints(userId)

  const [tab, setTab] = useState<Tab>('referrals')
  const [copied, setCopied] = useState(false)
  const trackedView = useRef(false)

  const displayName: string = (user as { display_name?: string } | null)?.display_name || 'Un amigo'
  const storedCode: string | null = (user as { referral_code?: string } | null)?.referral_code || null

  // Una cuenta puede no tener código todavía (el alta lo genera, pero no hay
  // garantía retroactiva). Sin código no hay nada que compartir, así que lo
  // generamos una sola vez antes de habilitar las acciones.
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)
  const generating = useRef(false)
  const referralCode = storedCode ?? generatedCode

  useEffect(() => {
    if (!userId || referralCode || generating.current) return
    generating.current = true
    void generateReferralCode(displayName).then(setGeneratedCode)
  }, [userId, referralCode, displayName, generateReferralCode])

  const loading = refLoading || ptsLoading
  const error = refError ?? ptsError ?? null
  const pendingCount = useMemo(
    () => referrals.filter(r => r.rewardStatus === 'pending').length,
    [referrals],
  )

  // Una sola vez por montaje y solo cuando ya sabemos qué se está viendo.
  useEffect(() => {
    if (trackedView.current || loading || error) return
    trackedView.current = true
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.referralStatusViewed, {
      surface: 'referrals',
      source: 'mobile',
      result: 'viewed',
      referral_count: stats.totalReferred,
      pending_rewards: pendingCount,
    })
  }, [loading, error, stats.totalReferred, pendingCount])

  const retry = useCallback(async () => {
    await Promise.all([refreshReferrals(), refreshPoints()])
  }, [refreshReferrals, refreshPoints])

  const onShare = useCallback(async (channel: 'native' | 'whatsapp' | 'copy') => {
    if (!referralCode) return
    haptics.selection()
    try {
      const ok = await shareReferralInviteByChannel(displayName, referralCode, channel)
      if (!ok) return
      if (channel === 'copy') {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.inviteSent, {
        surface: 'referrals',
        source: 'referral_status',
        share_type: channel,
        result: 'sent',
        method: channel,
      })
    } catch {
      // Compartir cancelado o canal no disponible: sin ruido para el usuario.
    }
  }, [referralCode, displayName])

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView
        contentContainerClassName="px-4 pb-32"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={retry} tintColor={COLORS.lime} />
        }
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <View className="pt-2 pb-2 mb-6">
          <Pressable
            onPress={() => { haptics.selection(); router.back() }}
            className="-ml-2 mb-1 size-9 flex-row items-center justify-center self-start rounded-lg"
            accessibilityRole="button"
            accessibilityLabel={t('common.back', { defaultValue: 'Atrás' })}
          >
            <ChevronLeft size={24} color="rgba(255,255,255,0.55)" />
          </Pressable>
          <Kicker>
            {t('referrals.subtitle')}
          </Kicker>
          <Text className="font-bebas text-4xl text-foreground">{t('referrals.title')}</Text>
        </View>

        {/* ── Fallo de carga ──────────────────────────────────────────────── */}
        {error && <ErrorCard error={error} onRetry={retry} retrying={loading} />}

        {/* ── Stats ───────────────────────────────────────────────────────── */}
        <Card className="mb-4">
          <CardContent className="py-5">
            <Text className="mb-4 font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
              {t('referrals.pointsLabel')}
            </Text>
            <View className="flex-row">
              <StatCell label={t('referrals.statReferred')} value={stats.totalReferred} />
              <StatCell
                label={t('referrals.statBalance')}
                value={stats.pointsBalance}
                negative={stats.pointsBalance < 0}
              />
              <StatCell label={t('referrals.statEarned')} value={stats.totalEarned} />
            </View>
            <Text className="mt-4 font-sans text-[11px] leading-relaxed text-muted-foreground">
              {t('referrals.milestoneNote')}
            </Text>
          </CardContent>
        </Card>

        {/* ── Link de invitación ──────────────────────────────────────────── */}
        {referralCode && (
          <Card className="mb-4">
            <CardContent className="py-5">
              <Text className="mb-2 font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
                {t('referrals.linkLabel')}
              </Text>
              <View className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                <Text className="font-mono text-[11px] text-muted-foreground" numberOfLines={1}>
                  {inviteUrl(referralCode)}
                </Text>
              </View>
              <View className="mt-3 flex-row gap-2">
                <ShareAction
                  icon={Copy}
                  label={copied ? t('common.copied') : t('referrals.copyLink')}
                  active={copied}
                  onPress={() => onShare('copy')}
                />
                <ShareAction
                  icon={Share2}
                  label={t('share.invite', { defaultValue: 'Compartir' })}
                  onPress={() => onShare('native')}
                />
              </View>
              <Text className="mt-3 font-sans text-[11px] leading-relaxed text-muted-foreground">
                {t('referrals.linkHelp', { points: REFERRAL_SIGNUP_POINTS })}
              </Text>
            </CardContent>
          </Card>
        )}

        {/* ── Cómo funciona ───────────────────────────────────────────────── */}
        <Card className="mb-4">
          <CardContent className="py-5">
            <Text className="mb-3 font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
              {t('referrals.howItWorksTitle')}
            </Text>
            {[
              t('referrals.howItWorksStep1'),
              t('referrals.howItWorksStep2'),
              t('referrals.howItWorksStep3', {
                referrerPoints: REFERRAL_SIGNUP_POINTS,
                referredPoints: REFERRAL_BONUS_POINTS,
              }),
            ].map((step, i) => (
              <View key={i} className="mb-2 flex-row items-start gap-2.5">
                <View className="mt-0.5 size-5 items-center justify-center rounded-full bg-lime/10">
                  <Text className="font-bebas text-xs text-lime">{i + 1}</Text>
                </View>
                <Text className="flex-1 font-sans text-[11px] leading-relaxed text-muted-foreground">
                  {step}
                </Text>
              </View>
            ))}
          </CardContent>
        </Card>

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <View className="mb-4 flex-row border-b border-border">
          {(['referrals', 'history'] as const).map(key => (
            <Pressable
              key={key}
              onPress={() => { haptics.selection(); setTab(key) }}
              className={cn(
                '-mb-px flex-1 items-center border-b-2 py-3',
                tab === key ? 'border-lime' : 'border-transparent',
              )}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === key }}
            >
              <Text className={cn(
                'font-mono text-[10px] uppercase tracking-[2px]',
                tab === key ? 'text-foreground' : 'text-muted-foreground',
              )}>
                {key === 'referrals' ? t('referrals.tabReferrals') : t('referrals.tabHistory')}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === 'referrals'
          ? <ReferralRows referrals={referrals} pendingCount={pendingCount} />
          : <HistoryRows transactions={transactions} />}
      </ScrollView>
    </SafeAreaView>
  )
}

// ── Piezas ────────────────────────────────────────────────────────────────────

function StatCell({ label, value, negative }: { label: string; value: number; negative?: boolean }) {
  return (
    <View className="flex-1">
      <Text className={cn('font-bebas text-3xl leading-none', negative ? 'text-destructive' : 'text-lime')}>
        {value}
      </Text>
      <Text className="mt-1 font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground">
        {label}
      </Text>
    </View>
  )
}

function ShareAction({
  icon: Icon,
  label,
  onPress,
  active,
}: {
  icon: typeof Copy
  label: string
  onPress: () => void
  active?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'flex-1 flex-row items-center justify-center gap-2 rounded-lg border py-2.5 active:bg-lime/10',
        active ? 'border-lime/40' : 'border-border',
      )}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon size={14} color={active ? COLORS.lime : COLORS.mutedIcon} />
      <Text className={cn('font-mono text-[10px] uppercase tracking-[2px]', active ? 'text-lime' : 'text-muted-foreground')}>
        {label}
      </Text>
    </Pressable>
  )
}

function ErrorCard({
  error,
  onRetry,
  retrying,
}: {
  error: ReferralDataError | Error
  onRetry: () => void
  retrying: boolean
}) {
  const { t } = useTranslation()
  const offline = (error as ReferralDataError)?.reason === 'offline'

  return (
    <View className="mb-4 flex-row items-start gap-3 rounded-xl border border-border bg-card/40 p-4">
      <AlertTriangle size={16} color="#F59E0B" />
      <View className="flex-1">
        <Text className="font-sans-medium text-foreground">{t('referrals.errorTitle')}</Text>
        <Text className="mt-1 font-sans text-[11px] leading-relaxed text-muted-foreground">
          {offline ? t('referrals.errorOffline') : t('referrals.errorGeneric')}
        </Text>
        <Pressable
          onPress={onRetry}
          disabled={retrying}
          className="mt-3 flex-row items-center gap-1.5 self-start rounded-lg border border-border px-3 py-2 active:bg-lime/10"
          accessibilityRole="button"
        >
          <RotateCw size={12} color={COLORS.mutedIcon} />
          <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
            {t('referrals.retry')}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

function ReferralRows({ referrals, pendingCount }: { referrals: Referral[]; pendingCount: number }) {
  const { t } = useTranslation()

  if (referrals.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title={t('referrals.emptyTitle')}
        body={t('referrals.emptyBody', { points: REFERRAL_SIGNUP_POINTS })}
      />
    )
  }

  return (
    <View className="gap-2">
      {pendingCount > 0 && (
        <Text className="px-1 font-sans text-[11px]" style={{ color: '#F59E0B' }}>
          {t('referrals.pendingNotice')}
        </Text>
      )}
      {referrals.map(ref => {
        // La cuenta referida puede no ser legible: se rotula, no se rompe.
        const name = ref.referredDeleted || !ref.referredName
          ? t('referrals.deletedUser')
          : ref.referredName
        const credited = ref.rewardStatus === 'credited'
        return (
          <View
            key={ref.id}
            className="flex-row items-center gap-3 rounded-lg border border-border bg-card p-3"
          >
            <View className="size-9 items-center justify-center rounded-full bg-muted/40">
              <Text className="font-bebas text-sm text-foreground">
                {name.charAt(0).toUpperCase() || '?'}
              </Text>
            </View>
            <View className="flex-1">
              <Text
                className={cn('font-sans-medium text-sm', ref.referredDeleted ? 'text-muted-foreground' : 'text-foreground')}
                numberOfLines={1}
              >
                {name}
              </Text>
              <Text className="font-mono text-[10px] text-muted-foreground">
                {ref.created ? utcToLocalDateStr(ref.created) : ''}
              </Text>
            </View>
            <View
              className={cn('rounded px-2 py-1', credited ? 'bg-lime/10' : '')}
              style={credited ? undefined : { backgroundColor: 'rgba(245,158,11,0.12)' }}
            >
              <Text
                className={cn('font-mono text-[9px] uppercase tracking-[1px]', credited ? 'text-lime' : '')}
                style={credited ? undefined : { color: '#F59E0B' }}
              >
                {credited
                  ? t('referrals.rewardCredited', { points: ref.rewardPoints })
                  : t('referrals.rewardPending')}
              </Text>
            </View>
          </View>
        )
      })}
    </View>
  )
}

function HistoryRows({ transactions }: { transactions: PointTransaction[] }) {
  const { t } = useTranslation()

  if (transactions.length === 0) {
    return (
      <Text className="py-12 text-center font-sans text-sm text-muted-foreground">
        {t('referrals.noTransactions')}
      </Text>
    )
  }

  return (
    <View className="gap-2">
      {transactions.map(tx => {
        const positive = tx.amount > 0
        return (
          <View
            key={tx.id}
            className="flex-row items-center gap-3 rounded-lg border border-border bg-card p-3"
          >
            <View className="flex-1">
              <Text className="font-sans-medium text-sm text-foreground" numberOfLines={1}>
                {tx.description}
              </Text>
              <Text className="font-mono text-[10px] text-muted-foreground">
                {tx.created ? utcToLocalDateStr(tx.created) : ''}
              </Text>
            </View>
            <Text
              className={cn('font-bebas text-lg', positive ? 'text-lime' : 'text-destructive')}
            >
              {positive ? '+' : ''}{tx.amount}
            </Text>
          </View>
        )
      })}
    </View>
  )
}
