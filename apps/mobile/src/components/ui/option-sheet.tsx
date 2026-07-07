/**
 * OptionSheet — reemplazo reusable del Alert.alert de opciones: bottom sheet
 * nativo estilo spec-sheet (Modal nativo, patrón CommentsSheet — no gorhom).
 * Para elecciones cortas tipo "Cámara / Galería".
 */
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { LucideIcon } from 'lucide-react-native'

export interface OptionSheetOption {
  key: string
  label: string
  icon?: LucideIcon
  onPress: () => void
}

export function OptionSheet({ visible, kicker, title, options, cancelLabel, onClose }: {
  visible: boolean
  /** Label mono uppercase sobre el título (idioma del caller). */
  kicker?: string
  title: string
  options: OptionSheetOption[]
  cancelLabel: string
  onClose: () => void
}) {
  const insets = useSafeAreaInsets()

  const select = (opt: OptionSheetOption) => {
    onClose()
    // El Modal es otra ventana nativa: dejarla cerrar antes de lanzar
    // cámara/galería (otra Activity) evita glitches de foco en Android/MIUI
    setTimeout(opt.onPress, 250)
  }

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
        <View className="mt-auto border-t border-border bg-card" style={{ borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: insets.bottom + 14 }}>
          <View className="items-center pb-2 pt-3"><View className="h-1 w-9 rounded-full bg-lime/40" /></View>
          <View className="px-4 pb-2">
            {kicker ? (
              <Text className="font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground">{kicker}</Text>
            ) : null}
            <Text className="font-bebas text-2xl text-foreground">{title}</Text>
          </View>
          {options.map(opt => (
            <Pressable
              key={opt.key}
              onPress={() => select(opt)}
              className="flex-row items-center gap-3 border-t border-border px-4 py-3.5 active:bg-lime/10"
              accessibilityRole="button"
            >
              {opt.icon ? <opt.icon size={18} color="hsl(0 0% 72%)" /> : null}
              <Text className="font-sans-medium text-foreground">{opt.label}</Text>
            </Pressable>
          ))}
          <Pressable onPress={onClose} className="items-center border-t border-border px-4 py-3.5 active:bg-muted/20" accessibilityRole="button">
            <Text className="font-mono text-xs uppercase tracking-[2px] text-muted-foreground">{cancelLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}
