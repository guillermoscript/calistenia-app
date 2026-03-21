import { useCallback } from 'react'
import { Button } from '../ui/button'
import { shareImage, canvasToBlob, loadLogo } from '../../lib/share'
import { formatPace, formatDuration, formatSpeed } from '../../lib/geo'
import { CARDIO_ACTIVITY } from '../../lib/style-tokens'
import type { CardioSession, KmSplit } from '../../types'

/** Uppercase labels for canvas rendering */
const ACTIVITY_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(CARDIO_ACTIVITY).map(([k, v]) => [k, v.label.toUpperCase()])
)

const ACCENT_COLORS: Record<string, string> = {
  running: '#a3e635',
  walking: '#fbbf24',
  cycling: '#38bdf8',
}

/** Draw a filled rounded rect */
function fillRRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color: string) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

interface CardioShareCardProps {
  session: CardioSession
}

export default function CardioShareCard({ session }: CardioShareCardProps) {
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
      const accent = ACCENT_COLORS[session.activity_type] || ACCENT_COLORS.running
      const isCycling = session.activity_type === 'cycling'

      // Background
      const grad = ctx.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, '#0a0a0a')
      grad.addColorStop(0.4, '#0f0f0f')
      grad.addColorStop(1, '#0a0a0a')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)

      // Header with logo
      const logoSize = 44
      const headerY = 40
      if (logo) ctx.drawImage(logo, pad, headerY, logoSize, logoSize)
      const textX = logo ? pad + logoSize + 12 : pad

      ctx.fillStyle = '#fafafa'
      ctx.font = '700 16px system-ui, -apple-system, sans-serif'
      ctx.fillText('CALISTENIA APP', textX, headerY + 20)

      ctx.fillStyle = '#525252'
      ctx.font = '400 12px system-ui, -apple-system, sans-serif'
      ctx.fillText(formatDate(session.started_at), textX, headerY + 38)

      // Activity type label
      ctx.fillStyle = accent
      ctx.font = '600 13px system-ui, -apple-system, sans-serif'
      ctx.fillText(ACTIVITY_LABELS[session.activity_type] || 'CARDIO', pad, 120)

      // Accent line
      fillRRect(ctx, pad, 130, 40, 3, 1.5, accent)

      // Big distance
      ctx.fillStyle = '#fafafa'
      ctx.font = '700 72px system-ui, -apple-system, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(session.distance_km.toFixed(2), w / 2, 220)
      ctx.fillStyle = '#525252'
      ctx.font = '400 16px system-ui, -apple-system, sans-serif'
      ctx.fillText('KILÓMETROS', w / 2, 248)
      ctx.textAlign = 'left'

      // Stats grid 2x2
      const statsY = 290
      const cardW = (w - pad * 2 - 12) / 2
      const cardH = 100

      const statsData = [
        { label: 'DURACIÓN', value: formatDuration(session.duration_seconds), color: '#fafafa' },
        {
          label: isCycling ? 'VELOCIDAD' : 'RITMO',
          value: isCycling ? `${formatSpeed(session.avg_speed_kmh || 0)} km/h` : formatPace(session.avg_pace),
          color: accent,
        },
        { label: 'CALORÍAS', value: String(session.calories_burned || 0), unit: 'kcal', color: '#fb923c' },
        {
          label: isCycling ? 'VEL. MÁX' : 'RITMO MÁX',
          value: isCycling ? `${formatSpeed(session.max_speed_kmh || 0)} km/h` : formatPace(session.max_pace || 0),
          color: accent + '80',
        },
      ]

      statsData.forEach((s, i) => {
        const col = i % 2
        const row = Math.floor(i / 2)
        const x = pad + col * (cardW + 12)
        const y = statsY + row * (cardH + 10)
        fillRRect(ctx, x, y, cardW, cardH, 14, '#141414')

        ctx.fillStyle = s.color
        ctx.font = '700 32px system-ui, -apple-system, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(s.value, x + cardW / 2, y + 48)

        if (s.unit) {
          ctx.fillStyle = s.color + '80'
          ctx.font = '400 14px system-ui, -apple-system, sans-serif'
          ctx.fillText(s.unit, x + cardW / 2, y + 66)
        }

        ctx.fillStyle = '#525252'
        ctx.font = '600 10px system-ui, -apple-system, sans-serif'
        ctx.fillText(s.label, x + cardW / 2, y + cardH - 10)
        ctx.textAlign = 'left'
      })

      // Elevation if > 0
      let nextY = statsY + 2 * (cardH + 10) + 20
      if (session.elevation_gain > 0) {
        fillRRect(ctx, pad, nextY, w - pad * 2, 50, 14, '#141414')
        ctx.fillStyle = '#fbbf24'
        ctx.font = '700 24px system-ui, -apple-system, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(`${session.elevation_gain}m`, w / 2, nextY + 28)
        ctx.fillStyle = '#525252'
        ctx.font = '600 10px system-ui, -apple-system, sans-serif'
        ctx.fillText('DESNIVEL', w / 2, nextY + 44)
        ctx.textAlign = 'left'
        nextY += 70
      }

      // Top 3 splits
      if (session.splits && session.splits.length > 0) {
        const topSplits = [...session.splits]
          .filter(s => s.pace > 0)
          .sort((a, b) => a.pace - b.pace)
          .slice(0, 3)

        if (topSplits.length > 0) {
          ctx.fillStyle = '#404040'
          ctx.font = '600 11px system-ui, -apple-system, sans-serif'
          ctx.fillText('M E J O R E S   S P L I T S', pad, nextY + 10)
          nextY += 25

          topSplits.forEach((split, i) => {
            const y = nextY + i * 36
            fillRRect(ctx, pad, y, w - pad * 2, 30, 8, '#141414')
            ctx.fillStyle = '#a1a1aa'
            ctx.font = '400 12px system-ui, -apple-system, sans-serif'
            ctx.fillText(`KM ${split.km}`, pad + 12, y + 20)
            ctx.fillStyle = accent
            ctx.font = '700 14px system-ui, -apple-system, sans-serif'
            ctx.textAlign = 'right'
            ctx.fillText(formatPace(split.pace), w - pad - 12, y + 20)
            ctx.textAlign = 'left'
          })
        }
      }

      // Footer
      const footerY = h - 60
      const barW = w - pad * 2
      ctx.fillStyle = '#1a1a1a'
      ctx.fillRect(pad, footerY, barW, 1)

      const footerLogoSize = 22
      if (logo) ctx.drawImage(logo, pad, footerY + 12, footerLogoSize, footerLogoSize)
      ctx.fillStyle = '#404040'
      ctx.font = '400 12px system-ui, -apple-system, sans-serif'
      ctx.fillText('calistenia-app.com', pad + (logo ? footerLogoSize + 8 : 0), footerY + 28)

      const blob = await canvasToBlob(canvas)
      if (!blob) return
      const dateStr = session.started_at.split('T')[0]
      await shareImage(
        blob,
        `cardio_${dateStr}.png`,
        `${ACTIVITY_LABELS[session.activity_type]} — ${session.distance_km.toFixed(2)} km`,
        `${session.distance_km.toFixed(2)} km en ${formatDuration(session.duration_seconds)}`,
      )
    } catch (e) {
      console.warn('Share error:', e)
    }
  }, [session])

  return (
    <Button
      variant="outline"
      onClick={handleShare}
      className="h-11 font-bebas text-lg tracking-wide border-border"
    >
      COMPARTIR
    </Button>
  )
}

function formatDate(isoStr: string): string {
  try {
    const d = new Date(isoStr)
    return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return isoStr.split('T')[0]
  }
}
