import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Send } from 'lucide-react'
import { Input } from '../ui/input'
import { Spinner } from '../ui/spinner'
import { cn } from '../../lib/utils'

export function PantryChatInput({ onSend, busy, onManualAdd }: {
  onSend: (text: string) => void
  busy: boolean
  onManualAdd: () => void
}) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const canSend = text.trim().length > 0 && !busy

  const send = () => {
    if (!canSend) return
    onSend(text.trim())
    setText('')
  }

  return (
    <div className="flex items-center gap-2 border-t border-border bg-background px-3 py-3">
      <button
        type="button"
        onClick={onManualAdd}
        disabled={busy}
        aria-label={t('pantry.manualAdd')}
        className="size-11 shrink-0 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:border-lime-400/40 hover:text-lime-400 transition-colors disabled:opacity-50"
      >
        <Plus size={18} />
      </button>
      <Input
        value={text}
        onChange={e => setText(e.target.value.slice(0, 500))}
        placeholder={t('pantry.chatPlaceholder')}
        disabled={busy}
        onKeyDown={e => {
          if (e.key === 'Enter') send()
        }}
        className="h-11 flex-1"
      />
      <button
        type="button"
        onClick={send}
        disabled={!canSend}
        className={cn(
          'size-11 shrink-0 flex items-center justify-center rounded-md transition-colors',
          canSend ? 'bg-lime-400 hover:bg-lime-300 text-zinc-900' : 'bg-muted/40 text-muted-foreground',
        )}
      >
        {busy ? <Spinner className="size-4" /> : <Send size={18} />}
      </button>
    </div>
  )
}
