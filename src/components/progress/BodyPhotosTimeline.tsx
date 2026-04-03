import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { todayStr } from '../../lib/dateUtils'
import { useBodyPhotos } from '../../hooks/useBodyPhotos'

const CATEGORIES = [
  { value: 'front', labelKey: 'progress.bodyPhotos.front' },
  { value: 'side', labelKey: 'progress.bodyPhotos.side' },
  { value: 'back', labelKey: 'progress.bodyPhotos.back' },
]

interface BodyPhotosTimelineProps {
  userId: string | null
}

export default function BodyPhotosTimeline({ userId }: BodyPhotosTimelineProps) {
  const { t } = useTranslation()
  const { photos, isReady, uploadPhoto, deletePhoto } = useBodyPhotos(userId)
  const [uploading, setUploading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [category, setCategory] = useState('front')
  const [date, setDate] = useState(() => todayStr())
  const [note, setNote] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    if (file.size > MAX_FILE_SIZE) {
      alert(t('progress.bodyPhotos.fileTooLarge'))
      return
    }
    setUploading(true)
    try {
      await uploadPhoto(file, date, category, note)
      setShowUpload(false)
      setNote('')
      if (fileRef.current) fileRef.current.value = ''
    } catch {
      // uploadPhoto handles its own error display
    } finally {
      setUploading(false)
    }
  }

  if (!isReady) return null

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[10px] text-muted-foreground tracking-[3px] uppercase">{t('progress.bodyPhotos.title')}</div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowUpload(s => !s)}
            className="text-[10px] tracking-widest hover:border-lime hover:text-lime"
          >
            {showUpload ? t('progress.bodyPhotos.cancel') : t('progress.bodyPhotos.uploadPhoto')}
          </Button>
        </div>

        {/* Upload form */}
        {showUpload && (
          <div className="mb-4 p-4 bg-muted/20 rounded-lg border border-border/60 flex flex-col gap-3">
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">{t('progress.bodyPhotos.photo')}</label>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:bg-muted file:text-foreground hover:file:bg-muted/80"
              />
            </div>
            <div className="flex gap-3 flex-wrap">
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">{t('progress.bodyPhotos.category')}</label>
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
                      {t(c.labelKey)}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="min-w-[140px]">
                <label className="text-[10px] text-muted-foreground mb-1 block">{t('progress.bodyPhotos.date')}</label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">{t('progress.bodyPhotos.noteOptional')}</label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('progress.bodyPhotos.notePlaceholder')}
                className="h-8 text-sm"
              />
            </div>
            <Button
              onClick={handleUpload}
              disabled={uploading}
              className="h-9 bg-lime text-zinc-900 hover:bg-lime/90 font-bebas text-sm tracking-wide self-start"
            >
              {uploading ? t('progress.bodyPhotos.uploading') : t('progress.bodyPhotos.upload')}
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
                      {t(CATEGORIES.find(c => c.value === photo.category)?.labelKey || photo.category)}
                    </Badge>
                  </div>
                  <div className="text-[10px] text-foreground font-mono">{photo.date}</div>
                  {photo.note && (
                    <div className="text-[9px] text-muted-foreground mt-0.5 truncate">{photo.note}</div>
                  )}
                </div>
                {confirmDeleteId === photo.id ? (
                  <div className="absolute top-1.5 right-1.5 flex gap-1">
                    <button
                      onClick={() => { deletePhoto(photo.id); setConfirmDeleteId(null) }}
                      className="size-6 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-medium"
                    >
                      <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3,8 7,12 13,4" /></svg>
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="size-6 rounded-full bg-black/60 text-white/70 flex items-center justify-center text-xs"
                    >
                      <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" /></svg>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(photo.id)}
                    className="absolute top-1.5 right-1.5 size-7 rounded-full bg-black/60 text-white/70 hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    title={t('progress.bodyPhotos.delete')}
                  >
                    <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" /></svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-muted-foreground text-sm py-6">
            {userId ? t('progress.bodyPhotos.emptyState') : t('progress.bodyPhotos.loginRequired')}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
