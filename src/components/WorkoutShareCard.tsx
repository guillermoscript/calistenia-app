import { useCallback } from 'react'
import { Button } from './ui/button'
import { shareImage, canvasToBlob, loadLogo } from '../lib/share'
import { todayStr } from '../lib/dateUtils'
import type { Exercise } from '../types'

interface Quote { q: string; a: string }

interface WorkoutShareCardProps {
  workoutTitle: string
  totalSets: number
  durationMin: number
  date?: string
  exercises?: Exercise[]
  quote?: Quote | null
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

/** Draw a stroked rounded rect */
function strokeRRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color: string, lineWidth: number) {
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
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.stroke()
}

export default function WorkoutShareCard({ workoutTitle, totalSets, durationMin, date, exercises, quote }: WorkoutShareCardProps) {
  const dateStr = date || todayStr()

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
      const pad = 32
      const logo = await loadLogo()
      const lime = '#a3e635'
      const limeDim = '#a3e63540'
      const fg = '#fafafa'
      const fgDim = '#a1a1aa'
      const fgMuted = '#52525b'
      const bg = '#09090b'
      const cardBg = '#18181b'
      const borderColor = '#27272a'
      const exList = exercises || []

      // ── Full background ──
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)

      // ── Subtle lime accent strip at top ──
      const accentGrad = ctx.createLinearGradient(0, 0, w, 0)
      accentGrad.addColorStop(0, '#a3e63500')
      accentGrad.addColorStop(0.3, '#a3e63518')
      accentGrad.addColorStop(0.7, '#a3e63518')
      accentGrad.addColorStop(1, '#a3e63500')
      ctx.fillStyle = accentGrad
      ctx.fillRect(0, 0, w, 4)

      // ── Header: logo + app name + date ──
      let y = 32
      const logoSize = 36
      if (logo) {
        ctx.drawImage(logo, pad, y, logoSize, logoSize)
      }
      const textX = logo ? pad + logoSize + 10 : pad
      ctx.fillStyle = fg
      ctx.font = '700 14px "DM Sans", system-ui, sans-serif'
      ctx.fillText('CALISTENIA', textX, y + 15)
      ctx.fillStyle = fgMuted
      ctx.font = '400 11px "DM Sans", system-ui, sans-serif'
      ctx.fillText(formatDate(dateStr), textX, y + 30)

      // ── "SESIÓN COMPLETADA" label ──
      y = 90
      ctx.fillStyle = lime
      ctx.font = '600 10px "DM Sans", system-ui, sans-serif'
      ctx.letterSpacing = '3px'
      ctx.fillText('S E S I Ó N   C O M P L E T A D A', pad, y)
      ctx.letterSpacing = '0px'

      // ── Workout title — BIG ──
      y = 110
      ctx.fillStyle = fg
      ctx.font = '800 38px "DM Sans", system-ui, sans-serif'
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
        ctx.fillText(line, pad, y + (i + 1) * 46)
      })

      // ── Stats row — bold numbers ──
      y = y + titleLines.length * 46 + 28
      const statsW = (w - pad * 2 - 16) / 3
      const statsH = 80

      const stats = [
        { value: String(totalSets), label: 'SERIES', color: lime },
        { value: `${durationMin}`, label: 'MINUTOS', color: '#38bdf8' },
        { value: String(exList.length), label: 'EJERCICIOS', color: '#f472b6' },
      ]

      stats.forEach((s, i) => {
        const sx = pad + i * (statsW + 8)
        fillRRect(ctx, sx, y, statsW, statsH, 10, cardBg)
        strokeRRect(ctx, sx, y, statsW, statsH, 10, borderColor, 1)

        // Accent line at top of card
        fillRRect(ctx, sx + 12, y, statsW - 24, 2, 1, s.color + '40')

        // Value
        ctx.fillStyle = s.color
        ctx.font = '800 32px "DM Sans", system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(s.value, sx + statsW / 2, y + 42)

        // Label
        ctx.fillStyle = fgMuted
        ctx.font = '500 9px "DM Sans", system-ui, sans-serif'
        ctx.letterSpacing = '1.5px'
        ctx.fillText(s.label, sx + statsW / 2, y + statsH - 12)
        ctx.letterSpacing = '0px'
        ctx.textAlign = 'left'
      })

      // ── Exercise list ──
      y = y + statsH + 24
      if (exList.length > 0) {
        ctx.fillStyle = fgMuted
        ctx.font = '500 9px "DM Sans", system-ui, sans-serif'
        ctx.letterSpacing = '2px'
        ctx.fillText('E J E R C I C I O S', pad, y)
        ctx.letterSpacing = '0px'
        y += 16

        const maxExercises = Math.min(exList.length, 8)
        for (let i = 0; i < maxExercises; i++) {
          const ex = exList[i]
          const rowY = y + i * 42
          const rowH = 36

          fillRRect(ctx, pad, rowY, w - pad * 2, rowH, 8, i % 2 === 0 ? cardBg : bg)

          // Number
          ctx.fillStyle = limeDim
          ctx.font = '700 11px "DM Sans", system-ui, sans-serif'
          ctx.fillText(String(i + 1).padStart(2, '0'), pad + 10, rowY + 22)

          // Exercise name
          ctx.fillStyle = fg
          ctx.font = '600 13px "DM Sans", system-ui, sans-serif'
          const nameMaxW = w - pad * 2 - 140
          let name = ex.name
          while (ctx.measureText(name).width > nameMaxW && name.length > 3) {
            name = name.slice(0, -1)
          }
          if (name !== ex.name) name += '…'
          ctx.fillText(name, pad + 36, rowY + 22)

          // Sets × reps
          ctx.fillStyle = fgDim
          ctx.font = '400 11px "DM Sans", system-ui, sans-serif'
          ctx.textAlign = 'right'
          const setsText = `${ex.sets}×${ex.reps}`
          ctx.fillText(setsText, w - pad - 10, rowY + 22)
          ctx.textAlign = 'left'
        }

        if (exList.length > 8) {
          const moreY = y + maxExercises * 42 + 4
          ctx.fillStyle = fgMuted
          ctx.font = '400 11px "DM Sans", system-ui, sans-serif'
          ctx.fillText(`+${exList.length - 8} más`, pad + 36, moreY + 12)
          y = moreY + 20
        } else {
          y = y + maxExercises * 42 + 8
        }
      }

      // ── Quote section ──
      if (quote?.q) {
        y += 8
        // Thin divider
        fillRRect(ctx, pad, y, w - pad * 2, 1, 0, borderColor)
        y += 20

        ctx.fillStyle = fg + 'b0'
        ctx.font = 'italic 14px "DM Sans", system-ui, sans-serif'

        // Word wrap the quote
        const quoteMaxW = w - pad * 2 - 20
        const quoteWords = `"${quote.q}"`.split(' ')
        const quoteLines: string[] = []
        let qLine = ''
        for (const word of quoteWords) {
          const test = qLine ? `${qLine} ${word}` : word
          if (ctx.measureText(test).width > quoteMaxW) {
            if (qLine) quoteLines.push(qLine)
            qLine = word
          } else {
            qLine = test
          }
        }
        if (qLine) quoteLines.push(qLine)

        quoteLines.slice(0, 4).forEach((line, i) => {
          ctx.fillText(line, pad + 10, y + i * 20)
        })

        y += quoteLines.slice(0, 4).length * 20 + 6
        ctx.fillStyle = fgMuted
        ctx.font = '400 11px "DM Sans", system-ui, sans-serif'
        ctx.fillText(`— ${quote.a}`, pad + 10, y)
      }

      // ── Footer ──
      const footerY = h - 48
      fillRRect(ctx, pad, footerY - 8, w - pad * 2, 1, 0, borderColor)

      const footerLogoSize = 18
      if (logo) {
        ctx.drawImage(logo, pad, footerY + 6, footerLogoSize, footerLogoSize)
      }
      ctx.fillStyle = fgMuted
      ctx.font = '400 11px "DM Sans", system-ui, sans-serif'
      ctx.fillText('calistenia-app.com', pad + (logo ? footerLogoSize + 8 : 0), footerY + 20)

      // Lime dot accent
      ctx.beginPath()
      ctx.arc(w - pad, footerY + 14, 4, 0, Math.PI * 2)
      ctx.fillStyle = lime
      ctx.fill()

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
  }, [workoutTitle, totalSets, durationMin, dateStr, exercises, quote])

  return (
    <Button
      variant="outline"
      onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleShare() }}
      className="font-mono text-[10px] tracking-[2px] border-lime/25 text-lime hover:bg-lime/10 h-11 px-5"
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
