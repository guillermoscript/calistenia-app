import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import { shareContent, type ShareMethod } from '../../lib/share'
import { op } from '../../lib/analytics'

const BASE_URL = 'https://gym.guille.tech'

interface InviteButtonProps {
  referralCode: string | null
  onCreateChallenge?: () => void
  className?: string
}

export function InviteButton({ referralCode, onCreateChallenge, className }: InviteButtonProps) {
  const { t } = useTranslation()
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

  if (!referralCode) return null

  const inviteUrl = `${BASE_URL}/invite/${referralCode}`

  const handleQuickInvite = async (method: ShareMethod) => {
    const ok = await shareContent({
      title: t('share.inviteTitle'),
      text: t('share.inviteText'),
      url: inviteUrl,
    }, method)

    if (ok) op.track('invite_sent', { method })

    if (method === 'copy' && ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
    setOpen(false)
  }

  return (
    <div ref={ref} className={cn('relative inline-block', className)}>
      <Button
        onClick={() => setOpen(o => !o)}
        className="bg-lime text-[hsl(0_0%_5%)] hover:bg-lime/90 font-semibold text-sm h-10 px-5"
      >
        <InviteIcon className="size-4 mr-1.5" />
        {t('share.invite')}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[200px] bg-card border border-border rounded-lg shadow-lg py-1 motion-safe:animate-fade-in">
          <div className="px-3 py-1.5 text-[10px] tracking-widest uppercase text-muted-foreground">{t('share.quickInvite')}</div>
          {navigator.share && (
            <DropItem label={t('share.shareNative')} onClick={() => handleQuickInvite('native')} />
          )}
          <DropItem label="WhatsApp" onClick={() => handleQuickInvite('whatsapp')} accent="text-emerald-400" />
          <DropItem label={copied ? t('share.copied') : t('share.copyLink')} onClick={() => handleQuickInvite('copy')} />

          {onCreateChallenge && (
            <>
              <div className="border-t border-border my-1" />
              <DropItem
                label={t('share.inviteWithChallenge')}
                onClick={() => {
                  setOpen(false)
                  onCreateChallenge()
                }}
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function DropItem({ label, onClick, accent }: { label: string; onClick: () => void; accent?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/50 transition-colors text-left',
        accent || 'text-foreground',
      )}
    >
      {label}
    </button>
  )
}

function InviteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="6" cy="5" r="2.5" />
      <path d="M1.5 14c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5" />
      <path d="M12 5v4M10 7h4" />
    </svg>
  )
}
