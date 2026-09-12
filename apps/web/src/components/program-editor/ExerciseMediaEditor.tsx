/**
 * Media propia de un ejercicio dentro del programa (#618) — web.
 *
 * Hasta 3 imágenes (admite GIF) y un vídeo corto que, en el reproductor de
 * #608, ganan a lo que traiga el catálogo compartido. Es el override que hace
 * falta cuando el autor quiere enseñar SU variante del movimiento y no la del
 * catálogo.
 *
 * Vive en su propio fichero y no dentro de `StepExercises` porque el panel
 * expandido de cada ejercicio ya era largo; aquí además se concentra todo el
 * manejo de blob URLs, que hay que revocar a mano.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getProgramFileUrl } from '@calistenia/core/lib/pocketbase'
import { remainingImageSlots } from '@calistenia/core/lib/programMedia'
import type { EditorExercise } from '@calistenia/core/hooks/useProgramEditor'
import { exerciseMediaOf } from '@calistenia/core/hooks/useProgramEditor'
import {
  DEMO_IMAGE_ACCEPT,
  DEMO_VIDEO_ACCEPT,
  pickDemoImage,
  pickDemoVideo,
} from '../../lib/program-media'

const LABEL_CLASS = 'text-[9px] text-muted-foreground tracking-widest uppercase block mb-1'

interface ExerciseMediaEditorProps {
  exercise: EditorExercise
  onChange: (data: Partial<EditorExercise>) => void
}

export function ExerciseMediaEditor({ exercise, onChange }: ExerciseMediaEditorProps) {
  const { t } = useTranslation()
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const media = exerciseMediaOf(exercise)
  const slots = remainingImageSlots(media)

  // Imágenes que siguen en el servidor y el autor no ha quitado.
  const savedImages = media.demoImages.filter(name => !media.removedImages.includes(name))
  const savedVideo = media.removeVideo ? '' : media.demoVideo

  // Un blob URL por imagen pendiente. Se recalculan sólo cuando cambia la lista
  // y se revocan al cambiar: sin eso, elegir seis imágenes seguidas deja seis
  // ficheros enteros retenidos en memoria.
  //
  // La dependencia es `exercise.pendingImages` y NO `media.pendingImages`:
  // `exerciseMediaOf` rellena el opcional con `?? []`, que es un array nuevo en
  // cada render y convertiría este memo en un ciclo de crear-y-revocar que
  // dejaría las miniaturas parpadeando.
  const pendingImages = exercise.pendingImages
  const pendingPreviews = useMemo(
    () => (pendingImages ?? []).map(f => URL.createObjectURL(f.blob)),
    [pendingImages],
  )
  useEffect(() => () => pendingPreviews.forEach(URL.revokeObjectURL), [pendingPreviews])

  const addImages = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const accepted = [...media.pendingImages]
    let rejection: string | null = null
    for (const file of Array.from(files)) {
      if (accepted.length - media.pendingImages.length >= slots) {
        rejection = t('programEditor.mediaTooManyImages')
        break
      }
      const result = pickDemoImage(file, accepted.length)
      if (!result.ok) {
        rejection = t(result.reason === 'size' ? 'programEditor.mediaTooLarge' : 'programEditor.mediaUnsupported')
        continue
      }
      accepted.push(result.file)
    }
    setError(rejection)
    onChange({ pendingImages: accepted })
    // Sin esto, volver a elegir el mismo fichero no dispara `change`.
    if (imageInputRef.current) imageInputRef.current.value = ''
  }

  const removePending = (index: number) => {
    setError(null)
    onChange({ pendingImages: media.pendingImages.filter((_, i) => i !== index) })
  }

  /** Quitar una imagen YA guardada se anota; el borrado real va en el guardado. */
  const removeSaved = (name: string) => {
    setError(null)
    onChange({ removedImages: [...media.removedImages, name] })
  }

  const setVideo = (file: File | undefined) => {
    if (!file) return
    const result = pickDemoVideo(file)
    if (!result.ok) {
      setError(t(result.reason === 'size' ? 'programEditor.videoTooLarge' : 'programEditor.videoUnsupported'))
      return
    }
    setError(null)
    onChange({ pendingVideo: result.file, removeVideo: false })
  }

  const clearVideo = () => {
    setError(null)
    onChange({ pendingVideo: null, removeVideo: true })
    if (videoInputRef.current) videoInputRef.current.value = ''
  }

  return (
    <div className="space-y-2">
      <div>
        <span className={LABEL_CLASS}>{t('programEditor.mediaImagesLabel')}</span>
        <div className="flex flex-wrap items-center gap-2">
          {savedImages.map(name => (
            <figure key={name} className="relative">
              <img
                src={getProgramFileUrl('program_exercises', exercise.pbRecordId, name) || undefined}
                alt={t('programEditor.mediaImageAlt', { name: exercise.name || t('programEditor.exercise') })}
                className="size-16 rounded-md border border-border object-cover"
              />
              <button
                type="button"
                onClick={() => removeSaved(name)}
                aria-label={t('programEditor.mediaRemoveImage')}
                className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full border border-border bg-background text-[9px] text-muted-foreground hover:text-red-400"
              >
                ✕
              </button>
            </figure>
          ))}
          {pendingPreviews.map((url, i) => (
            <figure key={url} className="relative">
              <img
                src={url}
                alt={t('programEditor.mediaPendingAlt')}
                className="size-16 rounded-md border border-dashed border-[hsl(var(--lime))]/40 object-cover"
              />
              <button
                type="button"
                onClick={() => removePending(i)}
                aria-label={t('programEditor.mediaRemoveImage')}
                className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full border border-border bg-background text-[9px] text-muted-foreground hover:text-red-400"
              >
                ✕
              </button>
            </figure>
          ))}
          <input
            ref={imageInputRef}
            type="file"
            accept={DEMO_IMAGE_ACCEPT}
            multiple
            disabled={slots === 0}
            onChange={e => addImages(e.target.files)}
            className="text-[11px] file:mr-2 file:rounded-md file:border file:border-border file:bg-transparent file:px-2 file:py-1 file:text-[10px] file:uppercase file:tracking-widest file:text-foreground disabled:opacity-40"
          />
        </div>
        <div className="mt-1 text-[9px] text-muted-foreground">
          {t('programEditor.mediaImagesDesc', { n: slots })}
        </div>
      </div>

      <div>
        <span className={LABEL_CLASS}>{t('programEditor.mediaVideoLabel')}</span>
        <div className="flex flex-wrap items-center gap-2">
          {media.pendingVideo && (
            <span className="rounded-md border border-dashed border-[hsl(var(--lime))]/40 px-2 py-1 text-[10px] text-[hsl(var(--lime))]">
              {media.pendingVideo.name}
            </span>
          )}
          {!media.pendingVideo && savedVideo && (
            <a
              href={getProgramFileUrl('program_exercises', exercise.pbRecordId, savedVideo) || undefined}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
            >
              {savedVideo}
            </a>
          )}
          <input
            ref={videoInputRef}
            type="file"
            accept={DEMO_VIDEO_ACCEPT}
            onChange={e => setVideo(e.target.files?.[0])}
            className="text-[11px] file:mr-2 file:rounded-md file:border file:border-border file:bg-transparent file:px-2 file:py-1 file:text-[10px] file:uppercase file:tracking-widest file:text-foreground"
          />
          {(media.pendingVideo || savedVideo) && (
            <button
              type="button"
              onClick={clearVideo}
              className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-red-400"
            >
              {t('programEditor.mediaRemoveVideo')}
            </button>
          )}
        </div>
        <div className="mt-1 text-[9px] text-muted-foreground">{t('programEditor.mediaVideoDesc')}</div>
      </div>

      {error && <div className="text-[11px] text-red-400" role="alert">{error}</div>}
    </div>
  )
}
