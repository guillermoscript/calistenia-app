/**
 * Guía rápida (#859, épica #852): una hoja estática que explica las 5
 * pestañas y dónde quedó Perfil. Sustituye al tour automático y al botón «?».
 *
 * Modal NATIVO con `animationType="slide"` (patrón WhatsNewModal /
 * CommentsSheet): en MIUI edge-to-edge es lo único que no choca con la barra
 * de navegación. Se cierra con el fondo, con ✕ y con el botón atrás.
 */
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { Home, Dumbbell, Apple, BarChart3, Users, CircleUser, X } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { Kicker } from '@/components/ui/kicker'
import { COLORS } from '@/lib/theme'

const ITEMS = [
  { icon: Home, key: 'today' },
  { icon: Dumbbell, key: 'train' },
  { icon: Apple, key: 'nutrition' },
  { icon: BarChart3, key: 'progress' },
  { icon: Users, key: 'community' },
  { icon: CircleUser, key: 'profile' },
] as const

export function QuickGuideSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { height: screenH } = useWindowDimensions()

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        />
        <View style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents="box-none">
          <View
            className="border-t border-border bg-card"
            style={{
              maxHeight: screenH * 0.86,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              overflow: 'hidden',
              paddingBottom: insets.bottom + 14,
            }}
          >
            <View className="flex-row items-start justify-between px-5 pb-2 pt-5">
              <View className="flex-1">
                <Kicker>{t('quickGuide.kicker')}</Kicker>
                <Text className="mt-1 font-bebas text-4xl leading-none text-foreground">{t('quickGuide.title')}</Text>
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={10}
                className="size-9 items-center justify-center rounded-full bg-muted active:opacity-70"
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <X size={16} color={COLORS.mutedIcon} />
              </Pressable>
            </View>

            <ScrollView contentContainerClassName="px-5 pb-2">
              {ITEMS.map(({ icon: Icon, key }, i) => (
                <View key={key} className={i > 0 ? 'flex-row gap-3 border-t border-border py-3.5' : 'flex-row gap-3 py-3.5'}>
                  <View className="size-8 items-center justify-center rounded-lg border border-border">
                    <Icon size={16} color={COLORS.lime} />
                  </View>
                  <View className="flex-1 gap-0.5">
                    <Text className="font-sans-medium text-sm text-foreground">{t(`quickGuide.${key}Title`)}</Text>
                    <Text className="text-[13px] leading-5 text-muted-foreground">{t(`quickGuide.${key}Body`)}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  )
}
