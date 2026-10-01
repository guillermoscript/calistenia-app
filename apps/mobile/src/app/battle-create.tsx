/**
 * Crear una batalla: elegir origen (día de programa, propia o formato rápido) → crear el
 * borrador → abrir la sala. Las tres vías acaban en la misma `BattleConfiguration` (#882).
 *
 * El borrador es la ÚNICA escritura que el cliente hace directamente sobre `battles`
 * (la createRule lo fija a `draft` con `revision = 0`); publicar y todo lo demás pasa
 * por la API del servidor.
 */
import { useEffect, useMemo, useState } from 'react'
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useLocalize } from '@calistenia/core/hooks/useLocalize'
import { X, Swords, Plus, Check } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Kicker } from '@/components/ui/kicker'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { Chip } from '@/components/ui/chip'
import { useAuthUser } from '@/lib/use-auth-user'
import { useBattleProgramDay } from '@/lib/use-battle-program-day'
import { ExercisePickerSheet } from '@/components/program-editor/ExercisePickerSheet'
import {
  BattleTitleField,
  NumberField,
  RoundsStepper,
  SectionLabel,
} from '@/components/battle/BattleCreateParts'
import { BATTLE_PRESETS, BATTLE_CUSTOM_TEMPLATE_ID } from '@calistenia/core/data/battle-presets'
import { BATTLE_LIMITS, validateBattleConfiguration } from '@calistenia/core/lib/battle'
import { battleExerciseNamesFrom } from '@calistenia/core/lib/battle-exercise-names'
import { parseRestSeconds, type BattleDayNote } from '@calistenia/core/lib/battle-from-program-day'
import { getOrLoadCatalogIndex } from '@calistenia/core/lib/catalogIndex'
import { dayIdFromDateStr } from '@calistenia/core/lib/programProgress'
import { todayStr } from '@calistenia/core/lib/dateUtils'
import type { EditorExercise } from '@calistenia/core/hooks/useProgramEditor'
import {
  createBattleDraft,
  findMyActiveBattle,
  publishBattle,
  newIdempotencyKey,
} from '@calistenia/core/lib/battleApi'
import type { Battle, BattleConfiguration, BattleSource } from '@calistenia/core/types/battle'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '@calistenia/core/lib/analytics'

/** Lo que una batalla propia lleva por ejercicio mientras se edita. */
interface CustomItem {
  exerciseId: string
  name: string
  kind: 'reps' | 'seconds'
  value: number
  rest: number
}

const CUSTOM_DEFAULT_REST = 30
const CUSTOM_MAX_REST = 120

function customItemFrom(ex: EditorExercise): CustomItem {
  const isTimer = !!ex.isTimer
  const reps = parseInt(ex.reps, 10)
  return {
    exerciseId: ex.exerciseId,
    name: ex.name,
    kind: isTimer ? 'seconds' : 'reps',
    value: isTimer
      ? Math.min(ex.timerSeconds > 0 ? Math.round(ex.timerSeconds) : 30, BATTLE_LIMITS.maxSeconds)
      : Math.min(reps > 0 ? reps : 10, BATTLE_LIMITS.maxReps),
    rest: Math.min(parseRestSeconds(ex.rest) || CUSTOM_DEFAULT_REST, CUSTOM_MAX_REST),
  }
}

type Origin = 'program_day' | 'custom' | 'preset'
const ORIGINS: Origin[] = ['program_day', 'custom', 'preset']

const noteKey = (note: BattleDayNote): string | null => {
  switch (note.code) {
    case 'rounds_flattened': return 'battle.note.roundsFlattened'
    case 'non_numeric_sets': return 'battle.note.nonNumericSets'
    case 'truncated': return 'battle.note.truncated'
    case 'duplicates_removed': return 'battle.note.duplicatesRemoved'
    case 'rest_capped': return 'battle.note.restCapped'
    case 'targets_capped': return 'battle.note.targetsCapped'
    case 'targets_defaulted': return 'battle.note.targetsDefaulted'
    // Lo ha elegido el propio creador: no hace falta avisarle.
    case 'rounds_overridden': return null
  }
}

const noteParams = (note: BattleDayNote): Record<string, unknown> => {
  switch (note.code) {
    case 'rounds_flattened': return { min: note.min, max: note.max }
    case 'truncated': return { dropped: note.dropped, max: note.max }
    default: return {}
  }
}

export default function BattleCreateScreen() {
  const { t, i18n } = useTranslation()
  const l = useLocalize()
  const router = useRouter()
  const user = useAuthUser()
  const params = useLocalSearchParams<{ origin?: string; phase?: string; day?: string }>()
  const battleDay = useBattleProgramDay()

  const [origin, setOrigin] = useState<Origin>(
    (ORIGINS as string[]).includes(params.origin ?? '') ? (params.origin as Origin) : 'preset',
  )
  const [selected, setSelected] = useState(BATTLE_PRESETS[0].id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Día de programa. `phase` solo viene de un enlace desde Hoy/Entrenar; sin él, la fase actual.
  const phase = Number(params.phase) > 0 ? Number(params.phase) : battleDay.currentPhase
  const [pickedDay, setPickedDay] = useState<string | null>(params.day ?? null)
  const [dayRounds, setDayRounds] = useState<number | null>(null)
  const [dayTitle, setDayTitle] = useState('')
  const [targetEdits, setTargetEdits] = useState<Record<string, number>>({})

  // Propia.
  const [items, setItems] = useState<CustomItem[]>([])
  const [customRounds, setCustomRounds] = useState(3)
  const [customTitle, setCustomTitle] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)

  // Hoy si se puede jugar; si no, el primer día convertible.
  const todayId = dayIdFromDateStr(todayStr())
  const defaultDay = useMemo(() => {
    if (todayId && battleDay.convert(todayId, { phase })?.ok) return todayId
    return battleDay.weekDays.find(d => battleDay.convert(d.id, { phase })?.ok)?.id ?? null
  }, [battleDay, todayId, phase])
  const dayId = pickedDay ?? defaultDay

  const conversion = useMemo(
    () => (dayId ? battleDay.convert(dayId, { phase, rounds: dayRounds ?? undefined }) : null),
    [battleDay, dayId, phase, dayRounds],
  )
  const autoTitle = (dayId ? battleDay.dayTitle(dayId, phase) : '').slice(0, BATTLE_LIMITS.maxTitleLength)
  const lang = i18n.language

  // La configuración que se enviaría, ya con origen, título y nombres congelados.
  const config = useMemo((): BattleConfiguration | null => {
    if (origin === 'preset') {
      const preset = BATTLE_PRESETS.find(p => p.id === selected)
      return preset ? { ...preset.config, source: 'preset' } : null
    }
    if (origin === 'program_day') {
      if (!conversion?.ok || !dayId) return null
      const title = (dayTitle.trim() || autoTitle).slice(0, BATTLE_LIMITS.maxTitleLength)
      return {
        ...conversion.config,
        ...(title ? { title } : {}),
        exercises: conversion.config.exercises.map(ex => ({
          ...ex,
          target: { kind: ex.target.kind, value: targetEdits[`${dayId}:${ex.exercise_id}`] ?? ex.target.value },
        })),
        exercise_names: battleExerciseNamesFrom(
          conversion.meta.map(m => ({ exerciseId: m.exerciseId, displayName: m.name })),
          lang,
          getOrLoadCatalogIndex(),
        ),
      }
    }
    if (items.length === 0) return null
    const title = customTitle.trim()
    return {
      workout_template_id: BATTLE_CUSTOM_TEMPLATE_ID,
      source: 'custom',
      rounds: customRounds,
      scoring_mode: 'rounds_then_reps_then_time',
      ...(title ? { title } : {}),
      exercises: items.map((it, position) => ({
        exercise_id: it.exerciseId,
        position,
        target: { kind: it.kind, value: it.value },
        rest_seconds: it.rest,
      })),
      exercise_names: battleExerciseNamesFrom(
        items.map(it => ({ exerciseId: it.exerciseId, displayName: it.name })),
        lang,
        getOrLoadCatalogIndex(),
      ),
    }
  }, [origin, selected, conversion, dayId, dayTitle, autoTitle, targetEdits, items, customRounds, customTitle, lang])

  const chooseOrigin = (next: Origin) => {
    setOrigin(next)
    setError(null)
  }
  const chooseDay = (id: string) => {
    haptics.selection()
    setPickedDay(id)
    setDayRounds(null)
    setError(null)
  }
  const addCustom = (ex: EditorExercise) => {
    setItems(prev => {
      if (prev.length >= BATTLE_LIMITS.maxExercises || prev.some(p => p.exerciseId === ex.exerciseId)) return prev
      return [...prev, customItemFrom(ex)]
    })
  }
  const patchItem = (exerciseId: string, patch: Partial<CustomItem>) =>
    setItems(prev => prev.map(p => (p.exerciseId === exerciseId ? { ...p, ...patch } : p)))

  // Una batalla en curso sobrevive a que se mate la app —el estado vive en el servidor—
  // pero sin esto no habría forma de volver a ella: esta pantalla era el único acceso y
  // solo sabía crear una nueva.
  const [active, setActive] = useState<Battle | null>(null)
  useEffect(() => {
    let alive = true
    findMyActiveBattle()
      .then(battle => { if (alive) setActive(battle) })
      .catch(err => {
        // Sin conexión esto falla y la pantalla sigue sirviendo para crear. Pero no se
        // calla del todo: un fallo de la consulta es indistinguible de "no hay batalla"
        // y así es como una query mal formada se quedó sin tarjeta y sin rastro.
        if (__DEV__) console.warn('[battle] no se pudo buscar la batalla activa:', err)
      })
    return () => { alive = false }
  }, [])

  const handleCreate = async () => {
    if (!config || !user?.id) return
    // Los mismos límites que aplica el servidor: aquí se explican, allí se rechazan.
    const problems = validateBattleConfiguration(config)
    if (problems.length > 0) {
      setError(`${t('battle.invalidConfig')} ${problems.join(' · ')}`)
      void haptics.error()
      return
    }

    setBusy(true)
    setError(null)
    try {
      const battleId = await createBattleDraft(user.id, config)
      // Publicar en el mismo gesto: un borrador sin sala no le sirve a nadie, y así el
      // creador ya tiene su plaza y puede compartir el enlace de inmediato.
      await publishBattle(battleId, newIdempotencyKey())
      const source: BattleSource = config.source ?? 'preset'
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.battleCreated, {
        surface: 'battle', source, battle_id: battleId,
        participant_count: 1, result: 'created', template: config.workout_template_id,
        exercise_count: config.exercises.length,
      })
      void haptics.success()
      router.replace(`/battle/${battleId}`)
    } catch (e) {
      setError((e as Error).message)
      void haptics.error()
      setBusy(false)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <ScrollView contentContainerClassName="px-4 pb-10">
        <View className="flex-row justify-end pt-2">
          <Pressable
            onPress={() => router.back()}
            className="rounded-full bg-muted/60 p-2 active:opacity-70"
            accessibilityLabel={t('common.back')}
          >
            <X size={18} color="#888899" />
          </Pressable>
        </View>

        <View className="items-center pb-6 pt-2">
          <Swords size={28} color="#a3e635" />
          <Text className="mt-2 font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
            {t('battle.kicker')}
          </Text>
          <Text className="font-bebas text-4xl leading-none text-foreground">{t('battle.newBattle')}</Text>
          <Text className="mt-2 text-center text-sm text-muted-foreground">{t('battle.createHint')}</Text>
        </View>

        {active && (
          <Pressable
            onPress={() => router.replace(`/battle/${active.id}`)}
            className="mb-6 rounded-xl border border-lime/40 bg-lime/5 px-4 py-3.5 active:bg-lime/10"
          >
            <Kicker tone="lime">
              {t('battle.resumeKicker')}
            </Kicker>
            <Text className="mt-1 font-bebas text-2xl leading-none text-foreground">
              {t('battle.resumeAction')}
            </Text>
          </Pressable>
        )}

        <Text className="mb-2 font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
          {t('battle.chooseOrigin')}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {ORIGINS.map(o => (
            <Chip key={o} label={t(`battle.origin.${o}`)} active={origin === o} onPress={() => chooseOrigin(o)} />
          ))}
        </View>

        {origin === 'preset' && (
          <View className="mt-4 gap-2">
            {BATTLE_PRESETS.map((preset) => {
              const active = preset.id === selected
              return (
                <Pressable
                  key={preset.id}
                  onPress={() => setSelected(preset.id)}
                  className={cn(
                    'rounded-xl border px-4 py-3.5',
                    active ? 'border-lime/40 bg-lime/5' : 'border-border bg-card active:bg-muted/40',
                  )}
                >
                  <View className="flex-row items-center justify-between">
                    <Text className={cn('font-bebas text-2xl leading-none', active ? 'text-lime' : 'text-foreground')}>
                      {l(preset.name)}
                    </Text>
                    <Text className="font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground">
                      ~{preset.estimatedMinutes} min
                    </Text>
                  </View>
                  <Text className="mt-1 text-xs text-muted-foreground">{l(preset.description)}</Text>
                </Pressable>
              )
            })}
          </View>
        )}

        {origin === 'program_day' && (
          <View>
            {!battleDay.activeProgram ? (
              <Text className="mt-4 text-sm text-muted-foreground">{t('battle.noProgram')}</Text>
            ) : (
              <>
                <SectionLabel>{t('battle.pickDay')}</SectionLabel>
                <View className="border-t border-border">
                  {battleDay.weekDays.map(d => {
                    const result = battleDay.convert(d.id, { phase })
                    const playable = !!result?.ok
                    const picked = d.id === dayId
                    return (
                      <Pressable
                        key={d.id}
                        onPress={() => chooseDay(d.id)}
                        disabled={!playable}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: !playable, selected: picked }}
                        className={cn(
                          'min-h-12 flex-row items-center gap-3 border-b border-border py-2',
                          playable && 'active:bg-muted/40',
                          !playable && 'opacity-50',
                        )}
                      >
                        <Text className={cn('w-8 font-mono text-[10px] uppercase tracking-[1px]', picked ? 'text-lime' : 'text-muted-foreground')}>
                          {t(`day.${d.id}`).slice(0, 3)}
                        </Text>
                        <View className="flex-1">
                          <Text className={cn('text-sm', picked ? 'font-sans-medium text-foreground' : 'text-foreground')} numberOfLines={1}>
                            {battleDay.dayTitle(d.id, phase) || t(`day.${d.id}`)}
                          </Text>
                          {result && !result.ok ? (
                            <Text className="text-[11px] text-muted-foreground">{t(`battle.reason.${result.reason}`)}</Text>
                          ) : null}
                        </View>
                        {picked && playable ? <Check size={16} color="#a3e635" strokeWidth={2.5} /> : null}
                      </Pressable>
                    )
                  })}
                </View>

                {conversion?.ok && dayId ? (
                  <>
                    <SectionLabel>{t('battle.exercisesLabel')}</SectionLabel>
                    <View className="rounded-xl border border-border bg-card px-4">
                      {conversion.config.exercises.map((ex, i) => {
                        const meta = conversion.meta[i]
                        const key = `${dayId}:${ex.exercise_id}`
                        return (
                          <View
                            key={key}
                            className={cn('flex-row items-center gap-3 py-2.5', i > 0 && 'border-t border-border')}
                          >
                            <View className="flex-1">
                              <Text className="text-sm text-foreground" numberOfLines={2}>{meta.name}</Text>
                              <Text className="mt-0.5 font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground">
                                {meta.perSide ? `${t(`battle.perSide.${meta.perSide}`)} · ` : ''}
                                {t('battle.restShort', { seconds: ex.rest_seconds })}
                              </Text>
                            </View>
                            <NumberField
                              value={targetEdits[key] ?? ex.target.value}
                              onChange={value => setTargetEdits(prev => ({ ...prev, [key]: value }))}
                              accessibilityLabel={meta.name}
                              className={meta.defaulted ? 'border-lime/60' : undefined}
                            />
                            <Text className="w-9 font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground">
                              {ex.target.kind === 'seconds' ? t('battle.secondsShort') : t('battle.repsShort')}
                            </Text>
                          </View>
                        )
                      })}
                    </View>

                    <View className="mt-3">
                      <RoundsStepper rounds={dayRounds ?? conversion.dayRounds} onChange={setDayRounds} />
                    </View>

                    {conversion.notes.map(noteKey).some(Boolean) ? (
                      <View className="mt-3 gap-1">
                        {conversion.notes.map(note => {
                          const key = noteKey(note)
                          if (!key) return null
                          return (
                            <Text key={note.code} className="text-xs text-muted-foreground">
                              {t(key, noteParams(note))}
                            </Text>
                          )
                        })}
                      </View>
                    ) : null}

                    <BattleTitleField value={dayTitle} placeholder={autoTitle || t('battle.titlePlaceholder')} onChange={setDayTitle} />
                  </>
                ) : null}
              </>
            )}
          </View>
        )}

        {origin === 'custom' && (
          <View>
            <SectionLabel>{t('battle.exercisesLabel')}</SectionLabel>
            {items.length > 0 && (
              <View className="rounded-xl border border-border bg-card px-4">
                {items.map((it, i) => (
                  <View key={it.exerciseId} className={cn('gap-2 py-3', i > 0 && 'border-t border-border')}>
                    <View className="flex-row items-center justify-between gap-3">
                      <Text className="flex-1 text-sm text-foreground" numberOfLines={2}>{it.name}</Text>
                      <Pressable
                        onPress={() => setItems(prev => prev.filter(p => p.exerciseId !== it.exerciseId))}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={t('battle.removeExercise', { name: it.name })}
                        className="h-8 w-8 items-center justify-center rounded-full active:bg-muted/40"
                      >
                        <X size={15} color="#888899" />
                      </Pressable>
                    </View>
                    <View className="flex-row flex-wrap items-center gap-2">
                      <Chip
                        label={t('battle.targetReps')}
                        active={it.kind === 'reps'}
                        onPress={() => patchItem(it.exerciseId, { kind: 'reps', value: Math.min(it.value, BATTLE_LIMITS.maxReps) })}
                      />
                      <Chip
                        label={t('battle.targetSeconds')}
                        active={it.kind === 'seconds'}
                        onPress={() => patchItem(it.exerciseId, { kind: 'seconds' })}
                      />
                      <NumberField
                        value={it.value}
                        onChange={value => patchItem(it.exerciseId, { value })}
                        accessibilityLabel={`${it.name} · ${it.kind === 'seconds' ? t('battle.targetSeconds') : t('battle.targetReps')}`}
                      />
                      <Text className="font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground">
                        {t('battle.restLabel')}
                      </Text>
                      <NumberField
                        value={it.rest}
                        onChange={rest => patchItem(it.exerciseId, { rest })}
                        accessibilityLabel={`${it.name} · ${t('battle.restLabel')}`}
                      />
                      <Text className="font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground">
                        {t('battle.secondsShort')}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
            <Pressable
              onPress={() => setPickerOpen(true)}
              disabled={items.length >= BATTLE_LIMITS.maxExercises}
              accessibilityRole="button"
              className={cn(
                'mt-2 h-12 flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-lime/40 active:bg-lime/5',
                items.length >= BATTLE_LIMITS.maxExercises && 'opacity-40',
              )}
            >
              <Plus size={16} color="#a3e635" />
              <Text className="font-sans-medium text-sm text-lime">{t('battle.addExercise')}</Text>
            </Pressable>
            <Text className="mt-2 text-xs text-muted-foreground">
              {items.length === 0
                ? t('battle.customEmpty', { max: BATTLE_LIMITS.maxExercises })
                : t('battle.customCount', { count: items.length, max: BATTLE_LIMITS.maxExercises })}
            </Text>

            <View className="mt-4">
              <RoundsStepper rounds={customRounds} onChange={setCustomRounds} />
            </View>
            <BattleTitleField value={customTitle} placeholder={t('battle.titlePlaceholder')} onChange={setCustomTitle} />
          </View>
        )}

        {error && (
          <View className="mt-4 rounded-xl border border-red-400/40 bg-red-400/10 px-4 py-3">
            <Text className="text-xs text-red-400">{error}</Text>
          </View>
        )}

        <Pressable
          onPress={() => void handleCreate()}
          disabled={busy || !user?.id || !config}
          className={cn(
            'mt-6 h-14 items-center justify-center rounded-xl bg-lime active:bg-lime/90',
            (busy || !user?.id || !config) && 'opacity-50',
          )}
        >
          {busy
            ? <ActivityIndicator color="#18181b" />
            : (
              <Text className="font-bebas text-xl uppercase tracking-widest text-zinc-900">
                {t('battle.createAndInvite')}
              </Text>
            )}
        </Pressable>

        <Text className="mt-3 text-center font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground">
          {t('battle.needTwoReady')}
        </Text>
      </ScrollView>
      <ExercisePickerSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} onAdd={addCustom} />
    </SafeAreaView>
  )
}
