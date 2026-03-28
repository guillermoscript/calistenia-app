import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'
import { shareReferralInvite } from '../lib/share'

const REFERRAL_PROMPT_KEY = 'calistenia_referral_prompt_shown'

const REFERRAL_COOLDOWN_DAYS = 14

export function isReferralPromptShown(userId: string): boolean {
  const stored = localStorage.getItem(`${REFERRAL_PROMPT_KEY}_${userId}`)
  if (!stored || stored === 'true') return false // no date or legacy boolean → allow showing
  const lastShown = new Date(stored)
  if (isNaN(lastShown.getTime())) return false // invalid date → allow showing
  const daysSince = (Date.now() - lastShown.getTime()) / (1000 * 60 * 60 * 24)
  return daysSince < REFERRAL_COOLDOWN_DAYS
}

export function markReferralPromptShown(userId: string): void {
  localStorage.setItem(`${REFERRAL_PROMPT_KEY}_${userId}`, new Date().toISOString())
}

interface ReferralPromptProps {
  userId: string
  displayName: string
  referralCode: string
  onDismiss: () => void
}

export default function ReferralPrompt({ userId, displayName, referralCode, onDismiss }: ReferralPromptProps) {
  const { t } = useTranslation()

  const handleInvite = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    await shareReferralInvite(displayName, referralCode, 'whatsapp')
    markReferralPromptShown(userId)
    onDismiss()
  }, [displayName, referralCode, userId, onDismiss])

  const handleDismiss = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    markReferralPromptShown(userId)
    onDismiss()
  }, [userId, onDismiss])

  return (
    <div style={{ animation: 'fadeUp 0.5s 0.7s ease-out both' }}>
      <div className="h-px mb-5 bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="text-sm text-muted-foreground mb-3">
        {t('referral.prompt.question')}
      </div>
      <div className="flex items-center gap-3">
        <Button
          onClick={handleInvite}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 h-9"
        >
          <svg className="size-4 mr-1.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
          </svg>
          {t('referral.prompt.cta')}
        </Button>
        <button
          onClick={handleDismiss}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('referral.prompt.dismiss')}
        </button>
      </div>
    </div>
  )
}
