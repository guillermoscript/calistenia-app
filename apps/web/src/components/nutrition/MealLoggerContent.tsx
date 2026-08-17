/**
 * Registro de comidas web — cáscara fina (#477).
 *
 * Antes eran 1.441 líneas con la máquina de estados, la captura, la IA, las
 * plantillas y los iconos en el mismo fichero. Ahora el estado vive en
 * `useMealLogger` (que compone captura/análisis/guardado, como móvil en #470) y
 * cada paso es su propio componente. Aquí solo queda el cableado.
 */
import BarcodeScanner from './BarcodeScanner'
import { useMealLogger } from './use-meal-logger'
import { AnalyzingStep, CaptureStep, ReviewStep, SavingStep, SuccessStep } from './meal-logger-steps'
import type { MealLoggerContentProps } from './meal-logger-shared'

export type { MealLoggerContentProps }

export default function MealLoggerContent(props: MealLoggerContentProps) {
  const model = useMealLogger(props)
  const { t, step, scanning, barcodeLoading, barcodeError, handleBarcodeResult, closeScan, resetBarcode } = model

  return (
    <div className="space-y-4 motion-safe:animate-fade-in">
      {/* Barcode scanner overlay */}
      <BarcodeScanner
        scanning={scanning}
        onScan={handleBarcodeResult}
        onClose={closeScan}
      />

      {/* Barcode loading */}
      {barcodeLoading && (
        <div className="p-4 rounded-xl bg-muted/30 border border-border flex items-center gap-3">
          <div className="size-5 border-2 border-lime-400/30 border-t-lime-400 rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">{t('nutrition.logger.searchingNutrition')}</span>
        </div>
      )}

      {/* Barcode error */}
      {barcodeError && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-center justify-between">
          <span>{barcodeError}</span>
          <button onClick={resetBarcode} className="text-xs px-2 py-1 rounded bg-red-400/10 hover:bg-red-400/20 transition-colors">OK</button>
        </div>
      )}

      {step === 'capture' && <CaptureStep model={model} />}
      {step === 'analyzing' && <AnalyzingStep model={model} />}
      {step === 'review' && <ReviewStep model={model} />}
      {step === 'saving' && <SavingStep model={model} />}
      {step === 'success' && <SuccessStep model={model} />}
    </div>
  )
}
