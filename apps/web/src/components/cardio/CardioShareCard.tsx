import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import { shareImage, canvasToBlob, loadLogo } from '../../lib/share'
import { op } from '../../lib/analytics'
import { formatPace, formatDuration, formatSpeed } from '../../lib/geo'
import { fillRRect, drawInitialAvatar, CARD_COLORS } from '../../lib/canvas-helpers'
import i18n from '../../lib/i18n'
import type { CardioSession } from '../../types'

const ACCENT: Record<string, string> = {
  running: '#a3e635',
  walking: '#fbbf24',
  cycling: '#38bdf8',
}

interface CardioShareCardProps {
  session: CardioSession
  referralCode?: string | null
  raceName?: string
  userName?: string
}

export default function CardioShareCard({ session, referralCode, raceName, userName }: CardioShareCardProps) {
  const { t } = useTranslation()
  const handleShare = useCallback(async () => {
    try {
      const scale = 2
      const w = 1080 / scale  // 540
      const h = 1920 / scale  // 960
      const canvas = document.createElement('canvas')
      canvas.width = 1080
      canvas.height = 1920
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.scale(scale, scale)
      const pad = 32
      const logo = await loadLogo()
      const isCycling = session.activity_type === 'cycling'
      const accent = ACCENT[session.activity_type] || ACCENT.running
      const { fg, fgDim, fgMuted, bg, cardBg, borderColor } = CARD_COLORS
      const contentW = w - pad * 2

      // ── Background ──
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)

      // ── Top accent band — thick, bold ──
      const bandH = 4
      ctx.fillStyle = accent
      ctx.fillRect(0, 0, w, bandH)

      // ── Subtle noise texture via diagonal lines ──
      ctx.globalAlpha = 0.012
      ctx.strokeStyle = fg
      ctx.lineWidth = 0.5
      for (let i = -h; i < w + h; i += 18) {
        ctx.beginPath()
        ctx.moveTo(i, 0)
        ctx.lineTo(i + h, h)
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // ── Large accent glow ──
      const glow = ctx.createRadialGradient(w * 0.3, 160, 0, w * 0.3, 160, 320)
      glow.addColorStop(0, accent + '0c')
      glow.addColorStop(1, accent + '00')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, w, 400)

      let y = bandH + 32

      // ════════════════════════════════════════════
      // ZONE 1: Identity (profile + race + activity)
      // ════════════════════════════════════════════

      // Profile
      const avatarR = 18
      drawInitialAvatar(ctx, pad + avatarR, y + avatarR, avatarR, (userName || '?')[0], borderColor, accent)

      const px = pad + avatarR * 2 + 12
      ctx.fillStyle = fg
      ctx.font = '700 14px "DM Sans", system-ui, sans-serif'
      ctx.fillText(userName || 'Atleta', px, y + avatarR - 1)
      ctx.fillStyle = fgMuted
      ctx.font = '400 10px "DM Sans", system-ui, sans-serif'
      ctx.fillText(formatDate(session.started_at), px, y + avatarR + 13)

      // Logo right
      if (logo) ctx.drawImage(logo, w - pad - 24, y + 6, 24, 24)

      y += avatarR * 2 + 24

      // Race name — large typographic element, not a badge
      if (raceName) {
        ctx.fillStyle = accent
        ctx.font = '800 22px "DM Sans", system-ui, sans-serif'
        ctx.fillText(raceName.toUpperCase(), pad, y + 20)
        // Underline accent
        const nameW = ctx.measureText(raceName.toUpperCase()).width
        ctx.fillStyle = accent + '40'
        ctx.fillRect(pad, y + 26, nameW, 2)
        y += 44
      }

      // Activity label — small, muted
      ctx.fillStyle = fgMuted
      ctx.font = '500 9px "DM Sans", system-ui, sans-serif'
      ctx.letterSpacing = '2px'
      ctx.fillText(i18n.t(`cardio.${session.activity_type}`).toUpperCase(), pad, y + 8)
      ctx.letterSpacing = '0px'
      y += 18

      // ════════════════════════════════════════════
      // ZONE 2: Hero distance — BIG, dominant
      // ════════════════════════════════════════════

      const distStr = session.distance_km.toFixed(2)
      const dotPos = distStr.indexOf('.')

      // Whole number — massive
      ctx.fillStyle = fg
      ctx.font = '800 120px "DM Sans", system-ui, sans-serif'
      const wholeStr = distStr.slice(0, dotPos)
      ctx.fillText(wholeStr, pad - 4, y + 105)
      const wholeW = ctx.measureText(wholeStr).width

      // Decimal — lighter, smaller
      ctx.fillStyle = fgDim
      ctx.font = '300 60px "DM Sans", system-ui, sans-serif'
      ctx.fillText(distStr.slice(dotPos), pad - 4 + wholeW, y + 105)

      // KM unit — right-aligned, vertical center with distance
      ctx.fillStyle = accent
      ctx.font = '700 18px "DM Sans", system-ui, sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText('KM', w - pad, y + 105)
      ctx.textAlign = 'left'

      y += 128

      // ════════════════════════════════════════════
      // ZONE 3: Stats — 2x2 grid, tight, dense
      // ════════════════════════════════════════════

      const g = 6
      const cW = (contentW - g) / 2
      const cH = 72

      const allStats = [
        { value: formatDuration(session.duration_seconds), label: 'TIEMPO', color: fg },
        {
          value: isCycling ? formatSpeed(session.avg_speed_kmh || 0) : formatPace(session.avg_pace),
          label: isCycling ? 'VELOCIDAD' : 'RITMO',
          color: accent,
        },
        {
          value: isCycling ? formatSpeed(session.max_speed_kmh || 0) : formatPace(session.max_pace || 0),
          label: isCycling ? 'VEL. MÁX' : 'MEJOR RITMO',
          color: accent + 'a0',
        },
        { value: String(session.calories_burned || 0), label: 'CALORÍAS', color: '#fb923c' },
      ]

      allStats.forEach((s, i) => {
        const col = i % 2
        const row = Math.floor(i / 2)
        const sx = pad + col * (cW + g)
        const sy = y + row * (cH + g)

        fillRRect(ctx, sx, sy, cW, cH, 10, cardBg)

        // Left accent stripe
        fillRRect(ctx, sx, sy + 12, 2.5, cH - 24, 1, s.color + '60')

        ctx.fillStyle = s.color
        ctx.font = '800 26px "DM Sans", system-ui, sans-serif'
        ctx.fillText(s.value, sx + 16, sy + 38)

        ctx.fillStyle = fgMuted
        ctx.font = '500 8px "DM Sans", system-ui, sans-serif'
        ctx.letterSpacing = '1px'
        ctx.fillText(s.label, sx + 16, sy + cH - 14)
        ctx.letterSpacing = '0px'
      })

      y += 2 * (cH + g) + 4

      // Elevation row (if > 0)
      if (session.elevation_gain > 0) {
        y += 4
        fillRRect(ctx, pad, y, contentW, 48, 10, cardBg)
        fillRRect(ctx, pad, y + 10, 2.5, 28, 1, '#fbbf24' + '60')

        ctx.fillStyle = '#fbbf24'
        ctx.font = '800 20px "DM Sans", system-ui, sans-serif'
        ctx.fillText(`${session.elevation_gain}m`, pad + 16, y + 31)

        ctx.fillStyle = fgMuted
        ctx.font = '500 8px "DM Sans", system-ui, sans-serif'
        ctx.letterSpacing = '1px'
        ctx.textAlign = 'right'
        ctx.fillText('DESNIVEL', w - pad - 14, y + 31)
        ctx.letterSpacing = '0px'
        ctx.textAlign = 'left'
        y += 56
      }

      // ════════════════════════════════════════════
      // ZONE 4: Splits — visual bars fill remaining space
      // ════════════════════════════════════════════

      if (session.splits && session.splits.length > 0) {
        y += 12
        ctx.fillStyle = fgMuted
        ctx.font = '500 9px "DM Sans", system-ui, sans-serif'
        ctx.letterSpacing = '2px'
        ctx.fillText('SPLITS POR KM', pad, y + 8)
        ctx.letterSpacing = '0px'
        y += 20

        const validSplits = session.splits.filter(s => s.pace > 0)
        const bestPace = validSplits.length ? Math.min(...validSplits.map(s => s.pace)) : 1
        const worstPace = validSplits.length ? Math.max(...validSplits.map(s => s.pace)) : 1
        const paceRange = worstPace - bestPace || 1

        // Available space for splits — fill to footer
        const footerReserve = 64
        const availH = h - y - footerReserve
        const maxSplits = Math.min(session.splits.length, 10)
        const barH = Math.min(Math.floor((availH - 4) / maxSplits) - 4, 32)

        for (let i = 0; i < maxSplits; i++) {
          const split = session.splits[i]
          const sy = y + i * (barH + 4)
          const isBest = split.pace === bestPace && split.pace > 0

          // Bar width relative to pace (best = full, worst = 40%)
          const ratio = split.pace > 0 ? 1 - ((split.pace - bestPace) / paceRange) * 0.6 : 0.4
          const maxBarW = contentW - 80  // reserve space for km label + pace
          const barW = maxBarW * ratio

          // Bar bg
          fillRRect(ctx, pad + 30, sy, maxBarW, barH, 4, cardBg)

          // Bar fill
          const barColor = isBest ? accent : fgMuted + '50'
          fillRRect(ctx, pad + 30, sy, barW, barH, 4, barColor)

          // KM number
          ctx.fillStyle = isBest ? accent : fgDim
          ctx.font = `${isBest ? '700' : '500'} 10px "DM Sans", system-ui, sans-serif`
          ctx.textAlign = 'right'
          ctx.fillText(String(split.km), pad + 22, sy + barH / 2 + 4)

          // Pace text
          ctx.fillStyle = isBest ? accent : fg
          ctx.font = `${isBest ? '700' : '500'} 11px "DM Sans", system-ui, sans-serif`
          ctx.textAlign = 'right'
          ctx.fillText(formatPace(split.pace), w - pad, sy + barH / 2 + 4)

          ctx.textAlign = 'left'
        }
      }

      // ════════════════════════════════════════════
      // FOOTER
      // ════════════════════════════════════════════

      const fy = h - 48
      // Gradient line
      const fGrad = ctx.createLinearGradient(pad, fy - 8, w - pad, fy - 8)
      fGrad.addColorStop(0, borderColor + '00')
      fGrad.addColorStop(0.15, borderColor)
      fGrad.addColorStop(0.85, borderColor)
      fGrad.addColorStop(1, borderColor + '00')
      ctx.fillStyle = fGrad
      ctx.fillRect(pad, fy - 8, contentW, 1)

      if (logo) ctx.drawImage(logo, pad, fy + 6, 18, 18)
      ctx.fillStyle = fgDim
      ctx.font = '600 11px "DM Sans", system-ui, sans-serif'
      ctx.fillText('CALISTENIA', pad + (logo ? 26 : 0), fy + 19)

      ctx.fillStyle = fgMuted
      ctx.font = '400 10px "DM Sans", system-ui, sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText('calistenia-app.com', w - pad, fy + 19)
      ctx.textAlign = 'left'

      // ── Export ──
      const blob = await canvasToBlob(canvas)
      if (!blob) return
      const dateStr = session.started_at.split('T')[0]
      const shareText = referralCode
        ? `${session.distance_km.toFixed(2)} km en ${formatDuration(session.duration_seconds)}\ngym.guille.tech/invite/${referralCode}`
        : `${session.distance_km.toFixed(2)} km en ${formatDuration(session.duration_seconds)}`
      await shareImage(
        blob,
        `cardio_${dateStr}.png`,
        `${i18n.t(`cardio.${session.activity_type}`).toUpperCase()} — ${session.distance_km.toFixed(2)} km`,
        shareText,
      )
      op.track('share_card_shared', { card_type: 'cardio', activity: session.activity_type })
    } catch (e) {
      console.warn('Share error:', e)
    }
  }, [session, referralCode, raceName, userName])

  return (
    <Button
      variant="outline"
      onClick={handleShare}
      className="h-11 font-bebas text-lg tracking-wide border-border"
    >
      {t('cardio.share')}
    </Button>
  )
}

function formatDate(isoStr: string): string {
  try {
    const d = new Date(isoStr)
    return d.toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return isoStr.split('T')[0]
  }
}
