/**
 * Paso 4 del editor de programas (#223): ejercicios por día, agrupados en
 * secciones warmup/main/cooldown. Port de ProgramEditorPage web :591-885.
 */
import { useState } from 'react'
import { View, Pressable, ScrollView, Switch } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, ChevronUp, Plus, X } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import type { EditorDay, EditorExercise, EditorPhase } from '@calistenia/core/hooks/useProgramEditor'
import { DAY_IDS, PRIORITY_OPTIONS } from './constants'

const LIME = 'hsl(74 90% 45%)'
const SECTIONS = ['warmup', 'main', 'cooldown'] as const
type Section = (typeof SECTIONS)[number]

interface StepExercisesProps {
  phases: EditorPhase[]
  days: Record<string, EditorDay>
  selectedPhaseTab: number
  onSelectPhaseTab: (index: number) => void
  selectedDayId: string
  onSelectDayId: (dayId: string) => void
  updateExercise: (dayKey: string, index: number, data: Partial<EditorExercise>) => void
  removeExercise: (dayKey: string, index: number) => void
  moveExercise: (dayKey: string, index: number, direction: 'up' | 'down') => void
  addExercise: (dayKey: string, exercise: EditorExercise) => void
  onOpenCatalog: (section: Section) => void
}

export function StepExercises({
  phases, days, selectedPhaseTab, onSelectPhaseTab, selectedDayId, onSelectDayId,
  updateExercise, removeExercise, moveExercise, addExercise, onOpenCatalog,
}: StepExercisesProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState<number | null>(null)

  const dayKey = `${selectedPhaseTab}_${selectedDayId}`
  const day = days[dayKey]

  const handleAddCustom = () => {
    haptics.light()
    addExercise(dayKey, {
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
      section: 'main',
    })
  }

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

      {/* Selector de día con contador */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1.5">
        {DAY_IDS.map(dayId => {
          const d = days[`${selectedPhaseTab}_${dayId}`]
          if (!d) return null
          const active = selectedDayId === dayId
          const count = d.exercises.length
          return (
            <Pressable
              key={dayId}
              onPress={() => { haptics.light(); onSelectDayId(dayId) }}
              className={cn(
                'items-center rounded-lg border px-3 py-2 active:opacity-70',
                active ? 'border-lime/50 bg-lime/10' : 'border-border bg-card',
                d.type === 'rest' && 'opacity-50',
              )}
            >
              <Text className={cn('font-mono text-[10px] uppercase tracking-wide', active ? 'text-lime' : 'text-muted-foreground')}>
                {t(`day.${dayId}`).slice(0, 3)}
              </Text>
              <Text className={cn('font-mono text-[9px]', active ? 'text-lime/70' : 'text-muted-foreground/50')}>
                {d.type === 'rest' ? '—' : count}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>

      {!day || day.type === 'rest' ? (
        <Card>
          <CardContent className="items-center gap-1 py-8">
            <Text className="text-2xl">🌙</Text>
            <Text className="font-bebas text-lg text-muted-foreground">{t('dayType.rest')}</Text>
          </CardContent>
        </Card>
      ) : day.type === 'cardio' ? (
        <Card>
          <CardContent className="items-center gap-1 py-8">
            <Text className="text-2xl">🏃</Text>
            <Text className="font-bebas text-lg text-foreground">{t('programEditor.cardioDay')}</Text>
            <Text className="text-center text-xs text-muted-foreground">{t('programEditor.cardioConfigHint')}</Text>
          </CardContent>
        </Card>
      ) : (
        <View className="gap-4">
          {SECTIONS.map(section => {
            // Índices reales dentro de day.exercises (moveExercise/update/remove usan el índice global)
            const items = day.exercises
              .map((ex, i) => ({ ex, i }))
              .filter(({ ex }) => (ex.section ?? 'main') === section)
            return (
              <View key={section} className="gap-2">
                <View className="flex-row items-center justify-between">
                  <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
                    {t(`warmupCooldown.sections.${section}`)} · {items.length}
                  </Text>
                  <Pressable
                    onPress={() => { haptics.light(); onOpenCatalog(section) }}
                    className="flex-row items-center gap-1 rounded-full border border-lime/40 bg-lime/10 px-3 py-1.5 active:opacity-70"
                  >
                    <Plus size={12} color={LIME} />
                    <Text className="font-mono text-[9px] uppercase tracking-wide text-lime">
                      {t('programEditor.addFromCatalog')}
                    </Text>
                  </Pressable>
                </View>

                {items.length === 0 && section === 'main' && (
                  <Text className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">
                    {t('programEditor.noExercises')}
                  </Text>
                )}

                {items.map(({ ex, i }, pos) => {
                  const isExpanded = expanded === i
                  return (
                    <Card key={`${ex.exerciseId}_${i}`}>
                      <CardContent className="gap-2.5 p-3.5">
                        <View className="flex-row items-center gap-2">
                          {/* Reordenar dentro de la lista global del día */}
                          <View className="gap-0.5">
                            <Pressable
                              disabled={pos === 0}
                              onPress={() => { haptics.light(); moveExercise(dayKey, i, 'up') }}
                              hitSlop={4}
                              className={cn('active:opacity-60', pos === 0 && 'opacity-25')}
                              accessibilityLabel={t('programEditor.moveUp', { name: ex.name })}
                            >
                              <ChevronUp size={15} color="#888899" />
                            </Pressable>
                            <Pressable
                              disabled={pos === items.length - 1}
                              onPress={() => { haptics.light(); moveExercise(dayKey, i, 'down') }}
                              hitSlop={4}
                              className={cn('active:opacity-60', pos === items.length - 1 && 'opacity-25')}
                              accessibilityLabel={t('programEditor.moveDown', { name: ex.name })}
                            >
                              <ChevronDown size={15} color="#888899" />
                            </Pressable>
                          </View>

                          <View className="flex-1 min-w-0">
                            <Input
                              placeholder={t('programEditor.exerciseName')}
                              value={ex.name}
                              onChangeText={name => updateExercise(dayKey, i, { name })}
                              className="h-9 text-[13px]"
                            />
                          </View>

                          <Pressable
                            onPress={() => { haptics.light(); setExpanded(isExpanded ? null : i) }}
                            hitSlop={6}
                            className="active:opacity-60"
                          >
                            {isExpanded ? <ChevronDown size={16} color={LIME} /> : <ChevronRight size={16} color="#888899" />}
                          </Pressable>
                          <Pressable
                            onPress={() => { haptics.light(); setExpanded(null); removeExercise(dayKey, i) }}
                            hitSlop={6}
                            className="active:opacity-60"
                            accessibilityLabel={t('programEditor.removeExercise', { name: ex.name })}
                          >
                            <X size={16} color="#ef4444" />
                          </Pressable>
                        </View>

                        {/* Sets × reps · descanso · prioridad */}
                        <View className="flex-row items-center gap-2">
                          <Input
                            keyboardType="number-pad"
                            value={String(ex.sets)}
                            onChangeText={v => updateExercise(dayKey, i, { sets: v })}
                            className="h-9 w-14 text-center text-[13px]"
                          />
                          <Text className="font-mono text-xs text-muted-foreground">×</Text>
                          <Input
                            value={ex.reps}
                            onChangeText={reps => updateExercise(dayKey, i, { reps })}
                            className="h-9 w-20 text-center text-[13px]"
                          />
                          <Input
                            keyboardType="number-pad"
                            value={String(ex.rest)}
                            onChangeText={v => updateExercise(dayKey, i, { rest: parseInt(v, 10) || 0 })}
                            className="h-9 w-16 text-center text-[13px]"
                          />
                          <Text className="font-mono text-[10px] text-muted-foreground">s</Text>
                          <View className="flex-1" />
                          {PRIORITY_OPTIONS.map(p => {
                            const active = ex.priority === p.value
                            return (
                              <Pressable
                                key={p.value}
                                onPress={() => { haptics.light(); updateExercise(dayKey, i, { priority: p.value }) }}
                                className={cn('rounded border px-1.5 py-1 active:opacity-70', active ? 'border-current bg-muted/40' : 'border-transparent')}
                              >
                                <Text className={cn('font-mono text-[9px] uppercase', active ? p.className : 'text-muted-foreground/40')}>
                                  {t(p.i18nKey).slice(0, 4)}
                                </Text>
                              </Pressable>
                            )
                          })}
                        </View>

                        {isExpanded && (
                          <View className="gap-2.5 border-t border-border/60 pt-2.5">
                            <View className="gap-1.5">
                              <Text className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('programEditor.muscles')}</Text>
                              <Input
                                placeholder={t('programEditor.musclesPlaceholder')}
                                value={ex.muscles}
                                onChangeText={muscles => updateExercise(dayKey, i, { muscles })}
                                className="h-9 text-[13px]"
                              />
                            </View>
                            <View className="gap-1.5">
                              <Text className="text-[11px] uppercase tracking-wide text-muted-foreground">YouTube</Text>
                              <Input
                                placeholder={t('programEditor.youtubePlaceholder')}
                                value={ex.youtube}
                                onChangeText={youtube => updateExercise(dayKey, i, { youtube })}
                                autoCapitalize="none"
                                className="h-9 text-[13px]"
                              />
                            </View>
                            <View className="gap-1.5">
                              <Text className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('programEditor.note')}</Text>
                              <Input
                                placeholder={t('programEditor.notePlaceholder')}
                                value={ex.note}
                                onChangeText={note => updateExercise(dayKey, i, { note })}
                                className="h-9 text-[13px]"
                              />
                            </View>
                            <View className="flex-row items-center justify-between">
                              <Text className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('programEditor.isTimer')}</Text>
                              <View className="flex-row items-center gap-2">
                                {ex.isTimer && (
                                  <Input
                                    keyboardType="number-pad"
                                    value={String(ex.timerSeconds || '')}
                                    placeholder={t('programEditor.timerSeconds')}
                                    onChangeText={v => updateExercise(dayKey, i, { timerSeconds: parseInt(v, 10) || 0 })}
                                    className="h-9 w-20 text-center text-[13px]"
                                  />
                                )}
                                <Switch
                                  value={ex.isTimer}
                                  onValueChange={isTimer => { haptics.light(); updateExercise(dayKey, i, { isTimer }) }}
                                  trackColor={{ true: 'rgba(200,245,66,0.4)', false: undefined }}
                                  thumbColor={ex.isTimer ? '#c8f542' : undefined}
                                />
                              </View>
                            </View>
                          </View>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}

                {section === 'main' && (
                  <Pressable
                    onPress={handleAddCustom}
                    className="items-center rounded-lg border border-dashed border-border py-2.5 active:opacity-70"
                  >
                    <Text className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                      + {t('programEditor.customExercise')}
                    </Text>
                  </Pressable>
                )}
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}
