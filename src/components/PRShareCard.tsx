import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'
import { shareImage, canvasToBlob, loadLogo } from '../lib/share'
import { todayStr } from '../lib/dateUtils'
import { fillRRect, strokeRRect, drawCircleImage, drawInitialAvatar, loadImage, CARD_COLORS } from '../lib/canvas-helpers'
import i18n from '../lib/i18n'
import type { PREvent } from '../hooks/useProgress'

interface PRShareCardProps {
  prEvent: PREvent
  exerciseName: string
  userName?: string
  avatarUrl?: string | null
  referralCode?: string | null
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return dateStr
  }
}

export default function PRShareCard({ prEvent, exerciseName, userName, avatarUrl, referralCode }: PRShareCardProps) {
  const { t } = useTranslation()
  const dateStr = todayStr()

  const handleShare = useCallback(async () => {
    try {
      const scale = 2
      const w = 1080 / scale
      const h = 1920 / scale
      const canvas = document.createElement('canvas')
      canvas.width = 1080
      canvas.height = 1920
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.scale(scale, scale)
      const pad = 36
      const logo = await loadLogo()
      const avatarImg = avatarUrl ? await loadImage(avatarUrl) : null

      const { lime, fg, fgDim, fgMuted, bg, cardBg, borderColor } = CARD_COLORS

      // ── Background ──
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)

      // ── Lime gradient glow at top ──
      const topGlow = ctx.createRadialGradient(w / 2, 0, 0, w / 2, 0, w * 0.7)
      topGlow.addColorStop(0, '#a3e63518')
      topGlow.addColorStop(0.5, '#a3e63508')
      topGlow.addColorStop(1, '#a3e63500')
      ctx.fillStyle = topGlow
      ctx.fillRect(0, 0, w, 200)

      // ── Top accent line ──
      const accentGrad = ctx.createLinearGradient(0, 0, w, 0)
      accentGrad.addColorStop(0, '#a3e63500')
      accentGrad.addColorStop(0.2, lime)
      accentGrad.addColorStop(0.8, lime)
      accentGrad.addColorStop(1, '#a3e63500')
      ctx.fillStyle = accentGrad
      ctx.fillRect(0, 0, w, 3)

      // ── Profile section ──
      let y = 36
      const avatarR = 26
      const avatarCx = pad + avatarR
      const avatarCy = y + avatarR

      if (avatarImg) {
        drawCircleImage(ctx, avatarImg, avatarCx, avatarCy, avatarR)
        ctx.beginPath()
        ctx.arc(avatarCx, avatarCy, avatarR + 1.5, 0, Math.PI * 2)
        ctx.strokeStyle = lime + '60'
        ctx.lineWidth = 1.5
        ctx.stroke()
      } else {
        const initial = (userName || '?')[0]
        drawInitialAvatar(ctx, avatarCx, avatarCy, avatarR, initial, '#27272a', lime)
      }

      const profileTextX = avatarCx + avatarR + 14
      ctx.fillStyle = fg
      ctx.font = '700 16px "DM Sans", system-ui, sans-serif'
      ctx.fillText(userName || 'Atleta', profileTextX, avatarCy - 4)

      ctx.fillStyle = fgMuted
      ctx.font = '400 11px "DM Sans", system-ui, sans-serif'
      ctx.fillText(formatDate(dateStr), profileTextX, avatarCy + 14)

      // ── "NUEVO RECORD PERSONAL" badge ──
      y = avatarCy + avatarR + 28
      const badgeText = t('pr.newRecord')
      ctx.font = '700 10px "DM Sans", system-ui, sans-serif'
      ctx.letterSpacing = '3px'
      const badgeW = ctx.measureText(badgeText).width + 28
      const badgeH = 26
      fillRRect(ctx, pad, y, badgeW, badgeH, 13, lime + '18')
      strokeRRect(ctx, pad, y, badgeW, badgeH, 13, lime + '40', 1)

      ctx.fillStyle = lime
      ctx.fillText(badgeText, pad + 14, y + 17)
      ctx.letterSpacing = '0px'

      // ── Trophy emoji ──
      y += badgeH + 32
      ctx.font = '72px "Apple Color Emoji", "Segoe UI Emoji", sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('🏆', w / 2, y + 60)
      ctx.textAlign = 'left'

      // ── Exercise name — BIG ──
      y += 90
      ctx.fillStyle = fg
      ctx.font = '800 42px "DM Sans", system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(exerciseName.toUpperCase(), w / 2, y)
      ctx.textAlign = 'left'

      // ── PR values (old → new) ──
      y += 60
      const arrowY = y + 20

      // Old value
      ctx.fillStyle = fgMuted
      ctx.font = '700 56px "DM Sans", system-ui, sans-serif'
      ctx.textAlign = 'center'
      const oldText = prEvent.oldValue ? String(prEvent.oldValue) : '—'
      ctx.fillText(oldText, w / 2 - 80, arrowY)

      // Arrow
      ctx.fillStyle = lime
      ctx.font = '400 40px "DM Sans", system-ui, sans-serif'
      ctx.fillText('→', w / 2, arrowY - 4)

      // New value (highlighted)
      ctx.fillStyle = lime
      ctx.font = '800 72px "DM Sans", system-ui, sans-serif'
      ctx.fillText(String(prEvent.newValue), w / 2 + 80, arrowY + 4)

      // "reps" label
      y = arrowY + 40
      ctx.fillStyle = fgDim
      ctx.font = '500 14px "DM Sans", system-ui, sans-serif'
      ctx.fillText('REPS', w / 2, y)
      ctx.textAlign = 'left'

      // ── Motivational section ──
      y += 60
      const divGrad = ctx.createLinearGradient(pad, y, w - pad, y)
      divGrad.addColorStop(0, borderColor + '00')
      divGrad.addColorStop(0.2, borderColor)
      divGrad.addColorStop(0.8, borderColor)
      divGrad.addColorStop(1, borderColor + '00')
      ctx.fillStyle = divGrad
      ctx.fillRect(pad, y, w - pad * 2, 1)

      y += 30
      ctx.fillStyle = fg + 'b0'
      ctx.font = 'italic 16px "DM Sans", system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('💪 New limits. New strength.', w / 2, y)
      ctx.textAlign = 'left'

      // ── Footer ──
      const footerY = h - 52
      const footerGrad = ctx.createLinearGradient(pad, footerY - 12, w - pad, footerY - 12)
      footerGrad.addColorStop(0, borderColor + '00')
      footerGrad.addColorStop(0.2, borderColor)
      footerGrad.addColorStop(0.8, borderColor)
      footerGrad.addColorStop(1, borderColor + '00')
      ctx.fillStyle = footerGrad
      ctx.fillRect(pad, footerY - 12, w - pad * 2, 1)

      const footerLogoSize = 20
      if (logo) {
        ctx.drawImage(logo, pad, footerY + 4, footerLogoSize, footerLogoSize)
      }
      ctx.fillStyle = fgDim
      ctx.font = '500 12px "DM Sans", system-ui, sans-serif'
      ctx.fillText('CALISTENIA', pad + (logo ? footerLogoSize + 8 : 0), footerY + 18)

      ctx.fillStyle = fgMuted
      ctx.font = '400 10px "DM Sans", system-ui, sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText('calistenia-app.com', w - pad, footerY + 18)
      ctx.textAlign = 'left'

      const blob = await canvasToBlob(canvas)
      if (!blob) return
      const shareText = referralCode
        ? `${exerciseName}: ${prEvent.oldValue || 0} → ${prEvent.newValue} reps 🏆\ngym.guille.tech/invite/${referralCode}`
        : `${exerciseName}: ${prEvent.oldValue || 0} → ${prEvent.newValue} reps 🏆`
      await shareImage(
        blob,
        `pr_${prEvent.prKey}_${dateStr}.png`,
        `${t('pr.newRecord')} — ${exerciseName}`,
        shareText,
      )
    } catch (e) {
      console.warn('PR share error:', e)
    }
  }, [prEvent, exerciseName, userName, avatarUrl, dateStr, t, referralCode])

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleShare() }}
      className="flex-shrink-0 text-[10px] font-mono tracking-wider border-lime/25 text-lime hover:bg-lime/10"
    >
      {t('pr.share')}
    </Button>
  )
}
