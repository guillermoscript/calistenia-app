import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'
import { cn } from '../lib/utils'
import type { ShareMethod } from '../lib/share'

interface ShareButtonProps {
  onShare: (method: ShareMethod) => Promise<boolean>
  onInvite?: () => void
  className?: string
  size?: 'sm' | 'default'
  variant?: 'outline' | 'ghost'
  label?: string
}

export function ShareButton({ onShare, onInvite, className, size = 'sm', variant = 'outline', label }: ShareButtonProps) {
  const { t } = useTranslation()
  const displayLabel = label ?? t('share.share').toUpperCase()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [open])

  const handle = async (method: ShareMethod) => {
    const ok = await onShare(method)
    if (method === 'copy' && ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative inline-block">
      <Button
        variant={variant}
        size={size}
        onClick={() => setOpen(o => !o)}
        className={cn(
          'text-[10px] tracking-widest gap-1.5',
          size === 'sm' && 'h-9 px-3',
          className,
        )}
      >
        <ShareIcon className="size-3.5" />
        {displayLabel}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] bg-card border border-border rounded-lg shadow-lg py-1 motion-safe:animate-fade-in">
          {navigator.share && (
            <DropItem icon={<ShareIcon className="size-3.5" />} label={t('share.shareNative')} onClick={() => handle('native')} />
          )}
          <DropItem icon={<WhatsAppIcon className="size-3.5" />} label="WhatsApp" onClick={() => handle('whatsapp')} accent="text-emerald-400" />
          <DropItem icon={copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />} label={copied ? t('share.copied') : t('share.copyLink')} onClick={() => handle('copy')} />
          {onInvite && (
            <>
              <div className="my-1 border-t border-border" />
              <DropItem icon={<InviteIcon className="size-3.5" />} label={t('share.inviteFriend')} onClick={() => { onInvite(); setOpen(false) }} accent="text-[hsl(var(--lime))]" />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function DropItem({ icon, label, onClick, accent }: { icon: React.ReactNode; label: string; onClick: () => void; accent?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/50 transition-colors',
        accent || 'text-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  )
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="3" r="2" />
      <circle cx="12" cy="13" r="2" />
      <circle cx="4" cy="8" r="2" />
      <line x1="5.8" y1="7" x2="10.2" y2="4" />
      <line x1="5.8" y1="9" x2="10.2" y2="12" />
    </svg>
  )
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="5" y="5" width="9" height="9" rx="1.5" />
      <path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3,8 7,12 13,4" />
    </svg>
  )
}

function InviteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="6" cy="5" r="2.5" />
      <path d="M1 13c0-2 2-3.5 5-3.5s5 1.5 5 3.5" />
      <path d="M12 5v4" />
      <path d="M10 7h4" />
    </svg>
  )
}
