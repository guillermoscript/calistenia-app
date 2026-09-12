/**
 * Paso 3 del editor de programas web (#223/#478): configuración de días por fase.
 * Extraído de ProgramEditorPage.tsx:399-588, sin cambios de markup.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { cn } from '../../lib/utils'
import type { EditorDay, EditorPhase } from '@calistenia/core/hooks/useProgramEditor'
import { copyDayTargets, copyPhaseTargets } from '@calistenia/core/hooks/useProgramEditor'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Card, CardContent } from '../ui/card'
import { Badge } from '../ui/badge'
import { CopyToDialog, type CopyTargetOption } from './CopyToDialog'
import { CARDIO_TYPE_OPTIONS, DAY_IDS, DAY_TYPE_OPTIONS } from './constants'

interface StepDaysProps {
  phases: EditorPhase[]
  days: Record<string, EditorDay>
  selectedPhaseTab: number
  onSelectPhaseTab: (index: number) => void
  updateDay: (key: string, data: Partial<EditorDay>) => void
  copyDay: (fromKey: string, toKey: string) => void
  copyPhase: (fromIndex: number, toIndex: number) => void
}

export function StepDays({ phases, days, selectedPhaseTab, onSelectPhaseTab, updateDay, copyDay, copyPhase }: StepDaysProps) {
  const { t } = useTranslation()

  // El día que se está copiando (`null` = diálogo cerrado). Guardar la clave y
  // no un booleano deja que el diálogo titule con el nombre del día de origen.
  const [copySourceKey, setCopySourceKey] = useState<string | null>(null)
  const [copyPhaseOpen, setCopyPhaseOpen] = useState(false)

  const phaseLabel = (index: number) => `F${index + 1}: ${phases[index]?.name ?? ''}`

  const dayTargets: CopyTargetOption[] = copySourceKey
    ? copyDayTargets(days, phases.length, copySourceKey).map(target => ({
        id: target.key,
        label: target.dayName,
        group: phaseLabel(target.phaseIndex),
        exerciseCount: target.exerciseCount,
      }))
    : []

  const phaseTargets: CopyTargetOption[] = copyPhaseOpen
    ? copyPhaseTargets(days, phases.length, selectedPhaseTab).map(target => ({
        id: String(target.phaseIndex),
        label: phaseLabel(target.phaseIndex),
        exerciseCount: target.exerciseCount,
      }))
    : []

  return (
    <div className="space-y-4">
      <div className="font-bebas text-2xl tracking-wide mb-2">{t('programEditor.daysPerPhase')}</div>

      {/* Phase tabs */}
      <div className="flex gap-1.5 flex-wrap mb-4">
        {phases.map((phase, pi) => (
          <Button
            key={pi}
            variant={selectedPhaseTab === pi ? 'default' : 'outline'}
            size="sm"
            onClick={() => onSelectPhaseTab(pi)}
            className={cn(
              'h-8 text-[10px] tracking-wide',
              selectedPhaseTab === pi && 'text-black'
            )}
            style={selectedPhaseTab === pi ? { backgroundColor: phase.color } : undefined}
          >
            F{pi + 1}: {phase.name}
          </Button>
        ))}
        {phases.length > 1 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCopyPhaseOpen(true)}
            className="ml-auto h-8 text-[10px] tracking-wide"
          >
            {t('programEditor.copy.phaseCta')}
          </Button>
        )}
      </div>

      {/* Day cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {DAY_IDS.map(dayId => {
          const dayKey = `${selectedPhaseTab}_${dayId}`
          const day = days[dayKey]
          if (!day) return null

          return (
            <Card key={dayId}>
              <CardContent className="p-4 space-y-2.5">
                <div className="flex items-center gap-2">
                  <div className="size-2 rounded-full" style={{ backgroundColor: day.color }} />
                  <div className="font-bebas text-lg tracking-wide">{day.dayName}</div>
                  <Badge variant="outline" className="text-[9px] ml-auto">
                    {day.type.toUpperCase()}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => setCopySourceKey(dayKey)}
                    className="shrink-0 font-mono text-[9px] uppercase tracking-[1.5px] text-muted-foreground transition-colors hover:text-lime"
                  >
                    {t('programEditor.copy.dayCta')}
                  </button>
                </div>

                <div>
                  <label className="text-[9px] text-muted-foreground tracking-widest uppercase block mb-1">{t('programEditor.focus')}</label>
                  <Input
                    value={day.focus}
                    onChange={e => updateDay(dayKey, { focus: e.target.value })}
                    placeholder={t('programEditor.focusPlaceholder')}
                    className="text-sm h-8"
                  />
                </div>

                <div>
                  <label className="text-[9px] text-muted-foreground tracking-widest uppercase block mb-1">{t('programEditor.type')}</label>
                  <select
                    value={day.type}
                    onChange={e => updateDay(dayKey, { type: e.target.value })}
                    className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {DAY_TYPE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                    ))}
                  </select>
                </div>

                {day.type === 'cardio' && (
                  <div className="space-y-2 p-3 bg-emerald-400/5 border border-emerald-400/20 rounded-lg">
                    <div className="text-[9px] text-emerald-400 tracking-widest uppercase mb-1">{t('programEditor.cardioConfig')}</div>
                    <div>
                      <label className="text-[9px] text-muted-foreground tracking-widest uppercase block mb-1">{t('programEditor.activity')}</label>
                      <div className="flex gap-1.5">
                        {CARDIO_TYPE_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => updateDay(dayKey, { cardioActivityType: opt.value })}
                            className={cn(
                              'flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[10px] border transition-all',
                              day.cardioActivityType === opt.value
                                ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-400'
                                : 'border-border text-muted-foreground hover:text-foreground'
                            )}
                          >
                            <span>{opt.icon}</span>
                            <span>{t(opt.labelKey)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] text-muted-foreground tracking-widest uppercase block mb-1">{t('programEditor.distanceKm')}</label>
                        <Input
                          type="number"
                          min={0}
                          step={0.5}
                          value={day.cardioTargetDistanceKm || ''}
                          onChange={e => updateDay(dayKey, { cardioTargetDistanceKm: parseFloat(e.target.value) || undefined })}
                          placeholder={t('programEditor.distancePlaceholder')}
                          className="text-sm h-8"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-muted-foreground tracking-widest uppercase block mb-1">{t('programEditor.durationMin')}</label>
                        <Input
                          type="number"
                          min={0}
                          value={day.cardioTargetDurationMin || ''}
                          onChange={e => updateDay(dayKey, { cardioTargetDurationMin: parseInt(e.target.value) || undefined })}
                          placeholder={t('programEditor.durationPlaceholder')}
                          className="text-sm h-8"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {day.type === 'circuit' && (
                  <div className="space-y-2 p-3 bg-orange-400/5 border border-orange-400/20 rounded-lg">
                    <div className="text-[9px] text-orange-400 tracking-widest uppercase mb-1">{t('circuit.title')}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] text-muted-foreground tracking-widest uppercase block mb-1">{t('circuit.modes.circuit')} / {t('circuit.modes.timed')}</label>
                        <select
                          className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm"
                          value={day.circuitMode ?? 'circuit'}
                          onChange={(e) => updateDay(dayKey, { circuitMode: e.target.value as 'circuit' | 'timed' })}
                        >
                          <option value="circuit">{t('circuit.modes.circuit')}</option>
                          <option value="timed">{t('circuit.modes.timed')}</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] text-muted-foreground tracking-widest uppercase block mb-1">{t('circuit.rounds')}</label>
                        <Input
                          type="number" min={1} max={20}
                          value={day.circuitRounds ?? 3}
                          onChange={(e) => updateDay(dayKey, { circuitRounds: parseInt(e.target.value) || 3 })}
                          className="text-sm h-8"
                        />
                      </div>
                      {(day.circuitMode ?? 'circuit') === 'timed' && (
                        <>
                          <div>
                            <label className="text-[9px] text-muted-foreground tracking-widest uppercase block mb-1">{t('circuit.workTime')}</label>
                            <Input
                              type="number" min={5} max={120} step={5}
                              value={day.circuitWorkSeconds ?? 40}
                              onChange={(e) => updateDay(dayKey, { circuitWorkSeconds: parseInt(e.target.value) || 40 })}
                              className="text-sm h-8"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-muted-foreground tracking-widest uppercase block mb-1">{t('circuit.restTime')}</label>
                            <Input
                              type="number" min={0} max={60} step={5}
                              value={day.circuitRestSeconds ?? 20}
                              onChange={(e) => updateDay(dayKey, { circuitRestSeconds: parseInt(e.target.value) || 20 })}
                              className="text-sm h-8"
                            />
                          </div>
                        </>
                      )}
                      <div>
                        <label className="text-[9px] text-muted-foreground tracking-widest uppercase block mb-1">{t('circuit.restBetweenExercises')}</label>
                        <Input
                          type="number" min={0} max={120} step={5}
                          value={day.circuitRestBetweenExercises ?? 0}
                          onChange={(e) => updateDay(dayKey, { circuitRestBetweenExercises: parseInt(e.target.value) || 0 })}
                          className="text-sm h-8"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-muted-foreground tracking-widest uppercase block mb-1">{t('circuit.restBetweenRounds')}</label>
                        <Input
                          type="number" min={0} max={180} step={15}
                          value={day.circuitRestBetweenRounds ?? 60}
                          onChange={(e) => updateDay(dayKey, { circuitRestBetweenRounds: parseInt(e.target.value) || 60 })}
                          className="text-sm h-8"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <CopyToDialog
        open={copySourceKey !== null}
        onOpenChange={open => { if (!open) setCopySourceKey(null) }}
        title={t('programEditor.copy.dayTitle', { day: (copySourceKey && days[copySourceKey]?.dayName) || '' })}
        description={t('programEditor.copy.dayDesc')}
        targets={dayTargets}
        onSelect={toKey => {
          if (!copySourceKey) return
          copyDay(copySourceKey, toKey)
          toast.success(t('programEditor.copy.doneDay', { target: days[toKey]?.dayName ?? '' }))
        }}
      />

      <CopyToDialog
        open={copyPhaseOpen}
        onOpenChange={setCopyPhaseOpen}
        title={t('programEditor.copy.phaseTitle', { phase: phaseLabel(selectedPhaseTab) })}
        description={t('programEditor.copy.phaseDesc')}
        targets={phaseTargets}
        onSelect={toIndex => {
          copyPhase(selectedPhaseTab, Number(toIndex))
          toast.success(t('programEditor.copy.donePhase', { target: phaseLabel(Number(toIndex)) }))
        }}
      />
    </div>
  )
}
