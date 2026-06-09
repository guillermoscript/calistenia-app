import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import { PHASE_COLORS } from '../../lib/style-tokens'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog'
import { Button } from '../ui/button'
import type { BodyPhoto } from '../../hooks/useBodyPhotos'

const CATEGORIES = ['front', 'side', 'back'] as const
const MAX_FILE_SIZE = 10 * 1024 * 1024
const FALLBACK_COLORS = PHASE_COLORS[1]

interface PhasePhotoUploadModalProps {
  phase: number
  previousPhasePhotos: BodyPhoto[]
  onUpload: (files: { file: File; category: string }[], phase: number) => Promise<BodyPhoto[]>
  onComplete: (uploaded: BodyPhoto[]) => void
  onClose: () => void
}

export default function PhasePhotoUploadModal({
  phase, previousPhasePhotos, onUpload, onComplete, onClose,
}: PhasePhotoUploadModalProps) {
  const { t } = useTranslation()
  const [files, setFiles] = useState<Record<string, File | null>>({ front: null, side: null, back: null })
  const [previews, setPreviews] = useState<Record<string, string | null>>({ front: null, side: null, back: null })
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sizeError, setSizeError] = useState<string | null>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({ front: null, side: null, back: null })
  const colors = PHASE_COLORS[phase] ?? FALLBACK_COLORS

  const handleFileSelect = (category: string, file: File | null) => {
    setSizeError(null)
    setError(null)
    if (file && file.size > MAX_FILE_SIZE) {
      setSizeError(t('progress.phasePhotos.fileTooLarge', {
        defaultValue: 'El archivo es demasiado grande (máx 10 MB)',
      }))
      return
    }
    setFiles(prev => ({ ...prev, [category]: file }))
    if (file) {
      const url = URL.createObjectURL(file)
      setPreviews(prev => {
        if (prev[category]) URL.revokeObjectURL(prev[category]!)
        return { ...prev, [category]: url }
      })
    } else {
      setPreviews(prev => {
        if (prev[category]) URL.revokeObjectURL(prev[category]!)
        return { ...prev, [category]: null }
      })
    }
  }

  const handleSave = async () => {
    const toUpload = CATEGORIES
      .filter(c => files[c] !== null)
      .map(c => ({ file: files[c]!, category: c }))
    if (toUpload.length === 0 || uploading) return

    setError(null)
    setUploading(true)
    try {
      const uploaded = await onUpload(toUpload, phase)
      onComplete(uploaded)
    } catch {
      setError(t('progress.phasePhotos.uploadError', {
        defaultValue: 'Error al subir las fotos. Intenta de nuevo.',
      }))
    } finally {
      setUploading(false)
    }
  }

  const hasAnyFile = CATEGORIES.some(c => files[c] !== null)
  const prevPhotoMap: Record<string, BodyPhoto | undefined> = {}
  for (const cat of CATEGORIES) {
    prevPhotoMap[cat] = previousPhasePhotos.find(p => p.category === cat)
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className={cn('font-bebas text-2xl', colors.text)}>
            {t('progress.phasePhotos.uploadTitle', { phase })}
          </DialogTitle>
          <DialogDescription>
            {t('progress.phasePhotos.uploadDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          {CATEGORIES.map((cat, i) => {
            const preview = previews[cat]
            const prevPhoto = prevPhotoMap[cat]
            const catLabel = t(`progress.phasePhotos.${cat}`)

            return (
              <div
                key={cat}
                className="flex flex-col gap-1.5 animate-[fade-in_0.35s_cubic-bezier(0.16,1,0.3,1)_both]"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="text-[10px] text-muted-foreground tracking-wider uppercase text-center">
                  {catLabel}
                </div>

                {/* Upload zone */}
                <button
                  onClick={() => fileRefs.current[cat]?.click()}
                  className={cn(
                    'aspect-[3/4] rounded-lg border-2 border-dashed overflow-hidden relative',
                    'flex items-center justify-center transition-colors duration-200',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    preview
                      ? 'border-current/30 ' + colors.text
                      : 'border-border hover:border-lime/40 hover:bg-muted/30',
                  )}
                >
                  {preview ? (
                    <>
                      <img
                        src={preview}
                        alt={catLabel}
                        className="w-full h-full object-cover animate-[scale-in_0.3s_cubic-bezier(0.16,1,0.3,1)]"
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); handleFileSelect(cat, null) }}
                        className="absolute top-0.5 right-0.5 size-7 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center transition-colors"
                        aria-label={t('progress.phasePhotos.removePhoto', { defaultValue: 'Quitar foto' })}
                      >
                        <svg className="size-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <line x1="2" y1="2" x2="10" y2="10" /><line x1="10" y1="2" x2="2" y2="10" />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                      <svg className="size-8 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="M21 15l-5-5L5 21" />
                      </svg>
                      <span className="text-[10px]">{t('progress.phasePhotos.addPhoto')}</span>
                    </div>
                  )}
                  <input
                    ref={el => { fileRefs.current[cat] = el }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={e => handleFileSelect(cat, e.target.files?.[0] || null)}
                  />
                </button>

                {/* Previous phase reference */}
                {prevPhoto && (
                  <div className="flex items-center gap-1.5">
                    <img
                      src={prevPhoto.url}
                      alt={t('progress.phasePhotos.previousPhase', { phase: phase - 1 })}
                      className="size-8 rounded object-cover opacity-60"
                    />
                    <span className="text-[9px] text-muted-foreground leading-tight">
                      {t('progress.phasePhotos.previousPhase', { phase: phase - 1 })}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {(sizeError || error) && (
          <p className="text-sm text-destructive text-center" role="alert">{sizeError || error}</p>
        )}

        <Button
          onClick={handleSave}
          disabled={!hasAnyFile || uploading}
          className={cn(
            'w-full font-bebas text-lg tracking-wide transition-opacity duration-200',
            !hasAnyFile && 'opacity-50',
          )}
        >
          {uploading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {t('progress.phasePhotos.uploading')}
            </span>
          ) : t('progress.phasePhotos.save')}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
