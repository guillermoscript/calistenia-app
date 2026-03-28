import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import { PHASE_COLORS } from '../../lib/style-tokens'
import { Button } from '../ui/button'
import { useBodyPhotos } from '../../hooks/useBodyPhotos'
import PhasePhotoUploadModal from './PhasePhotoUploadModal'
import PhotoRevealAnimation from './PhotoRevealAnimation'
import type { BodyPhoto } from '../../hooks/useBodyPhotos'

interface PhasePhotoBannerProps {
  currentPhase: number
  userId: string | null
  hasCompletedWorkoutInPhase: boolean
}

const DISMISS_KEY = (phase: number) => `phase_photo_nudge_dismissed_${phase}`

export default function PhasePhotoBanner({ currentPhase, userId, hasCompletedWorkoutInPhase }: PhasePhotoBannerProps) {
  const { t } = useTranslation()
  const { photos, getPhotosByPhase, uploadPhotos } = useBodyPhotos(userId)
  const [showModal, setShowModal] = useState(false)
  const [revealData, setRevealData] = useState<{ before?: BodyPhoto; after: BodyPhoto; phase: number } | null>(null)

  const isDismissed = useMemo(() => {
    try { return localStorage.getItem(DISMISS_KEY(currentPhase)) === '1' } catch { return false }
  }, [currentPhase])

  const [dismissed, setDismissed] = useState(isDismissed)

  const phasePhotos = getPhotosByPhase(currentPhase)
  const hasPhotosForPhase = phasePhotos.length > 0

  if (!hasCompletedWorkoutInPhase || hasPhotosForPhase || dismissed || !userId) return null

  const colors = PHASE_COLORS[currentPhase]

  const handleDismiss = () => {
    try { localStorage.setItem(DISMISS_KEY(currentPhase), '1') } catch {}
    setDismissed(true)
  }

  const handleUploadComplete = (uploaded: BodyPhoto[]) => {
    setShowModal(false)
    if (uploaded.length === 0) return

    const prevPhase = currentPhase - 1
    const prevPhotos = prevPhase >= 1 ? getPhotosByPhase(prevPhase) : []
    const afterPhoto = uploaded[0]
    const beforePhoto = prevPhotos.find(p => p.category === afterPhoto.category)

    setRevealData({ before: beforePhoto, after: afterPhoto, phase: currentPhase })
  }

  return (
    <>
      <div className={cn(
        'mb-6 p-4 border rounded-xl flex items-center gap-4 flex-wrap animate-[slide-up_0.4s_ease-out]',
        colors.bg, `border-current/20 ${colors.text}`,
      )}>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">
            {t('progress.phasePhotos.nudge', { phase: currentPhase })}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setShowModal(true)}
            className="font-bebas text-base tracking-wide"
          >
            {t('progress.phasePhotos.nudgeCta')}
          </Button>
          <button
            onClick={handleDismiss}
            className="size-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      {showModal && (
        <PhasePhotoUploadModal
          phase={currentPhase}
          previousPhasePhotos={currentPhase > 1 ? getPhotosByPhase(currentPhase - 1) : []}
          onUpload={uploadPhotos}
          onComplete={handleUploadComplete}
          onClose={() => setShowModal(false)}
        />
      )}

      {revealData && (
        <PhotoRevealAnimation
          before={revealData.before}
          after={revealData.after}
          phaseBefore={revealData.phase - 1}
          phaseAfter={revealData.phase}
          onDismiss={() => setRevealData(null)}
        />
      )}
    </>
  )
}
