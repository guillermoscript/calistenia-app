/** Piezas del formulario de «Crear batalla»: etiqueta de sección, campo numérico, rondas, título. */
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Minus, Plus } from 'lucide-react'

import { BATTLE_LIMITS } from '@calistenia/core/lib/battle'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Kicker } from '../ui/kicker'

export function SectionLabel({ children }: { children: ReactNode }) {
  return <Kicker className="mb-2 mt-6">{children}</Kicker>
}

/** Entero editable: acepta vacío mientras se escribe (vale 0) y no deja pasar letras. */
export function NumberField({ value, onChange, label, className }: {
  value: number
  onChange: (value: number) => void
  label: string
  className?: string
}) {
  const [text, setText] = useState(String(value))
  return (
    <Input
      value={text}
      inputMode="numeric"
      aria-label={label}
      onFocus={e => e.currentTarget.select()}
      onChange={e => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 4)
        setText(digits)
        onChange(digits ? parseInt(digits, 10) : 0)
      }}
      className={cn('h-9 w-16 px-2 text-center font-mono', className)}
    />
  )
}

export function RoundsStepper({ rounds, onChange }: { rounds: number; onChange: (rounds: number) => void }) {
  const { t } = useTranslation()
  const step = (delta: number) => {
    const next = Math.min(BATTLE_LIMITS.maxRounds, Math.max(BATTLE_LIMITS.minRounds, rounds + delta))
    if (next !== rounds) onChange(next)
  }
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium">{t('battle.roundsLabel')}</span>
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="icon" className="rounded-full" disabled={rounds <= BATTLE_LIMITS.minRounds} onClick={() => step(-1)} aria-label={t('battle.fewerRounds')}>
          <Minus className="size-4" aria-hidden />
        </Button>
        <span className="w-6 text-center font-bebas text-2xl tabular-nums">{rounds}</span>
        <Button type="button" variant="outline" size="icon" className="rounded-full" disabled={rounds >= BATTLE_LIMITS.maxRounds} onClick={() => step(1)} aria-label={t('battle.moreRounds')}>
          <Plus className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}

export function BattleTitleField({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (v: string) => void }) {
  const { t } = useTranslation()
  return (
    <div>
      <SectionLabel>{t('battle.titleLabel')}</SectionLabel>
      <Input
        value={value}
        placeholder={placeholder}
        maxLength={BATTLE_LIMITS.maxTitleLength}
        aria-label={t('battle.titleLabel')}
        onChange={e => onChange(e.target.value.slice(0, BATTLE_LIMITS.maxTitleLength))}
      />
    </div>
  )
}

export function OriginChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-10 rounded-full border px-4 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  )
}
