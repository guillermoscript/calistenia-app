import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLocalize } from '../hooks/useLocalize'
import { useCircuitSession } from '../contexts/CircuitSessionContext'
import { CIRCUIT_PRESETS, type CircuitPreset } from '../data/circuit-presets'
import CircuitBuilder from '../components/circuit/CircuitBuilder'
import { Button } from '../components/ui/button'
import { cn } from '../lib/utils'
import type { CircuitDefinition } from '../types'

// ── Preset Card ────────────────────────────────────────────────────────────────

function PresetCard({
  preset,
  isSelected,
  onSelect,
  l,
  t,
}: {
  preset: CircuitPreset
  isSelected: boolean
  onSelect: () => void
  l: (field: Record<string, string> | string | undefined | null) => string
  t: (key: string) => string
}) {
  return (
    <button
      type="button"
      className={cn(
        'w-full text-left p-4 rounded-xl border transition-colors',
        isSelected
          ? 'bg-lime/10 border-lime/30'
          : 'bg-muted/20 border-border hover:border-lime/20',
      )}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">{l(preset.name)}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{l(preset.description)}</p>
        </div>
        <span
          className={cn(
            'text-xs font-medium px-2.5 py-1 rounded-lg transition-colors',
            isSelected
              ? 'bg-lime/20 text-lime'
              : 'bg-muted/50 text-muted-foreground',
          )}
        >
          {isSelected ? t('circuit.selected') : t('circuit.select')}
        </span>
      </div>
    </button>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default function CircuitPage() {
  const { t } = useTranslation()
  const l = useLocalize()
  const navigate = useNavigate()
  const { startCircuit } = useCircuitSession()

  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)
  const [showCustomBuilder, setShowCustomBuilder] = useState(false)

  const selectedPreset = CIRCUIT_PRESETS.find((p) => p.id === selectedPresetId) ?? null

  const handleSelectPreset = (preset: CircuitPreset) => {
    if (selectedPresetId === preset.id) {
      setSelectedPresetId(null)
    } else {
      setSelectedPresetId(preset.id)
      setShowCustomBuilder(false)
    }
  }

  const handleCustom = () => {
    setSelectedPresetId(null)
    setShowCustomBuilder((prev) => !prev)
  }

  const handleStart = (circuit: CircuitDefinition) => {
    const source = selectedPresetId ? 'preset' : 'custom'
    startCircuit(circuit, source)
    navigate('/circuit/active')
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-24">
      {/* Header */}
      <h1 className="text-xl font-bold mb-5">{t('circuit.pageTitle')}</h1>

      {/* Preset cards */}
      <section className="space-y-2.5 mb-5">
        <h2 className="text-sm font-medium text-muted-foreground">{t('circuit.presets')}</h2>
        {CIRCUIT_PRESETS.map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            isSelected={selectedPresetId === preset.id}
            onSelect={() => handleSelectPreset(preset)}
            l={l}
            t={t}
          />
        ))}
      </section>

      {/* Build custom button */}
      <Button
        variant="outline"
        className={cn('w-full mb-5', showCustomBuilder && 'border-lime/30 text-lime')}
        onClick={handleCustom}
      >
        {t('circuit.buildCustom')}
      </Button>

      {/* Builder */}
      {(selectedPreset || showCustomBuilder) && (
        <CircuitBuilder
          initialPreset={selectedPreset?.template}
          onStart={handleStart}
        />
      )}
    </div>
  )
}
