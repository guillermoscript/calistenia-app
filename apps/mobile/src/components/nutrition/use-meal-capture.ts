/**
 * useMealCapture — owns photo capture: camera/gallery pickers, EXIF-derived
 * finish-time seeding, and photo removal. Pure image-picker concern, no
 * analysis or save logic.
 */
import type { Dispatch, SetStateAction } from 'react'
import type { useTranslation } from 'react-i18next'
import * as ImagePicker from 'expo-image-picker'

import {
  requestCameraPermission as askCameraPermission,
  requestMediaPermission as askMediaPermission,
} from '@/lib/image-upload'
import { parseExifDateTimeToHM } from '@calistenia/core/lib/meal-time'
import type { NutritionEntry } from '@calistenia/core/types'

import { type ImageAsset, MAX_PHOTOS } from './meal-logger-shared'

interface UseMealCaptureParams {
  t: ReturnType<typeof useTranslation>['t']
  editEntry?: NutritionEntry | null
  imageAssets: ImageAsset[]
  setImageAssets: Dispatch<SetStateAction<ImageAsset[]>>
  setEatenHour: Dispatch<SetStateAction<string>>
  setEatenMinute: Dispatch<SetStateAction<string>>
}

export function useMealCapture({
  t,
  editEntry,
  imageAssets,
  setImageAssets,
  setEatenHour,
  setEatenMinute,
}: UseMealCaptureParams) {
  // ── Image Picker ───────────────────────────────────────────────────────────
  // Thin i18n wrappers over the shared permission helpers (which own the actual
  // expo-image-picker permission request + denied Alert).
  const requestCameraPermission = () =>
    askCameraPermission({
      title: t('common.permissionRequired') || 'Permiso requerido',
      message: t('common.cameraPermissionMessage') || 'Se necesita acceso a la cámara para tomar fotos.',
    })

  const requestMediaPermission = () =>
    askMediaPermission({
      title: t('common.permissionRequired') || 'Permiso requerido',
      message: t('common.galleryPermissionMessage') || 'Se necesita acceso a la galería.',
    })

  /**
   * Apply capture time from the first asset's EXIF metadata (fresh logs only).
   * EXIF keys differ by platform; check in priority order.
   */
  const applyExifTime = (asset: ImagePicker.ImagePickerAsset) => {
    // Only seed time for fresh logs (editEntry == null handled by the caller).
    const exif = asset.exif as Record<string, unknown> | null | undefined
    if (!exif) return
    const raw =
      (exif['DateTimeOriginal'] as string | undefined) ??
      (exif['DateTimeDigitized'] as string | undefined) ??
      (exif['DateTime'] as string | undefined) ??
      ((exif['{Exif}'] as Record<string, unknown> | undefined)?.['DateTimeOriginal'] as string | undefined)
    const hm = parseExifDateTimeToHM(raw)
    if (hm) {
      setEatenHour(hm.hour)
      setEatenMinute(hm.minute)
    }
  }

  const handleCamera = async () => {
    const ok = await requestCameraPermission()
    if (!ok) return
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: false,
      exif: true,
    })
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0]
      setImageAssets((prev) =>
        prev.length < MAX_PHOTOS
          ? [...prev, { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg', fileName: asset.fileName ?? undefined }]
          : prev,
      )
      // For fresh logs, seed the finish-time from EXIF capture datetime.
      if (!editEntry) {
        applyExifTime(asset)
      }
    }
  }

  const handleGallery = async () => {
    const ok = await requestMediaPermission()
    if (!ok) return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - imageAssets.length,
      exif: true,
    })
    if (!result.canceled && result.assets.length > 0) {
      const newAssets: ImageAsset[] = result.assets.map((a: ImagePicker.ImagePickerAsset) => ({
        uri: a.uri,
        mimeType: a.mimeType ?? 'image/jpeg',
        fileName: a.fileName ?? undefined,
      }))
      setImageAssets((prev) => [...prev, ...newAssets].slice(0, MAX_PHOTOS))
      // For fresh logs, seed the finish-time from the first asset's EXIF datetime.
      if (!editEntry) {
        applyExifTime(result.assets[0])
      }
    }
  }

  const removePhoto = (index: number) => {
    setImageAssets((prev) => prev.filter((_, i) => i !== index))
  }

  return { handleCamera, handleGallery, removePhoto }
}
