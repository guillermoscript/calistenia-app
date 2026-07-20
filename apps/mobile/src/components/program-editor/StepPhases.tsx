/**
 * Paso 2 del editor de programas (#223): fases (nombre, semanas, color).
 * Port de ProgramEditorPage web :323-396.
 */
import { View, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import type { EditorPhase } from '@calistenia/core/hooks/useProgramEditor'
import { COLOR_SWATCHES } from './constants'

const MAX_PHASES = 8

interface StepPhasesProps {
  phases: EditorPhase[]
  addPhase: () => void
  removePhase: (index: number) => void
  updatePhase: (index: number, data: Partial<EditorPhase>) => void
}

export function StepPhases({ phases, addPhase, removePhase, updatePhase }: StepPhasesProps) {
  const { t } = useTranslation()

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="font-mono text-[10px] uppercase tracking-[2px] text-muted-foreground">
          {t('programEditor.phasesTitle')}
        </Text>
        {phases.length < MAX_PHASES && (
          <Pressable
            onPress={() => { haptics.light(); addPhase() }}
            className="flex-row items-center gap-1 rounded-full border border-lime/40 bg-lime/10 px-3 py-1.5 active:opacity-70"
          >
            <Plus size={13} color="hsl(74 90% 45%)" />
            <Text className="font-mono text-[10px] uppercase tracking-wide text-lime">
              {t('programEditor.addPhase')}
            </Text>
          </Pressable>
        )}
      </View>

      {phases.map((phase, pi) => (
        <Card key={pi} style={{ borderColor: `${phase.color}66` }}>
          <CardContent className="gap-3 p-4">
            <View className="flex-row items-center justify-between">
              <Text className="font-bebas text-xl leading-none" style={{ color: phase.color }}>
                {pi + 1}
              </Text>
              {phases.length > 1 && (
                <Pressable onPress={() => { haptics.light(); removePhase(pi) }} hitSlop={6} className="active:opacity-60">
                  <Trash2 size={16} color="#ef4444" />
                </Pressable>
              )}
            </View>

            <View className="flex-row gap-3">
              <View className="flex-[2] gap-1.5">
                <Text className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t('programEditor.phaseName')}
                </Text>
                <Input
                  placeholder={t('programEditor.phaseNamePlaceholder')}
                  value={phase.name}
                  onChangeText={name => updatePhase(pi, { name })}
                />
              </View>
              <View className="flex-1 gap-1.5">
                <Text className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t('programEditor.weeks')}
                </Text>
                <Input
                  placeholder={t('programEditor.weeksPlaceholder')}
                  value={phase.weeks}
                  onChangeText={weeks => updatePhase(pi, { weeks })}
                />
              </View>
            </View>

            <View className="flex-row gap-2">
              {COLOR_SWATCHES.map(sw => {
                const active = phase.color === sw.color
                return (
                  <Pressable
                    key={sw.name}
                    onPress={() => { haptics.light(); updatePhase(pi, { color: sw.color, bgColor: sw.bg }) }}
                    className={cn('h-7 w-7 rounded-full border-2', active ? 'border-foreground' : 'border-transparent')}
                    style={{ backgroundColor: sw.color }}
                    accessibilityLabel={sw.name}
                  />
                )
              })}
            </View>
          </CardContent>
        </Card>
      ))}
    </View>
  )
}
