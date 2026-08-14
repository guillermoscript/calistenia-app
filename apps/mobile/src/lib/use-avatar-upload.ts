/**
 * Máquina de la foto de perfil: permisos, picker, validación, subida a
 * PocketBase y refresco del authStore.
 *
 * Vive aparte del componente a propósito — `AvatarPicker` solo pinta y llama a
 * estas acciones, así que la UI no sabe nada de expo-image-picker ni de `pb`.
 * Además deja la lógica lista para reutilizar si algún día el onboarding pide
 * la foto (hoy solo la usa la pantalla de perfil).
 */
import { useState } from 'react'
import { Alert } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useTranslation } from 'react-i18next'
import type { RecordModel } from 'pocketbase'

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

/** Recorte cuadrado en el propio picker: un toque, y el thumb no corta la cabeza. */
const PICKER_OPTIONS = {
  mediaTypes: ImagePicker.MediaTypeOptions.Images,
  allowsEditing: true,
  aspect: [1, 1] as [number, number],
  quality: 0.8,
}

export type AvatarSource = 'camera' | 'gallery'

export interface AvatarUpload {
  /** URL del thumb 200x200 con token de caché, o null si no hay foto. */
  avatarUrl: string | null
  /** Subiendo o borrando: la UI bloquea el botón y tapa el círculo. */
  busy: boolean
  pick: (source: AvatarSource) => Promise<void>
  remove: () => Promise<void>
}

export function useAvatarUpload(user: RecordModel | null): AvatarUpload {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)

  const avatarUrl = user
    ? withCacheToken(getUserAvatarUrl(user, '200x200'), user.updated as string)
    : null

  const fail = (e: unknown, op: string) => {
    Sentry.captureException(e, { tags: { feature: 'profile', op } })
    haptics.error()
    Alert.alert(t('profile.avatarError'))
  }

  /** Escribe en `users` y sincroniza el authStore, que es de donde lee la app. */
  const persist = async (body: FormData | Record<string, unknown>, op: string) => {
    if (!user) return
    setBusy(true)
    try {
      await pb.collection('users').update(user.id, body)
      // Sin esto la foto solo se vería tras cerrar sesión: el resto de la app
      // lee al usuario del authStore, no de una query.
      await pb.collection('users').authRefresh()
      haptics.success()
    } catch (e) {
      fail(e, op)
    } finally {
      setBusy(false)
    }
  }

  const requestPermission = (source: AvatarSource) => {
    const ask = source === 'camera' ? requestCameraPermission : requestMediaPermission
    return ask({
      title: t('common.permissionRequired'),
      message: t(
        source === 'camera' ? 'common.cameraPermissionMessage' : 'common.galleryPermissionMessage',
      ),
    })
  }

  const pick = async (source: AvatarSource) => {
    if (!user || busy) return
    if (!(await requestPermission(source))) return

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
      // Descarta por tamaño ya con lo que reporta el picker, para no leer
      // 20 MB a memoria solo para tirarlos.
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
      // Un Blob nativo no tiene `.name` y PocketBase valida por extensión.
      form.append('avatar', blob, avatarFileName(mime))
      await persist(form, 'upload_avatar')
    } catch (e) {
      fail(e, `pick_avatar_${source}`)
    }
  }

  // null vacía el campo de archivo (convención de PocketBase).
  const remove = () => persist({ avatar: null }, 'delete_avatar')

  return { avatarUrl, busy, pick, remove }
}
