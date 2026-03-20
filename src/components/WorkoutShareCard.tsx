import { useCallback } from 'react'
import { Button } from './ui/button'
import { shareImage, canvasToBlob } from '../lib/share'

interface WorkoutShareCardProps {
  workoutTitle: string
  totalSets: number
  durationMin: number
  date?: string
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

export default function WorkoutShareCard({ workoutTitle, totalSets, durationMin, date }: WorkoutShareCardProps) {
  const dateStr = date || new Date().toISOString().split('T')[0]

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

      // ── Background gradient ──
      const grad = ctx.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, '#0a0a0a')
      grad.addColorStop(0.4, '#0f0f0f')
      grad.addColorStop(1, '#0a0a0a')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)

      // ── Decorative top accent ──
      fillRRect(ctx, pad, 40, 60, 4, 2, '#a3e635')

      // ── Header ──
      ctx.fillStyle = '#a3e635'
      ctx.font = '600 16px system-ui, -apple-system, sans-serif'
      ctx.fillText('CALISTENIA APP', pad, 76)

      ctx.fillStyle = '#525252'
      ctx.font = '400 13px system-ui, -apple-system, sans-serif'
      ctx.fillText(formatDate(dateStr), pad, 96)

      // ── Section label ──
      ctx.fillStyle = '#404040'
      ctx.font = '600 11px system-ui, -apple-system, sans-serif'
      ctx.fillText('E N T R E N A M I E N T O   C O M P L E T A D O', pad, 150)

      // ── Checkmark circle ──
      const checkCx = w / 2
      const checkCy = 260
      const checkR = 60

      // Outer ring
      ctx.beginPath()
      ctx.arc(checkCx, checkCy, checkR, 0, Math.PI * 2)
      ctx.strokeStyle = '#a3e635'
      ctx.lineWidth = 4
      ctx.stroke()

      // Inner glow
      const glowGrad = ctx.createRadialGradient(checkCx, checkCy, 0, checkCx, checkCy, checkR)
      glowGrad.addColorStop(0, '#a3e63510')
      glowGrad.addColorStop(1, '#a3e63500')
      ctx.fillStyle = glowGrad
      ctx.beginPath()
      ctx.arc(checkCx, checkCy, checkR, 0, Math.PI * 2)
      ctx.fill()

      // Checkmark
      ctx.strokeStyle = '#a3e635'
      ctx.lineWidth = 5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(checkCx - 22, checkCy + 2)
      ctx.lineTo(checkCx - 6, checkCy + 18)
      ctx.lineTo(checkCx + 24, checkCy - 14)
      ctx.stroke()

      // ── Workout title ──
      const titleY = 380
      ctx.fillStyle = '#fafafa'
      ctx.font = '700 36px system-ui, -apple-system, sans-serif'
      ctx.textAlign = 'center'

      // Word wrap title if too long
      const maxTitleW = w - pad * 2
      const titleWords = workoutTitle.toUpperCase().split(' ')
      const titleLines: string[] = []
      let currentLine = ''
      for (const word of titleWords) {
        const test = currentLine ? `${currentLine} ${word}` : word
        if (ctx.measureText(test).width > maxTitleW) {
          if (currentLine) titleLines.push(currentLine)
          currentLine = word
        } else {
          currentLine = test
        }
      }
      if (currentLine) titleLines.push(currentLine)

      titleLines.forEach((line, i) => {
        ctx.fillText(line, w / 2, titleY + i * 44)
      })

      ctx.textAlign = 'left'

      // ── Stats cards ──
      const statsY = titleY + titleLines.length * 44 + 30
      const cardW = (w - pad * 2 - 12) / 2
      const cardH = 110

      const stats = [
        { label: 'SERIES', value: String(totalSets), color: '#a3e635' },
        { label: 'DURACION', value: `${durationMin}`, unit: 'min', color: '#38bdf8' },
      ]

      stats.forEach((s, i) => {
        const x = pad + i * (cardW + 12)
        fillRRect(ctx, x, statsY, cardW, cardH, 14, '#141414')

        // Value
        ctx.fillStyle = s.color
        ctx.font = '700 44px system-ui, -apple-system, sans-serif'
        ctx.textAlign = 'center'
        const valText = s.unit ? s.value : s.value
        ctx.fillText(valText, x + cardW / 2, statsY + 55)

        // Unit if present
        if (s.unit) {
          ctx.fillStyle = s.color + '80'
          ctx.font = '400 18px system-ui, -apple-system, sans-serif'
          ctx.fillText(s.unit, x + cardW / 2, statsY + 78)
        }

        // Label
        ctx.fillStyle = '#525252'
        ctx.font = '600 11px system-ui, -apple-system, sans-serif'
        ctx.fillText(s.label, x + cardW / 2, statsY + cardH - 12)

        ctx.textAlign = 'left'
      })

      // ── Motivational divider ──
      const divY = statsY + cardH + 50
      const barW = w - pad * 2
      fillRRect(ctx, pad, divY, barW, 2, 1, '#1a1a1a')

      // ── Footer ──
      const footerY = h - 60

      ctx.fillStyle = '#1a1a1a'
      ctx.fillRect(pad, footerY, barW, 1)

      ctx.fillStyle = '#a3e635'
      ctx.beginPath()
      ctx.arc(pad + 8, footerY + 24, 4, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#404040'
      ctx.font = '400 12px system-ui, -apple-system, sans-serif'
      ctx.fillText('calistenia-app.com', pad + 20, footerY + 28)

      const blob = await canvasToBlob(canvas)
      if (!blob) return
      await shareImage(
        blob,
        `workout_${dateStr}.png`,
        `${workoutTitle} - ${formatDate(dateStr)}`,
        `${workoutTitle} — ${totalSets} series en ${durationMin} min`,
      )
    } catch (e) {
      console.warn('Share error:', e)
    }
  }, [workoutTitle, totalSets, durationMin, dateStr])

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleShare}
      className="font-mono text-[10px] tracking-[2px] border-lime/25 text-lime hover:bg-lime/10"
    >
      COMPARTIR
    </Button>
  )
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return dateStr
  }
}
