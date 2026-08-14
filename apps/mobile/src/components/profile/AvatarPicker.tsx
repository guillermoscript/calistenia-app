/**
 * Foto de perfil editable. Toca el círculo → hoja con Cámara / Galería /
 * Quitar. Sube al campo `avatar` de `users` y refresca el authStore para que
 * la foto nueva se vea sin reiniciar la app.
 *
 * Paridad con el avatar de la web (`ProfilePage`), pero nativo: el recorte
 * cuadrado lo hace el propio picker (`allowsEditing` + `aspect 1:1`), así que
 * subir una foto es un toque y el thumb de PocketBase nunca corta la cabeza.
 */
import { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, View } from 'react-native'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { useTranslation } from 'react-i18next'
import { useColorScheme } from 'nativewind'
import { Camera, Images, Trash2 } from 'lucide-react-native'
import type { RecordModel } from 'pocketbase'

import { Text } from '@/components/ui/text'
import { OptionSheet, type OptionSheetOption } from '@/components/ui/option-sheet'
import { requestCameraPermission, requestMediaPermission, uriToBlob } from '@/lib/image-upload'
import {
  MAX_AVATAR_SIZE_BYTES,
  avatarFileName,
  resolveAvatarMime,
  withCacheToken,
} from '@/lib/avatar'
import { haptics } from '@/lib/haptics'
import { Sentry } from '@/lib/instrument'
import { pb, getUserAvatarUrl } from '@calistenia/core/lib/pocketbase'

/** Opciones del picker: recorte cuadrado y calidad suficiente para un thumb. */
const PICKER_OPTIONS = {
  mediaTypes: ImagePicker.MediaTypeOptions.Images,
  allowsEditing: true,
  aspect: [1, 1] as [number, number],
  quality: 0.8,
}

export function AvatarPicker({ user, initial }: { user: RecordModel | null; initial: string }) {
  const { t } = useTranslation()
  const { colorScheme } = useColorScheme()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  // El contraste sobre lime se invierte con el tema (--lime-foreground).
  const onLime = colorScheme === 'dark' ? 'hsl(0 0% 7%)' : 'hsl(0 0% 100%)'

  const avatarUrl = user
    ? withCacheToken(getUserAvatarUrl(user, '200x200'), user.updated as string)
    : null

  const fail = (e: unknown, op: string) => {
    Sentry.captureException(e, { tags: { feature: 'profile', op } })
    haptics.error()
    Alert.alert(t('profile.avatarError'))
  }

  /** Persiste el cambio y sincroniza el authStore (fuente de `useAuthUser`). */
  const persist = async (body: FormData | Record<string, unknown>, op: string) => {
    if (!user) return
    setBusy(true)
    try {
      await pb.collection('users').update(user.id, body)
      // Sin esto la foto solo se vería tras cerrar sesión: el resto de la app
      // lee el usuario del authStore, no de una query.
      await pb.collection('users').authRefresh()
      haptics.success()
    } catch (e) {
      fail(e, op)
    } finally {
      setBusy(false)
    }
  }

  const pick = async (source: 'camera' | 'gallery') => {
    if (!user || busy) return

    const granted =
      source === 'camera'
        ? await requestCameraPermission({
            title: t('common.permissionRequired'),
            message: t('common.cameraPermissionMessage'),
          })
        : await requestMediaPermission({
            title: t('common.permissionRequired'),
            message: t('common.galleryPermissionMessage'),
          })
    if (!granted) return

    try {
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS)
          : await ImagePicker.launchImageLibraryAsync({
              ...PICKER_OPTIONS,
              allowsMultipleSelection: false,
            })
      if (result.canceled || !result.assets?.[0]) return

      const asset = result.assets[0]
      const mime = resolveAvatarMime([asset.mimeType])
      if (!mime) {
        Alert.alert(t('profile.avatarUnsupported'))
        return
      }
      // Rechaza el exceso de tamaño ya con lo que reporta el picker, para no
      // leer 20 MB a memoria solo para descartarlos.
      if (asset.fileSize != null && asset.fileSize > MAX_AVATAR_SIZE_BYTES) {
        Alert.alert(t('profile.avatarTooLarge'))
        return
      }

      const blob = await uriToBlob(asset.uri, mime)
      // No todos los pickers reportan `fileSize`: revalida sobre el blob real.
      if (blob.size > MAX_AVATAR_SIZE_BYTES) {
        Alert.alert(t('profile.avatarTooLarge'))
        return
      }

      const form = new FormData()
      form.append('avatar', blob, avatarFileName(mime))
      await persist(form, 'upload_avatar')
    } catch (e) {
      fail(e, `pick_avatar_${source}`)
    }
  }

  const confirmRemove = () => {
    Alert.alert(t('profile.avatarRemoveConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.avatarRemove'),
        style: 'destructive',
        // null vacía el campo de archivo (convención de PocketBase).
        onPress: () => { void persist({ avatar: null }, 'delete_avatar') },
      },
    ])
  }

  const options: OptionSheetOption[] = [
    { key: 'camera', label: t('profile.avatarTakePhoto'), icon: Camera, onPress: () => { void pick('camera') } },
    { key: 'gallery', label: t('profile.avatarChooseGallery'), icon: Images, onPress: () => { void pick('gallery') } },
  ]
  if (avatarUrl) {
    options.push({
      key: 'remove',
      label: t('profile.avatarRemove'),
      icon: Trash2,
      destructive: true,
      onPress: confirmRemove,
    })
  }

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
            style={{ width: '100%', height: '100%' }}
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
