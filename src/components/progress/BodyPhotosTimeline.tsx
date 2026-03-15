import { useState, useRef } from 'react'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { useBodyPhotos } from '../../hooks/useBodyPhotos'

const CATEGORIES = [
  { value: 'front', label: 'Frente' },
  { value: 'side', label: 'Lado' },
  { value: 'back', label: 'Espalda' },
]

interface BodyPhotosTimelineProps {
  userId: string | null
}

export default function BodyPhotosTimeline({ userId }: BodyPhotosTimelineProps) {
  const { photos, isReady, uploadPhoto, deletePhoto } = useBodyPhotos(userId)
  const [uploading, setUploading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [category, setCategory] = useState('front')
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [note, setNote] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setUploading(true)
    await uploadPhoto(file, date, category, note)
    setUploading(false)
    setShowUpload(false)
    setNote('')
    if (fileRef.current) fileRef.current.value = ''
  }

  if (!isReady) return null

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[10px] text-muted-foreground tracking-[3px] uppercase">Fotos de Progreso</div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowUpload(s => !s)}
            className="text-[10px] tracking-widest hover:border-lime hover:text-lime"
          >
            {showUpload ? 'CANCELAR' : '+ SUBIR FOTO'}
          </Button>
        </div>

        {/* Upload form */}
        {showUpload && (
          <div className="mb-4 p-4 bg-muted/20 rounded-lg border border-border/60 flex flex-col gap-3">
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">Foto</label>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:bg-muted file:text-foreground hover:file:bg-muted/80"
              />
            </div>
            <div className="flex gap-3 flex-wrap">
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Categoria</label>
                <div className="flex gap-1.5">
                  {CATEGORIES.map(c => (
                    <Button
                      key={c.value}
                      variant={category === c.value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setCategory(c.value)}
                      className={category === c.value
                        ? 'h-7 px-3 text-[10px] bg-lime text-zinc-900 hover:bg-lime/90'
                        : 'h-7 px-3 text-[10px]'
                      }
                    >
                      {c.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="min-w-[140px]">
                <label className="text-[10px] text-muted-foreground mb-1 block">Fecha</label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">Nota (opcional)</label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ej: Inicio de fase 2"
                className="h-8 text-sm"
              />
            </div>
            <Button
              onClick={handleUpload}
              disabled={uploading}
              className="h-9 bg-lime text-zinc-900 hover:bg-lime/90 font-bebas text-sm tracking-wide self-start"
            >
              {uploading ? 'SUBIENDO...' : 'SUBIR'}
            </Button>
          </div>
        )}

        {/* Photos grid */}
        {photos.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {photos.map(photo => (
              <div key={photo.id} className="relative group">
                <img
                  src={photo.url}
                  alt={`${photo.category} - ${photo.date}`}
                  className="w-full aspect-[3/4] object-cover rounded-lg border border-border/60"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 rounded-b-lg">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Badge variant="outline" className="text-[8px] border-lime/30 text-lime bg-lime/10 px-1.5 py-0">
                      {CATEGORIES.find(c => c.value === photo.category)?.label || photo.category}
                    </Badge>
                  </div>
                  <div className="text-[10px] text-foreground font-mono">{photo.date}</div>
                  {photo.note && (
                    <div className="text-[9px] text-muted-foreground mt-0.5 truncate">{photo.note}</div>
                  )}
                </div>
                <button
                  onClick={() => deletePhoto(photo.id)}
                  className="absolute top-1.5 right-1.5 size-6 rounded-full bg-black/60 text-white/70 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs"
                  title="Eliminar"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-muted-foreground text-sm py-6">
            {userId ? 'Sube tu primera foto para registrar tu progreso visual' : 'Necesitas PocketBase para subir fotos'}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
