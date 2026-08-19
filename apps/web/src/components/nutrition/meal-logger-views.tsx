/**
 * Fragmentos de vista del registro de comidas web (#477).
 *
 * Espejo de `apps/mobile/src/components/nutrition/meal-logger-views.tsx`: son
 * trozos de UI sin estado propio; todo sale del modelo de `useMealLogger`.
 */
import i18n from '../../lib/i18n'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import FoodNameInput from './FoodNameInput'
import PortionInput from './PortionInput'
import type { FoodItem, MealType, NutritionEntry } from '@calistenia/core/types'
import { MAX_PHOTOS } from './meal-logger-shared'
import type { MealLoggerModel } from './use-meal-logger'
import { BackIcon, CameraIcon, CloseIcon, GalleryIcon, SearchIcon, TemplateIcon } from './meal-logger-icons'

type ModelProps = { model: MealLoggerModel }

export function ErrorBanner({ error }: { error: string }) {
  return (
    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400" role="alert">
      {error}
    </div>
  )
}

/** Selector de tipo de comida del paso de captura. */
export function MealTypeSelector({ model }: ModelProps) {
  const { t, mealType, setMealType, mealOptions } = model
  return (
    <div id="tour-meallog-type" className="flex gap-1.5 p-1 bg-muted/50 rounded-xl">
      {mealOptions.map(opt => (
        <button
          key={opt.id}
          type="button"
          onClick={() => setMealType(opt.id)}
          aria-pressed={mealType === opt.id}
          className={cn(
            'flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg text-center transition-all',
            mealType === opt.id
              ? 'bg-background shadow-sm ring-1 ring-lime-400/30 text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <span className="text-base leading-none">{opt.icon}</span>
          <span className="text-[10px] font-mono tracking-wide">{t(opt.labelKey)}</span>
        </button>
      ))}
    </div>
  )
}

/** Cambio rápido de tipo de comida del paso de revisión. */
export function MealTypeQuickSwitch({ model }: ModelProps) {
  const { t, mealType, setMealType, mealOptions } = model
  return (
    <div className="flex gap-1">
      {mealOptions.map(opt => (
        <button
          key={opt.id}
          onClick={() => setMealType(opt.id)}
          className={cn(
            'size-8 rounded-lg flex items-center justify-center text-sm transition-all',
            mealType === opt.id
              ? 'bg-lime-400/10 ring-1 ring-lime-400/30'
              : 'hover:bg-muted text-muted-foreground'
          )}
          title={t(opt.labelKey)}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  )
}

/** Tira de fotos + botones de añadir, con la descripción para la IA. */
export function PhotoStrip({ model }: ModelProps) {
  const { t, imagePreviews, imageFiles, removePhoto, openCamera, openGallery, imageDescription, setImageDescription, handleAnalyze } = model
  return (
    <div className="space-y-3">
      {/* Photo strip */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
        {imagePreviews.map((preview, i) => (
          <div key={i} className="relative shrink-0 w-[calc(50%-4px)] max-w-[180px] aspect-square rounded-xl overflow-hidden">
            <img src={preview} alt={t('nutrition.photo', { number: i + 1 })} className="w-full h-full object-cover" />
            <button
              onClick={() => removePhoto(i)}
              className="absolute top-1.5 right-1.5 size-6 rounded-full bg-background/80 backdrop-blur-sm text-foreground flex items-center justify-center hover:bg-background transition-colors"
              aria-label={`${t('common.delete')} ${t('nutrition.photo', { number: i + 1 })}`}
            >
              <CloseIcon className="size-3" />
            </button>
            <div className="absolute bottom-1.5 left-1.5 text-[9px] font-mono text-white/70 bg-black/40 backdrop-blur-sm px-1.5 py-0.5 rounded">
              {i + 1}/{imagePreviews.length}
            </div>
          </div>
        ))}
        {imageFiles.length < MAX_PHOTOS && (
          <div className="shrink-0 w-[calc(50%-4px)] max-w-[180px] aspect-square rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2">
            <span className="text-[9px] font-mono text-muted-foreground/50 tracking-wide">
              {imageFiles.length}/{MAX_PHOTOS}
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={openCamera}
                className="size-9 rounded-lg flex items-center justify-center hover:bg-lime-400/10 transition-colors"
                aria-label="Tomar foto"
              >
                <CameraIcon className="size-4 text-muted-foreground/60" />
              </button>
              <button
                onClick={openGallery}
                className="size-9 rounded-lg flex items-center justify-center hover:bg-lime-400/10 transition-colors"
                aria-label={t('nutrition.chooseFromGallery')}
              >
                <GalleryIcon className="size-4 text-muted-foreground/60" />
              </button>
            </div>
          </div>
        )}
      </div>
      {/* Description field for AI context */}
      <div className="relative">
        <textarea
          value={imageDescription}
          onChange={e => setImageDescription(e.target.value)}
          placeholder={t('nutrition.logger.describeFood')}
          maxLength={500}
          rows={2}
          className="w-full text-base px-3.5 py-3 rounded-xl border border-border bg-muted/30 focus:outline-none focus:border-lime-400/40 focus:ring-1 focus:ring-lime-400/20 placeholder:text-muted-foreground/40 transition-all resize-none leading-relaxed"
        />
        {imageDescription && (
          <div className="absolute bottom-2 right-3 text-[9px] text-muted-foreground/40 tabular-nums">
            {imageDescription.length}/500
          </div>
        )}
      </div>
      <Button
        variant="limeSolid"
        onClick={handleAnalyze}
        className="w-full h-12 font-bebas text-base tracking-widest shadow-lg shadow-lime-400/10"
      >
        {t('nutrition.logger.analyzeWithAI')}
      </Button>
    </div>
  )
}

/** Hora exacta de fin + duración opcional. */
export function MealTimingRow({ model }: ModelProps) {
  const { t, eatenHour, setEatenHour, eatenMinute, setEatenMinute, durationInput, setDurationInput } = model
  return (
    <div className="flex items-center gap-4 p-3 rounded-xl bg-muted/30 border border-border/50">
      <div className="space-y-1">
        <div className="text-[9px] text-muted-foreground tracking-widest uppercase">{t('nutrition.logger.finishedAt')}</div>
        <div className="flex items-center">
          <input
            value={eatenHour}
            onChange={e => setEatenHour(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
            onBlur={() => { const n = parseInt(eatenHour, 10); setEatenHour(isNaN(n) ? '' : String(Math.min(23, Math.max(0, n))).padStart(2, '0')) }}
            inputMode="numeric"
            aria-label={t('nutrition.logger.finishedAt')}
            className="w-12 h-10 text-center rounded-lg bg-background border border-input font-bebas text-xl focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lime-400/30"
          />
          <span className="font-bebas text-xl text-muted-foreground mx-1">:</span>
          <input
            value={eatenMinute}
            onChange={e => setEatenMinute(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
            onBlur={() => { const n = parseInt(eatenMinute, 10); setEatenMinute(isNaN(n) ? '' : String(Math.min(59, Math.max(0, n))).padStart(2, '0')) }}
            inputMode="numeric"
            aria-label={t('nutrition.logger.duration')}
            className="w-12 h-10 text-center rounded-lg bg-background border border-input font-bebas text-xl focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lime-400/30"
          />
        </div>
      </div>
      <div className="space-y-1 flex-1">
        <div className="text-[9px] text-muted-foreground tracking-widest uppercase">{t('nutrition.logger.duration')}</div>
        <div className="flex items-center gap-1.5">
          <input
            value={durationInput}
            onChange={e => setDurationInput(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
            inputMode="numeric"
            placeholder="—"
            className="w-16 h-10 text-center rounded-lg bg-background border border-input font-bebas text-xl focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lime-400/30"
          />
          <span className="text-[11px] text-muted-foreground">{t('nutrition.logger.durationUnit')}</span>
        </div>
      </div>
    </div>
  )
}

/** Chips de añadido rápido: recientes + habituales a esta hora. */
export function QuickAddChips({ model }: ModelProps) {
  const { t, recentFoods, hourSuggestions, addRecentFood } = model
  if (recentFoods.length === 0 && hourSuggestions.length === 0) return null
  return (
    <div className="space-y-2">
      {hourSuggestions.length > 0 && (
        <div>
          <div className="text-[9px] text-muted-foreground tracking-widest uppercase mb-1.5">{t('nutrition.logger.usualAtThisHour')}</div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
            {hourSuggestions.map((food, i) => (
              <button
                key={`h-${i}`}
                onClick={() => addRecentFood(food)}
                className="shrink-0 min-h-[36px] px-3 py-1.5 rounded-full border border-lime-400/30 bg-lime-400/5 text-xs text-lime-400 hover:bg-lime-400/10 active:bg-lime-400/20 transition-colors"
              >
                + <span className="truncate max-w-[20ch] inline-block align-bottom">{food.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {recentFoods.length > 0 && (
        <div>
          <div className="text-[9px] text-muted-foreground tracking-widest uppercase mb-1.5">{t('nutrition.logger.recents')}</div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
            {recentFoods.map((food, i) => (
              <button
                key={`r-${i}`}
                onClick={() => addRecentFood(food)}
                className="shrink-0 min-h-[36px] px-3 py-1.5 rounded-full border border-border text-xs text-muted-foreground hover:border-lime-400/40 hover:text-foreground active:bg-muted/50 transition-colors"
              >
                + <span className="truncate max-w-[20ch] inline-block align-bottom">{food.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const MACROS = [
  { field: 'calories' as const, label: 'kcal', color: 'text-foreground font-medium', suffix: ' kcal', round: true },
  { field: 'protein' as const, label: 'P', color: 'text-sky-500', suffix: 'g P', round: false },
  { field: 'carbs' as const, label: 'C', color: 'text-amber-400', suffix: 'g C', round: false },
  { field: 'fat' as const, label: 'G', color: 'text-pink-500', suffix: 'g G', round: false },
] as const

/** Una comida del paso de revisión: nombre, porción y macros editables. */
export function FoodItemCard({ model, food, index }: ModelProps & { food: FoodItem; index: number }) {
  const { t, recentFoods, updateFood, removeFood, selectCatalogFood, handlePortionChange, editingMacro, setEditingMacro, commitMacroEdit } = model
  return (
    <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
      {/* Food header */}
      <div className="flex items-center gap-2 p-3 pb-2">
        <div className="flex-1 min-w-0">
          <FoodNameInput
            value={food.name}
            onChange={val => updateFood(index, 'name', val)}
            onFoodSelect={selected => selectCatalogFood(index, selected as FoodItem)}
            recentFoods={recentFoods}
          />
        </div>
        <button
          onClick={() => removeFood(index)}
          className="size-9 flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded-lg shrink-0 transition-colors -mr-1"
          aria-label={`${t('common.delete')} ${food.name || t('nutrition.addFood')}`}
        >
          <CloseIcon className="size-3.5" />
        </button>
      </div>

      {/* Portion */}
      <div className="px-3 pb-2">
        <PortionInput
          amount={food.portionAmount}
          unit={food.portionUnit}
          unitWeight={food.unitWeightInGrams}
          onChange={(amount, unit, unitWeight) => handlePortionChange(index, amount, unit, unitWeight)}
          category={food.category}
          portionNote={food.portionNote}
        />
      </div>

      {/* Macros row — tap to edit inline */}
      <div className="px-3 py-2 bg-muted/30 border-t border-border/50">
        <div className="flex items-center gap-1 text-xs">
          {MACROS.map(macro => {
            const isEditing = editingMacro?.index === index && editingMacro?.field === macro.field
            const rawVal = Number(food[macro.field]) || 0
            const displayVal = macro.round ? Math.round(rawVal) : Math.round(rawVal * 10) / 10

            if (isEditing) {
              return (
                <input
                  key={macro.field}
                  type="number"
                  inputMode="decimal"
                  autoFocus
                  defaultValue={displayVal}
                  onBlur={e => {
                    const val = macro.round ? parseInt(e.target.value) || 0 : parseFloat(e.target.value) || 0
                    commitMacroEdit(index, macro.field, val)
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') setEditingMacro(null)
                  }}
                  className={cn('w-16 h-8 text-base px-1 rounded-lg border border-lime-400/40 bg-background text-center tabular-nums', macro.color)}
                />
              )
            }

            return (
              <button
                key={macro.field}
                type="button"
                onClick={() => setEditingMacro({ index, field: macro.field })}
                className={cn(
                  'min-h-[36px] px-2 py-1.5 rounded-lg tabular-nums transition-colors',
                  'active:bg-muted/60 active:ring-1 active:ring-border/50',
                  macro.color,
                )}
                title={`Editar ${macro.label}`}
              >
                {displayVal}{macro.suffix}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Totales de la comida en curso. */
export function TotalsSummary({ model }: ModelProps) {
  const { t, totals } = model
  return (
    <div className="p-4 bg-muted/40 rounded-xl border border-border/50">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[9px] text-muted-foreground tracking-widest uppercase">Total</span>
        <span className="font-bebas text-2xl tabular-nums">{Math.round(totals.calories)} kcal</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center p-2 bg-background/50 rounded-lg">
          <div className="font-bebas text-lg text-sky-500 tabular-nums">{Math.round(totals.protein)}g</div>
          <div className="text-[9px] text-muted-foreground tracking-wide">{t('nutrition.protein')}</div>
        </div>
        <div className="text-center p-2 bg-background/50 rounded-lg">
          <div className="font-bebas text-lg text-amber-400 tabular-nums">{Math.round(totals.carbs)}g</div>
          <div className="text-[9px] text-muted-foreground tracking-wide">{t('nutrition.carbs')}</div>
        </div>
        <div className="text-center p-2 bg-background/50 rounded-lg">
          <div className="font-bebas text-lg text-pink-500 tabular-nums">{Math.round(totals.fat)}g</div>
          <div className="text-[9px] text-muted-foreground tracking-wide">{t('nutrition.fat')}</div>
        </div>
      </div>
    </div>
  )
}

/** Guardar la comida en curso como plantilla. */
export function SaveTemplateRow({ model }: ModelProps) {
  const { t, showSaveTemplate, setShowSaveTemplate, templateName, setTemplateName, handleSaveTemplate } = model

  if (!showSaveTemplate) {
    return (
      <button
        onClick={() => setShowSaveTemplate(true)}
        className="w-full flex items-center justify-center gap-2 min-h-[40px] py-2 text-xs text-muted-foreground tracking-widest hover:text-lime-400 active:text-lime-300 transition-colors"
      >
        <TemplateIcon className="size-3" />
        {t('nutrition.logger.saveAsTemplate')}
      </button>
    )
  }

  return (
    <div className="flex gap-2 items-center">
      <input
        value={templateName}
        onChange={e => setTemplateName(e.target.value)}
        placeholder={t('nutrition.logger.templateNamePlaceholder')}
        maxLength={100}
        aria-label={t('nutrition.logger.templateNamePlaceholder')}
        className="flex-1 h-10 text-base px-3 rounded-lg border border-input bg-transparent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lime-400/20"
      />
      <Button
        size="sm"
        variant="limeSolid"
        onClick={handleSaveTemplate}
        disabled={!templateName.trim()}
        className="h-9 text-[10px] tracking-widest"
      >
        OK
      </Button>
      <button
        onClick={() => setShowSaveTemplate(false)}
        className="size-9 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg shrink-0"
        aria-label={t('nutrition.logger.cancelTemplate')}
      >
        <CloseIcon className="size-3" />
      </button>
    </div>
  )
}

/** Sub-vista "repetir comida": buscador, filtros y lista paginada. */
export function RepeatMealView({ model }: ModelProps) {
  const {
    t, setCaptureSubView, recentEntries, recentSearch, setRecentSearch,
    recentTypeFilter, setRecentTypeFilter, setRecentPage, resetRecentFilters,
    filteredRecentEntries, paginatedRecentEntries, hasMoreRecent, selectRecentEntry, mealOptions,
  } = model

  return (
    <div className="space-y-3 motion-safe:animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={() => { setCaptureSubView('main'); resetRecentFilters() }} className="size-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors">
          <BackIcon className="size-4 text-muted-foreground" />
        </button>
        <div className="font-bebas text-lg tracking-wide">{t('nutrition.logger.recentMeals')}</div>
      </div>
      {recentEntries.length > 0 && (
        <>
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={recentSearch}
              onChange={e => { setRecentSearch(e.target.value); setRecentPage(1) }}
              placeholder={t('nutrition.logger.searchDish')}
              className="w-full pl-9 pr-8 py-2 text-sm bg-muted/30 border border-border rounded-lg focus:outline-none focus:border-lime-400/80 focus:ring-1 focus:ring-lime-400/30 placeholder:text-muted-foreground/50 transition-colors"
            />
            {recentSearch && (
              <button
                onClick={() => { setRecentSearch(''); setRecentPage(1) }}
                className="absolute right-2 top-1/2 -translate-y-1/2 size-5 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label={t('nutrition.logger.clearSearch')}
              >
                <CloseIcon className="size-3" />
              </button>
            )}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {(['' as const, ...mealOptions.map(m => m.id)]).map(type => (
              <button
                key={type || 'all'}
                onClick={() => { setRecentTypeFilter(type as MealType | ''); setRecentPage(1) }}
                className={cn(
                  'px-2.5 py-1 text-[11px] rounded-full border transition-colors',
                  recentTypeFilter === type
                    ? 'bg-lime-400/15 border-lime-400/40 text-lime-400'
                    : 'bg-muted/30 border-border text-muted-foreground hover:border-lime-400/20'
                )}
              >
                {type ? t(mealOptions.find(m => m.id === type)!.labelKey) : t('nutrition.logger.all')}
              </button>
            ))}
          </div>
        </>
      )}
      {filteredRecentEntries.length === 0 ? (
        <div className="text-center py-10">
          <div className="text-2xl mb-2">🍽️</div>
          <div className="text-sm text-muted-foreground">
            {recentSearch.trim() || recentTypeFilter ? t('common.noResults') : t('nutrition.logger.noRecentMeals')}
          </div>
          {(recentSearch.trim() || recentTypeFilter) && (
            <button
              onClick={resetRecentFilters}
              className="mt-2 text-xs text-lime-400 hover:underline"
            >
              {t('nutrition.logger.clearFilters')}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {paginatedRecentEntries.map((entry: NutritionEntry, i: number) => (
            <button
              key={entry.id || i}
              onClick={() => selectRecentEntry(entry)}
              className="w-full text-left p-3.5 bg-muted/30 border border-border rounded-xl hover:border-lime-400/30 hover:bg-lime-400/[0.03] transition-all"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-mono tracking-widest px-2 py-0.5 rounded-full uppercase bg-muted text-muted-foreground">
                  {entry.mealType}
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {new Date(entry.loggedAt).toLocaleDateString(i18n.language, { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
              <div className="text-sm text-foreground leading-snug truncate">
                {entry.foods.map(f => f.name).filter(Boolean).join(', ') || t('nutrition.noName')}
              </div>
              <div className="flex gap-3 mt-1.5 text-[10px] text-muted-foreground">
                <span className="text-xs font-semibold text-foreground/80">{Math.round(entry.totalCalories)} kcal</span>
                <span className="text-sky-500">P {Math.round(entry.totalProtein)}g</span>
                <span className="text-amber-400">C {Math.round(entry.totalCarbs)}g</span>
                <span className="text-pink-500">G {Math.round(entry.totalFat)}g</span>
              </div>
            </button>
          ))}
          {hasMoreRecent && (
            <button
              onClick={() => setRecentPage((p: number) => p + 1)}
              className="w-full py-2.5 text-xs text-muted-foreground hover:text-lime-400 border border-dashed border-border rounded-xl hover:border-lime-400/30 transition-colors"
            >
              {t('nutrition.logger.seeMore', { count: filteredRecentEntries.length - paginatedRecentEntries.length })}
            </button>
          )}
          <div className="text-center text-[10px] text-muted-foreground/50 tabular-nums">
            {t('nutrition.logger.mealCount', { count: filteredRecentEntries.length })}
            {recentEntries.length !== filteredRecentEntries.length && ` de ${recentEntries.length}`}
          </div>
        </div>
      )}
    </div>
  )
}

/** Sub-vista "mis plantillas". */
export function TemplatesView({ model }: ModelProps) {
  const { t, setCaptureSubView, templates, selectTemplate, handleDeleteTemplate } = model
  return (
    <div className="space-y-3 motion-safe:animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={() => setCaptureSubView('main')} className="size-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors">
          <BackIcon className="size-4 text-muted-foreground" />
        </button>
        <div className="font-bebas text-lg tracking-wide">{t('nutrition.logger.myTemplates')}</div>
      </div>
      {templates.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-2xl mb-2">📋</div>
          <div className="text-sm text-muted-foreground">{t('nutrition.logger.noTemplates')}</div>
          <div className="text-xs text-muted-foreground/60 mt-1">{t('nutrition.logger.saveTemplateHint')}</div>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map(tmpl => (
            <div key={tmpl.id} className="flex items-center gap-2">
              <button
                onClick={() => selectTemplate(tmpl)}
                className="flex-1 text-left p-3.5 bg-muted/30 border border-border rounded-xl hover:border-lime-400/30 hover:bg-lime-400/[0.03] transition-all"
              >
                <div className="text-sm font-medium">{tmpl.name}</div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {t('nutrition.foodCount', { count: tmpl.foods.length })} · {Math.round(tmpl.foods.reduce((s, f) => s + (f.calories || 0), 0))} kcal
                </div>
              </button>
              <button
                onClick={() => handleDeleteTemplate(tmpl.id!)}
                className="size-9 flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded-lg shrink-0 transition-colors"
                aria-label={`${t('common.delete')} ${tmpl.name}`}
              >
                <CloseIcon className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
