import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import { PHASE_COLORS } from '../../lib/style-tokens'
import type { BodyPhoto } from '../../hooks/useBodyPhotos'
import PhasePhotoUploadModal from './PhasePhotoUploadModal'
import PhotoRevealAnimation from './PhotoRevealAnimation'

interface PhasePhotoTimelineProps {
  currentPhase: number
  photos: BodyPhoto[]
  getPhotosByPhase: (phase: number) => BodyPhoto[]
  uploadPhotos: (files: { file: File; category: string }[], phase: number) => Promise<BodyPhoto[]>
  onCompare?: (phaseA: number, phaseB: number) => void
}

const PHASES = [1, 2, 3, 4]

export default function PhasePhotoTimeline({
  currentPhase, photos, getPhotosByPhase, uploadPhotos, onCompare,
}: PhasePhotoTimelineProps) {
  const { t } = useTranslation()
  const [uploadPhase, setUploadPhase] = useState<number | null>(null)
  const [revealData, setRevealData] = useState<{ before?: BodyPhoto; after: BodyPhoto; phase: number } | null>(null)
  const [animatingNode, setAnimatingNode] = useState<number | null>(null)

  const phasePhotos = useMemo(() => {
    const map: Record<number, BodyPhoto[]> = {}
    for (const p of PHASES) map[p] = getPhotosByPhase(p)
    return map
  }, [photos, getPhotosByPhase])

  const completedPhases = PHASES.filter(p => phasePhotos[p].length > 0)
  const showStartVsNow = completedPhases.length >= 2

  const handleUploadComplete = (uploaded: BodyPhoto[], phase: number) => {
    setUploadPhase(null)
    if (uploaded.length === 0) return

    // Find a before photo from previous phase (same category)
    const prevPhase = phase - 1
    const prevPhotos = prevPhase >= 1 ? getPhotosByPhase(prevPhase) : []
    const afterPhoto = uploaded[0]
    const beforePhoto = prevPhotos.find(p => p.category === afterPhoto.category)

    setRevealData({
      before: beforePhoto,
      after: afterPhoto,
      phase,
    })

    // Animate the node after reveal
    setTimeout(() => setAnimatingNode(phase), 300)
    setTimeout(() => setAnimatingNode(null), 2000)
  }

  const getFrontPhoto = (phase: number): BodyPhoto | undefined => {
    return phasePhotos[phase].find(p => p.category === 'front') || phasePhotos[phase][0]
  }

  return (
    <div className="mb-8">
      <div className="text-[10px] text-muted-foreground tracking-[3px] mb-4 uppercase">
        {t('progress.phasePhotos.timelineTitle')}
      </div>

      {/* Timeline */}
      <div className="relative flex items-start justify-between px-2 mb-4">
        {/* Connection line */}
        <div className="absolute top-5 left-[calc(12.5%+8px)] right-[calc(12.5%+8px)] h-[2px] bg-border" />
        <div
          className="absolute top-5 left-[calc(12.5%+8px)] h-[2px] bg-lime/50 transition-all duration-1000 ease-out"
          style={{
            width: completedPhases.length <= 1
              ? '0%'
              : `${((Math.max(...completedPhases) - 1) / 3) * 100}%`,
            maxWidth: `calc(100% - ${12.5 * 2 + 16}px)`,
          }}
        />

        {PHASES.map((phase) => {
          const hasPhotos = phasePhotos[phase].length > 0
          const isCurrent = phase === currentPhase
          const isFuture = phase > currentPhase
          const colors = PHASE_COLORS[phase]
          const thumbnail = getFrontPhoto(phase)

          return (
            <div key={phase} className="flex flex-col items-center gap-2 flex-1 relative z-10">
              {/* Node */}
              <button
                onClick={() => {
                  if (hasPhotos && onCompare && phase > 1) {
                    const prevCompleted = completedPhases.filter(p => p < phase).pop()
                    if (prevCompleted) onCompare(prevCompleted, phase)
                  } else if (!hasPhotos && !isFuture) {
                    setUploadPhase(phase)
                  }
                }}
                className={cn(
                  'size-10 rounded-full border-2 flex items-center justify-center transition-all duration-500',
                  hasPhotos && 'border-current bg-current/20 scale-100',
                  isCurrent && !hasPhotos && 'border-current animate-[pulse_2s_ease-in-out_infinite]',
                  isFuture && !hasPhotos && 'border-border bg-transparent',
                  !isFuture && !hasPhotos && !isCurrent && 'border-border bg-transparent',
                  animatingNode === phase && 'animate-[scale-in_0.5s_ease-out] ring-4 ring-current/20',
                  colors.text,
                )}
              >
                {hasPhotos ? (
                  <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <polyline points="3,8 7,12 13,4" />
                  </svg>
                ) : (
                  <span className="text-[11px] font-medium opacity-60">{phase}</span>
                )}
              </button>

              {/* Label */}
              <div className="text-center">
                <div className={cn(
                  'text-[10px] font-medium',
                  hasPhotos ? colors.text : isCurrent ? 'text-foreground' : 'text-muted-foreground',
                )}>
                  {t('progress.phasePhotos.phase', { phase })}
                </div>
                {hasPhotos && (
                  <div className="text-[9px] text-muted-foreground">
                    {t('progress.phasePhotos.completed')}
                  </div>
                )}
                {isCurrent && !hasPhotos && (
                  <div className="text-[9px] text-muted-foreground">
                    {t('progress.phasePhotos.currentPhase')}
                  </div>
                )}
              </div>

              {/* Thumbnail */}
              {thumbnail ? (
                <button
                  onClick={() => {
                    if (onCompare && phase > 1) {
                      const prevCompleted = completedPhases.filter(p => p < phase).pop()
                      if (prevCompleted) onCompare(prevCompleted, phase)
                    }
                  }}
                  className={cn(
                    'size-14 rounded-lg overflow-hidden border-2 transition-all duration-700',
                    'animate-[slide-up_0.4s_ease-out]',
                    animatingNode === phase && 'animate-[scale-in_0.5s_ease-out]',
                    colors.text, 'border-current/30',
                  )}
                >
                  <img src={thumbnail.url} alt="" className="w-full h-full object-cover" />
                </button>
              ) : !isFuture ? (
                <button
                  onClick={() => setUploadPhase(phase)}
                  className="size-14 rounded-lg border border-dashed border-border flex items-center justify-center hover:border-lime/40 transition-colors"
                >
                  <svg className="size-5 text-muted-foreground" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="10" cy="10" r="8" />
                    <line x1="10" y1="6" x2="10" y2="14" />
                    <line x1="6" y1="10" x2="14" y2="10" />
                  </svg>
                </button>
              ) : (
                <div className="size-14" />
              )}
            </div>
          )
        })}
      </div>

      {/* Start vs Now button */}
      {showStartVsNow && onCompare && (
        <button
          onClick={() => onCompare(completedPhases[0], completedPhases[completedPhases.length - 1])}
          className="w-full py-2.5 px-4 bg-lime/5 border border-lime/20 rounded-lg hover:border-lime/40 transition-colors flex items-center justify-center gap-2"
        >
          <span className="text-sm text-lime font-medium">{t('progress.phasePhotos.startVsNow')}</span>
          <svg className="size-4 text-lime" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="6,3 11,8 6,13" />
          </svg>
        </button>
      )}

      {/* Upload Modal */}
      {uploadPhase !== null && (
        <PhasePhotoUploadModal
          phase={uploadPhase}
          previousPhasePhotos={uploadPhase > 1 ? getPhotosByPhase(uploadPhase - 1) : []}
          onUpload={uploadPhotos}
          onComplete={(uploaded) => handleUploadComplete(uploaded, uploadPhase)}
          onClose={() => setUploadPhase(null)}
        />
      )}

      {/* Reveal Animation */}
      {revealData && (
        <PhotoRevealAnimation
          before={revealData.before}
          after={revealData.after}
          phaseBefore={revealData.phase - 1}
          phaseAfter={revealData.phase}
          onDismiss={() => setRevealData(null)}
        />
      )}
    </div>
  )
}
