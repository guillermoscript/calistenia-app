import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import { shareImage, canvasToBlob, loadLogo } from '../../lib/share'
import { op } from '@calistenia/core/lib/analytics'
import { formatPace, formatDuration, formatSpeed } from '@calistenia/core/lib/geo'
import { fillRRect, drawInitialAvatar } from '../../lib/canvas-helpers'
import i18n from '../../lib/i18n'
import type { CardioSession } from '@calistenia/core/types'
import {
  fitViewport,
  pointToPixel,
  tilesForViewport,
  cartoTileUrl,
  ROUTE_COLOR,
} from '@calistenia/core/lib/static-map'

// Spanish activity labels — matches mobile parity
const ACTIVITY_LABEL: Record<string, string> = {
  running: 'CARRERA',
  walking: 'CAMINATA',
  cycling: 'CICLISMO',
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
      const pad = 30
      const contentW = w - pad * 2
      const logo = await loadLogo()
      const isCycling = session.activity_type === 'cycling'

      // Palette — warm-tinted neutrals, ONE accent (the activity color)
      const accent = ROUTE_COLOR[session.activity_type] || ROUTE_COLOR.running
      const INK = '#f5f5f4'
      const INK_DIM = 'rgba(245,245,244,0.66)'
      const INK_FAINT = 'rgba(245,245,244,0.40)'
      const BG = '#0a0a0b'

      // ════════════════════════════════════════════
      // 0) CANVAS BACKGROUND
      // ════════════════════════════════════════════
      ctx.fillStyle = BG
      ctx.fillRect(0, 0, w, h)

      // ════════════════════════════════════════════
      // 1) MAP HERO — full-bleed tiles + route
      // ════════════════════════════════════════════

      const hasRoute = session.gps_points && session.gps_points.length >= 2

      if (hasRoute) {
        const vp = fitViewport(session.gps_points, w, h, { padding: 40 })

        if (vp) {
          const tiles = tilesForViewport(vp)

          // Load all tiles; resolve (not reject) so a bad tile never aborts the share
          const tileImages = await Promise.all(
            tiles.map(t =>
              new Promise<{ img: HTMLImageElement | null; t: typeof t }>(resolve => {
                const img = new Image()
                img.crossOrigin = 'anonymous'
                img.onload = () => resolve({ img, t })
                img.onerror = () => resolve({ img: null, t })
                img.src = cartoTileUrl(t, 'dark', true)
              })
            )
          )

          // Clip to canvas bounds then draw tiles full-bleed
          ctx.save()
          ctx.beginPath()
          ctx.rect(0, 0, w, h)
          ctx.clip()

          for (const { img, t } of tileImages) {
            if (img) ctx.drawImage(img, t.px, t.py, 256, 256)
          }

          ctx.restore()

          // Route polyline — build path helper (break on gap)
          const pts = session.gps_points
          const buildPath = () => {
            ctx.beginPath()
            let penDown = false
            for (const p of pts) {
              if (p.gap) { penDown = false; continue }
              const { x, y: py } = pointToPixel(p.lat, p.lng, vp)
              if (!penDown) { ctx.moveTo(x, py); penDown = true }
              else ctx.lineTo(x, py)
            }
          }

          // Dark casing
          buildPath()
          ctx.strokeStyle = 'rgba(0,0,0,0.5)'
          ctx.lineWidth = 9
          ctx.lineJoin = 'round'
          ctx.lineCap = 'round'
          ctx.stroke()

          // Accent stroke
          buildPath()
          ctx.strokeStyle = accent
          ctx.lineWidth = 6
          ctx.lineJoin = 'round'
          ctx.lineCap = 'round'
          ctx.stroke()

          // Start dot — filled #fafafa, accent ring
          const firstPt = pointToPixel(pts[0].lat, pts[0].lng, vp)
          ctx.beginPath()
          ctx.arc(firstPt.x, firstPt.y, 8, 0, Math.PI * 2)
          ctx.fillStyle = '#fafafa'
          ctx.fill()
          ctx.strokeStyle = accent
          ctx.lineWidth = 3
          ctx.stroke()

          // End dot — filled accent, white ring
          const lastPt = pointToPixel(pts[pts.length - 1].lat, pts[pts.length - 1].lng, vp)
          ctx.beginPath()
          ctx.arc(lastPt.x, lastPt.y, 8, 0, Math.PI * 2)
          ctx.fillStyle = accent
          ctx.fill()
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 2.5
          ctx.stroke()
        }
      } else {
        // No route: vertical gradient wash + giant ghost wordmark
        const emptyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.65)
        emptyGrad.addColorStop(0, accent + '2e')   // ~0.18 alpha
        emptyGrad.addColorStop(1, BG + 'ff')
        ctx.fillStyle = emptyGrad
        ctx.fillRect(0, 0, w, h)

        const ghostWord = ACTIVITY_LABEL[session.activity_type] ?? session.activity_type.toUpperCase()
        ctx.save()
        ctx.globalAlpha = 0.08
        ctx.fillStyle = accent
        ctx.font = '800 220px "DM Sans", system-ui, sans-serif'
        ctx.textBaseline = 'top'
        ctx.fillText(ghostWord, -10, h * 0.35)
        ctx.textBaseline = 'alphabetic'
        ctx.globalAlpha = 1
        ctx.restore()
      }

      // ════════════════════════════════════════════
      // 2) SCRIMS — legibility over the map
      // ════════════════════════════════════════════

      // Top scrim: header legibility (only meaningful when hasRoute)
      if (hasRoute) {
        const topScrim = ctx.createLinearGradient(0, 0, 0, h * 0.32)
        topScrim.addColorStop(0, 'rgba(0,0,0,0.55)')
        topScrim.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = topScrim
        ctx.fillRect(0, 0, w, h * 0.32)
      }

      // Bottom scrim: transparent → BG (stats sit on solid ground)
      const bottomScrim = ctx.createLinearGradient(0, h * 0.46, 0, h)
      bottomScrim.addColorStop(0, 'rgba(10,10,11,0)')
      bottomScrim.addColorStop(0.6, 'rgba(10,10,11,0.8)')
      bottomScrim.addColorStop(1, 'rgba(10,10,11,0.99)')
      ctx.fillStyle = bottomScrim
      ctx.fillRect(0, h * 0.46, w, h * 0.54)

      // ════════════════════════════════════════════
      // 3) HEADER (top, pad≈30)
      // ════════════════════════════════════════════

      const headerY = pad + 10

      // Accent dot + activity label
      ctx.fillStyle = accent
      ctx.beginPath()
      ctx.arc(pad + 4, headerY + 8, 4, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = accent
      ctx.font = '700 15px "DM Sans", system-ui, sans-serif'
      ctx.letterSpacing = '2px'
      ctx.fillText(ACTIVITY_LABEL[session.activity_type] ?? session.activity_type.toUpperCase(), pad + 14, headerY + 12)
      ctx.letterSpacing = '0px'

      // Date below
      ctx.fillStyle = INK_DIM
      ctx.font = '500 12px "DM Sans", system-ui, sans-serif'
      ctx.fillText(formatDate(session.started_at), pad + 14, headerY + 28)

      // Top-right: initial avatar
      const avatarCx = w - pad - 17
      const avatarCy = headerY + 17
      drawInitialAvatar(ctx, avatarCx, avatarCy, 17, (userName || '?')[0], 'rgba(10,10,11,0.55)', INK)

      // ════════════════════════════════════════════
      // 4) FOOT — anchored from bottom
      // ════════════════════════════════════════════

      // Brand row height reserve
      const brandH = 44
      const footBottom = h - pad

      // Brand row — hairline top border + CALISTENIA left / URL right
      const brandY = footBottom - brandH
      ctx.fillStyle = 'rgba(245,245,244,0.18)'
      ctx.fillRect(pad, brandY, contentW, 1)

      if (logo) ctx.drawImage(logo, pad, brandY + 14, 16, 16)
      ctx.fillStyle = INK
      ctx.font = '700 13px "DM Sans", system-ui, sans-serif'
      ctx.letterSpacing = '1px'
      ctx.fillText('CALISTENIA', pad + (logo ? 22 : 0), brandY + 27)
      ctx.letterSpacing = '0px'

      ctx.fillStyle = INK_FAINT
      ctx.font = '400 12px "DM Sans", system-ui, sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText('calistenia-app.com', w - pad, brandY + 27)
      ctx.textAlign = 'left'

      // Splits micro bar-chart (only if ≥2 valid splits)
      const validSplits = (session.splits || []).filter(s => s.pace > 0)
      let splitsH = 0
      if (validSplits.length >= 2) {
        const splitsSlice = validSplits.slice(0, 12)
        const bestPace = Math.min(...splitsSlice.map(s => s.pace))
        const worstPace = Math.max(...splitsSlice.map(s => s.pace))
        const paceRange = worstPace - bestPace || 1
        const maxBarH = 34
        const barW = (contentW - (splitsSlice.length - 1) * 3) / splitsSlice.length
        splitsH = maxBarH + 10  // 10px bottom gap before stat row

        const splitsTop = brandY - splitsH - 14

        for (let i = 0; i < splitsSlice.length; i++) {
          const sp = splitsSlice[i]
          const ratio = 1 - ((sp.pace - bestPace) / paceRange) * 0.7
          const bh = Math.max(4, Math.round(maxBarH * ratio))
          const bx = pad + i * (barW + 3)
          const by = splitsTop + (maxBarH - bh)
          const isBest = sp.pace === bestPace

          fillRRect(ctx, bx, by, barW, bh, 2, isBest ? accent : INK_FAINT)
        }
      }

      // Stat row — 3 inline stats with thin vertical dividers
      const statRowH = 60
      const splitsBlockH = validSplits.length >= 2 ? splitsH + 14 : 0
      const statRowBottom = brandY - splitsBlockH
      const statRowTop = statRowBottom - statRowH

      const statItems = [
        { value: formatDuration(session.duration_seconds), label: 'Tiempo' },
        {
          value: isCycling ? formatSpeed(session.avg_speed_kmh || 0) : formatPace(session.avg_pace),
          label: isCycling ? 'km/h' : 'min/km',
        },
        { value: String(session.calories_burned || 0), label: 'kcal' },
      ]

      const statCellW = contentW / 3

      statItems.forEach((st, i) => {
        const sx = pad + i * statCellW

        ctx.fillStyle = INK
        ctx.font = '800 34px "DM Sans", system-ui, sans-serif'
        ctx.fillText(st.value, sx, statRowTop + 36)

        ctx.fillStyle = INK_DIM
        ctx.font = '500 16px "DM Sans", system-ui, sans-serif'
        ctx.fillText(st.label, sx, statRowTop + 56)

        // Thin vertical divider between cells
        if (i > 0) {
          ctx.fillStyle = 'rgba(245,245,244,0.15)'
          ctx.fillRect(sx - 1, statRowTop + 4, 1, 44)
        }
      })

      // Accent rule under distance hero
      const ruleBottom = statRowTop - 16
      fillRRect(ctx, pad, ruleBottom, 90, 6, 3, accent)

      // Distance hero — left-aligned, value + 'KM' beside it
      const distStr = session.distance_km.toFixed(2)
      ctx.fillStyle = INK
      ctx.font = '800 100px "DM Sans", system-ui, sans-serif'
      ctx.textBaseline = 'alphabetic'
      const heroBaseline = ruleBottom - 10
      ctx.fillText(distStr, pad, heroBaseline)
      const distW = ctx.measureText(distStr).width

      ctx.fillStyle = accent
      ctx.font = '800 30px "DM Sans", system-ui, sans-serif'
      ctx.fillText('KM', pad + distW + 8, heroBaseline)

      // Byline — userName above distance
      const bylineY = heroBaseline - 104
      ctx.fillStyle = INK
      ctx.font = '600 26px "DM Sans", system-ui, sans-serif'
      ctx.fillText(userName || 'Atleta', pad, bylineY)

      // Optional race kicker — above byline in accent
      if (raceName) {
        ctx.fillStyle = accent
        ctx.font = '800 22px "DM Sans", system-ui, sans-serif'
        ctx.letterSpacing = '1px'
        ctx.fillText(raceName.toUpperCase(), pad, bylineY - 32)
        ctx.letterSpacing = '0px'
      }

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
