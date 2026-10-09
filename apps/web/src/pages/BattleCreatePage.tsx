/**
 * Crear una batalla: elegir origen (día de programa, propia o formato rápido) → crear el
 * borrador → publicar → abrir la sala. Las tres vías acaban en la misma `BattleConfiguration`
 * (#882). Params de URL idénticos a móvil: `?origin=program_day&phase=N&day=ID`.
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Swords } from 'lucide-react'

import { BATTLE_PRESETS } from '@calistenia/core/data/battle-presets'
import { BATTLE_LIMITS, validateBattleConfiguration } from '@calistenia/core/lib/battle'
import { battleExerciseNamesFrom } from '@calistenia/core/lib/battle-exercise-names'
import { loadCatalogIndex } from '@calistenia/core/lib/catalogIndex'
import { dayIdFromDateStr } from '@calistenia/core/lib/programProgress'
import { todayStr } from '@calistenia/core/lib/dateUtils'
import { createBattleDraft, publishBattle, newIdempotencyKey } from '@calistenia/core/lib/battleApi'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '@calistenia/core/lib/analytics'
import type { EditorExercise } from '@calistenia/core/hooks/useProgramEditor'
import type { BattleConfiguration } from '@calistenia/core/types/battle'

import { useActiveBattle } from '@calistenia/core/hooks/useActiveBattle'
import { isBattleOngoing } from '@calistenia/core/lib/battle'
import { useBattleProgramDay } from '../hooks/useBattleProgramDay'
import {
  BATTLE_ORIGINS, addCustomItem, customBattleConfig, parseOrigin, parsePhase, type BattleOrigin, type CustomItem,
} from '../lib/battle-create'
import { Button } from '../components/ui/button'
import { Kicker } from '../components/ui/kicker'
import ExerciseCatalogPicker from '../components/ExerciseCatalogPicker'
import { OriginChip, SectionLabel } from '../components/battle/BattleCreateParts'
import { CustomSection, PresetSection, ProgramDaySection } from '../components/battle/BattleCreateSections'
import { qk } from '@calistenia/core/lib/query-keys'

export default function BattleCreatePage({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params] = useSearchParams()
  const battleDay = useBattleProgramDay()
  const { data: active } = useActiveBattle()

  const [origin, setOrigin] = useState<BattleOrigin>(parseOrigin(params.get('origin')))
  const [selected, setSelected] = useState(BATTLE_PRESETS[0].id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Día de programa. `phase` solo viene de un enlace desde Entrenar; sin él, la fase actual.
  const phase = parsePhase(params.get('phase')) ?? battleDay.currentPhase
  const [pickedDay, setPickedDay] = useState<string | null>(params.get('day'))
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

  // Los nombres que se congelan en `exercise_names` (#882) se resuelven al CREAR, con el catálogo cargado.
  const nameSources = useMemo(() => {
    if (origin === 'program_day') return conversion?.ok ? conversion.meta.map(m => ({ exerciseId: m.exerciseId, displayName: m.name })) : []
    if (origin === 'custom') return items.map(it => ({ exerciseId: it.exerciseId, displayName: it.name }))
    return []
  }, [origin, conversion, items])

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
      }
    }
    return customBattleConfig(items, customRounds, customTitle)
  }, [origin, selected, conversion, dayId, dayTitle, autoTitle, targetEdits, items, customRounds, customTitle])

  const handleCreate = async () => {
    if (!config || !userId) return
    let toSend = config
    if (nameSources.length > 0) {
      const index = await loadCatalogIndex().catch(() => null)
      toSend = { ...config, exercise_names: battleExerciseNamesFrom(nameSources, i18n.language, index) }
    }
    // Los mismos límites que aplica el servidor: aquí se explican, allí se rechazan.
    const problems = validateBattleConfiguration(toSend)
    if (problems.length > 0) {
      setError(`${t('battle.invalidConfig')} ${problems.join(' · ')}`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const battleId = await createBattleDraft(userId, toSend)
      // Publicar en el mismo gesto: un borrador sin sala no le sirve a nadie.
      await publishBattle(battleId, newIdempotencyKey())
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.battleCreated, {
        surface: 'battle', source: 'battle_create', battle_id: battleId,
        participant_count: 1, result: 'created', template: toSend.workout_template_id,
        battle_source: toSend.source ?? 'preset', exercise_count: toSend.exercises.length,
      })
      void queryClient.invalidateQueries({ queryKey: qk.battles.all })
      navigate(`/battle/${battleId}`, { replace: true })
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const onPickerAdd = (ex: EditorExercise) => setItems(prev => addCustomItem(prev, ex))

  return (
    <div className="mx-auto max-w-xl px-4 py-6 pb-12 md:px-6 md:py-8">
      <header className="flex flex-col items-center pb-6 text-center">
        <Swords className="size-7 text-lime" aria-hidden />
        <Kicker className="mt-2">{t('battle.kicker')}</Kicker>
        <h1 className="font-bebas text-4xl md:text-5xl leading-none">{t('battle.newBattle')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('battle.createHint')}</p>
      </header>

      {isBattleOngoing(active) && (
        <Link to={`/battle/${active.id}`} className="mb-6 block rounded-xl border border-lime/40 bg-lime/5 px-4 py-3.5 hover:bg-lime/10">
          <Kicker tone="lime">{t('battle.resumeKicker')}</Kicker>
          <span className="mt-1 block font-bebas text-2xl leading-none">{t('battle.resumeAction')}</span>
        </Link>
      )}

      <SectionLabel>{t('battle.chooseOrigin')}</SectionLabel>
      <div className="flex flex-wrap gap-2">
        {BATTLE_ORIGINS.map(o => (
          <OriginChip key={o} label={t(`battle.origin.${o}`)} active={origin === o} onClick={() => { setOrigin(o); setError(null) }} />
        ))}
      </div>

      {origin === 'preset' && <PresetSection selected={selected} onSelect={setSelected} />}
      {origin === 'program_day' && (
        <ProgramDaySection
          battleDay={battleDay} phase={phase} dayId={dayId} conversion={conversion}
          onPickDay={id => { setPickedDay(id); setDayRounds(null); setError(null) }}
          targetEdits={targetEdits} onEditTarget={(k, v) => setTargetEdits(prev => ({ ...prev, [k]: v }))}
          rounds={dayRounds} onRounds={setDayRounds}
          title={dayTitle} autoTitle={autoTitle} onTitle={setDayTitle}
        />
      )}
      {origin === 'custom' && (
        <CustomSection
          items={items}
          onPatch={(id, patch) => setItems(prev => prev.map(p => (p.exerciseId === id ? { ...p, ...patch } : p)))}
          onRemove={id => setItems(prev => prev.filter(p => p.exerciseId !== id))}
          onOpenPicker={() => setPickerOpen(true)}
          rounds={customRounds} onRounds={setCustomRounds} title={customTitle} onTitle={setCustomTitle}
        />
      )}

      {error && <div role="alert" className="mt-4 rounded-xl border border-red-400/40 bg-red-400/10 px-4 py-3 text-xs text-red-400">{error}</div>}

      <Button className="mt-6 h-14 w-full font-bebas text-xl tracking-widest uppercase" disabled={busy || !userId || !config} onClick={() => void handleCreate()}>
        {t('battle.createAndInvite')}
      </Button>
      <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground">{t('battle.needTwoReady')}</p>

      {pickerOpen && <ExerciseCatalogPicker onAdd={onPickerAdd} onClose={() => setPickerOpen(false)} />}
    </div>
  )
}
