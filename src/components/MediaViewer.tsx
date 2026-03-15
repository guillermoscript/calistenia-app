import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs'
import type { Exercise } from '../types'

interface MediaViewerProps {
  exercise: Exercise
  onClose: () => void
}

export default function MediaViewer({ exercise, onClose }: MediaViewerProps) {
  const [imgIdx, setImgIdx] = useState<number>(0)

  const images = exercise.demoImages || []
  const video = exercise.demoVideo || ''
  const hasMedia = images.length > 0 || !!video

  const ytSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(exercise.youtube)}`
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(exercise.youtube + ' tutorial video')}`

  const prevImage = () => setImgIdx(i => (i - 1 + images.length) % images.length)
  const nextImage = () => setImgIdx(i => (i + 1) % images.length)

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-[700px] p-0 overflow-hidden bg-zinc-900 border-zinc-700">
        <DialogHeader className="px-5 py-4 border-b border-zinc-800">
          <div className="font-mono text-[10px] text-lime tracking-[2px] mb-1">MEDIA</div>
          <DialogTitle className="font-semibold text-[15px] text-zinc-100">{exercise.name}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="demo" className="w-full">
          <TabsList className="w-full rounded-none bg-zinc-800/60 border-b border-zinc-800">
            <TabsTrigger
              value="demo"
              className="flex-1 font-mono text-[11px] tracking-wide data-[state=active]:bg-zinc-700 data-[state=active]:text-lime"
            >
              DEMO
            </TabsTrigger>
            <TabsTrigger
              value="youtube"
              className="flex-1 font-mono text-[11px] tracking-wide data-[state=active]:bg-zinc-700 data-[state=active]:text-red-500"
            >
              YOUTUBE
            </TabsTrigger>
          </TabsList>

          {/* ── Demo Tab ── */}
          <TabsContent value="demo" className="mt-0">
            <div className="p-5 flex flex-col gap-4">
              {!hasMedia ? (
                <div className="flex items-center justify-center py-12 text-zinc-500 font-mono text-sm tracking-wide">
                  Sin media disponible
                </div>
              ) : (
                <>
                  {/* Image carousel */}
                  {images.length > 0 && (
                    <div className="relative">
                      <img
                        src={`/api/files/program_exercises/${exercise.pbRecordId}/${images[imgIdx]}`}
                        alt={`${exercise.name} demo ${imgIdx + 1}`}
                        className="w-full max-h-[400px] object-contain rounded-lg bg-zinc-950"
                      />
                      {images.length > 1 && (
                        <>
                          <button
                            onClick={prevImage}
                            className="absolute left-2 top-1/2 -translate-y-1/2 size-8 rounded-full bg-zinc-900/80 border border-zinc-700 text-zinc-300 hover:text-lime hover:border-lime/30 transition-colors flex items-center justify-center cursor-pointer"
                          >
                            &larr;
                          </button>
                          <button
                            onClick={nextImage}
                            className="absolute right-2 top-1/2 -translate-y-1/2 size-8 rounded-full bg-zinc-900/80 border border-zinc-700 text-zinc-300 hover:text-lime hover:border-lime/30 transition-colors flex items-center justify-center cursor-pointer"
                          >
                            &rarr;
                          </button>
                          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 font-mono text-[10px] text-zinc-400 bg-zinc-900/70 px-2 py-0.5 rounded">
                            {imgIdx + 1} / {images.length}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Video player */}
                  {video && (
                    <div className="rounded-lg overflow-hidden bg-zinc-950">
                      <video
                        src={`/api/files/program_exercises/${exercise.pbRecordId}/${video}`}
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
                className="flex items-center gap-4 px-5 py-4 bg-red-500/5 border border-red-500/20 rounded-lg no-underline text-zinc-100 hover:bg-red-500/10 transition-colors"
              >
                <svg width="32" height="22" viewBox="0 0 32 22" className="shrink-0">
                  <rect width="32" height="22" rx="5" fill="#FF0000"/>
                  <polygon points="13,6 13,16 22,11" fill="white"/>
                </svg>
                <div>
                  <div className="font-semibold text-sm mb-0.5">Buscar en YouTube</div>
                  <div className="text-[12px] text-zinc-500">Resultados para: &quot;{exercise.youtube}&quot;</div>
                </div>
                <div className="ml-auto text-zinc-500 text-lg">&nearr;</div>
              </a>

              <a
                href={googleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 px-5 py-3.5 bg-sky-500/5 border border-sky-500/15 rounded-lg no-underline text-zinc-100 hover:bg-sky-500/10 transition-colors"
              >
                <div className="size-8 rounded-md bg-sky-500/10 flex items-center justify-center text-base shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                  </svg>
                </div>
                <div>
                  <div className="font-medium text-sm mb-0.5">Buscar en Google</div>
                  <div className="text-[12px] text-zinc-500">Resultados generales + videos</div>
                </div>
                <div className="ml-auto text-zinc-500 text-lg">&nearr;</div>
              </a>

              <button
                onClick={() => navigator.clipboard.writeText(exercise.youtube)}
                className="flex items-center gap-4 px-5 py-3.5 bg-lime/4 border border-lime/10 rounded-lg text-zinc-100 cursor-pointer text-left hover:bg-lime/8 transition-colors"
              >
                <div className="size-8 rounded-md bg-lime/8 flex items-center justify-center text-base shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                  </svg>
                </div>
                <div>
                  <div className="font-medium text-sm mb-0.5">Copiar al portapapeles</div>
                  <div className="text-[12px] text-zinc-500 font-mono">{exercise.youtube}</div>
                </div>
              </button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
