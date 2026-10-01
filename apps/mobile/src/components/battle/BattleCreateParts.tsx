/**
 * Piezas del formulario de «Nueva batalla» (#882): campo numérico, selector de rondas
 * y título opcional. Sin estado de negocio; la pantalla decide qué hace cada valor.
 */
import { useState } from 'react'
import { Pressable, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Minus, Plus } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { BATTLE_LIMITS } from '@calistenia/core/lib/battle'

export function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="mb-2 mt-6 font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
      {children}
    </Text>
  )
}

/** Entero editable: acepta vacío mientras se escribe (vale 0) y no deja pasar letras. */
export function NumberField({ value, onChange, accessibilityLabel, className }: {
  value: number
  onChange: (value: number) => void
  accessibilityLabel: string
  className?: string
}) {
  const [text, setText] = useState(String(value))
  return (
    <TextInput
      value={text}
      onChangeText={raw => {
        const digits = raw.replace(/\D/g, '').slice(0, 4)
        setText(digits)
        onChange(digits ? parseInt(digits, 10) : 0)
      }}
      keyboardType="number-pad"
      selectTextOnFocus
      accessibilityLabel={accessibilityLabel}
      className={cn(
        'h-9 w-14 rounded-md border border-border bg-background px-2 text-center font-mono text-sm text-foreground',
        className,
      )}
    />
  )
}

export function RoundsStepper({ rounds, onChange }: { rounds: number; onChange: (rounds: number) => void }) {
  const { t } = useTranslation()
  const step = (delta: number) => {
    const next = Math.min(BATTLE_LIMITS.maxRounds, Math.max(BATTLE_LIMITS.minRounds, rounds + delta))
    if (next === rounds) return
    haptics.light()
    onChange(next)
  }
  const btn = 'h-11 w-11 items-center justify-center rounded-full border border-border active:bg-muted/40'
  return (
    <View className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5">
      <Text className="font-sans-medium text-sm text-foreground">{t('battle.roundsLabel')}</Text>
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={() => step(-1)}
          disabled={rounds <= BATTLE_LIMITS.minRounds}
          className={cn(btn, rounds <= BATTLE_LIMITS.minRounds && 'opacity-40')}
          accessibilityRole="button"
          accessibilityLabel={t('battle.fewerRounds')}
        >
          <Minus size={16} color="#888899" />
        </Pressable>
        <Text className="w-8 text-center font-bebas text-3xl leading-none text-lime">{rounds}</Text>
        <Pressable
          onPress={() => step(1)}
          disabled={rounds >= BATTLE_LIMITS.maxRounds}
          className={cn(btn, rounds >= BATTLE_LIMITS.maxRounds && 'opacity-40')}
          accessibilityRole="button"
          accessibilityLabel={t('battle.moreRounds')}
        >
          <Plus size={16} color="#888899" />
        </Pressable>
      </View>
    </View>
  )
}

export function BattleTitleField({ value, placeholder, onChange }: {
  value: string
  placeholder: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  return (
    <View>
      <SectionLabel>{t('battle.titleLabel')}</SectionLabel>
      <Input
        value={value}
        onChangeText={text => onChange(text.slice(0, BATTLE_LIMITS.maxTitleLength))}
        placeholder={placeholder}
        maxLength={BATTLE_LIMITS.maxTitleLength}
        returnKeyType="done"
        accessibilityLabel={t('battle.titleLabel')}
      />
    </View>
  )
}
