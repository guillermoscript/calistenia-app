/**
 * Foto de perfil editable. Toca el círculo → hoja con Cámara / Galería /
 * Quitar. Paridad con el avatar de la web (`ProfilePage`), pero nativo.
 *
 * Aquí solo hay píxeles: los permisos, el picker y la subida viven en
 * `useAvatarUpload`. Lo único que este componente decide es la confirmación
 * del borrado, que es UX, no fontanería.
 */
import { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, View } from 'react-native'
import { Image } from 'expo-image'
import { useTranslation } from 'react-i18next'
import { Camera, Images, Trash2 } from 'lucide-react-native'
import type { RecordModel } from 'pocketbase'

import { Text } from '@/components/ui/text'
import { OptionSheet, type OptionSheetOption } from '@/components/ui/option-sheet'
import { useAvatarUpload } from '@/lib/use-avatar-upload'
import { haptics } from '@/lib/haptics'

/** Rellena el círculo; fuera del render para no crear un objeto nuevo por frame. */
const FILL = { width: '100%', height: '100%' } as const

export function AvatarPicker({ user, initial }: { user: RecordModel | null; initial: string }) {
  const { t } = useTranslation()
  const { avatarUrl, busy, pick, remove } = useAvatarUpload(user)
  const [sheetOpen, setSheetOpen] = useState(false)

  // Casi-negro en ambos temas (--lime-foreground es 0 0% 7% en claro y oscuro; #548).
  const onLime = 'hsl(0 0% 7%)'

  const confirmRemove = () => {
    Alert.alert(t('profile.avatarRemoveConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.avatarRemove'), style: 'destructive', onPress: () => { void remove() } },
    ])
  }

  const options: OptionSheetOption[] = [
    { key: 'camera', label: t('profile.avatarTakePhoto'), icon: Camera, onPress: () => { void pick('camera') } },
    { key: 'gallery', label: t('profile.avatarChooseGallery'), icon: Images, onPress: () => { void pick('gallery') } },
    // "Quitar" solo tiene sentido si hay algo que quitar.
    ...(avatarUrl
      ? [{ key: 'remove', label: t('profile.avatarRemove'), icon: Trash2, destructive: true, onPress: confirmRemove }]
      : []),
  ]

  return (
    <View className="size-16">
      <Pressable
        onPress={() => { haptics.selection(); setSheetOpen(true) }}
        disabled={!user || busy}
        accessibilityRole="button"
        accessibilityLabel={t('profile.avatarChange')}
        className="size-16 items-center justify-center overflow-hidden rounded-full border border-border bg-muted active:border-lime/40"
      >
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={FILL}
            contentFit="cover"
            transition={150}
            cachePolicy="memory-disk"
          />
        ) : (
          <Text className="font-bebas text-3xl leading-none text-foreground">{initial}</Text>
        )}
        {busy ? (
          <View className="absolute inset-0 items-center justify-center bg-black/60">
            <ActivityIndicator size="small" color="hsl(74 90% 57%)" />
          </View>
        ) : null}
      </Pressable>

      {/* Distintivo de cámara: es lo que delata que el círculo se puede tocar. */}
      <View
        pointerEvents="none"
        className="absolute bottom-0 right-0 size-6 items-center justify-center rounded-full border-2 border-background bg-lime"
      >
        <Camera size={11} color={onLime} />
      </View>

      <OptionSheet
        visible={sheetOpen}
        kicker={t('profile.title')}
        title={t('profile.avatarChange')}
        cancelLabel={t('common.cancel')}
        options={options}
        onClose={() => setSheetOpen(false)}
      />
    </View>
  )
}
