import { Modal, Pressable, ScrollView, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Check, X } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { LIME, MUTED } from '@/components/session/constants'

export interface ExerciseListItem {
  id: string
  name: string
  /** Series totales del ejercicio. */
  totalSets: number
  /** Series registradas en esta sesión. */
  loggedSets: number
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
 * «Hecho» = todas sus series registradas; saltar uno no lo marca.
 */
export default function ExerciseListSheet({ visible, items, currentIndex, onSelect, onClose }: ExerciseListSheetProps) {
  const { t } = useTranslation()
  // En el POCO la ventana del Modal se dibuja bajo la barra de navegación de
  // Android aunque no sea navigationBarTranslucent: sin este margen la última
  // fila queda tapada por los botones.
  const insets = useSafeAreaInsets()
  const isDone = (item: ExerciseListItem) => item.loggedSets >= item.totalSets
  const remaining = items.filter((item, i) => i !== currentIndex && !isDone(item)).length

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable className="absolute inset-0 bg-black/60" onPress={onClose} accessibilityLabel={t('common.close')} />
        <View className="max-h-[75%] rounded-t-2xl border-t border-border bg-background" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
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
              // En el descanso tras la última serie el índice actual sigue en el
              // ejercicio recién terminado: ya hecho gana a «ahora».
              const done = isDone(item)
              const current = i === currentIndex && !done
              const partial = !done && item.loggedSets > 0
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
                      {partial
                        ? t('session.exerciseListSetsProgress', { done: Math.min(item.loggedSets, item.totalSets), total: item.totalSets })
                        : t('session.exerciseListSets', { count: item.totalSets })}
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
