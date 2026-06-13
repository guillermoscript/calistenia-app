/**
 * MealLoggerSheet — full-screen modal for logging meals.
 * Thin shell: owns the modal chrome + header and switches between step components.
 * All state lives in useMealLogger; presentation lives in meal-logger-steps / -views.
 */
import { Modal, View, ScrollView, Pressable, Platform, KeyboardAvoidingView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { X, ChevronLeft } from 'lucide-react-native'

import { Text } from '@/components/ui/text'

import { useMealLogger } from './use-meal-logger'
import type { MealLoggerSheetProps } from './meal-logger-shared'
import {
  CaptureStep,
  AnalyzingStep,
  ReviewStep,
  SavingStep,
  SuccessStep,
} from './meal-logger-steps'

export type { MealLoggerSheetProps } from './meal-logger-shared'

export default function MealLoggerSheet(props: MealLoggerSheetProps) {
  const { t } = useTranslation()
  const model = useMealLogger(props)
  const { step } = model

  return (
    <Modal
      visible={props.visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={props.onClose}
    >
      <SafeAreaView className="flex-1 bg-background">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
          {/* ── Header ── */}
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-border/50">
            {/* Back / cancel on left (context-dependent) */}
            {step === 'review' ? (
              <Pressable
                onPress={model.backFromReview}
                className="size-9 items-center justify-center rounded-lg active:bg-muted"
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
              >
                <ChevronLeft size={20} color="#a1a1aa" />
              </Pressable>
            ) : (
              <View className="size-9" />
            )}

            <Text className="font-bebas text-xl tracking-widest text-foreground">
              {t('nutrition.logger.title')}
            </Text>

            <Pressable
              onPress={props.onClose}
              className="size-9 items-center justify-center rounded-lg active:bg-muted"
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              <X size={18} color="#a1a1aa" />
            </Pressable>
          </View>

          {/* ── Drag handle (iOS visual) ── */}
          {Platform.OS === 'ios' && (
            <View className="items-center py-1">
              <View className="w-10 h-1 rounded-full bg-muted/60" />
            </View>
          )}

          {/* ── Scrollable content ── */}
          <ScrollView
            className="flex-1"
            contentContainerClassName="px-4 py-4 gap-4"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {step === 'capture' && <CaptureStep model={model} />}
            {step === 'analyzing' && <AnalyzingStep model={model} />}
            {step === 'review' && <ReviewStep model={model} />}
            {step === 'saving' && <SavingStep />}
            {step === 'success' && <SuccessStep model={model} />}

            {/* Bottom padding so content clears keyboard */}
            <View style={{ height: 32 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}
