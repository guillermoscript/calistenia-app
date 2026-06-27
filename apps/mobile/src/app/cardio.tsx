/**
 * Pantalla de cardio GPS — port móvil de CardioSessionPage (web).
 * Tres vistas: idle (selector + historial + stats), tracking (métricas en vivo
 * + mapa) y finished (resumen + splits + elevación + nota).
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { View, ScrollView, Pressable, TextInput, Alert, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { X, MapPin, Check } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { useAuthUser } from '@/lib/use-auth-user'
import { useCardioSessionContext } from '@/contexts/CardioSessionContext'
import { useWorkoutActions } from '@/contexts/WorkoutContext'
import RouteMap from '@/components/cardio/RouteMap'
import CardioHistory from '@/components/cardio/CardioHistory'
import CardioStats from '@/components/cardio/CardioStats'
import SplitsTable from '@/components/cardio/SplitsTable'
import ElevationProfile from '@/components/cardio/ElevationProfile'
import RacePRsPanel from '@/components/race/RacePRsPanel'
import CardioShareButton from '@/components/share/CardioShareButton'

import { useCardioStats } from '@calistenia/core/hooks/useCardioStats'
import { formatDuration, formatPace, formatSpeed, assessTrackQuality } from '@calistenia/core/lib/geo'
import { CARDIO_ACTIVITY } from '@calistenia/core/lib/style-tokens'
import { op } from '@calistenia/core/lib/analytics'
import type { CardioActivityType, CardioSession } from '@calistenia/core/types'
import { Sentry } from '@/lib/instrument'

const ACTIVITIES: CardioActivityType[] = ['running', 'walking', 'cycling']
const LIME = 'hsl(74 90% 45%)'

export default function CardioScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const user = useAuthUser()
  const userId = user?.id ?? null

  const {
    state, activityType, points: pointsRef, pointsCount, distance, duration,
    currentPace, currentSpeed, currentSplit, error, note, setNote, gpsAccuracy,
    start, pause, resume, finish, discard, getHistory, deleteSession, updateSessionNote, unsavedCount,
  } = useCardioSessionContext()
  const { markCardioDayDone } = useWorkoutActions()

  const params = useLocalSearchParams<{
    program?: string; dayKey?: string; activity?: string; targetKm?: string; targetMin?: string
  }>()
  const isFromProgram = !!(params.program && params.dayKey)

  const { weeklyStats, monthlyStats, records, weeklyTrend, lastSession, loadStats } = useCardioStats(userId)

  const [selectedActivity, setSelectedActivity] = useState<CardioActivityType>(
    (params.activity as CardioActivityType) || 'running',
  )
  const [history, setHistory] = useState<CardioSession[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [savedSession, setSavedSession] = useState<CardioSession | null>(null)
  const [raceLink, setRaceLink] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const isIdle = state === 'idle'
  useEffect(() => {
    if (!isIdle && !savedSession) return
    setHistoryLoading(true)
    getHistory(20).then(setHistory).catch((e) => { Sentry.captureException(e, { tags: { feature: 'cardio', op: 'load_history' } }) }).finally(() => setHistoryLoading(false))
    void loadStats()
  }, [isIdle, getHistory, loadStats]) // eslint-disable-line react-hooks/exhaustive-deps

  const isCycling = (type: CardioActivityType) => type === 'cycling'

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([
      getHistory(20).then(setHistory).catch((e) => { Sentry.captureException(e, { tags: { feature: 'cardio', op: 'refresh_history' } }) }),
      loadStats(),
    ])
    setRefreshing(false)
  }, [getHistory, loadStats])

  const handleStart = async () => {
    op.track('cardio_started', { activity_type: selectedActivity, platform: 'mobile' })
    await start(selectedActivity, params.program || undefined, params.dayKey || undefined)
  }

  const handleFinish = async () => {
    const session = await finish(note.trim() || undefined)
    if (session) {
      op.track('cardio_completed', {
        activity_type: session.activity_type,
        distance_km: session.distance_km,
        duration_seconds: session.duration_seconds,
        platform: 'mobile',
      })
      // Día de programa cardio → marca el día hecho (checkmark del programa).
      if (session.id && session.program_day_key) {
        markCardioDayDone(session.program_day_key, session.id, session.note ?? '')
      }
    }
    setSavedSession(session)
  }

  const handleDiscard = useCallback(() => {
    Alert.alert(
      t('cardio.discardSession'),
      t('cardio.discardConfirm', { activity: t(`cardio.${activityType}`).toLowerCase() }),
      [
        { text: t('cardio.continue'), style: 'cancel' },
        {
          text: t('cardio.discard'),
          style: 'destructive',
          onPress: () => {
            op.track('cardio_discarded', { activity_type: activityType, platform: 'mobile' })
            discard()
            setSavedSession(null)
          },
        },
      ],
    )
  }, [t, activityType, discard])

  const handleNewSession = () => {
    discard()
    setSavedSession(null)
  }

  const handleDeleteSession = async (id: string) => {
    await deleteSession(id)
    setHistory((prev) => prev.filter((s) => s.id !== id))
  }

  const displaySession = savedSession

  const trackQuality = useMemo(() => {
    if (state !== 'finished') return null
    const pts = displaySession?.gps_points ?? pointsRef.current
    const dist = displaySession?.distance_km ?? distance
    if (pts.length < 2) return null
    return assessTrackQuality(pts, dist)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, displaySession, distance, pointsCount])

  const isTracking = state === 'tracking' || state === 'paused'

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <ScrollView
        contentContainerClassName="px-4 pb-10 gap-4"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          isIdle && !savedSession
            ? <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={LIME} colors={[LIME]} />
            : undefined
        }
      >
        {/* Header */}
        <View className="flex-row items-start justify-between pt-2">
          {!isTracking ? (
            <View>
              <Text className="font-bebas text-5xl leading-none text-foreground">{t('cardio.title')}</Text>
              <Text className="mt-1 font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
                {t('cardio.gpsTracking')}
              </Text>
            </View>
          ) : (
            <View className="flex-row items-center gap-2">
              <Text className="text-xl">{CARDIO_ACTIVITY[activityType]?.icon}</Text>
              <Text className="font-bebas text-xl uppercase tracking-widest text-foreground">
                {t(`cardio.${activityType}`)}
              </Text>
            </View>
          )}
          <View className="flex-row items-center gap-3">
            {state === 'tracking' && (
              <View className="flex-row items-center gap-1">
                <MapPin size={13} color={gpsAccuracy == null ? '#f87171' : gpsAccuracy <= 10 ? LIME : gpsAccuracy <= 20 ? '#fbbf24' : '#f87171'} />
                <Text
                  className={cn(
                    'font-mono text-[10px]',
                    gpsAccuracy == null ? 'text-red-400' : gpsAccuracy <= 10 ? 'text-lime' : gpsAccuracy <= 20 ? 'text-amber-400' : 'text-red-400',
                  )}
                >
                  {gpsAccuracy != null ? `${Math.round(gpsAccuracy)}m` : '---'}
                </Text>
              </View>
            )}
            {state === 'tracking' ? (
              <View className="flex-row items-center gap-1.5">
                <View className="size-2.5 rounded-full bg-red-500" />
                <Text className="font-mono text-[10px] uppercase tracking-widest text-red-400">{t('cardio.recording')}</Text>
              </View>
            ) : state === 'paused' ? (
              <Text className="rounded-lg bg-amber-400/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-amber-400">
                {t('cardio.paused')}
              </Text>
            ) : (
              <Pressable onPress={() => router.back()} className="rounded-full bg-muted/60 p-2 active:opacity-70" accessibilityLabel={t('common.back')}>
                <X size={18} color="#888899" />
              </Pressable>
            )}
          </View>
        </View>

        {error && (
          <View className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
            <Text className="text-sm text-red-400">{error}</Text>
          </View>
        )}

        {/* ── Vista idle ── */}
        {state === 'idle' && !savedSession && (
          <View className="gap-5">
            {unsavedCount > 0 && (
              <View className="flex-row items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2">
                <Text className="text-amber-400">⚠</Text>
                <Text className="font-mono text-xs text-amber-400">
                  {t('cardio.unsavedSessions', '{{count}} sesión(es) pendientes de subir', { count: unsavedCount })}
                </Text>
              </View>
            )}

            {isFromProgram && (
              <View className="items-center rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-3">
                <Text className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-emerald-400">
                  {t('cardio.fromProgram')}
                </Text>
                <View className="flex-row gap-3">
                  {params.targetKm ? (
                    <Text className="text-sm font-sans-medium text-emerald-400">{t('cardio.targetKm', { km: params.targetKm })}</Text>
                  ) : null}
                  {params.targetMin ? (
                    <Text className="text-sm font-sans-medium text-emerald-400">{t('cardio.targetMin', { min: params.targetMin })}</Text>
                  ) : null}
                </View>
              </View>
            )}

            {/* Selector de actividad */}
            <View className="flex-row gap-2 rounded-xl bg-muted/50 p-1">
              {ACTIVITIES.map((act) => (
                <Pressable
                  key={act}
                  onPress={() => {
                    if (act !== selectedActivity) void haptics.selection()
                    setSelectedActivity(act)
                  }}
                  className={cn(
                    'flex-1 items-center gap-1 rounded-lg py-4',
                    selectedActivity === act && 'border border-lime/30 bg-background',
                  )}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: selectedActivity === act }}
                >
                  <Text className="text-2xl">{CARDIO_ACTIVITY[act]?.icon}</Text>
                  <Text className={cn('font-mono text-[10px] uppercase tracking-widest', selectedActivity === act ? 'text-foreground' : 'text-muted-foreground')}>
                    {t(`cardio.${act}`)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Button
              onPress={handleStart}
              className={cn('h-14 w-full', isFromProgram ? 'bg-emerald-500 active:bg-emerald-400' : 'bg-lime active:bg-lime/90')}
            >
              <Text className="font-bebas text-xl uppercase tracking-widest text-zinc-900">
                {t('cardio.start')} {t(`cardio.${selectedActivity}`)}
              </Text>
            </Button>

            {/* Carreras: crear / descubrir / unirse por link */}
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => router.push('/race-create')}
                className="h-11 flex-1 items-center justify-center rounded-xl border border-border active:bg-muted/50"
              >
                <Text className="font-bebas text-base uppercase tracking-widest text-muted-foreground">{t('race.create')}</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/races-discover')}
                className="h-11 flex-1 items-center justify-center rounded-xl border border-border active:bg-muted/50"
              >
                <Text className="font-bebas text-base uppercase tracking-widest text-muted-foreground">{t('race.findNearby')}</Text>
              </Pressable>
            </View>
            <View className="flex-row gap-2">
              <TextInput
                value={raceLink}
                onChangeText={setRaceLink}
                placeholder={t('race.pasteLinkPlaceholder')}
                placeholderTextColor="#71717a"
                autoCapitalize="none"
                className="h-11 flex-1 rounded-xl border border-border bg-muted/30 px-3.5 text-sm text-foreground"
              />
              <Pressable
                onPress={() => {
                  const raceId = raceLink.includes('/race/')
                    ? raceLink.split('/race/')[1].split('?')[0].trim()
                    : raceLink.trim()
                  if (raceId) router.push(`/race/${raceId}`)
                }}
                disabled={!raceLink.trim()}
                className={cn('h-11 items-center justify-center rounded-xl border border-border px-4 active:bg-muted/50', !raceLink.trim() && 'opacity-40')}
              >
                <Text className="font-bebas text-base uppercase tracking-widest text-muted-foreground">{t('race.join')}</Text>
              </Pressable>
            </View>

            <RacePRsPanel userId={userId} />

            {/* Historial */}
            <View className="gap-3">
              <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">{t('cardio.history')}</Text>
              <CardioHistory sessions={history} loading={historyLoading} onDelete={handleDeleteSession} />
            </View>

            {/* Estadísticas */}
            {(weeklyStats.totalSessions > 0 || monthlyStats.totalSessions > 0) && (
              <View className="gap-3">
                <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">{t('cardio.statistics')}</Text>
                <CardioStats weeklyStats={weeklyStats} monthlyStats={monthlyStats} records={records} weeklyTrend={weeklyTrend} lastSession={lastSession} />
              </View>
            )}
          </View>
        )}

        {/* ── Vista tracking / paused ── */}
        {isTracking && (
          <View className="gap-4">
            {/* Duración — métrica hero */}
            <View className="items-center pt-2">
              <Text className="font-bebas text-7xl leading-none text-foreground">{formatDuration(duration)}</Text>
              <Text className="mt-1.5 font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
                {t('cardio.duration')}
              </Text>
            </View>

            {/* Distancia + ritmo/velocidad */}
            <View className="flex-row gap-3">
              <View className="flex-1 items-center rounded-xl bg-muted/60 p-5">
                <Text className="font-bebas text-5xl leading-none text-lime">{distance.toFixed(2)}</Text>
                <Text className="mt-1.5 font-mono text-[10px] tracking-[2px] text-muted-foreground">KM</Text>
              </View>
              <View className="flex-1 items-center rounded-xl bg-muted/60 p-5">
                <Text className="font-bebas text-5xl leading-none text-sky-500">
                  {isCycling(activityType) ? formatSpeed(currentSpeed) : formatPace(currentPace)}
                </Text>
                <Text className="mt-1.5 font-mono text-[10px] tracking-[2px] text-muted-foreground">
                  {isCycling(activityType) ? 'KM/H' : 'MIN/KM'}
                </Text>
              </View>
            </View>

            {/* Split en curso */}
            {currentSplit && distance > 0.1 && (
              <View className="flex-row items-center justify-center gap-2 rounded-lg bg-muted/40 py-2.5">
                <Text className="font-bebas text-base tracking-widest text-muted-foreground">KM {currentSplit.km}</Text>
                <Text className="text-muted-foreground/40">—</Text>
                <Text className="font-bebas text-base text-sky-500">{formatDuration(currentSplit.elapsed)}</Text>
              </View>
            )}

            {/* Mapa en vivo */}
            {pointsCount > 1 && (
              <RouteMap points={pointsRef.current} pointsVersion={pointsCount} height={220} live activityType={activityType} />
            )}

            {/* Controles */}
            <View className="flex-row gap-3">
              {state === 'tracking' ? (
                <>
                  <Pressable onPress={pause} className="h-16 flex-1 items-center justify-center rounded-xl border border-amber-400/30 active:bg-amber-400/10">
                    <Text className="font-bebas text-xl tracking-widest text-amber-400">{t('cardio.pause')}</Text>
                  </Pressable>
                  <Pressable onPress={handleFinish} className="h-16 flex-1 items-center justify-center rounded-xl bg-red-500 active:bg-red-600">
                    <Text className="font-bebas text-xl tracking-widest text-white">{t('cardio.stop')}</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable onPress={resume} className="h-16 flex-1 items-center justify-center rounded-xl bg-lime active:bg-lime/90">
                    <Text className="font-bebas text-xl tracking-widest text-zinc-900">{t('cardio.resume')}</Text>
                  </Pressable>
                  <Pressable onPress={handleFinish} className="h-16 flex-1 items-center justify-center rounded-xl bg-red-500 active:bg-red-600">
                    <Text className="font-bebas text-xl tracking-widest text-white">{t('cardio.end')}</Text>
                  </Pressable>
                </>
              )}
            </View>

            {/* Nota rápida en pausa */}
            {state === 'paused' && (
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder={t('cardio.quickNotes')}
                placeholderTextColor="#71717a"
                maxLength={500}
                multiline
                className="min-h-[64px] rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-sm text-foreground"
              />
            )}

            <Pressable onPress={handleDiscard} className="py-3">
              <Text className="text-center text-xs text-muted-foreground">{t('cardio.discardSession')}</Text>
            </Pressable>
          </View>
        )}

        {/* ── Vista finished ── */}
        {(state === 'finished' || savedSession) && (
          <View className="gap-5">
            <View className="items-center pt-2">
              <View className="mb-3 size-14 items-center justify-center rounded-full border border-lime/20 bg-lime/10">
                <Check size={28} color={LIME} />
              </View>
              <Text className="font-bebas text-2xl tracking-wide text-lime">{t('cardio.sessionComplete')}</Text>
            </View>

            {pointsCount > 1 && (
              <RouteMap points={pointsRef.current} pointsVersion={pointsCount} height={250} activityType={activityType} />
            )}

            {pointsCount > 2 && <ElevationProfile points={pointsRef.current} height={80} />}

            {trackQuality && trackQuality.grade !== 'good' && (
              <View
                className={cn(
                  'flex-row items-center gap-2 rounded-lg px-3 py-2',
                  trackQuality.grade === 'poor' ? 'bg-red-500/10' : 'bg-amber-500/10',
                )}
              >
                <Text className={trackQuality.grade === 'poor' ? 'text-red-400' : 'text-amber-400'}>
                  {trackQuality.grade === 'poor' ? '⚠' : 'ℹ'}
                </Text>
                <Text className={cn('flex-1 font-mono text-xs', trackQuality.grade === 'poor' ? 'text-red-400' : 'text-amber-400')}>
                  {trackQuality.grade === 'poor'
                    ? t('cardio.trackingIssues', 'El GPS tuvo problemas — la distancia es aproximada')
                    : t('cardio.estimatedDistance', '~{{km}} km estimados por {{gaps}} corte(s) de GPS', {
                        km: trackQuality.gapDistanceKm,
                        gaps: trackQuality.gapCount,
                      })}
                </Text>
              </View>
            )}

            {/* Stats principales */}
            <View className="flex-row gap-3">
              <View className="flex-1 items-center rounded-xl bg-muted/60 p-4">
                <Text className="font-bebas text-3xl text-lime">
                  {trackQuality && trackQuality.grade !== 'good' ? '~' : ''}
                  {(displaySession?.distance_km ?? distance).toFixed(2)}
                </Text>
                <Text className="mt-1 font-mono text-[9px] tracking-widest text-muted-foreground">KM</Text>
              </View>
              <View className="flex-1 items-center rounded-xl bg-muted/60 p-4">
                <Text className="font-bebas text-3xl text-foreground">{formatDuration(displaySession?.duration_seconds ?? duration)}</Text>
                <Text className="mt-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{t('cardio.duration')}</Text>
              </View>
              <View className="flex-1 items-center rounded-xl bg-muted/60 p-4">
                <Text className="font-bebas text-3xl text-sky-500">
                  {isCycling(displaySession?.activity_type ?? activityType)
                    ? formatSpeed(displaySession?.avg_speed_kmh ?? 0)
                    : formatPace(displaySession?.avg_pace ?? currentPace)}
                </Text>
                <Text className="mt-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                  {isCycling(displaySession?.activity_type ?? activityType) ? 'KM/H' : t('cardio.pace')}
                </Text>
              </View>
            </View>

            {/* Stats secundarias */}
            <View className="flex-row gap-3">
              <View className="flex-1 items-center rounded-xl bg-muted/40 p-3">
                <Text className="font-bebas text-2xl text-amber-400">{displaySession?.calories_burned ?? 0}</Text>
                <Text className="mt-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{t('nutrition.calories')}</Text>
              </View>
              <View className="flex-1 items-center rounded-xl bg-muted/40 p-3">
                <Text className="font-bebas text-2xl text-amber-400">{displaySession?.elevation_gain ?? 0}m</Text>
                <Text className="mt-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{t('cardio.elevation')}</Text>
              </View>
              <View className="flex-1 items-center rounded-xl bg-muted/40 p-3">
                <Text className="font-bebas text-2xl text-pink-500">
                  {isCycling(displaySession?.activity_type ?? activityType)
                    ? formatSpeed(displaySession?.max_speed_kmh ?? 0)
                    : formatPace(displaySession?.max_pace ?? 0)}
                </Text>
                <Text className="mt-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                  {isCycling(displaySession?.activity_type ?? activityType) ? t('cardio.maxSpeed') : t('cardio.maxPace')}
                </Text>
              </View>
            </View>

            {displaySession?.splits && displaySession.splits.length > 0 && (
              <View className="gap-3">
                <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">{t('cardio.splits')}</Text>
                <SplitsTable splits={displaySession.splits} />
              </View>
            )}

            <View className="gap-1.5">
              <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
                {t('cardio.notesOptional')}
              </Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                onEndEditing={() => {
                  if (savedSession?.id) void updateSessionNote(savedSession.id, note.trim())
                }}
                placeholder={t('cardio.sessionNotes')}
                placeholderTextColor="#71717a"
                maxLength={500}
                multiline
                className="min-h-[72px] rounded-xl border border-border bg-muted/30 px-3.5 py-3 text-base text-foreground"
              />
            </View>

            {/* Share card — only available once the session is saved (has id + full data) */}
            {savedSession && (
              <CardioShareButton
                session={savedSession}
                userName={(user?.display_name as string | undefined) ?? (user?.email as string | undefined)?.split('@')[0]}
                referralCode={(user?.referral_code as string | undefined) ?? null}
              />
            )}

            <Button onPress={handleNewSession} className="h-12 w-full bg-lime active:bg-lime/90">
              <Text className="font-bebas text-lg tracking-wide text-zinc-900">{t('cardio.newSession')}</Text>
            </Button>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
