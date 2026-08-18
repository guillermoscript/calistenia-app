/**
 * Paso 4 del editor de programas web (#223/#478): ejercicios por día,
 * agrupados en secciones warmup/main/cooldown.
 * Extraído de ProgramEditorPage.tsx:591-885, sin cambios de markup;
 * la IIFE de agrupación se convierte en tres `filter` (como en mobile).
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import { CARDIO_ACTIVITY } from '@calistenia/core/lib/style-tokens'
import type { EditorDay, EditorExercise, EditorPhase } from '@calistenia/core/hooks/useProgramEditor'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { Card, CardContent } from '../ui/card'
import { Badge } from '../ui/badge'
import { DAY_IDS, PRIORITY_OPTIONS } from './constants'

interface StepExercisesProps {
  phases: EditorPhase[]
  days: Record<string, EditorDay>
  selectedPhaseTab: number
  onSelectPhaseTab: (index: number) => void
  selectedDayId: string
  onSelectDayId: (dayId: string) => void
  addExercise: (dayKey: string, exercise: EditorExercise) => void
  updateExercise: (dayKey: string, index: number, data: Partial<EditorExercise>) => void
  removeExercise: (dayKey: string, index: number) => void
  moveExercise: (dayKey: string, index: number, direction: 'up' | 'down') => void
  onOpenCatalog: (section: 'warmup' | 'main' | 'cooldown') => void
}

export function StepExercises({
  phases, days, selectedPhaseTab, onSelectPhaseTab, selectedDayId, onSelectDayId,
  addExercise, updateExercise, removeExercise, moveExercise, onOpenCatalog,
}: StepExercisesProps) {
  const { t } = useTranslation()
  const [expandedExercise, setExpandedExercise] = useState<number | null>(null)

  const currentDayKey = `${selectedPhaseTab}_${selectedDayId}`
  const currentDay = days[currentDayKey]

  const handleAddCustom = (section: 'warmup' | 'main' | 'cooldown' = 'main') => {
    const newEx: EditorExercise = {
      exerciseId: `custom_${Date.now()}`,
      name: '',
      sets: 3,
      reps: '10',
      rest: 60,
      muscles: '',
      note: '',
      youtube: '',
      priority: 'med',
      isTimer: false,
      timerSeconds: 0,
      section,
    }
    addExercise(currentDayKey, newEx)
    setExpandedExercise(currentDay ? currentDay.exercises.length : 0)
  }

  const allExercises = currentDay?.exercises || []
  const sections: { key: 'warmup' | 'main' | 'cooldown'; label: string; color: string; exercises: { ex: EditorExercise; globalIndex: number }[] }[] = [
    { key: 'warmup', label: t('warmupCooldown.sections.warmup'), color: 'text-amber-400', exercises: [] },
    { key: 'main', label: t('warmupCooldown.sections.main'), color: 'text-foreground', exercises: [] },
    { key: 'cooldown', label: t('warmupCooldown.sections.cooldown'), color: 'text-sky-400', exercises: [] },
  ]
  allExercises.forEach((ex, i) => {
    const sec = ex.section === 'warmup' ? 0 : ex.section === 'cooldown' ? 2 : 1
    sections[sec].exercises.push({ ex, globalIndex: i })
  })

  return (
    <div className="space-y-4">
      <div className="font-bebas text-2xl tracking-wide mb-2">EJERCICIOS</div>

      {/* Phase tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {phases.map((phase, pi) => (
          <Button
            key={pi}
            variant={selectedPhaseTab === pi ? 'default' : 'outline'}
            size="sm"
            onClick={() => onSelectPhaseTab(pi)}
            className={cn(
              'h-7 text-[10px] tracking-wide',
              selectedPhaseTab === pi && 'text-black'
            )}
            style={selectedPhaseTab === pi ? { backgroundColor: phase.color } : undefined}
          >
            F{pi + 1}
          </Button>
        ))}
      </div>

      {/* Day selector */}
      <div className="flex gap-1 flex-wrap">
        {DAY_IDS.map(dayId => {
          const dayKey = `${selectedPhaseTab}_${dayId}`
          const day = days[dayKey]
          const isActive = selectedDayId === dayId
          const exerciseCount = day?.exercises?.length || 0

          return (
            <Button
              key={dayId}
              variant={isActive ? 'limeSolid' : 'outline'}
              size="sm"
              onClick={() => onSelectDayId(dayId)}
              className="h-8 px-2.5 text-[10px] tracking-wide"
            >
              {dayId.toUpperCase()}
              {exerciseCount > 0 && (
                <span className={cn('ml-1 text-[9px]', isActive ? 'text-black/60' : 'text-muted-foreground')}>
                  ({exerciseCount})
                </span>
              )}
            </Button>
          )
        })}
      </div>

      {/* Day info */}
      {currentDay && (
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{currentDay.dayName}</span>
          {' · '}{currentDay.focus}
          {' · '}<Badge variant="outline" className="text-[9px]">{currentDay.type.toUpperCase()}</Badge>
        </div>
      )}

      {/* Cardio day summary */}
      {currentDay?.type === 'cardio' && (
        <Card className="border-emerald-400/30 bg-emerald-400/5">
          <CardContent className="p-5 text-center">
            <div className="text-3xl mb-2">{CARDIO_ACTIVITY[(currentDay as any).cardioActivityType || 'running']?.icon || '🏃'}</div>
            <div className="font-bebas text-xl text-emerald-400 tracking-wide mb-1">{t('programEditor.cardioDay')}</div>
            <div className="text-sm text-muted-foreground mb-3">
              {t(`cardio.${(currentDay as any).cardioActivityType || 'running'}`)}
            </div>
            <div className="flex justify-center gap-4 text-[11px]">
              {(currentDay as any).cardioTargetDistanceKm && (
                <div className="text-emerald-400">
                  <span className="font-bold">{(currentDay as any).cardioTargetDistanceKm}</span> km
                </div>
              )}
              {(currentDay as any).cardioTargetDurationMin && (
                <div className="text-emerald-400">
                  <span className="font-bold">{(currentDay as any).cardioTargetDurationMin}</span> min
                </div>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground mt-3">
              {t('programEditor.cardioConfigHint')}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Exercise list — grouped by section */}
      {currentDay?.type !== 'cardio' && sections.map(section => (
        <div key={section.key} className="space-y-2">
          <div className={cn('font-mono text-[10px] tracking-[2px] uppercase', section.color)}>
            {section.label}
          </div>

          {section.exercises.map(({ ex, globalIndex: ei }) => {
            const isExpanded = expandedExercise === ei
            return (
              <Card key={ei} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => moveExercise(currentDayKey, ei, 'up')}
                        disabled={ei === 0}
                        aria-label={t('programEditor.moveUp', { name: ex.name || t('programEditor.exercise') })}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-20 text-[10px]"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => moveExercise(currentDayKey, ei, 'down')}
                        disabled={ei === allExercises.length - 1}
                        aria-label={t('programEditor.moveDown', { name: ex.name || t('programEditor.exercise') })}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-20 text-[10px]"
                      >
                        ▼
                      </button>
                    </div>

                    <div className="flex-1 min-w-0">
                      <Input
                        value={ex.name}
                        onChange={e => updateExercise(currentDayKey, ei, { name: e.target.value })}
                        placeholder={t('programEditor.exerciseName')}
                        className="text-sm h-7 border-none bg-transparent px-1 focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Input
                        value={ex.sets}
                        onChange={e => {
                          const v = e.target.value
                          const n = parseInt(v)
                          updateExercise(currentDayKey, ei, { sets: isNaN(n) ? v : n })
                        }}
                        className="w-10 h-7 text-[11px] text-center px-1"
                        placeholder="S"
                      />
                      <span className="text-muted-foreground text-[10px]">x</span>
                      <Input
                        value={ex.reps}
                        onChange={e => updateExercise(currentDayKey, ei, { reps: e.target.value })}
                        className="w-16 h-7 text-[11px] text-center px-1"
                        placeholder="Reps"
                      />
                      <span className="text-muted-foreground text-[10px]">.</span>
                      <Input
                        value={ex.rest}
                        onChange={e => updateExercise(currentDayKey, ei, { rest: parseInt(e.target.value) || 0 })}
                        className="w-12 h-7 text-[11px] text-center px-1"
                        placeholder="Rest"
                      />
                      <span className="text-muted-foreground text-[9px]">s</span>
                    </div>

                    <select
                      value={ex.priority}
                      onChange={e => updateExercise(currentDayKey, ei, { priority: e.target.value as 'high' | 'med' | 'low' })}
                      className="h-7 rounded border border-input bg-background px-1 text-[10px]"
                    >
                      {PRIORITY_OPTIONS.map(p => (
                        <option key={p.value} value={p.value}>{t(p.i18nKey)}</option>
                      ))}
                    </select>

                    <button
                      onClick={() => setExpandedExercise(isExpanded ? null : ei)}
                      className="text-muted-foreground hover:text-foreground text-xs px-1"
                    >
                      {isExpanded ? '▾' : '▸'}
                    </button>
                    <button
                      onClick={() => removeExercise(currentDayKey, ei)}
                      aria-label={t('programEditor.removeExercise', { name: ex.name || t('programEditor.exercise') })}
                      className="text-muted-foreground hover:text-red-400 text-xs px-1"
                    >
                      ✕
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="px-3 pb-3 pt-1 border-t border-border space-y-2.5 bg-muted/30">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="text-[9px] text-muted-foreground tracking-widest uppercase block mb-1">{t('programEditor.muscles')}</label>
                          <Input
                            value={ex.muscles}
                            onChange={e => updateExercise(currentDayKey, ei, { muscles: e.target.value })}
                            placeholder={t('programEditor.musclesPlaceholder')}
                            className="text-sm h-8"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] text-muted-foreground tracking-widest uppercase block mb-1">YouTube</label>
                          <Input
                            value={ex.youtube}
                            onChange={e => updateExercise(currentDayKey, ei, { youtube: e.target.value })}
                            placeholder={t('programEditor.youtubePlaceholder')}
                            className="text-sm h-8"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[9px] text-muted-foreground tracking-widest uppercase block mb-1">{t('programEditor.note')}</label>
                        <Textarea
                          value={ex.note}
                          onChange={e => updateExercise(currentDayKey, ei, { note: e.target.value })}
                          placeholder={t('programEditor.notePlaceholder')}
                          rows={2}
                          className="text-sm"
                        />
                      </div>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={ex.isTimer}
                            onChange={e => updateExercise(currentDayKey, ei, { isTimer: e.target.checked })}
                            className="rounded"
                          />
                          <span className="text-[11px] text-muted-foreground">{t('programEditor.isTimer')}</span>
                        </label>
                        {ex.isTimer && (
                          <div className="flex items-center gap-1.5">
                            <label className="text-[9px] text-muted-foreground">{t('programEditor.timerSeconds')}:</label>
                            <Input
                              type="number"
                              min={1}
                              value={ex.timerSeconds}
                              onChange={e => updateExercise(currentDayKey, ei, { timerSeconds: parseInt(e.target.value) || 0 })}
                              className="w-16 h-7 text-sm"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}

          {section.exercises.length === 0 && section.key === 'main' && (
            <div className="py-4 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
              {t('programEditor.noExercises')}
            </div>
          )}

          {/* Per-section add buttons */}
          <div className="flex gap-2 flex-wrap pb-2">
            <Button
              onClick={() => onOpenCatalog(section.key)}
              size="sm"
              variant={section.key === 'main' ? 'limeSolid' : 'outline'}
              className="h-7 text-[10px] tracking-wide"
            >
              + {section.key === 'warmup' ? t('warmupCooldown.editor.addWarmup')
                 : section.key === 'cooldown' ? t('warmupCooldown.editor.addCooldown')
                 : t('programEditor.addFromCatalog')}
            </Button>
            {section.key === 'main' && (
              <Button
                onClick={() => handleAddCustom('main')}
                variant="outline"
                size="sm"
                className="h-7 text-[10px] tracking-wide"
              >
                + {t('programEditor.customExercise')}
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
