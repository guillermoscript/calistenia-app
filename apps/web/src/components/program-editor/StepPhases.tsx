/**
 * Paso 2 del editor de programas web (#223/#478): fases del programa.
 * Extraído de ProgramEditorPage.tsx:323-396, sin cambios de markup.
 */
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import type { EditorPhase } from '@calistenia/core/hooks/useProgramEditor'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Card, CardContent } from '../ui/card'
import { COLOR_SWATCHES } from './constants'

interface StepPhasesProps {
  phases: EditorPhase[]
  addPhase: () => void
  removePhase: (index: number) => void
  updatePhase: (index: number, data: Partial<EditorPhase>) => void
}

export function StepPhases({ phases, addPhase, removePhase, updatePhase }: StepPhasesProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div className="font-bebas text-2xl tracking-wide">FASES DEL PROGRAMA</div>
        {phases.length < 8 && (
          <Button
            onClick={addPhase}
            size="sm"
            className="h-8 text-[10px] tracking-wide bg-[hsl(var(--lime))] text-black hover:bg-[hsl(var(--lime))]/90"
          >
            + AGREGAR FASE
          </Button>
        )}
      </div>

      {phases.map((phase, pi) => (
        <Card key={pi} className="border-l-[3px]" style={{ borderLeftColor: phase.color }}>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-mono text-[10px] text-muted-foreground tracking-[2px]">FASE {pi + 1}</div>
              {phases.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removePhase(pi)}
                  className="h-7 px-2 text-[10px] text-muted-foreground hover:text-red-400"
                >
                  ELIMINAR
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-muted-foreground tracking-widest uppercase block mb-1">{t('programEditor.phaseName')}</label>
                <Input
                  value={phase.name}
                  onChange={e => updatePhase(pi, { name: e.target.value })}
                  placeholder={t('programEditor.phaseNamePlaceholder')}
                  className="text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground tracking-widest uppercase block mb-1">{t('programEditor.weeks')}</label>
                <Input
                  value={phase.weeks}
                  onChange={e => updatePhase(pi, { weeks: e.target.value })}
                  placeholder={t('programEditor.weeksPlaceholder')}
                  className="text-sm"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-muted-foreground tracking-widest uppercase block mb-1.5">Color</label>
              <div className="flex gap-2">
                {COLOR_SWATCHES.map(swatch => (
                  <button
                    key={swatch.name}
                    onClick={() => updatePhase(pi, { color: swatch.color, bgColor: swatch.bg })}
                    className={cn(
                      'size-7 rounded-full border-2 transition-all',
                      phase.color === swatch.color ? 'border-foreground scale-110' : 'border-transparent'
                    )}
                    style={{ backgroundColor: swatch.color }}
                  />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
