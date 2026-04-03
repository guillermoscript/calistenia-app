import { useCallback } from 'react'
import i18n from '../lib/i18n'
import { Button } from './ui/button'
import { shareImage, canvasToBlob, loadLogo } from '../lib/share'
import { op } from '../lib/analytics'
import { todayStr } from '../lib/dateUtils'
import { fillRRect, strokeRRect, drawCircleImage, drawInitialAvatar, loadImage } from '../lib/canvas-helpers'
import type { Exercise } from '../types'

interface Quote { q: string; a: string }

interface WorkoutShareCardProps {
  workoutTitle: string
  totalSets: number
  durationMin: number
  date?: string
  exercises?: Exercise[]
  quote?: Quote | null
  userName?: string
  avatarUrl?: string | null
  referralCode?: string | null
}

export default function WorkoutShareCard({ workoutTitle, totalSets, durationMin, date, exercises, quote, userName, avatarUrl, referralCode }: WorkoutShareCardProps) {
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
      const pad = 36
      const logo = await loadLogo()
      const avatar = avatarUrl ? await loadImage(avatarUrl) : null

      // Colors
      const lime = '#a3e635'
      const limeDim = '#a3e63540'
      const limeGlow = '#a3e63520'
      const fg = '#fafafa'
      const fgDim = '#a1a1aa'
      const fgMuted = '#52525b'
      const bg = '#09090b'
      const cardBg = '#18181b'
      const borderColor = '#27272a'
      const exList = exercises || []

      // ── Background ──
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)

      // ── Lime gradient glow at top ──
      const topGlow = ctx.createRadialGradient(w / 2, 0, 0, w / 2, 0, w * 0.7)
      topGlow.addColorStop(0, '#a3e63512')
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

      if (avatar) {
        drawCircleImage(ctx, avatar, avatarCx, avatarCy, avatarR)
        // Subtle ring
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

      // ── "SESIÓN COMPLETADA" badge ──
      y = avatarCy + avatarR + 28
      const badgeText = 'SESIÓN COMPLETADA'
      ctx.font = '700 10px "DM Sans", system-ui, sans-serif'
      ctx.letterSpacing = '3px'
      const badgeW = ctx.measureText(badgeText).width + 28
      const badgeH = 26
      fillRRect(ctx, pad, y, badgeW, badgeH, 13, lime + '18')
      strokeRRect(ctx, pad, y, badgeW, badgeH, 13, lime + '40', 1)

      ctx.fillStyle = lime
      ctx.fillText(badgeText, pad + 14, y + 17)
      ctx.letterSpacing = '0px'

      // ── Workout title — BIG ──
      y += badgeH + 18
      ctx.fillStyle = fg
      ctx.font = '800 42px "DM Sans", system-ui, sans-serif'
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
        ctx.fillText(line, pad, y + (i + 1) * 50)
      })

      // ── Stats row ──
      y = y + titleLines.length * 50 + 28
      const statsGap = 10
      const statsW = (w - pad * 2 - statsGap * 2) / 3
      const statsH = 88

      const stats = [
        { value: String(totalSets), label: 'SERIES', color: lime, icon: '🔥' },
        { value: `${durationMin}`, label: 'MINUTOS', color: '#38bdf8', icon: '⏱' },
        { value: String(exList.length), label: 'EJERCICIOS', color: '#f472b6', icon: '💪' },
      ]

      stats.forEach((s, i) => {
        const sx = pad + i * (statsW + statsGap)
        fillRRect(ctx, sx, y, statsW, statsH, 12, cardBg)
        strokeRRect(ctx, sx, y, statsW, statsH, 12, borderColor, 1)

        // Top accent bar
        const barGrad = ctx.createLinearGradient(sx + 16, y, sx + statsW - 16, y)
        barGrad.addColorStop(0, s.color + '00')
        barGrad.addColorStop(0.5, s.color + '60')
        barGrad.addColorStop(1, s.color + '00')
        ctx.fillStyle = barGrad
        ctx.fillRect(sx + 16, y + 1, statsW - 32, 2)

        // Emoji
        ctx.font = '20px "Apple Color Emoji", "Segoe UI Emoji", sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(s.icon, sx + statsW / 2, y + 30)

        // Value
        ctx.fillStyle = s.color
        ctx.font = '800 30px "DM Sans", system-ui, sans-serif'
        ctx.fillText(s.value, sx + statsW / 2, y + 58)

        // Label
        ctx.fillStyle = fgMuted
        ctx.font = '500 8px "DM Sans", system-ui, sans-serif'
        ctx.letterSpacing = '1.5px'
        ctx.fillText(s.label, sx + statsW / 2, y + statsH - 10)
        ctx.letterSpacing = '0px'
        ctx.textAlign = 'left'
      })

      // ── Exercise list ──
      y = y + statsH + 28
      if (exList.length > 0) {
        ctx.fillStyle = fgMuted
        ctx.font = '600 9px "DM Sans", system-ui, sans-serif'
        ctx.letterSpacing = '2.5px'
        ctx.fillText('EJERCICIOS', pad, y)
        ctx.letterSpacing = '0px'
        y += 18

        // Card container
        const maxExercises = Math.min(exList.length, 8)
        const listH = maxExercises * 42 + 16 + (exList.length > 8 ? 24 : 0)
        fillRRect(ctx, pad, y, w - pad * 2, listH, 12, cardBg)
        strokeRRect(ctx, pad, y, w - pad * 2, listH, 12, borderColor, 1)

        for (let i = 0; i < maxExercises; i++) {
          const ex = exList[i]
          const rowY = y + 8 + i * 42

          // Number badge
          fillRRect(ctx, pad + 12, rowY + 8, 22, 22, 6, limeDim)
          ctx.fillStyle = lime
          ctx.font = '700 10px "DM Sans", system-ui, sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText(String(i + 1), pad + 23, rowY + 23)
          ctx.textAlign = 'left'

          // Exercise name
          ctx.fillStyle = fg
          ctx.font = '600 13px "DM Sans", system-ui, sans-serif'
          const nameMaxW = w - pad * 2 - 150
          let name = ex.name
          while (ctx.measureText(name).width > nameMaxW && name.length > 3) {
            name = name.slice(0, -1)
          }
          if (name !== ex.name) name += '…'
          ctx.fillText(name, pad + 42, rowY + 24)

          // Sets × reps
          ctx.fillStyle = fgDim
          ctx.font = '400 11px "DM Sans", system-ui, sans-serif'
          ctx.textAlign = 'right'
          ctx.fillText(`${ex.sets}×${ex.reps}`, w - pad - 12, rowY + 24)
          ctx.textAlign = 'left'

          // Divider (not on last)
          if (i < maxExercises - 1) {
            ctx.fillStyle = borderColor + '80'
            ctx.fillRect(pad + 42, rowY + 40, w - pad * 2 - 54, 0.5)
          }
        }

        if (exList.length > 8) {
          const moreY = y + 8 + maxExercises * 42
          ctx.fillStyle = fgMuted
          ctx.font = '500 11px "DM Sans", system-ui, sans-serif'
          ctx.fillText(`+${exList.length - 8} más`, pad + 42, moreY + 14)
        }

        y += listH + 8
      }

      // ── Quote section ──
      if (quote?.q) {
        y += 16

        fillRRect(ctx, pad, y, w - pad * 2, 4, 2, borderColor)
        y += 24

        // Opening quote mark
        ctx.fillStyle = lime + '30'
        ctx.font = '800 48px Georgia, serif'
        ctx.fillText('"', pad + 4, y + 20)

        ctx.fillStyle = fg + 'b0'
        ctx.font = 'italic 14px "DM Sans", system-ui, sans-serif'

        const quoteMaxW = w - pad * 2 - 24
        const quoteWords = quote.q.split(' ')
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
          ctx.fillText(line, pad + 12, y + 10 + i * 20)
        })

        y += quoteLines.slice(0, 4).length * 20 + 16
        ctx.fillStyle = fgMuted
        ctx.font = '400 11px "DM Sans", system-ui, sans-serif'
        ctx.fillText(`— ${quote.a}`, pad + 12, y)
      }

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
        ? `${workoutTitle} — ${totalSets} series en ${durationMin} min 💪\ngym.guille.tech/invite/${referralCode}`
        : `${workoutTitle} — ${totalSets} series en ${durationMin} min 💪`
      await shareImage(
        blob,
        `workout_${dateStr}.png`,
        `${workoutTitle} - ${formatDate(dateStr)}`,
        shareText,
      )
      op.track('share_card_shared', { card_type: 'workout' })
    } catch (e) {
      console.warn('Share error:', e)
    }
  }, [workoutTitle, totalSets, durationMin, dateStr, exercises, quote, userName, avatarUrl, referralCode])

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
    return d.toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return dateStr
  }
}
