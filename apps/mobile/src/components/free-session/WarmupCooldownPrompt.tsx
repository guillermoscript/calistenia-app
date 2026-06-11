import { useState, useMemo } from 'react'
import { View, Modal, Pressable } from 'react-native'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { detectDayType } from '@/lib/detect-day-type'
import { stretchTemplates } from '@calistenia/core/data/stretch-templates'
import type { Exercise } from '@calistenia/core/types'

// ── Sub-components ─────────────────────────────────────────────────────────

function SectionToggle({ checked, onToggle, label, count, color }: {
  checked: boolean
  onToggle: () => void
  label: string
  count: number
  color: 'amber' | 'sky'
}) {
  return (
    <Pressable
      onPress={onToggle}
      className={cn(
        'flex-row items-center gap-3 rounded-xl border px-4 py-3',
        checked
          ? color === 'amber'
            ? 'border-amber-400/40 bg-amber-400/5'
            : 'border-sky-400/40 bg-sky-400/5'
          : 'border-border bg-card',
      )}
    >
      <View className={cn(
        'h-5 w-5 rounded-full border-2 items-center justify-center',
        checked
          ? color === 'amber' ? 'border-amber-400 bg-amber-400' : 'border-sky-400 bg-sky-400'
          : 'border-muted-foreground/40',
      )}>
        {checked && (
          <View className="h-2 w-2 rounded-full bg-background" />
        )}
      </View>
      <Text className={cn('font-sans-medium text-sm flex-1', checked ? 'text-foreground' : 'text-muted-foreground')}>
        {label}
      </Text>
      <Text className="font-mono text-[10px] text-muted-foreground">
        {count} ejercicios
      </Text>
    </Pressable>
  )
}

function ExercisePreviewRow({ exercise, color }: { exercise: Exercise; color: 'amber' | 'sky' }) {
  return (
    <View className="flex-row items-center gap-2 px-2 py-1">
      <View className={cn(
        'h-1.5 w-1.5 rounded-full shrink-0',
        color === 'amber' ? 'bg-amber-400/60' : 'bg-sky-400/60',
      )} />
      <Text className="flex-1 text-[12px] text-muted-foreground" numberOfLines={1}>{exercise.name}</Text>
      <Text className="font-mono text-[10px] text-muted-foreground/60 shrink-0">
        {exercise.sets}×{exercise.reps}
      </Text>
    </View>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

interface WarmupCooldownPromptProps {
  mainExercises: Exercise[]
  visible: boolean
  onCancel: () => void
  onConfirm: (warmup: Exercise[], cooldown: Exercise[]) => void
}

export function WarmupCooldownPrompt({ mainExercises, visible, onCancel, onConfirm }: WarmupCooldownPromptProps) {
  const [includeWarmup, setIncludeWarmup] = useState(true)
  const [includeCooldown, setIncludeCooldown] = useState(true)

  const dayType = useMemo(() => detectDayType(mainExercises), [mainExercises])
  const tpl = stretchTemplates[dayType]

  const hasWarmup = tpl.warmup.length > 0
  const hasCooldown = tpl.cooldown.length > 0

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      {/* Dimmed backdrop */}
      <Pressable
        className="flex-1 bg-black/60"
        onPress={onCancel}
      >
        {/* Bottom card — stop propagation so taps inside don't close */}
        <Pressable
          className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-background px-5 pt-5 pb-8"
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground mb-1">
            {dayType}
          </Text>
          <Text className="font-bebas text-[28px] leading-none text-foreground mb-5">
            ¿Agregar calentamiento y estiramiento?
          </Text>

          {/* Toggles */}
          <View className="gap-3 mb-4">
            {hasWarmup && (
              <SectionToggle
                checked={includeWarmup}
                onToggle={() => setIncludeWarmup(v => !v)}
                label="Incluir calentamiento"
                count={tpl.warmup.length}
                color="amber"
              />
            )}
            {hasCooldown && (
              <SectionToggle
                checked={includeCooldown}
                onToggle={() => setIncludeCooldown(v => !v)}
                label="Incluir estiramiento"
                count={tpl.cooldown.length}
                color="sky"
              />
            )}
          </View>

          {/* Exercise preview list */}
          {(includeWarmup || includeCooldown) && (
            <View className="mb-5 max-h-40">
              {includeWarmup && hasWarmup && (
                <View className="mb-2">
                  <Text className="font-mono text-[10px] uppercase tracking-[2px] text-amber-400 mb-1">
                    Calentamiento
                  </Text>
                  {tpl.warmup.map(ex => (
                    <ExercisePreviewRow key={ex.id} exercise={ex} color="amber" />
                  ))}
                </View>
              )}
              {includeCooldown && hasCooldown && (
                <View>
                  <Text className="font-mono text-[10px] uppercase tracking-[2px] text-sky-400 mb-1">
                    Estiramiento
                  </Text>
                  {tpl.cooldown.map(ex => (
                    <ExercisePreviewRow key={ex.id} exercise={ex} color="sky" />
                  ))}
                </View>
              )}
            </View>
          )}

          {/* CTAs */}
          <Button
            className="w-full mb-2"
            onPress={() => onConfirm(
              includeWarmup && hasWarmup ? tpl.warmup : [],
              includeCooldown && hasCooldown ? tpl.cooldown : [],
            )}
          >
            <Text className="font-bebas text-lg tracking-wide">Empezar sesión</Text>
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onPress={onCancel}
          >
            <Text className="font-mono text-[11px] tracking-wide text-muted-foreground">Cancelar</Text>
          </Button>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
