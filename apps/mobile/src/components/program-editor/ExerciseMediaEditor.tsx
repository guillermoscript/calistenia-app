/**
 * Media propia de un ejercicio dentro del programa (#618) — nativo.
 *
 * Hasta 3 imágenes (admite GIF) y un vídeo corto que, en el reproductor de
 * #608, ganan a lo que traiga el catálogo compartido: es el override que hace
 * falta cuando el autor quiere enseñar SU variante del movimiento.
 *
 * Fichero aparte de `StepExercises` porque el panel expandido de cada ejercicio
 * ya era largo, y porque así el picker (permisos, lectura del uri, validación)
 * queda en un solo sitio.
 */
import { useState } from 'react'
import { View, Pressable } from 'react-native'
import { Image } from 'expo-image'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react-native'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { pickDemoImages, pickDemoVideo, type MediaSource } from '@/lib/program-media'
import { getProgramFileUrl } from '@calistenia/core/lib/pocketbase'
import { remainingImageSlots } from '@calistenia/core/lib/programMedia'
import { exerciseMediaOf, type EditorExercise } from '@calistenia/core/hooks/useProgramEditor'

interface ExerciseMediaEditorProps {
  exercise: EditorExercise
  onChange: (data: Partial<EditorExercise>) => void
}

/** Miniatura con su botón de quitar. A nivel de módulo para no remontarla. */
function Thumb({
  uri,
  pending,
  onRemove,
  removeLabel,
}: {
  uri: string
  pending: boolean
  onRemove: () => void
  removeLabel: string
}) {
  return (
    <View className="relative">
      <Image
        source={{ uri }}
        style={{ width: 64, height: 64, borderRadius: 6 }}
        contentFit="cover"
      />
      <Pressable
        onPress={onRemove}
        hitSlop={8}
        accessibilityLabel={removeLabel}
        className={cn(
          'absolute -right-1.5 -top-1.5 size-5 items-center justify-center rounded-full border bg-background active:opacity-60',
          pending ? 'border-lime/40' : 'border-border',
        )}
      >
        <X size={11} color="#ef4444" />
      </Pressable>
    </View>
  )
}

export function ExerciseMediaEditor({ exercise, onChange }: ExerciseMediaEditorProps) {
  const { t } = useTranslation()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const media = exerciseMediaOf(exercise)
  const slots = remainingImageSlots(media)
  const savedImages = media.demoImages.filter(name => !media.removedImages.includes(name))
  const savedVideo = media.removeVideo ? '' : media.demoVideo

  const permissionText = (source: MediaSource) => ({
    title: t('common.permissionRequired'),
    message: t(source === 'camera' ? 'common.cameraPermissionMessage' : 'common.galleryPermissionMessage'),
  })

  const addImages = async (source: MediaSource) => {
    if (busy) return
    if (slots === 0) {
      setError(t('programEditor.mediaTooManyImages'))
      return
    }
    setBusy(true)
    try {
      const result = await pickDemoImages(source, slots, permissionText(source))
      // `ok: null` es cancelar o denegar el permiso: no hay nada que contar.
      if (result.ok === null) return
      if (result.ok === false) {
        setError(t(
          result.reason === 'size' ? 'programEditor.mediaTooLarge'
            : result.reason === 'read' ? 'programEditor.mediaReadError'
            : 'programEditor.mediaUnsupported',
        ))
        return
      }
      setError(null)
      haptics.light()
      onChange({ pendingImages: [...media.pendingImages, ...result.files] })
    } finally {
      setBusy(false)
    }
  }

  const addVideo = async (source: MediaSource) => {
    if (busy) return
    setBusy(true)
    try {
      const result = await pickDemoVideo(source, permissionText(source))
      if (result.ok === null) return
      if (result.ok === false) {
        setError(t(
          result.reason === 'size' ? 'programEditor.videoTooLarge'
            : result.reason === 'read' ? 'programEditor.mediaReadError'
            : 'programEditor.videoUnsupported',
        ))
        return
      }
      setError(null)
      haptics.light()
      onChange({ pendingVideo: result.files[0], removeVideo: false })
    } finally {
      setBusy(false)
    }
  }

  /** Quitar una imagen YA guardada se anota; el borrado real va en el guardado. */
  const removeSaved = (name: string) => {
    setError(null)
    haptics.light()
    onChange({ removedImages: [...media.removedImages, name] })
  }

  const removePending = (index: number) => {
    setError(null)
    haptics.light()
    onChange({ pendingImages: media.pendingImages.filter((_, i) => i !== index) })
  }

  const clearVideo = () => {
    setError(null)
    haptics.light()
    onChange({ pendingVideo: null, removeVideo: true })
  }

  return (
    <View className="gap-2">
      <Text className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {t('programEditor.mediaImagesLabel')}
      </Text>

      {(savedImages.length > 0 || media.pendingImages.length > 0) && (
        <View className="flex-row flex-wrap gap-2">
          {savedImages.map(name => {
            const uri = getProgramFileUrl('program_exercises', exercise.pbRecordId, name)
            if (!uri) return null
            return (
              <Thumb
                key={name}
                uri={uri}
                pending={false}
                onRemove={() => removeSaved(name)}
                removeLabel={t('programEditor.mediaRemoveImage')}
              />
            )
          })}
          {media.pendingImages.map((file, i) => (
            <Thumb
              key={`${file.name}-${i}`}
              uri={file.previewUri || ''}
              pending
              onRemove={() => removePending(i)}
              removeLabel={t('programEditor.mediaRemoveImage')}
            />
          ))}
        </View>
      )}

      <View className="flex-row gap-2">
        <Pressable
          onPress={() => void addImages('gallery')}
          disabled={busy || slots === 0}
          className="flex-1 items-center rounded-lg border border-dashed border-border py-2 active:opacity-70 disabled:opacity-40"
        >
          <Text className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
            {t('programEditor.mediaAddImages', { n: slots })}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => void addImages('camera')}
          disabled={busy || slots === 0}
          className="items-center rounded-lg border border-dashed border-border px-3 py-2 active:opacity-70 disabled:opacity-40"
        >
          <Text className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
            {t('programEditor.coverPickCamera')}
          </Text>
        </Pressable>
      </View>

      <Text className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {t('programEditor.mediaVideoLabel')}
      </Text>
      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={() => void addVideo('gallery')}
          disabled={busy}
          className="flex-1 items-center rounded-lg border border-dashed border-border py-2 active:opacity-70 disabled:opacity-40"
        >
          <Text className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground" numberOfLines={1}>
            {media.pendingVideo?.name || savedVideo || t('programEditor.mediaAddVideo')}
          </Text>
        </Pressable>
        {(media.pendingVideo || savedVideo) && (
          <Pressable
            onPress={clearVideo}
            disabled={busy}
            hitSlop={8}
            accessibilityLabel={t('programEditor.mediaRemoveVideo')}
            className="active:opacity-60 disabled:opacity-40"
          >
            <X size={14} color="#ef4444" />
          </Pressable>
        )}
      </View>

      <Text className={cn('text-[11px]', error ? 'text-red-400' : 'text-muted-foreground')}>
        {error || t('programEditor.mediaVideoDesc')}
      </Text>
    </View>
  )
}
