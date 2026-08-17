/**
 * Captura de fotos del registro de comidas web (#477).
 *
 * Salió de MealLoggerContent: inputs de fichero (cámara y galería), compresión
 * y el auto-relleno de la hora desde el EXIF de la PRIMERA foto.
 */
import { useCallback, useRef } from 'react'
import { parseExifDateTimeToHM } from '@calistenia/core/lib/meal-time'
import { readPhotoTakenAt } from '../../lib/exif'
import { MAX_PHOTOS, compressImage } from './meal-logger-shared'

interface UseMealCaptureParams {
  imageFiles: File[]
  setImageFiles: React.Dispatch<React.SetStateAction<File[]>>
  setImagePreviews: React.Dispatch<React.SetStateAction<string[]>>
  setEatenHour: (v: string) => void
  setEatenMinute: (v: string) => void
}

export function useMealCapture({
  imageFiles, setImageFiles, setImagePreviews, setEatenHour, setEatenMinute,
}: UseMealCaptureParams) {
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || imageFiles.length >= MAX_PHOTOS) return
    const compressed = await compressImage(file)
    setImageFiles(prev => [...prev, compressed])
    const reader = new FileReader()
    reader.onload = () => setImagePreviews(prev => [...prev, reader.result as string])
    reader.readAsDataURL(compressed)

    // Auto-seed the finish time from EXIF DateTimeOriginal on the FIRST photo
    // of a fresh form (imageFiles.length === 0 means this is the first photo).
    // We use the original pre-compression File for EXIF so we don't lose the
    // metadata that canvas.toBlob() strips. Only overrides when it's the first
    // photo being added (any previously-set manual value is left intact after
    // subsequent additions).
    if (imageFiles.length === 0) {
      readPhotoTakenAt(file).then(exifRaw => {
        if (!exifRaw) return
        const hm = parseExifDateTimeToHM(exifRaw)
        if (hm) {
          setEatenHour(hm.hour)
          setEatenMinute(hm.minute)
        }
      }).catch(() => {/* non-fatal — time remains at now-default */})
    }

    // Reset input so the same file can be re-selected
    e.target.value = ''
  }, [imageFiles.length, setImageFiles, setImagePreviews, setEatenHour, setEatenMinute])

  const removePhoto = useCallback((index: number) => {
    setImageFiles(prev => prev.filter((_, i) => i !== index))
    setImagePreviews(prev => prev.filter((_, i) => i !== index))
  }, [setImageFiles, setImagePreviews])

  const openCamera = useCallback(() => cameraInputRef.current?.click(), [])
  const openGallery = useCallback(() => galleryInputRef.current?.click(), [])

  return { cameraInputRef, galleryInputRef, handleFileChange, removePhoto, openCamera, openGallery }
}
