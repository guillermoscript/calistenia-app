import { useState } from 'react'
import { Info } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { QualityScoreBadge } from './QualityScoreBadge'
import { useTranslation } from 'react-i18next'
import type { QualityScore } from '../../types'

const CRITERIA: { score: QualityScore; labelKey: string; exampleKey: string }[] = [
  { score: 'A', labelKey: 'nutrition.criteriaA.label', exampleKey: 'nutrition.criteriaA.example' },
  { score: 'B', labelKey: 'nutrition.criteriaB.label', exampleKey: 'nutrition.criteriaB.example' },
  { score: 'C', labelKey: 'nutrition.criteriaC.label', exampleKey: 'nutrition.criteriaC.example' },
  { score: 'D', labelKey: 'nutrition.criteriaD.label', exampleKey: 'nutrition.criteriaD.example' },
  { score: 'E', labelKey: 'nutrition.criteriaE.label', exampleKey: 'nutrition.criteriaE.example' },
]

interface ScoreCriteriaDialogProps {
  /** Controlled mode — parent manages open state */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function ScoreCriteriaDialog({ open: controlledOpen, onOpenChange }: ScoreCriteriaDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const { t } = useTranslation()

  const isOpen = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen

  return (
    <>
      {/* Show trigger button only in uncontrolled mode */}
      {controlledOpen === undefined && (
        <button
          type="button"
          className="size-11 rounded-full inline-flex items-center justify-center hover:bg-muted transition-colors focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setOpen(true)}
          aria-label={t('nutrition.scoreCriteriaTitle', 'Criterios de puntuación')}
        >
          <Info className="size-4 text-muted-foreground" />
        </button>
      )}

      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('nutrition.scoreCriteriaTitle', 'Cómo se calcula el score')}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            {CRITERIA.map(({ score, labelKey, exampleKey }) => (
              <div key={score} className="flex items-start gap-3">
                <QualityScoreBadge score={score} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{t(labelKey, getFallbackLabel(score))}</p>
                  <p className="text-xs text-muted-foreground">{t(exampleKey, getFallbackExample(score))}</p>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function getFallbackLabel(score: QualityScore): string {
  const labels: Record<QualityScore, string> = {
    A: 'Excelente',
    B: 'Bueno',
    C: 'Aceptable',
    D: 'Pobre',
    E: 'Malo',
  }
  return labels[score]
}

function getFallbackExample(score: QualityScore): string {
  const examples: Record<QualityScore, string> = {
    A: 'Nutritivo y equilibrado. Ej: pechuga + arroz integral + verduras',
    B: 'Sólido con áreas menores a mejorar. Ej: avena con fruta, falta proteína',
    C: 'Neutral, ni bueno ni malo. Ej: sandwich de jamón, funcional pero procesado',
    D: 'Baja calidad nutricional o mal horario. Ej: pizza congelada a las 11pm',
    E: 'Comida chatarra, ultraprocesada. Ej: Doritos con refresco de cena',
  }
  return examples[score]
}
