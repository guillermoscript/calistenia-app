/**
 * ScoreCriteriaSheet — mobile port of apps/web/.../ScoreCriteriaDialog.
 * The "how the A–E quality score is calculated" legend, opened by tapping the
 * daily score badge in the calorie ring. Native Modal bottom-sheet (per the
 * MIUI guidance in apps/mobile/CLAUDE.md — not gorhom).
 */
import { Modal, View, Pressable, ScrollView, StyleSheet, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'

import { Text } from '@/components/ui/text'
import { QualityScoreBadge } from './QualityBreakdownPanel'
import type { QualityScore } from '@calistenia/core/types'

const SCORES: QualityScore[] = ['A', 'B', 'C', 'D', 'E']

const SURFACE = '#141416'
const HAIRLINE = 'rgba(245,245,244,0.14)'

interface ScoreCriteriaSheetProps {
  visible: boolean
  onClose: () => void
}

export default function ScoreCriteriaSheet({ visible, onClose }: ScoreCriteriaSheetProps) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent={Platform.OS === 'android'}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View className="mb-4 flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">
                {t('nutrition.dailyScore', { defaultValue: 'Score del día' })}
              </Text>
              <Text className="font-bebas text-2xl tracking-wide text-foreground">
                {t('nutrition.scoreCriteriaTitle', { defaultValue: 'Cómo se calcula el score' })}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={t('common.close', { defaultValue: 'Cerrar' })}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Text className="text-base text-muted-foreground">✕</Text>
            </Pressable>
          </View>

          {/* A–E rows */}
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
            <View className="gap-3">
              {SCORES.map((score) => (
                <View key={score} className="flex-row gap-3">
                  <QualityScoreBadge score={score} size="md" />
                  <View className="flex-1 gap-0.5">
                    <Text className="font-sans-medium text-sm text-foreground">
                      {t(`nutrition.criteria${score}.label`)}
                    </Text>
                    <Text className="font-sans text-xs leading-relaxed text-muted-foreground">
                      {t(`nutrition.criteria${score}.example`)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: SURFACE,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: HAIRLINE,
    paddingHorizontal: 20,
    paddingTop: 16,
    maxHeight: '88%',
  },
})
