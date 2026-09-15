import { Modal, Pressable, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react-native'

/**
 * Visor de imagen a pantalla completa (portada de programa, media de ejercicio).
 *
 * `<Modal>` nativo, como el lightbox de `progress-photos`: su ventana queda por
 * encima de la barra de navegación en MIUI. Tres salidas que no dependen de
 * gestos: el ✕, tocar el fondo y el botón atrás de Android (`onRequestClose`).
 * La imagen va con `contain` para verse ENTERA; el recorte ya lo hace la
 * miniatura desde la que se abre.
 */
export function ImageViewer({ uri, label, onClose }: {
  uri: string | null
  label?: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/95" onPress={onClose} accessible={false}>
        <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
          <View className="flex-row justify-end px-2 py-1">
            <Pressable
              onPress={onClose}
              hitSlop={8}
              className="size-11 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <X size={24} color="white" />
            </Pressable>
          </View>
          {!!uri && (
            <Image
              source={{ uri }}
              style={{ flex: 1, width: '100%' }}
              contentFit="contain"
              transition={150}
              cachePolicy="memory-disk"
              accessibilityLabel={label}
            />
          )}
        </SafeAreaView>
      </Pressable>
    </Modal>
  )
}
