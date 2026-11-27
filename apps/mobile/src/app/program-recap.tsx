/**
 * Pantalla de cierre del programa (#941). Paridad con
 * `apps/web/src/pages/ProgramRecapPage.tsx`; el cálculo vive en core
 * (`useProgramRecap` → `buildProgramRecap`).
 *
 * Se abre sola una vez por inscripción desde la tarjeta «programa terminado»
 * del inicio (`TodayBlock`), y después desde «Tu resumen del programa».
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { View, ScrollView, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ChevronLeft } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Kicker } from '@/components/ui/kicker'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { useAuthUser } from '@/lib/use-auth-user'
import { useWorkoutState, useWorkoutActions } from '@/contexts/WorkoutContext'
import ProgramRecapShareButton from '@/components/programs/ProgramRecapShareButton'

import { useBodyPhotos } from '@calistenia/core/hooks/useBodyPhotos'
import { useProgramRecap } from '@calistenia/core/hooks/useProgramRecap'
import { programAdherencePct } from '@calistenia/core/lib/programProgress'
import { canExtendProgram, programOutcome } from '@calistenia/core/lib/programOutcome'
import { canRepeatProgram } from '@calistenia/core/lib/programCycle'
import { recommendNextPrograms, trackProgramNextChosen } from '@calistenia/core/lib/nextProgram'
import { formatRecapNumber } from '@calistenia/core/lib/programRecap'
import { markProgramRecapSeen } from '@calistenia/core/lib/programRecapSeen'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '@calistenia/core/lib/analytics'

function Rule() {
  return <View className="h-px bg-border" />
}

export default function ProgramRecapScreen() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const user = useAuthUser()
  const { activeProgram, activeEnrollment, programs, programProgress, progress } = useWorkoutState()
  const { getWorkout, selectProgram, extendProgram, repeatProgram } = useWorkoutActions()
  const { photos } = useBodyPhotos(user?.id ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recap = useProgramRecap({ progress, getWorkout, programProgress, locale: i18n.language })
  const ended = !!activeProgram && programProgress.isCompleted
  const finished = programOutcome(programProgress) === 'finished'
  const extendable = canExtendProgram(programProgress, activeEnrollment?.extended_weeks)
  const adherence = programAdherencePct(programProgress)
  // #939: repetir con más carga, solo si lo completó y queda vuelta.
  const repeatable = programProgress.isCompleted && !finished && canRepeatProgram(activeEnrollment?.cycle)
  const next = recommendNextPrograms(programs, { completed: activeProgram, level: user?.level as string | undefined })[0] ?? null
  const name = activeProgram?.name ?? ''
  const title = finished ? t('home.programComplete.titleFinished', { name }) : t('home.programComplete.title', { name })
  const counts = { done: programProgress.programSessionsDone, planned: programProgress.programSessionsPlanned }

  const photosInProgram = useMemo(() => {
    const { startDay, endDay } = programProgress
    if (!startDay || !endDay) return 0
    return photos.filter(p => p.date >= startDay && p.date <= endDay).length
  }, [photos, programProgress])

  const trackedRef = useRef(false)
  useEffect(() => {
    if (!ended || trackedRef.current) return
    trackedRef.current = true
    markProgramRecapSeen(activeEnrollment?.id, activeEnrollment?.cycle)
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.programRecapViewed, {
      surface: 'program_recap',
      source: 'program_complete',
      program_id: activeProgram?.id,
      result: programOutcome(programProgress),
      adherence_pct: adherence ?? undefined,
      comparisons: recap.comparisons.length,
      records: recap.records.length,
    })
  }, [ended, activeEnrollment?.id, activeEnrollment?.cycle, activeProgram?.id, programProgress, adherence, recap])

  const run = async (fn: () => Promise<boolean>, errorKey: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    const ok = await fn()
    setBusy(false)
    if (ok) router.dismissTo('/(tabs)')
    else setError(t(errorKey))
  }

  const stats = [
    { value: String(programProgress.totalWeeks), label: t('home.programComplete.weeks') },
    { value: counts.planned > 0 ? `${counts.done}/${counts.planned}` : String(counts.done), label: t('home.programComplete.adherence') },
    ...(adherence !== null ? [{ value: `${adherence}%`, label: t('programRecap.consistency') }] : []),
    { value: String(recap.setsLogged), label: t('programRecap.setsLogged') },
  ]

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView contentContainerClassName="px-4 pb-32" showsVerticalScrollIndicator={false}>
        <View className="pb-2 pt-2">
          <Pressable
            onPress={() => { haptics.selection(); router.back() }}
            className="-ml-2 mb-1 size-9 flex-row items-center justify-center self-start rounded-lg"
            accessibilityRole="button"
            accessibilityLabel={t('common.back', { defaultValue: 'Atrás' })}
          >
            <ChevronLeft size={24} color="rgba(255,255,255,0.55)" />
          </Pressable>
        </View>

        {!ended ? (
          <View className="gap-4 py-6">
            <Text className="font-sans text-sm text-muted-foreground">{t('programRecap.empty')}</Text>
            <Button variant="outline" className="self-start" onPress={() => router.dismissTo('/(tabs)')}>
              <Text>{t('programRecap.back')}</Text>
            </Button>
          </View>
        ) : (
          <View className="gap-8">
            <View className="gap-2">
              <Text className="font-mono text-[10px] uppercase tracking-[3px] text-lime">{t('programRecap.kicker')}</Text>
              <Text className="font-bebas text-5xl leading-[46px] text-foreground">{title}</Text>
              {finished ? (
                <Text className="font-sans text-sm text-muted-foreground">
                  {extendable ? t('home.programComplete.finishedBody', counts) : t('home.programComplete.finishedBodyNoExtend', counts)}
                </Text>
              ) : null}
            </View>

            <View>
              <Rule />
              <View className="flex-row flex-wrap">
                {stats.map((s, i) => (
                  <View key={s.label} className={cn('w-1/2 gap-1 py-4', i % 2 === 1 && 'border-l border-border pl-4')}>
                    <Text className="font-bebas text-4xl leading-[36px] text-foreground">{s.value}</Text>
                    <Text className="font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground">{s.label}</Text>
                  </View>
                ))}
              </View>
              <Rule />
            </View>

            <View className="gap-2">
              <Kicker>{t('programRecap.compareTitle')}</Kicker>
              {recap.comparisons.length === 0 ? (
                <Text className="font-sans text-sm text-muted-foreground">{t('programRecap.compareEmpty')}</Text>
              ) : (
                <View>
                  <Rule />
                  {recap.comparisons.map(c => (
                    <View key={c.key}>
                      <View className="min-h-14 flex-row items-center justify-between gap-3 py-2">
                        <View className="flex-1 gap-0.5">
                          <Text className="font-sans-medium text-sm text-foreground" numberOfLines={1}>{c.name}</Text>
                          <Text className="font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground">
                            {t('programRecap.compareWeeks', { first: c.firstWeek, last: c.lastWeek })}
                          </Text>
                        </View>
                        <Text className="font-bebas text-3xl text-muted-foreground">
                          {formatRecapNumber(c.first)} →{' '}
                          <Text className={cn('font-bebas text-3xl', c.delta > 0 ? 'text-lime' : 'text-foreground')}>{formatRecapNumber(c.last)}</Text>
                          <Text className="font-mono text-[10px] uppercase text-muted-foreground"> {t(`programRecap.unit.${c.unit}`)}</Text>
                        </Text>
                      </View>
                      <Rule />
                    </View>
                  ))}
                </View>
              )}
            </View>

            {recap.records.length > 0 ? (
              <View className="gap-2">
                <Kicker>{t('programRecap.recordsTitle')}</Kicker>
                <View>
                  <Rule />
                  {recap.records.map(r => (
                    <View key={r.key}>
                      <View className="min-h-12 flex-row items-center justify-between gap-3 py-2">
                        <Text className="flex-1 font-sans-medium text-sm text-foreground" numberOfLines={1}>{r.name}</Text>
                        <View className="items-end">
                          <Text className="font-bebas text-2xl text-lime">{formatRecapNumber(r.value)} {t(`programRecap.unit.${r.unit}`)}</Text>
                          <Text className="font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground">
                            {t('programRecap.recordBefore', { value: `${formatRecapNumber(r.previous)} ${t(`programRecap.unit.${r.unit}`)}` })}
                          </Text>
                        </View>
                      </View>
                      <Rule />
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {photosInProgram > 0 ? (
              <View className="gap-1">
                <Kicker>{t('programRecap.photosTitle')}</Kicker>
                <Text className="font-sans text-sm text-muted-foreground">{t('programRecap.photosBody', { count: photosInProgram })}</Text>
                <Pressable onPress={() => router.push('/progress-photos')} accessibilityRole="link" className="min-h-11 justify-center">
                  <Text className="font-sans-medium text-sm text-foreground underline">{t('programRecap.photosLink')}</Text>
                </Pressable>
              </View>
            ) : null}

            <ProgramRecapShareButton
              title={title}
              userName={(user?.display_name as string | undefined) || (user?.name as string | undefined)}
              stats={stats.slice(0, 3)}
              recap={recap}
              shareText={t('programRecap.shareText', { name, done: counts.done, planned: counts.planned, weeks: programProgress.totalWeeks })}
            />

            <View className="gap-3 border-t border-border pt-6">
              <Kicker>{t('programRecap.next')}</Kicker>
              {next ? (
                <View className="gap-0.5">
                  <Text className="font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground">{t('home.programComplete.nextRecommended')}</Text>
                  <Text className="font-sans-medium text-base text-foreground">{next.name}</Text>
                </View>
              ) : null}
              {extendable ? (
                <Button
                  className="min-h-14"
                  disabled={busy}
                  onPress={() => { trackProgramNextChosen('extend', activeProgram?.id, null, 'program_recap'); void run(extendProgram, 'programs.extendError') }}
                >
                  <Text className="font-bebas text-xl">{t('home.action.extendProgram')}</Text>
                </Button>
              ) : null}
              {next ? (
                <Button
                  variant={extendable ? 'outline' : 'default'}
                  className="min-h-14"
                  disabled={busy}
                  onPress={() => { trackProgramNextChosen('recommended', activeProgram?.id, next.id, 'program_recap'); void run(() => selectProgram(next.id), 'programs.switchError') }}
                >
                  <Text className={extendable ? 'font-sans-medium' : 'font-bebas text-xl'} numberOfLines={1}>{t('home.action.startProgram', { name: next.name })}</Text>
                </Button>
              ) : null}
              {repeatable ? (
                <Button
                  variant={next ? 'outline' : 'default'}
                  className="min-h-14"
                  disabled={busy}
                  onPress={() => { trackProgramNextChosen('repeat', activeProgram?.id, activeProgram?.id, 'program_recap'); void run(repeatProgram, 'programs.repeatError') }}
                >
                  <Text className={next ? 'font-sans-medium' : 'font-bebas text-xl'}>{t('home.action.repeatProgram')}</Text>
                </Button>
              ) : null}
              {error ? <Text className="font-sans text-sm text-destructive">{error}</Text> : null}
              <Button
                variant="outline"
                className="min-h-12"
                onPress={() => { trackProgramNextChosen('other', activeProgram?.id, null, 'program_recap'); router.push('/programs') }}
              >
                <Text>{t('home.action.seeOthers')}</Text>
              </Button>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
