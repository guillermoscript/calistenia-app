import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs'
import type { Exercise } from '@calistenia/core/types'
import { getExerciseMedia } from '@calistenia/core/lib/exerciseMedia'
import type { CatalogMediaRecord } from '@calistenia/core/lib/exerciseMedia'

interface MediaViewerProps {
  exercise: Exercise
  onClose: () => void
  /** Optional catalog record for fallback media (layers b + c) */
  catalogRecord?: CatalogMediaRecord
}

export default function MediaViewer({ exercise, onClose, catalogRecord }: MediaViewerProps) {
  const { t } = useTranslation()
  const [imgIdx, setImgIdx] = useState<number>(0)

  // Resolve media via canonical hierarchy: program override → catalog static → catalog PB → curated → youtube
  const resolved = getExerciseMedia(
    {
      pbRecordId: exercise.pbRecordId,
      demoImages: exercise.demoImages,
      demoVideo: exercise.demoVideo,
      youtube: exercise.youtube,
    },
    { catalogRecord },
  )

  // [015] Structured media: prefer structured fields when available; fall back to legacy images[]
  const sequenceUrl = resolved.sequence
  const musclesUrl = resolved.muscles
  const legacyImages = resolved.sequence
    ? [] // sequence + muscles are rendered in their own sections below
    : resolved.images
  const video = resolved.video || ''
  const hasMedia = !!(sequenceUrl || legacyImages.length > 0 || musclesUrl || video)

  const ytSearchUrl = resolved.youtubeUrl || `https://www.youtube.com/results?search_query=${encodeURIComponent(exercise.youtube)}`
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(exercise.youtube + ' tutorial video')}`

  const prevImage = () => setImgIdx(i => (i - 1 + legacyImages.length) % legacyImages.length)
  const nextImage = () => setImgIdx(i => (i + 1) % legacyImages.length)

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-[700px] max-sm:max-w-[95vw] p-0 overflow-hidden bg-card border-border">
        <DialogHeader className="px-5 py-4 border-b border-border">
          <div className="font-mono text-[10px] text-lime tracking-[2px] mb-1">MEDIA</div>
          <DialogTitle className="font-semibold text-[15px] text-foreground">{exercise.name}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="demo" className="w-full">
          <TabsList className="w-full rounded-none bg-muted/60 border-b border-border">
            <TabsTrigger
              value="demo"
              className="flex-1 font-mono text-[11px] tracking-wide data-[state=active]:bg-accent data-[state=active]:text-lime"
            >
              DEMO
            </TabsTrigger>
            <TabsTrigger
              value="youtube"
              className="flex-1 font-mono text-[11px] tracking-wide data-[state=active]:bg-accent data-[state=active]:text-red-500"
            >
              YOUTUBE
            </TabsTrigger>
          </TabsList>

          {/* ── Demo Tab ── */}
          <TabsContent value="demo" className="mt-0">
            <div className="p-5 flex flex-col gap-4">
              {!hasMedia ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground font-mono text-sm tracking-wide">
                  {t('media.noMedia')}
                </div>
              ) : (
                <>
                  {/* [015] Sequence image — hero demo (movement phase strip) */}
                  {sequenceUrl && (
                    <div>
                      <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground/50">
                        DEMO
                      </div>
                      <div className="rounded-lg overflow-hidden bg-muted/30 border border-border/40">
                        <img
                          src={sequenceUrl}
                          alt={`${exercise.name} — secuencia`}
                          className="w-full max-h-[420px] object-contain"
                        />
                      </div>
                    </div>
                  )}

                  {/* [015] Muscles image — activation map with labeled section */}
                  {musclesUrl && (
                    <div>
                      <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground/50">
                        MÚSCULOS TRABAJADOS
                      </div>
                      <div className="rounded-lg overflow-hidden bg-muted/30 border border-border/40">
                        <img
                          src={musclesUrl}
                          alt={`${exercise.name} — músculos trabajados`}
                          className="w-full max-h-[320px] object-contain"
                        />
                      </div>
                    </div>
                  )}

                  {/* Legacy image carousel (when no structured media) */}
                  {legacyImages.length > 0 && (
                    <div className="relative">
                      <img
                        src={legacyImages[imgIdx]}
                        alt={`${exercise.name} demo ${imgIdx + 1}`}
                        className="w-full max-h-[400px] object-contain rounded-lg bg-muted"
                      />
                      {legacyImages.length > 1 && (
                        <>
                          <button
                            onClick={prevImage}
                            className="absolute left-2 top-1/2 -translate-y-1/2 size-8 rounded-full bg-card/80 border border-border text-muted-foreground hover:text-lime hover:border-lime/30 transition-colors flex items-center justify-center cursor-pointer"
                          >
                            &larr;
                          </button>
                          <button
                            onClick={nextImage}
                            className="absolute right-2 top-1/2 -translate-y-1/2 size-8 rounded-full bg-card/80 border border-border text-muted-foreground hover:text-lime hover:border-lime/30 transition-colors flex items-center justify-center cursor-pointer"
                          >
                            &rarr;
                          </button>
                          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 font-mono text-[10px] text-muted-foreground bg-card/70 px-2 py-0.5 rounded">
                            {imgIdx + 1} / {legacyImages.length}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Video player */}
                  {video && (
                    <div className="rounded-lg overflow-hidden bg-muted">
                      <video
                        src={video}
                        controls
                        className="w-full max-h-[360px]"
                        preload="metadata"
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>

          {/* ── YouTube Tab ── */}
          <TabsContent value="youtube" className="mt-0">
            <div className="p-5 flex flex-col gap-3">
              <a
                href={ytSearchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 px-5 py-4 bg-red-500/5 border border-red-500/20 rounded-lg no-underline text-foreground hover:bg-red-500/10 transition-colors"
              >
                <svg width="32" height="22" viewBox="0 0 32 22" className="shrink-0">
                  <rect width="32" height="22" rx="5" fill="#FF0000"/>
                  <polygon points="13,6 13,16 22,11" fill="white"/>
                </svg>
                <div>
                  <div className="font-semibold text-sm mb-0.5">{t('media.searchYouTube')}</div>
                  <div className="text-[12px] text-muted-foreground">Resultados para: &quot;{exercise.youtube}&quot;</div>
                </div>
                <div className="ml-auto text-muted-foreground text-lg">&nearr;</div>
              </a>

              <a
                href={googleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 px-5 py-3.5 bg-sky-500/5 border border-sky-500/15 rounded-lg no-underline text-foreground hover:bg-sky-500/10 transition-colors"
              >
                <div className="size-8 rounded-md bg-sky-500/10 flex items-center justify-center text-base shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                  </svg>
                </div>
                <div>
                  <div className="font-medium text-sm mb-0.5">{t('media.searchGoogle')}</div>
                  <div className="text-[12px] text-muted-foreground">Resultados generales + videos</div>
                </div>
                <div className="ml-auto text-muted-foreground text-lg">&nearr;</div>
              </a>

              <button
                onClick={() => navigator.clipboard.writeText(exercise.youtube)}
                className="flex items-center gap-4 px-5 py-3.5 bg-lime/4 border border-lime/10 rounded-lg text-foreground cursor-pointer text-left hover:bg-lime/8 transition-colors"
              >
                <div className="size-8 rounded-md bg-lime/8 flex items-center justify-center text-base shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                  </svg>
                </div>
                <div>
                  <div className="font-medium text-sm mb-0.5">{t('media.copyToClipboard')}</div>
                  <div className="text-[12px] text-muted-foreground font-mono">{exercise.youtube}</div>
                </div>
              </button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
