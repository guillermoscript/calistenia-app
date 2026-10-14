import { Modal, Pressable, ScrollView, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Check, X } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { LIME, MUTED } from '@/components/session/constants'

export interface ExerciseListItem {
  id: string
  name: string
  /** Series totales del ejercicio. */
  totalSets: number
  section: 'warmup' | 'main' | 'cooldown'
}

interface ExerciseListSheetProps {
  visible: boolean
  items: ExerciseListItem[]
  /** Posición 0-based del ejercicio en curso. */
  currentIndex: number
  onSelect: (index: number) => void
  onClose: () => void
}

/**
 * Lista rápida de todos los ejercicios de la sesión: hechos, el actual y los
 * que faltan. Tocar uno salta a él. Modal nativo (no gorhom) por MIUI.
 */
export default function ExerciseListSheet({ visible, items, currentIndex, onSelect, onClose }: ExerciseListSheetProps) {
  const { t } = useTranslation()
  const remaining = Math.max(0, items.length - currentIndex - 1)

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable className="absolute inset-0 bg-black/60" onPress={onClose} accessibilityLabel={t('common.close')} />
        <View className="max-h-[75%] rounded-t-2xl border-t border-border bg-background">
          <View className="h-[52px] flex-row items-center justify-between border-b border-border px-4">
            <View>
              <Text className="font-mono text-[10px] tracking-[2px] text-muted-foreground">
                {t('session.exerciseListTitle').toUpperCase()}
              </Text>
              <Text className="font-mono text-[9px] text-muted-foreground/60">
                {t('session.exerciseListRemaining', { count: remaining })}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} className="min-h-[44px] min-w-[44px] items-center justify-center" accessibilityLabel={t('common.close')}>
              <X size={20} color={MUTED} />
            </Pressable>
          </View>
          <ScrollView>
            {items.map((item, i) => {
              const done = i < currentIndex
              const current = i === currentIndex
              return (
                <Pressable
                  key={`${item.id}-${i}`}
                  onPress={() => onSelect(i)}
                  className={`min-h-[52px] flex-row items-center gap-3 border-b border-border px-4 active:bg-lime/10 ${current ? 'bg-lime/10' : ''}`}
                >
                  <View className="w-6 items-center">
                    {done ? (
                      <Check size={16} color={LIME} />
                    ) : (
                      <Text className={`font-mono text-[11px] tabular-nums ${current ? 'text-lime' : 'text-muted-foreground'}`}>{i + 1}</Text>
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className={`font-sans-medium text-[14px] ${done ? 'text-muted-foreground line-through' : 'text-foreground'}`} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text className="font-mono text-[10px] text-muted-foreground">
                      {t('session.exerciseListSets', { count: item.totalSets })}
                    </Text>
                  </View>
                  {current && <Text className="font-mono text-[10px] tracking-[1px] text-lime">{t('session.exerciseListNow').toUpperCase()}</Text>}
                </Pressable>
              )
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}
