import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import type { BodyPhoto } from '../../hooks/useBodyPhotos'

interface PhotoComparatorProps {
  photos: BodyPhoto[]
}

export default function PhotoComparator({ photos }: PhotoComparatorProps) {
  const { t } = useTranslation()
  const [category, setCategory] = useState('front')
  const [leftIdx, setLeftIdx] = useState(0)
  const [rightIdx, setRightIdx] = useState(0)
  const [sliderPos, setSliderPos] = useState(50)

  const categories = useMemo(() => {
    const cats = [...new Set(photos.map(p => p.category).filter(Boolean))]
    return cats.length > 0 ? cats : ['front']
  }, [photos])

  const filtered = useMemo(
    () => photos.filter(p => p.category === category).sort((a, b) => a.date.localeCompare(b.date)),
    [photos, category]
  )

  if (filtered.length < 2) return null

  // Set initial right to latest
  const left = filtered[leftIdx] || filtered[0]
  const right = filtered[rightIdx || filtered.length - 1] || filtered[filtered.length - 1]

  return (
    <div className="mb-8">
      <div className="text-[10px] text-muted-foreground tracking-[3px] mb-4 uppercase">{t('progress.photoComparator.title')}</div>
      <Card>
        <CardContent className="p-5">
          {/* Category selector */}
          <div className="flex gap-1.5 mb-4">
            {categories.map(c => (
              <Button
                key={c}
                variant="outline"
                size="sm"
                onClick={() => { setCategory(c); setLeftIdx(0); setRightIdx(filtered.length - 1) }}
                className={cn(
                  'h-7 px-3 text-[10px] tracking-wide capitalize',
                  category === c && 'border-lime/50 text-lime bg-lime/10'
                )}
              >
                {c === 'front' ? t('progress.photoComparator.front') : c === 'side' ? t('progress.photoComparator.side') : c === 'back' ? t('progress.photoComparator.back') : c}
              </Button>
            ))}
          </div>

          {/* Comparator */}
          <div className="relative aspect-[3/4] max-h-[500px] overflow-hidden rounded-lg border border-border/60 select-none">
            {/* Right image (full) */}
            <img
              src={right.url}
              alt={`${right.category} - ${right.date}`}
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Left image (clipped) */}
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ width: `${sliderPos}%` }}
            >
              <img
                src={left.url}
                alt={`${left.category} - ${left.date}`}
                className="absolute inset-0 w-full h-full object-cover"
                style={{ width: `${10000 / sliderPos}%`, maxWidth: 'none' }}
              />
            </div>
            {/* Slider line */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white/80 cursor-ew-resize z-10"
              style={{ left: `${sliderPos}%` }}
            >
              <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-8 rounded-full bg-white/90 border-2 border-lime flex items-center justify-center text-xs font-bold text-zinc-900">
                ↔
              </div>
            </div>
            {/* Drag area */}
            <input
              type="range"
              min={5}
              max={95}
              value={sliderPos}
              onChange={e => setSliderPos(Number(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-20"
            />
            {/* Labels */}
            <div className="absolute bottom-2 left-2 bg-black/70 text-white text-[10px] px-2 py-1 rounded font-mono z-10">
              {left.date}
            </div>
            <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-2 py-1 rounded font-mono z-10">
              {right.date}
            </div>
          </div>

          {/* Photo selectors */}
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <div className="text-[9px] text-muted-foreground tracking-widest uppercase mb-2">{t('progress.photoComparator.before')}</div>
              <div className="flex gap-1 flex-wrap">
                {filtered.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => setLeftIdx(i)}
                    className={cn(
                      'px-2 py-1 rounded text-[10px] font-mono border transition-colors',
                      leftIdx === i
                        ? 'border-lime/50 text-lime bg-lime/10'
                        : 'border-border text-muted-foreground hover:border-lime/30'
                    )}
                  >
                    {p.date.slice(5)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-muted-foreground tracking-widest uppercase mb-2">{t('progress.photoComparator.after')}</div>
              <div className="flex gap-1 flex-wrap">
                {filtered.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => setRightIdx(i)}
                    className={cn(
                      'px-2 py-1 rounded text-[10px] font-mono border transition-colors',
                      (rightIdx || filtered.length - 1) === i
                        ? 'border-lime/50 text-lime bg-lime/10'
                        : 'border-border text-muted-foreground hover:border-lime/30'
                    )}
                  >
                    {p.date.slice(5)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
