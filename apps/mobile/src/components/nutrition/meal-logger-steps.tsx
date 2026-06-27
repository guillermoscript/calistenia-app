/**
 * Step components for the MealLogger state machine. Each renders one `step` and reads
 * everything it needs from the injected `model` (see useMealLogger).
 */
import { View, ScrollView, TextInput, Pressable, ActivityIndicator } from 'react-native'
import { Image as ExpoImage } from 'expo-image'
import { useTranslation } from 'react-i18next'
import { X, Camera, Image as ImageIcon, PenLine, RefreshCw, Plus, Check } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'

import { MAX_PHOTOS, MEAL_OPTIONS } from './meal-logger-shared'
import type { MealLoggerModel } from './use-meal-logger'
import QualityBreakdownPanel from './QualityBreakdownPanel'
import {
  MealTypeSelector,
  MealTimingRow,
  InputMethodCard,
  RepeatMealView,
  FoodItemCard,
  DailyProgressBar,
  TotalsSummary,
  MacroCell,
} from './meal-logger-views'

type StepProps = { model: MealLoggerModel }

// ── Capture ────────────────────────────────────────────────────────────────────

export function CaptureStep({ model }: StepProps) {
  const { t } = useTranslation()

  if (model.captureSubView === 'repeatMeal') {
    return (
      <RepeatMealView
        entries={model.filteredRecentEntries}
        allEntries={model.recentEntries}
        searchValue={model.recentSearch}
        onSearchChange={model.setRecentSearch}
        typeFilter={model.recentTypeFilter}
        onTypeFilterChange={model.setRecentTypeFilter}
        onSelect={model.selectRecentEntry}
        onBack={model.backFromRepeat}
        t={t}
      />
    )
  }

  return (
    <>
      {/* Meal type selector */}
      <MealTypeSelector value={model.mealType} onChange={model.selectMealType} t={t} />

      {/* Text analysis input */}
      <View className="gap-2">
        <TextInput
          ref={model.quickTextInputRef}
          value={model.quickText}
          onChangeText={model.setQuickText}
          placeholder={t('nutrition.logger.aiTextPlaceholder')}
          placeholderTextColor="#52525b"
          multiline
          numberOfLines={3}
          maxLength={500}
          textAlignVertical="top"
          className="px-4 py-3 rounded-xl border border-border bg-muted/30 text-foreground font-sans text-base leading-relaxed min-h-[72px]"
          style={{ minHeight: 72 }}
        />
        {model.quickText.trim().length > 0 && (
          <View className="flex-row gap-2">
            <Pressable
              onPress={model.handleAnalyzeText}
              className="flex-1 h-12 bg-lime-400 items-center justify-center rounded-xl active:bg-lime-300"
            >
              <Text className="font-bebas text-base tracking-widest text-zinc-900">
                ✨ {t('nutrition.logger.analyzeWithAI')}
              </Text>
            </Pressable>
            <Pressable
              onPress={model.createManualFoodsFromText}
              className="h-12 px-4 items-center justify-center rounded-xl border border-border active:bg-muted"
            >
              <Text className="font-mono text-[10px] tracking-widest text-muted-foreground">
                {t('nutrition.logger.manual')}
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Photo strip (when photos selected) */}
      {model.imageAssets.length > 0 ? (
        <View className="gap-3">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-1">
            {model.imageAssets.map((asset, i) => (
              <View key={i} className="relative rounded-xl overflow-hidden" style={{ width: 120, height: 120 }}>
                <ExpoImage
                  source={{ uri: asset.uri }}
                  style={{ width: 120, height: 120 }}
                  contentFit="cover"
                  recyclingKey={asset.uri}
                  cachePolicy="memory-disk"
                />
                <Pressable
                  onPress={() => model.removePhoto(i)}
                  className="absolute top-1.5 right-1.5 size-6 rounded-full bg-black/60 items-center justify-center"
                >
                  <X size={10} color="#ffffff" />
                </Pressable>
                <View className="absolute bottom-1.5 left-1.5 bg-black/50 rounded px-1 py-0.5">
                  <Text className="font-mono text-[9px] text-white/80">
                    {i + 1}/{model.imageAssets.length}
                  </Text>
                </View>
              </View>
            ))}
            {model.imageAssets.length < MAX_PHOTOS && (
              <View
                className="rounded-xl border-2 border-dashed border-border items-center justify-center gap-2 flex-row"
                style={{ width: 120, height: 120 }}
              >
                <Pressable
                  onPress={model.handleCamera}
                  className="size-9 items-center justify-center rounded-lg active:bg-lime-400/10"
                >
                  <Camera size={18} color="#71717a" />
                </Pressable>
                <Pressable
                  onPress={model.handleGallery}
                  className="size-9 items-center justify-center rounded-lg active:bg-lime-400/10"
                >
                  <ImageIcon size={18} color="#71717a" />
                </Pressable>
              </View>
            )}
          </ScrollView>

          {/* Optional image description */}
          <TextInput
            value={model.imageDescription}
            onChangeText={model.setImageDescription}
            placeholder={t('nutrition.logger.describeFood')}
            placeholderTextColor="#52525b"
            multiline
            numberOfLines={2}
            maxLength={500}
            textAlignVertical="top"
            className="px-3.5 py-3 rounded-xl border border-border bg-muted/30 text-foreground font-sans text-base leading-relaxed"
            style={{ minHeight: 56 }}
          />

          <Pressable
            onPress={model.handleAnalyzeImages}
            className="h-12 bg-lime-400 items-center justify-center rounded-xl active:bg-lime-300"
          >
            <Text className="font-bebas text-base tracking-widest text-zinc-900">
              ✨ {t('nutrition.logger.analyzeWithAI')}
            </Text>
          </Pressable>
        </View>
      ) : (
        /* Input method grid */
        <View className="flex-row flex-wrap gap-2">
          <InputMethodCard icon={<Camera size={22} color="#71717a" />} label={t('nutrition.logger.camera')} onPress={model.handleCamera} />
          <InputMethodCard icon={<ImageIcon size={22} color="#71717a" />} label={t('nutrition.logger.gallery')} onPress={model.handleGallery} />
          <InputMethodCard icon={<PenLine size={22} color="#71717a" />} label={t('nutrition.logger.manual')} onPress={model.startManualEntry} />
          <InputMethodCard icon={<RefreshCw size={22} color="#71717a" />} label={t('nutrition.logger.repeat')} onPress={model.loadRepeatMeal} />
        </View>
      )}

      {model.error && (
        <View className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <Text className="text-sm text-red-400">{model.error}</Text>
        </View>
      )}
    </>
  )
}

// ── Analyzing ──────────────────────────────────────────────────────────────────

export function AnalyzingStep({ model }: StepProps) {
  const { t } = useTranslation()
  return (
    <View className="py-10 items-center gap-6">
      {model.imageAssets.length > 0 ? (
        <View className="w-full rounded-xl overflow-hidden" style={{ maxHeight: 240 }}>
          <ExpoImage source={{ uri: model.imageAssets[0].uri }} style={{ width: '100%', height: 200, opacity: 0.6 }} contentFit="cover" cachePolicy="memory-disk" />
          <View className="absolute inset-0 items-center justify-center">
            <View className="bg-background/80 rounded-xl px-6 py-4 items-center gap-2">
              <ActivityIndicator size="small" color="#a3e635" />
              <Text className="font-sans text-sm text-foreground">{t('nutrition.logger.analyzing')}</Text>
            </View>
          </View>
        </View>
      ) : (
        <>
          <ActivityIndicator size="large" color="#a3e635" />
          <Text className="font-sans text-sm text-muted-foreground">{t('nutrition.logger.analyzing')}</Text>
          {[0, 1, 2].map((i) => (
            <View key={i} className="w-full h-10 rounded-lg bg-muted/40" style={{ opacity: 1 - i * 0.2 }} />
          ))}
        </>
      )}
      <Pressable onPress={model.cancelAnalysis} className="py-2 px-4">
        <Text className="font-mono text-xs tracking-widest text-muted-foreground">{t('nutrition.logger.cancel')}</Text>
      </Pressable>
    </View>
  )
}

// ── Review ─────────────────────────────────────────────────────────────────────

export function ReviewStep({ model }: StepProps) {
  const { t } = useTranslation()
  return (
    <>
      {/* Meal type quick switch */}
      <View className="flex-row items-center justify-between">
        <Text className="font-bebas text-xl tracking-wide text-foreground">{model.mealLabel.toUpperCase()}</Text>
        <View className="flex-row gap-1">
          {MEAL_OPTIONS.map((opt) => (
            <Pressable
              key={opt.id}
              onPress={() => model.selectMealType(opt.id)}
              className={cn(
                // active: estático — ver nota en MealTypeSelector (meal-logger-views).
                'size-9 rounded-lg items-center justify-center active:bg-muted',
                model.mealType === opt.id ? 'bg-lime-400/10 ring-1 ring-lime-400/30' : '',
              )}
            >
              <Text className="text-base">{opt.icon}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Meal timing: exact finish time + optional duration */}
      <MealTimingRow
        hour={model.eatenHour}
        minute={model.eatenMinute}
        duration={model.durationInput}
        onHourChange={model.setEatenHour}
        onMinuteChange={model.setEatenMinute}
        onDurationChange={model.setDurationInput}
        t={t}
      />

      {/* Daily progress context (compact) */}
      {model.goals && (
        <DailyProgressBar dailyTotals={model.dailyTotals} mealTotals={model.totals} goals={model.goals} t={t} />
      )}

      {/* Quick-add: recent foods */}
      {model.recentFoods.length > 0 && (
        <View className="gap-2">
          <Text className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            {t('nutrition.logger.recentMeals')}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1.5 px-0.5">
            {model.recentFoods.map((food, i) => (
              <Pressable
                key={`r-${i}`}
                onPress={() => model.addRecentFood(food)}
                className="px-3 py-1.5 rounded-full border border-border active:bg-muted/50"
                style={{ minHeight: 36, justifyContent: 'center' }}
              >
                <Text className="font-sans text-xs text-muted-foreground">+ {food.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Food items list */}
      <View className="gap-2.5">
        {model.foods.map((food, idx) => (
          <FoodItemCard
            key={idx}
            food={food}
            index={idx}
            editingMacro={model.editingMacro}
            editingMacroValue={model.editingMacroValue}
            onEditingMacroChange={model.setEditingMacro}
            onEditingMacroValueChange={model.setEditingMacroValue}
            onCommitMacro={model.commitMacroEdit}
            onUpdateFood={model.updateFood}
            onRemove={model.removeFood}
            t={t}
          />
        ))}
      </View>

      {/* AI meal description */}
      {model.mealDescription ? (
        <View className="px-3 py-2.5 rounded-xl bg-lime-400/5 border border-lime-400/10">
          <Text className="font-sans text-xs text-muted-foreground leading-relaxed">{model.mealDescription}</Text>
        </View>
      ) : null}

      {/* AI quality feedback — compact (score + summary + suggestion) mid-log;
          the full positives/negatives breakdown shows on the saved meal card. */}
      {model.analysisQuality?.score && model.analysisQuality.breakdown ? (
        <View className="rounded-xl border border-border bg-card px-4 py-3.5">
          <QualityBreakdownPanel
            score={model.analysisQuality.score}
            breakdown={model.analysisQuality.breakdown}
            message={model.analysisQuality.message}
            suggestion={model.analysisQuality.suggestion}
            compact
          />
        </View>
      ) : null}

      {/* Add food */}
      <Pressable
        onPress={model.addFood}
        className="flex-row items-center justify-center gap-2 min-h-[44px] rounded-xl border border-dashed border-border active:bg-lime-400/5"
      >
        <Plus size={14} color="#71717a" />
        <Text className="font-mono text-xs tracking-widest text-muted-foreground">{t('nutrition.logger.addFood')}</Text>
      </Pressable>

      {/* Total summary */}
      <TotalsSummary totals={model.totals} t={t} />

      {model.error && (
        <View className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <Text className="text-sm text-red-400">{model.error}</Text>
        </View>
      )}

      {/* Save button */}
      <Pressable
        onPress={model.handleSave}
        disabled={model.foods.length === 0}
        className={cn(
          'h-14 items-center justify-center rounded-xl',
          model.foods.length === 0 ? 'bg-lime-400/50' : 'bg-lime-400 active:bg-lime-300',
        )}
      >
        <Text className="font-bebas text-lg tracking-widest text-zinc-900">{t('nutrition.logger.saveMeal')}</Text>
      </Pressable>
    </>
  )
}

// ── Saving ─────────────────────────────────────────────────────────────────────

export function SavingStep() {
  const { t } = useTranslation()
  return (
    <View className="py-16 items-center gap-4">
      <ActivityIndicator size="large" color="#a3e635" />
      <Text className="font-sans text-sm text-muted-foreground">{t('nutrition.logger.saving')}</Text>
    </View>
  )
}

// ── Success ────────────────────────────────────────────────────────────────────

export function SuccessStep({ model }: StepProps) {
  const { t } = useTranslation()
  return (
    <View className="py-6 gap-4">
      {/* Success icon */}
      <View className="items-center gap-3">
        <View className="size-16 rounded-full bg-lime-400/10 border border-lime-400/20 items-center justify-center">
          <Check size={28} color="#a3e635" />
        </View>
        <Text className="font-bebas text-2xl tracking-wide text-lime-400">{t('nutrition.logger.mealRegistered')}</Text>
      </View>

      {/* Meal summary */}
      <View className="p-4 bg-muted/30 border border-border rounded-xl gap-3">
        <View className="flex-row items-center justify-between">
          <View className="px-2 py-0.5 rounded-full bg-lime-400/10 border border-lime-400/20">
            <Text className="font-mono text-[10px] uppercase tracking-widest text-lime-400">{model.mealLabel}</Text>
          </View>
          <Text className="font-bebas text-xl text-foreground tabular-nums">{Math.round(model.totals.calories)} kcal</Text>
        </View>
        <View className="flex-row gap-2">
          <MacroCell value={model.totals.protein} label={t('nutrition.protein')} color="text-sky-500" />
          <MacroCell value={model.totals.carbs} label={t('nutrition.carbs')} color="text-amber-400" />
          <MacroCell value={model.totals.fat} label={t('nutrition.fat')} color="text-pink-500" />
        </View>
        {model.goals && (
          <Text className="font-sans text-xs text-muted-foreground text-center pt-2 border-t border-border/50">
            {Math.round(model.dailyTotals.calories + model.totals.calories)} / {Math.round(model.goals.dailyCalories)} kcal {t('nutrition.today') || 'hoy'}
          </Text>
        )}
      </View>

      {/* Actions */}
      <View className="flex-row gap-2">
        <Pressable
          onPress={model.onClose}
          className="flex-1 h-12 bg-lime-400 active:bg-lime-300 items-center justify-center rounded-xl"
        >
          <Text className="font-bebas text-lg tracking-wide text-zinc-900">{t('nutrition.logger.done')}</Text>
        </Pressable>
        <Pressable
          onPress={() => model.handleResetForm()}
          className="flex-1 h-12 border border-border active:bg-muted items-center justify-center rounded-xl"
        >
          <Text className="font-bebas text-lg tracking-wide text-foreground">{t('nutrition.logger.registerAnother')}</Text>
        </Pressable>
      </View>
    </View>
  )
}
