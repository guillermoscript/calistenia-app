import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'

interface YoutubeModalProps {
  query: string
  onClose: () => void
}

export default function YoutubeModal({ query, onClose }: YoutubeModalProps) {
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query + ' tutorial video')}`

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-[700px] p-0 overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-border">
          <div className="font-mono text-[10px] text-[hsl(var(--lime))] tracking-[2px] mb-1">▶ YOUTUBE TUTORIAL</div>
          <DialogTitle className="font-semibold text-[15px]">{query}</DialogTitle>
        </DialogHeader>

        <div className="p-5 flex flex-col gap-3">
          <a
            href={searchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 px-5 py-4 bg-red-500/5 border border-red-500/20 rounded-lg no-underline text-foreground hover:bg-red-500/10 transition-colors"
          >
            <svg width="32" height="22" viewBox="0 0 32 22" className="shrink-0">
              <rect width="32" height="22" rx="5" fill="#FF0000"/>
              <polygon points="13,6 13,16 22,11" fill="white"/>
            </svg>
            <div>
              <div className="font-semibold text-sm mb-0.5">Buscar en YouTube</div>
              <div className="text-[12px] text-muted-foreground">Resultados para: "{query}"</div>
            </div>
            <div className="ml-auto text-muted-foreground text-lg">↗</div>
          </a>

          <a
            href={googleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 px-5 py-3.5 bg-sky-500/5 border border-sky-500/15 rounded-lg no-underline text-foreground hover:bg-sky-500/10 transition-colors"
          >
            <div className="size-8 rounded-md bg-sky-500/10 flex items-center justify-center text-base shrink-0">🔍</div>
            <div>
              <div className="font-medium text-sm mb-0.5">Buscar en Google</div>
              <div className="text-[12px] text-muted-foreground">Resultados generales + videos</div>
            </div>
            <div className="ml-auto text-muted-foreground text-lg">↗</div>
          </a>

          <button
            onClick={() => navigator.clipboard.writeText(query)}
            className="flex items-center gap-4 px-5 py-3.5 bg-[hsl(var(--lime))]/4 border border-[hsl(var(--lime))]/10 rounded-lg text-foreground cursor-pointer text-left hover:bg-[hsl(var(--lime))]/8 transition-colors"
          >
            <div className="size-8 rounded-md bg-[hsl(var(--lime))]/8 flex items-center justify-center text-base shrink-0">📋</div>
            <div>
              <div className="font-medium text-sm mb-0.5">Copiar búsqueda al portapapeles</div>
              <div className="text-[12px] text-muted-foreground font-mono">{query}</div>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
