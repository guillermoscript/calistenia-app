/**
 * Paso 3 del editor de programas (#223): configuración de días por fase.
 * Port de ProgramEditorPage web :399-588. El tipo de día se elige con un
 * OptionSheet nativo (10 opciones no caben como chips en una fila móvil).
 */
import { useState } from 'react'
import { View, Pressable, ScrollView } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { OptionSheet } from '@/components/ui/option-sheet'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import type { EditorDay, EditorPhase } from '@calistenia/core/hooks/useProgramEditor'
import { copyDayTargets, copyPhaseTargets } from '@calistenia/core/hooks/useProgramEditor'
import { CopyToSheet, type CopyTargetOption } from './CopyToSheet'
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

function numOrUndef(v: string): number | undefined {
  const n = parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : undefined
}

export function StepDays({ phases, days, selectedPhaseTab, onSelectPhaseTab, updateDay, copyDay, copyPhase }: StepDaysProps) {
  const { t } = useTranslation()
  // Día cuyo selector de tipo está abierto (key `${phase}_${dayId}`), o null.
  const [typePickerKey, setTypePickerKey] = useState<string | null>(null)
  // Día que se está copiando (`null` = sheet cerrado). Guardar la clave y no un
  // booleano deja que el sheet titule con el nombre del día de origen.
  const [copySourceKey, setCopySourceKey] = useState<string | null>(null)
  const [copyPhaseOpen, setCopyPhaseOpen] = useState(false)

  const phaseLabel = (index: number) =>
    `${index + 1} · ${phases[index]?.name || t('programEditor.phaseNumbered', { n: index + 1 })}`

  const dayTargets: CopyTargetOption[] = copySourceKey
    ? copyDayTargets(days, phases.length, copySourceKey).map(target => ({
        id: target.key,
        label: t(`day.${target.dayId}`),
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
    <View className="gap-3">
      {/* Tabs de fase */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
        {phases.map((phase, pi) => {
          const active = selectedPhaseTab === pi
          return (
            <Pressable
              key={pi}
              onPress={() => { haptics.light(); onSelectPhaseTab(pi) }}
              className={cn('rounded-full border px-3.5 py-1.5 active:opacity-70', active ? 'bg-lime/15' : 'border-border bg-card')}
              style={active ? { borderColor: phase.color } : undefined}
            >
              <Text
                className={cn('font-mono text-[10px] uppercase tracking-wide', !active && 'text-muted-foreground')}
                style={active ? { color: phase.color } : undefined}
              >
                {pi + 1} · {phase.name || `${t('programEditor.stepPhases')} ${pi + 1}`}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>

      <View className="flex-row items-center justify-between">
        <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
          {t('programEditor.daysPerPhase')}
        </Text>
        {phases.length > 1 && (
          <Pressable
            onPress={() => { haptics.light(); setCopyPhaseOpen(true) }}
            className="rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 active:opacity-70"
            accessibilityRole="button"
          >
            <Text className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              {t('programEditor.copy.phaseCta')}
            </Text>
          </Pressable>
        )}
      </View>

      {DAY_IDS.map(dayId => {
        const key = `${selectedPhaseTab}_${dayId}`
        const day = days[key]
        if (!day) return null
        const isRest = day.type === 'rest'
        const typeLabel = DAY_TYPE_OPTIONS.find(o => o.value === day.type)

        return (
          <Card key={key} className={cn(isRest && 'opacity-60')}>
            <CardContent className="gap-3 p-4">
              <View className="flex-row items-center justify-between">
                <Text className="font-bebas text-lg leading-none text-foreground">
                  {t(`day.${dayId}`)}
                </Text>
                <View className="flex-row items-center gap-2">
                  <Pressable
                    onPress={() => { haptics.light(); setCopySourceKey(key) }}
                    className="rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 active:opacity-70"
                    accessibilityRole="button"
                  >
                    <Text className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                      {t('programEditor.copy.dayCta')}
                    </Text>
                  </Pressable>
                  {/* Selector de tipo → OptionSheet */}
                  <Pressable
                    onPress={() => { haptics.light(); setTypePickerKey(key) }}
                    className="flex-row items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-1.5 active:opacity-70"
                  >
                    <View className="h-2 w-2 rounded-full" style={{ backgroundColor: day.color }} />
                    <Text className="font-mono text-[10px] uppercase tracking-wide text-foreground">
                      {typeLabel ? t(typeLabel.labelKey) : day.type}
                    </Text>
                    <ChevronDown size={12} color="#888899" />
                  </Pressable>
                </View>
              </View>

              {!isRest && (
                <View className="gap-1.5">
                  <Text className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {t('programEditor.focus')}
                  </Text>
                  <Input
                    placeholder={t('programEditor.focusPlaceholder')}
                    value={day.focus}
                    onChangeText={focus => updateDay(key, { focus })}
                  />
                </View>
              )}

              {/* Config cardio */}
              {day.type === 'cardio' && (
                <View className="gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                  <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
                    {t('programEditor.cardioConfig')}
                  </Text>
                  <View className="flex-row gap-2">
                    {CARDIO_TYPE_OPTIONS.map(opt => {
                      const active = (day.cardioActivityType ?? 'running') === opt.value
                      return (
                        <Pressable
                          key={opt.value}
                          onPress={() => { haptics.light(); updateDay(key, { cardioActivityType: opt.value }) }}
                          className={cn(
                            'flex-1 items-center rounded-lg border py-2 active:opacity-70',
                            active ? 'border-lime/50 bg-lime/10' : 'border-border bg-card',
                          )}
                        >
                          <Text className={cn('font-mono text-[10px] uppercase tracking-wide', active ? 'text-lime' : 'text-muted-foreground')}>
                            {t(opt.labelKey)}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>
                  <View className="flex-row gap-3">
                    <View className="flex-1 gap-1.5">
                      <Text className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {t('programEditor.distanceKm')}
                      </Text>
                      <Input
                        keyboardType="decimal-pad"
                        placeholder={t('programEditor.distancePlaceholder')}
                        value={day.cardioTargetDistanceKm != null ? String(day.cardioTargetDistanceKm) : ''}
                        onChangeText={v => updateDay(key, { cardioTargetDistanceKm: numOrUndef(v) })}
                      />
                    </View>
                    <View className="flex-1 gap-1.5">
                      <Text className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {t('programEditor.durationMin')}
                      </Text>
                      <Input
                        keyboardType="number-pad"
                        placeholder={t('programEditor.durationPlaceholder')}
                        value={day.cardioTargetDurationMin != null ? String(day.cardioTargetDurationMin) : ''}
                        onChangeText={v => updateDay(key, { cardioTargetDurationMin: numOrUndef(v) })}
                      />
                    </View>
                  </View>
                </View>
              )}

              {/* Config circuito */}
              {day.type === 'circuit' && (
                <View className="gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                  <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
                    {t('dayType.circuit')}
                  </Text>
                  <View className="flex-row gap-2">
                    {(['circuit', 'timed'] as const).map(mode => {
                      const active = (day.circuitMode ?? 'circuit') === mode
                      return (
                        <Pressable
                          key={mode}
                          onPress={() => { haptics.light(); updateDay(key, { circuitMode: mode }) }}
                          className={cn(
                            'flex-1 items-center rounded-lg border py-2 active:opacity-70',
                            active ? 'border-lime/50 bg-lime/10' : 'border-border bg-card',
                          )}
                        >
                          <Text className={cn('font-mono text-[10px] uppercase tracking-wide', active ? 'text-lime' : 'text-muted-foreground')}>
                            {t(`circuit.modes.${mode}`)}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>
                  <View className="flex-row flex-wrap gap-3">
                    <NumField label={t('circuit.rounds')} value={day.circuitRounds} onChange={n => updateDay(key, { circuitRounds: n })} />
                    {day.circuitMode === 'timed' && (
                      <>
                        <NumField label={t('circuit.workTime')} value={day.circuitWorkSeconds} onChange={n => updateDay(key, { circuitWorkSeconds: n })} />
                        <NumField label={t('circuit.restTime')} value={day.circuitRestSeconds} onChange={n => updateDay(key, { circuitRestSeconds: n })} />
                      </>
                    )}
                    <NumField label={t('circuit.restBetweenExercises')} value={day.circuitRestBetweenExercises} onChange={n => updateDay(key, { circuitRestBetweenExercises: n })} />
                    <NumField label={t('circuit.restBetweenRounds')} value={day.circuitRestBetweenRounds} onChange={n => updateDay(key, { circuitRestBetweenRounds: n })} />
                  </View>
                </View>
              )}
            </CardContent>
          </Card>
        )
      })}

      {/* OptionSheet del tipo de día */}
      <OptionSheet
        visible={typePickerKey !== null}
        kicker={t('programEditor.type')}
        title={typePickerKey ? t(`day.${typePickerKey.split('_')[1]}`) : ''}
        cancelLabel={t('common.cancel')}
        onClose={() => setTypePickerKey(null)}
        options={DAY_TYPE_OPTIONS.map(opt => ({
          key: opt.value,
          label: t(opt.labelKey),
          onPress: () => {
            if (typePickerKey) updateDay(typePickerKey, { type: opt.value })
          },
        }))}
      />

      <CopyToSheet
        visible={copySourceKey !== null}
        kicker={t('programEditor.copy.dayCta')}
        title={t('programEditor.copy.dayTitle', { day: copySourceKey ? t(`day.${copySourceKey.split('_')[1]}`) : '' })}
        description={t('programEditor.copy.dayDesc')}
        targets={dayTargets}
        onClose={() => setCopySourceKey(null)}
        onSelect={toKey => { if (copySourceKey) copyDay(copySourceKey, toKey) }}
      />

      <CopyToSheet
        visible={copyPhaseOpen}
        kicker={t('programEditor.copy.phaseCta')}
        title={t('programEditor.copy.phaseTitle', { phase: phaseLabel(selectedPhaseTab) })}
        description={t('programEditor.copy.phaseDesc')}
        targets={phaseTargets}
        onClose={() => setCopyPhaseOpen(false)}
        onSelect={toIndex => copyPhase(selectedPhaseTab, Number(toIndex))}
      />
    </View>
  )
}

function NumField({ label, value, onChange }: { label: string; value: number | undefined; onChange: (n: number | undefined) => void }) {
  return (
    <View className="w-[47%] gap-1.5">
      <Text className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Text>
      <Input
        keyboardType="number-pad"
        value={value != null ? String(value) : ''}
        onChangeText={v => onChange(numOrUndef(v))}
      />
    </View>
  )
}
