/**
 * Los cinco pasos del registro de comidas web (#477).
 *
 * Espejo de `apps/mobile/src/components/nutrition/meal-logger-steps.tsx`: cada
 * paso recibe el modelo de `useMealLogger` y no tiene estado propio.
 */
import { Button } from '../ui/button'
import MealProgressBar from './MealProgressBar'
import type { MealLoggerModel } from './use-meal-logger'
import {
  ErrorBanner, FoodItemCard, MealTimingRow, MealTypeQuickSwitch, MealTypeSelector,
  PhotoStrip, QuickAddChips, RepeatMealView, SaveTemplateRow, TemplatesView, TotalsSummary,
} from './meal-logger-views'
import { BackIcon, BarcodeIcon, CameraIcon, GalleryIcon, PencilIcon, PlusIcon, RepeatIcon, TemplateIcon } from './meal-logger-icons'

type StepProps = { model: MealLoggerModel }

export function CaptureStep({ model }: StepProps) {
  const {
    t, captureSubView, quickText, setQuickText, handleAnalyzeText, handleQuickTextSubmit,
    cameraInputRef, galleryInputRef, handleFileChange, openCamera, openGallery,
    imagePreviews, startManualEntry, loadRepeatMeal, loadTemplates, startScan, error,
  } = model

  return (
    <div className="space-y-5 motion-safe:animate-fade-in">
      {captureSubView === 'main' && (
        <>
          {/* ── Meal type selector ── */}
          <MealTypeSelector model={model} />

          {/* ── Main input area ── */}
          <div id="tour-meallog-input" className="space-y-3">
            {/* AI text input — write meal description, AI fills macros */}
            <form
              onSubmit={e => { e.preventDefault(); handleAnalyzeText() }}
              className="space-y-2"
            >
              <div className="relative">
                <textarea
                  value={quickText}
                  onChange={e => setQuickText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      handleAnalyzeText()
                    }
                  }}
                  placeholder={t('nutrition.logger.aiTextPlaceholder')}
                  aria-label={t('nutrition.logger.aiTextPlaceholder')}
                  maxLength={500}
                  rows={3}
                  className="w-full text-base px-4 py-3 rounded-xl border border-border bg-muted/30 focus:outline-none focus:border-lime-400/40 focus:ring-1 focus:ring-lime-400/20 placeholder:text-muted-foreground/50 transition-all resize-none leading-relaxed"
                />
                {quickText && (
                  <div className="absolute bottom-2 right-3 text-[9px] text-muted-foreground/40 tabular-nums">
                    {quickText.length}/500
                  </div>
                )}
              </div>
              {quickText.trim() && (
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    variant="limeSolid"
                    className="flex-1 h-11 font-bebas text-sm tracking-widest shadow-lg shadow-lime-400/10"
                  >
                    ✨ {t('nutrition.logger.analyzeWithAI')}
                  </Button>
                  <button
                    type="button"
                    onClick={handleQuickTextSubmit}
                    className="px-3 h-11 rounded-xl border border-border text-[10px] font-mono tracking-widest text-muted-foreground hover:text-foreground hover:border-lime-400/30 transition-colors"
                    title={t('nutrition.logger.manualWithoutAI')}
                  >
                    {t('nutrition.logger.manual')}
                  </button>
                </div>
              )}
            </form>

            {/* Hidden file inputs: camera (with capture) and gallery (without) */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />

            {imagePreviews.length > 0 ? (
              <PhotoStrip model={model} />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={openCamera}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-dashed border-border bg-muted/20 hover:border-lime-400/40 hover:bg-lime-400/5 transition-all"
                >
                  <CameraIcon className="size-6 text-muted-foreground" />
                  <span className="text-[10px] font-mono tracking-wide text-muted-foreground">{t('nutrition.logger.camera')}</span>
                </button>
                <button
                  onClick={openGallery}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-dashed border-border bg-muted/20 hover:border-lime-400/40 hover:bg-lime-400/5 transition-all"
                >
                  <GalleryIcon className="size-6 text-muted-foreground" />
                  <span className="text-[10px] font-mono tracking-wide text-muted-foreground">{t('nutrition.logger.gallery')}</span>
                </button>
                <button
                  onClick={startManualEntry}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-dashed border-border bg-muted/20 hover:border-lime-400/40 hover:bg-lime-400/5 transition-all"
                >
                  <PencilIcon className="size-6 text-muted-foreground" />
                  <span className="text-[10px] font-mono tracking-wide text-muted-foreground">{t('nutrition.logger.manual')}</span>
                </button>
                <button
                  onClick={loadRepeatMeal}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-dashed border-border bg-muted/20 hover:border-lime-400/40 hover:bg-lime-400/5 transition-all"
                >
                  <RepeatIcon className="size-6 text-muted-foreground" />
                  <span className="text-[10px] font-mono tracking-wide text-muted-foreground">{t('nutrition.logger.repeat')}</span>
                </button>
              </div>
            )}

            {/* Barcode scanner button */}
            <button
              id="tour-meallog-barcode"
              onClick={startScan}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl border border-dashed border-border bg-muted/20 hover:border-lime-400/40 hover:bg-lime-400/5 transition-all"
            >
              <BarcodeIcon className="size-5 text-muted-foreground" />
              <span className="text-[10px] font-mono tracking-wide text-muted-foreground">{t('nutrition.logger.scanBarcode')}</span>
            </button>
          </div>

          {/* Templates link */}
          <button
            onClick={loadTemplates}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-mono tracking-widest text-muted-foreground hover:text-lime-400 transition-colors"
          >
            <TemplateIcon className="size-3.5" />
            {t('nutrition.logger.myTemplates')}
          </button>

          {error && <ErrorBanner error={error} />}
        </>
      )}

      {captureSubView === 'repeatMeal' && <RepeatMealView model={model} />}

      {captureSubView === 'templates' && <TemplatesView model={model} />}
    </div>
  )
}

export function AnalyzingStep({ model }: StepProps) {
  const { t, imagePreviews, showBgOption, onSendToBackground, handleSendToBackground, cancelAnalysis } = model

  return (
    <div className="space-y-4 py-4 motion-safe:animate-fade-in" role="status" aria-label={t('nutrition.logger.analyzing')}>
      {imagePreviews.length > 0 ? (
        <div className="relative overflow-hidden rounded-xl">
          <img src={imagePreviews[0]} alt={t('nutrition.logger.analyzing')} className="w-full rounded-xl opacity-60" />
          {imagePreviews.length > 1 && (
            <div className="absolute top-2 left-2 text-[10px] font-mono text-white/80 bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded">
              {imagePreviews.length} {t('nutrition.logger.photos')}
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-lime-400/10 to-transparent animate-pulse" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center bg-background/70 backdrop-blur-sm rounded-xl px-6 py-4">
              <div className="inline-block size-6 border-2 border-lime-400/30 border-t-lime-400 rounded-full animate-spin mb-2" />
              <div className="text-sm text-foreground font-medium">{t('nutrition.logger.analyzing')}</div>
              <div className="text-[10px] text-muted-foreground mt-1">{t('nutrition.logger.detectingFoods')}</div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="text-center text-sm text-muted-foreground mb-4">{t('nutrition.logger.analyzing')}</div>
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="h-10 bg-muted rounded-lg animate-pulse"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </>
      )}
      {showBgOption && onSendToBackground ? (
        <button
          onClick={handleSendToBackground}
          className="w-full text-center text-xs text-lime-400 hover:text-lime-300 font-medium transition-colors py-2 motion-safe:animate-fade-in"
        >
          {t('nutrition.logger.dontWait')}
        </button>
      ) : !onSendToBackground ? (
        <button
          onClick={cancelAnalysis}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-2"
        >
          {t('nutrition.logger.cancel')}
        </button>
      ) : null}
    </div>
  )
}

export function ReviewStep({ model }: StepProps) {
  const { t, mealLabel, backToCapture, dailyTotals, totals, goals, foods, mealDescription, addFood, error, handleSave } = model

  return (
    <div className="space-y-4 motion-safe:animate-fade-in">
      {/* Meal type indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={backToCapture}
            className="size-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
          >
            <BackIcon className="size-4 text-muted-foreground" />
          </button>
          <span className="font-bebas text-lg tracking-wide">{mealLabel.toUpperCase()}</span>
        </div>
        {/* Meal type quick switch */}
        <MealTypeQuickSwitch model={model} />
      </div>

      {/* Meal timing: exact finish time + optional duration */}
      <MealTimingRow model={model} />

      {/* Daily progress context */}
      <MealProgressBar
        dailyTotals={dailyTotals}
        mealTotals={totals}
        goals={goals}
      />

      {/* Quick-add chips: recent + hourly */}
      <QuickAddChips model={model} />

      {/* Food items */}
      <div className="space-y-2.5">
        {foods.map((food, idx) => (
          <FoodItemCard key={idx} model={model} food={food} index={idx} />
        ))}
      </div>

      {/* AI meal description */}
      {mealDescription && (
        <div className="px-3 py-2.5 rounded-xl bg-lime-400/5 border border-lime-400/10 text-xs text-muted-foreground leading-relaxed">
          {mealDescription}
        </div>
      )}

      {/* Add food */}
      <button
        onClick={addFood}
        className="w-full flex items-center justify-center gap-2 min-h-[44px] py-3 rounded-xl border border-dashed border-border text-xs font-mono tracking-widest text-muted-foreground hover:border-lime-400/40 hover:text-lime-400 active:bg-lime-400/5 transition-colors"
      >
        <PlusIcon className="size-3.5" />
        {t('nutrition.logger.addFood')}
      </button>

      {/* Total summary */}
      <TotalsSummary model={model} />

      {/* Save as template */}
      <SaveTemplateRow model={model} />

      {error && <ErrorBanner error={error} />}

      {/* Save button */}
      <Button
        variant="limeSolid"
        onClick={handleSave}
        disabled={foods.length === 0}
        className="w-full h-12 font-bebas text-lg tracking-widest shadow-lg shadow-lime-400/10"
      >
        {t('nutrition.logger.saveMeal')}
      </Button>
    </div>
  )
}

export function SavingStep({ model }: StepProps) {
  const { t } = model
  return (
    <div className="py-12 text-center motion-safe:animate-fade-in" role="status">
      <div className="inline-block size-6 border-2 border-lime-400/30 border-t-lime-400 rounded-full animate-spin mb-3" />
      <div className="text-sm text-muted-foreground">{t('nutrition.logger.saving')}</div>
    </div>
  )
}

export function SuccessStep({ model }: StepProps) {
  const { t, mealLabel, totals, goals, dailyTotals, onSaveSuccess, handleResetForm } = model

  return (
    <div className="py-8 motion-safe:animate-fade-in">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center size-14 rounded-full bg-lime-400/10 border border-lime-400/20 mb-3 motion-safe:animate-scale-in">
          <svg className="size-7 text-lime-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div className="text-lime-400 font-bebas text-2xl tracking-wide">{t('nutrition.logger.mealRegistered')}</div>
      </div>

      {/* Meal summary */}
      <div className="p-4 bg-muted/30 border border-border rounded-xl space-y-3 mb-4">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-mono tracking-widest px-2 py-0.5 rounded-full uppercase bg-lime-400/10 text-lime-400 border border-lime-400/20">
            {mealLabel}
          </span>
          <span className="font-bebas text-lg tabular-nums">{Math.round(totals.calories)} kcal</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 bg-background/50 rounded-lg">
            <div className="font-bebas text-lg text-sky-500 tabular-nums">{Math.round(totals.protein)}g</div>
            <div className="text-[9px] text-muted-foreground">{t('nutrition.protein')}</div>
          </div>
          <div className="p-2 bg-background/50 rounded-lg">
            <div className="font-bebas text-lg text-amber-400 tabular-nums">{Math.round(totals.carbs)}g</div>
            <div className="text-[9px] text-muted-foreground">{t('nutrition.carbs')}</div>
          </div>
          <div className="p-2 bg-background/50 rounded-lg">
            <div className="font-bebas text-lg text-pink-500 tabular-nums">{Math.round(totals.fat)}g</div>
            <div className="text-[9px] text-muted-foreground">{t('nutrition.fat')}</div>
          </div>
        </div>
        {goals && (
          <div className="text-xs text-muted-foreground text-center pt-2 border-t border-border/50">
            {t('nutrition.logger.dailyProgress', { current: Math.round(dailyTotals.calories), goal: Math.round(goals.dailyCalories) })}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          variant="limeSolid"
          onClick={() => onSaveSuccess?.()}
          className="flex-1 h-11 font-bebas text-lg tracking-wide"
        >
          {t('nutrition.logger.done')}
        </Button>
        <Button
          variant="outline"
          onClick={handleResetForm}
          className="flex-1 h-11 font-bebas text-lg tracking-wide"
        >
          {t('nutrition.logger.registerAnother')}
        </Button>
      </div>
    </div>
  )
}
