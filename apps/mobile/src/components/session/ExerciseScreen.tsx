import { memo, useState } from 'react'
import { View, ScrollView, Pressable, Linking } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Image } from 'expo-image'

import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import * as sounds from '@/lib/sounds'
import { haptics as haptic } from '@/lib/haptics'
import { getExerciseMedia } from '@calistenia/core/lib/exerciseMedia'
import { getCatalogStaticMedia } from '@calistenia/core/lib/catalogMedia'
import { formatTempo, quickReps } from '@calistenia/core/lib/exercise-format'
import type { ExerciseLog, SetData } from '@calistenia/core/types'
import type { Step } from '@calistenia/core/lib/session-machine'
import { ExerciseTimer } from '@/components/session/TimerScreen'

interface ExerciseScreenProps {
  step: Step
  onLogged: (data: { reps: string; note: string; weight?: number; rpe?: number }) => void
  logs?: ExerciseLog[]
}

const ExerciseScreen = memo(function ExerciseScreen({ step, onLogged, logs = [] }: ExerciseScreenProps) {
  const { t } = useTranslation()
  const [editOpen, setEditOpen] = useState(false)
  const [customReps, setCustomReps] = useState('')
  const [customNote, setCustomNote] = useState('')
  const [customWeight, setCustomWeight] = useState('')
  const [customRpe, setCustomRpe] = useState('')
  // [014] media viewer state
  const [imgIdx, setImgIdx] = useState(0)
  const [showImages, setShowImages] = useState(false)

  const { exercise, setNumber, totalSets } = step
  const recentLogs = logs.slice(0, 2)

  // Pista de sobrecarga progresiva
  const lastLog = logs[0]
  const lastBestReps = lastLog?.sets?.reduce((max: number, s: SetData) => {
    const n = parseInt(s.reps); return (!isNaN(n) && n > max) ? n : max
  }, 0) || 0
  const lastBestWeight = lastLog?.sets?.reduce((max: number, s: SetData) => (s.weight || 0) > max ? (s.weight || 0) : max, 0) || 0

  const defaultReps = quickReps(exercise.reps)

  const doLog = (reps: string | number, note: string = '', weight?: number, rpe?: number): void => {
    sounds.playSetComplete()
    haptic.medium()
    onLogged({ reps: String(reps), note, weight, rpe })
  }

  const handleQuick = () => doLog(defaultReps)
  const handleForm = () => {
    if (!customReps) return
    const w = customWeight ? parseFloat(customWeight) : undefined
    const r = customRpe ? parseInt(customRpe) : undefined
    doLog(customReps, customNote, w, r)
    setCustomReps(''); setCustomNote(''); setCustomWeight(''); setCustomRpe(''); setEditOpen(false)
  }

  const openYoutube = () => {
    const query = exercise.youtube?.trim() || exercise.name
    Linking.openURL(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`).catch(() => {})
  }

  // [014+015] Resolve canonical media (program override → catalog static → catalog PB → youtube)
  // mediaBaseUrl prefixes origin-relative static paths (/exercise-media/…) so they resolve
  // as absolute HTTPS URLs on device (same origin as PocketBase / web).
  const MEDIA_BASE = process.env.EXPO_PUBLIC_PB_URL || 'https://gym.guille.tech'
  const resolvedMedia = getExerciseMedia(
    {
      pbRecordId: exercise.pbRecordId,
      demoImages: exercise.demoImages,
      demoVideo: exercise.demoVideo,
      youtube: exercise.youtube,
    },
    { mediaBaseUrl: MEDIA_BASE, catalogRecord: { staticMedia: getCatalogStaticMedia(exercise.id) } },
  )
  // [015] Structured media fields
  const mediaSequence = resolvedMedia.sequence
  const mediaMuscles  = resolvedMedia.muscles
  // Back-compat: legacy flat images (only used when no structured media)
  const mediaImages = mediaSequence ? [] : resolvedMedia.images

  return (
    <ScrollView className="flex-1" contentContainerClassName="flex-grow px-5 pb-6 pt-4">
      {/* Nombre + meta */}
      <View className="mb-2">
        <Text className="font-bebas text-[40px] leading-none tracking-[2px] text-foreground">{exercise.name}</Text>
        <View className="mt-2 flex-row flex-wrap items-center gap-x-3 gap-y-1">
          <Text className="font-mono text-[13px] tracking-wide text-lime">{exercise.reps}</Text>
          <Text className="font-mono text-[11px] text-muted-foreground">· {t('common.rest')} {exercise.rest}s</Text>
          <Text className="font-mono text-[10px] tracking-wide text-muted-foreground">{exercise.muscles}</Text>
        </View>
      </View>

      {/* Dots de series */}
      <View className="mb-5 flex-row items-center gap-2">
        {Array.from({ length: totalSets }).map((_, i) => (
          <View key={i} className={cn(
            'h-1.5 w-7 rounded',
            i < setNumber - 1 ? 'bg-lime' : i === setNumber - 1 ? 'bg-lime/40' : 'bg-border',
          )} />
        ))}
        <Text className="ml-1 font-mono text-[10px] text-muted-foreground">{t('session.set').toUpperCase()} {setNumber}/{totalSets}</Text>
      </View>

      {/* Sobrecarga progresiva */}
      {lastLog && lastBestReps > 0 && setNumber === 1 && (
        <View className="mb-4 rounded-md border-l-[3px] border-amber-400/30 bg-amber-400/5 px-3.5 py-2.5">
          <Text className="text-[12px] text-amber-400/80">
            {t('exercise.lastTime')} <Text className="font-sans-bold text-[12px] text-amber-400">{lastBestReps}</Text> reps
            {lastBestWeight > 0 ? <Text className="text-[12px] text-amber-400/80"> +<Text className="font-sans-bold text-[12px] text-amber-400">{lastBestWeight}</Text>kg</Text> : null}
            {' — '}
            {lastBestWeight > 0 ? `intenta +${(lastBestWeight + 2.5).toFixed(1)}kg o +1 rep` : `intenta ${lastBestReps + 1} reps`}
          </Text>
        </View>
      )}

      {/* Nota del ejercicio */}
      {exercise.note ? (
        <View className="mb-3 rounded-md border-l-[3px] border-lime/20 bg-muted/30 px-3.5 py-2.5">
          <Text className="font-sans-italic text-[13px] leading-5 text-muted-foreground">{exercise.note}</Text>
        </View>
      ) : null}

      {/* Structured tempo cues (plan-013) */}
      {formatTempo(exercise.tempo) ? (
        <View className="mb-5 rounded-md border-l-[3px] border-cyan-400/20 bg-cyan-400/5 px-3 py-2">
          <Text className="font-mono text-[12px] tracking-wide text-cyan-400/80">
            Tempo: {formatTempo(exercise.tempo)}
          </Text>
        </View>
      ) : null}
      {/* [014+015] Demo media — structured (sequence + muscles) or legacy flat carousel */}
      {(mediaSequence || mediaMuscles || mediaImages.length > 0) && (
        <View className="mb-5">
          <Pressable
            onPress={() => setShowImages(v => !v)}
            className="mb-2 flex-row items-center gap-1.5"
            accessibilityLabel={showImages ? 'Ocultar demo' : 'Ver demo'}
          >
            <Text className="font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground/50">
              DEMO
            </Text>
            <Text className="font-mono text-[9px] text-muted-foreground/40">
              {showImages ? '▲' : '▼'}
            </Text>
          </Pressable>
          {showImages && (
            <View className="gap-3">
              {/* [015] Sequence — hero movement demo */}
              {mediaSequence ? (
                <View className="rounded-lg overflow-hidden bg-muted/30">
                  <Image
                    source={{ uri: mediaSequence }}
                    style={{ width: '100%', aspectRatio: 16 / 9 }}
                    contentFit="contain"
                    accessibilityLabel={`${exercise.name} — secuencia`}
                  />
                </View>
              ) : null}

              {/* [015] Muscles — activation map with labeled section */}
              {mediaMuscles ? (
                <View>
                  <Text className="mb-1 font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground/50">
                    MÚSCULOS TRABAJADOS
                  </Text>
                  <View className="rounded-lg overflow-hidden bg-muted/30">
                    <Image
                      source={{ uri: mediaMuscles }}
                      style={{ width: '100%', aspectRatio: 4 / 3 }}
                      contentFit="contain"
                      accessibilityLabel={`${exercise.name} — músculos trabajados`}
                    />
                  </View>
                </View>
              ) : null}

              {/* Legacy flat carousel — only when no structured media */}
              {!mediaSequence && mediaImages.length > 0 ? (
                <View className="rounded-lg overflow-hidden bg-muted/30">
                  <Image
                    source={{ uri: mediaImages[imgIdx] }}
                    style={{ width: '100%', aspectRatio: 4 / 3 }}
                    contentFit="contain"
                    accessibilityLabel={`${exercise.name} demo ${imgIdx + 1}`}
                  />
                  {mediaImages.length > 1 && (
                    <View className="flex-row items-center justify-between px-3 py-2">
                      <Pressable
                        onPress={() => setImgIdx(i => (i - 1 + mediaImages.length) % mediaImages.length)}
                        className="size-8 items-center justify-center rounded-full border border-border"
                        accessibilityLabel="Imagen anterior"
                      >
                        <Text className="text-muted-foreground text-sm">‹</Text>
                      </Pressable>
                      <Text className="font-mono text-[10px] text-muted-foreground">
                        {imgIdx + 1} / {mediaImages.length}
                      </Text>
                      <Pressable
                        onPress={() => setImgIdx(i => (i + 1) % mediaImages.length)}
                        className="size-8 items-center justify-center rounded-full border border-border"
                        accessibilityLabel="Imagen siguiente"
                      >
                        <Text className="text-muted-foreground text-sm">›</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ) : null}
            </View>
          )}
        </View>
      )}

      {/* Historial reciente */}
      {recentLogs.length > 0 && (
        <View className="mb-5">
          <Text className="mb-1.5 font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground/50">Últimas sesiones</Text>
          {recentLogs.map((log, i) => (
            <Text key={i} className="mb-0.5 text-xs text-muted-foreground/60" numberOfLines={1}>
              <Text className="font-mono text-xs text-muted-foreground/30">{log.date}</Text>
              {'  '}
              {log.sets?.map((s: SetData, j: number) =>
                `${j + 1}: ${s.reps}${s.weight ? ` +${s.weight}kg` : ''}`
              ).join('  ')}
            </Text>
          ))}
        </View>
      )}

      {/* Timer para ejercicios de tiempo */}
      {exercise.isTimer && <ExerciseTimer initialSeconds={exercise.timerSeconds || 30} />}

      <View className="flex-1" />

      {/* ── Acciones ── */}
      <View className="gap-2.5">
        <Pressable
          onPress={handleQuick}
          className="items-center rounded-lg bg-lime/15 py-[18px] active:bg-lime/25"
          accessibilityLabel={`${t('session.set')} ${defaultReps}`}
        >
          <Text className="font-mono-bold text-sm tracking-[1.5px] text-lime">+ {t('session.set').toUpperCase()} — {defaultReps}</Text>
        </Pressable>

        <View className="flex-row gap-2">
          <Pressable
            onPress={() => setEditOpen(v => !v)}
            className={cn(
              'min-h-[44px] flex-1 items-center justify-center rounded-md border',
              editOpen ? 'border-lime/40 bg-lime/10' : 'border-border',
            )}
          >
            <Text className={cn('font-mono text-[10px] tracking-wide', editOpen ? 'text-lime' : 'text-muted-foreground')}>
              {t('session.editBtn')}
            </Text>
          </Pressable>
          <Pressable
            onPress={openYoutube}
            className="min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-red-500/20 bg-red-500/5"
            accessibilityLabel="YouTube"
          >
            <Text className="text-sm text-red-500">▶</Text>
          </Pressable>
        </View>

        {editOpen && (
          <View className="rounded-lg border border-lime/20 bg-lime/5 px-3.5 py-3">
            <Text className="mb-2.5 font-mono text-[9px] uppercase tracking-[2px] text-lime">Registrar serie personalizada</Text>
            <View className="flex-row gap-2">
              <Input
                value={customReps}
                onChangeText={setCustomReps}
                placeholder={`Reps (${exercise.reps})`}
                className="h-10 flex-1 text-xs"
                maxLength={20}
              />
              <Input
                value={customWeight}
                onChangeText={setCustomWeight}
                placeholder={t('session.weightPlaceholder')}
                keyboardType="decimal-pad"
                className="h-10 w-[84px] text-xs"
              />
              <Input
                value={customRpe}
                onChangeText={setCustomRpe}
                placeholder="RPE"
                keyboardType="number-pad"
                maxLength={2}
                className="h-10 w-[56px] text-xs"
              />
            </View>
            <View className="mt-2 flex-row gap-2">
              <Input
                value={customNote}
                onChangeText={setCustomNote}
                placeholder={t('session.optionalNote')}
                className="h-10 flex-1 text-xs"
                maxLength={200}
              />
              <Button onPress={handleForm} disabled={!customReps} size="sm" className="h-10 bg-lime px-5 active:bg-lime/90">
                <Text className="font-mono-bold text-[11px] text-lime-foreground">{t('common.save').toUpperCase()}</Text>
              </Button>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  )
})

export default ExerciseScreen
