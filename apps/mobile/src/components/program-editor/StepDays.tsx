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
import { CARDIO_TYPE_OPTIONS, DAY_IDS, DAY_TYPE_OPTIONS } from './constants'

interface StepDaysProps {
  phases: EditorPhase[]
  days: Record<string, EditorDay>
  selectedPhaseTab: number
  onSelectPhaseTab: (index: number) => void
  updateDay: (key: string, data: Partial<EditorDay>) => void
}

function numOrUndef(v: string): number | undefined {
  const n = parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : undefined
}

export function StepDays({ phases, days, selectedPhaseTab, onSelectPhaseTab, updateDay }: StepDaysProps) {
  const { t } = useTranslation()
  // Día cuyo selector de tipo está abierto (key `${phase}_${dayId}`), o null.
  const [typePickerKey, setTypePickerKey] = useState<string | null>(null)

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

      <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
        {t('programEditor.daysPerPhase')}
      </Text>

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
