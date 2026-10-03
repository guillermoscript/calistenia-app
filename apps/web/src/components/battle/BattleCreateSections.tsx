/** Las tres vías de «Crear batalla»: formatos rápidos, día de programa y propia (#882). */
import { useTranslation } from 'react-i18next'
import { Check, Plus, X } from 'lucide-react'

import { BATTLE_PRESETS } from '@calistenia/core/data/battle-presets'
import { useLocalize } from '@calistenia/core/hooks/useLocalize'
import { BATTLE_LIMITS } from '@calistenia/core/lib/battle'
import type { BattleFromDayResult } from '@calistenia/core/lib/battle-from-program-day'
import type { useBattleProgramDay } from '../../hooks/useBattleProgramDay'
import { noteKey, noteParams, type CustomItem } from '../../lib/battle-create'
import { cn } from '../../lib/utils'
import { Kicker } from '../ui/kicker'
import { OriginChip, NumberField, RoundsStepper, BattleTitleField, SectionLabel } from './BattleCreateParts'

export function PresetSection({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  const l = useLocalize()
  return (
    <div className="mt-4 flex flex-col gap-2">
      {BATTLE_PRESETS.map(preset => {
        const active = preset.id === selected
        return (
          <button
            key={preset.id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(preset.id)}
            className={cn('rounded-xl border px-4 py-3.5 text-left transition-colors', active ? 'border-lime/40 bg-lime/5' : 'border-border bg-card hover:bg-muted/40')}
          >
            <span className="flex items-center justify-between">
              <span className={cn('font-bebas text-2xl leading-none', active && 'text-lime')}>{l(preset.name)}</span>
              <Kicker size="xs">~{preset.estimatedMinutes} min</Kicker>
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">{l(preset.description)}</span>
          </button>
        )
      })}
    </div>
  )
}

interface DaySectionProps {
  battleDay: ReturnType<typeof useBattleProgramDay>
  phase: number
  dayId: string | null
  onPickDay: (id: string) => void
  conversion: BattleFromDayResult | null
  targetEdits: Record<string, number>
  onEditTarget: (key: string, value: number) => void
  rounds: number | null
  onRounds: (n: number) => void
  title: string
  autoTitle: string
  onTitle: (v: string) => void
}

export function ProgramDaySection(p: DaySectionProps) {
  const { t } = useTranslation()
  if (!p.battleDay.activeProgram) return <p className="mt-4 text-sm text-muted-foreground">{t('battle.noProgram')}</p>
  const { conversion, dayId } = p
  return (
    <div>
      <SectionLabel>{t('battle.pickDay')}</SectionLabel>
      <ul className="border-t border-border">
        {p.battleDay.weekDays.map(d => {
          const result = p.battleDay.convert(d.id, { phase: p.phase })
          const playable = !!result?.ok
          const picked = d.id === dayId
          return (
            <li key={d.id}>
              <button
                type="button"
                disabled={!playable}
                aria-pressed={picked}
                onClick={() => p.onPickDay(d.id)}
                className={cn('flex min-h-12 w-full items-center gap-3 border-b border-border py-2 text-left', playable ? 'hover:bg-muted/40' : 'opacity-50')}
              >
                <span className={cn('w-9 font-mono text-[10px] uppercase tracking-[1px]', picked ? 'text-lime' : 'text-muted-foreground')}>
                  {t(`day.${d.id}`).slice(0, 3)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate text-sm', picked && 'font-medium')}>{p.battleDay.dayTitle(d.id, p.phase) || t(`day.${d.id}`)}</span>
                  {result && !result.ok ? <span className="block text-[11px] text-muted-foreground">{t(`battle.reason.${result.reason}`)}</span> : null}
                </span>
                {picked && playable ? <Check className="size-4 text-lime" aria-hidden /> : null}
              </button>
            </li>
          )
        })}
      </ul>

      {conversion?.ok && dayId ? (
        <>
          <SectionLabel>{t('battle.exercisesLabel')}</SectionLabel>
          <ul className="rounded-xl border border-border bg-card px-4">
            {conversion.config.exercises.map((ex, i) => {
              const meta = conversion.meta[i]
              const key = `${dayId}:${ex.exercise_id}`
              return (
                <li key={key} className={cn('flex items-center gap-3 py-2.5', i > 0 && 'border-t border-border')}>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">{meta.name}</div>
                    <Kicker size="xs" className="mt-1">
                      {meta.perSide ? `${t(`battle.perSide.${meta.perSide}`)} · ` : ''}{t('battle.restShort', { seconds: ex.rest_seconds })}
                    </Kicker>
                  </div>
                  <NumberField
                    value={p.targetEdits[key] ?? ex.target.value}
                    onChange={value => p.onEditTarget(key, value)}
                    label={meta.name}
                    className={meta.defaulted ? 'border-lime/60' : undefined}
                  />
                  <Kicker size="xs" as="span" className="w-9">{ex.target.kind === 'seconds' ? t('battle.secondsShort') : t('battle.repsShort')}</Kicker>
                </li>
              )
            })}
          </ul>
          <div className="mt-3"><RoundsStepper rounds={p.rounds ?? conversion.dayRounds} onChange={p.onRounds} /></div>
          <div className="mt-3 flex flex-col gap-1">
            {conversion.notes.map(note => {
              const k = noteKey(note)
              return k ? <p key={note.code} className="text-xs text-muted-foreground">{t(k, noteParams(note))}</p> : null
            })}
          </div>
          <BattleTitleField value={p.title} placeholder={p.autoTitle || t('battle.titlePlaceholder')} onChange={p.onTitle} />
        </>
      ) : null}
    </div>
  )
}

interface CustomSectionProps {
  items: CustomItem[]
  onPatch: (exerciseId: string, patch: Partial<CustomItem>) => void
  onRemove: (exerciseId: string) => void
  onOpenPicker: () => void
  rounds: number
  onRounds: (n: number) => void
  title: string
  onTitle: (v: string) => void
}

export function CustomSection(p: CustomSectionProps) {
  const { t } = useTranslation()
  const full = p.items.length >= BATTLE_LIMITS.maxExercises
  return (
    <div>
      <SectionLabel>{t('battle.exercisesLabel')}</SectionLabel>
      {p.items.length > 0 && (
        <ul className="rounded-xl border border-border bg-card px-4">
          {p.items.map((it, i) => (
            <li key={it.exerciseId} className={cn('flex flex-col gap-2 py-3', i > 0 && 'border-t border-border')}>
              <div className="flex items-center justify-between gap-3">
                <span className="flex-1 text-sm">{it.name}</span>
                <button type="button" onClick={() => p.onRemove(it.exerciseId)} aria-label={t('battle.removeExercise', { name: it.name })} className="flex size-9 items-center justify-center rounded-full hover:bg-muted/40">
                  <X className="size-4 text-muted-foreground" aria-hidden />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <OriginChip label={t('battle.targetReps')} active={it.kind === 'reps'} onClick={() => p.onPatch(it.exerciseId, { kind: 'reps', value: Math.min(it.value, BATTLE_LIMITS.maxReps) })} />
                <OriginChip label={t('battle.targetSeconds')} active={it.kind === 'seconds'} onClick={() => p.onPatch(it.exerciseId, { kind: 'seconds' })} />
                <NumberField value={it.value} onChange={value => p.onPatch(it.exerciseId, { value })} label={`${it.name} · ${it.kind === 'seconds' ? t('battle.targetSeconds') : t('battle.targetReps')}`} />
                <Kicker size="xs" as="span">{t('battle.restLabel')}</Kicker>
                <NumberField value={it.rest} onChange={rest => p.onPatch(it.exerciseId, { rest })} label={`${it.name} · ${t('battle.restLabel')}`} />
                <Kicker size="xs" as="span">{t('battle.secondsShort')}</Kicker>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        disabled={full}
        onClick={p.onOpenPicker}
        className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-lime/40 text-sm font-medium text-lime hover:bg-lime/5 disabled:opacity-40"
      >
        <Plus className="size-4" aria-hidden /> {t('battle.addExercise')}
      </button>
      <p className="mt-2 text-xs text-muted-foreground">
        {p.items.length === 0
          ? t('battle.customEmpty', { max: BATTLE_LIMITS.maxExercises })
          : t('battle.customCount', { n: p.items.length, max: BATTLE_LIMITS.maxExercises })}
      </p>
      <div className="mt-4"><RoundsStepper rounds={p.rounds} onChange={p.onRounds} /></div>
      <BattleTitleField value={p.title} placeholder={t('battle.titlePlaceholder')} onChange={p.onTitle} />
    </div>
  )
}
