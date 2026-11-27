/**
 * Tarjeta para compartir el resumen del programa (#941). Se dibuja en canvas
 * como el resto de share cards de la web (`PRShareCard`, `CardioShareCard`),
 * pero con la estética del sistema: fondo casi negro, kicker mono, título
 * grande y filas separadas por líneas finas. Sin degradados ni emojis.
 */
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Share2 } from 'lucide-react'
import { Button } from '../ui/button'
import { shareImage, canvasToBlob, loadLogo } from '../../lib/share'
import { CARD_COLORS } from '../../lib/canvas-helpers'
import { trackShareCardShared } from '@calistenia/core/lib/analytics'
import { formatRecapNumber, type ProgramRecap } from '@calistenia/core/lib/programRecap'

interface Props {
  programName: string
  title: string
  weeks: number
  done: number
  planned: number
  recap: ProgramRecap
  userName?: string
}

const BEBAS = '"Bebas Neue", "DM Sans", system-ui, sans-serif'
const MONO = '"JetBrains Mono", ui-monospace, monospace'
const SANS = '"DM Sans", system-ui, sans-serif'

export default function ProgramRecapShareButton({ programName, title, weeks, done, planned, recap, userName }: Props) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)

  const handleShare = useCallback(async () => {
    if (busy) return
    setBusy(true)
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
      // Bebas y JetBrains Mono llegan por CSS: sin esperar, la primera
      // captura salía con la fuente de reserva.
      await document.fonts?.ready
      const logo = await loadLogo()
      const { lime, fg, fgDim, fgMuted, bg, borderColor } = CARD_COLORS
      const pad = 40
      const line = (y: number) => { ctx.fillStyle = borderColor; ctx.fillRect(pad, y, w - pad * 2, 1) }

      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = lime
      ctx.fillRect(0, 0, w, 3)

      // Kicker + título
      let y = 72
      ctx.fillStyle = lime
      ctx.font = `500 11px ${MONO}`
      ctx.letterSpacing = '3px'
      ctx.fillText(t('programRecap.kicker').toUpperCase(), pad, y)
      ctx.letterSpacing = '0px'

      y += 24
      ctx.fillStyle = fg
      ctx.font = `400 64px ${BEBAS}`
      const words = title.toUpperCase().split(' ')
      let current = ''
      for (const word of words) {
        const next = current ? `${current} ${word}` : word
        if (ctx.measureText(next).width > w - pad * 2 && current) {
          y += 58
          ctx.fillText(current, pad, y)
          current = word
        } else {
          current = next
        }
      }
      y += 58
      ctx.fillText(current, pad, y)

      if (userName) {
        y += 30
        ctx.fillStyle = fgDim
        ctx.font = `400 14px ${SANS}`
        ctx.fillText(userName, pad, y)
      }

      // Cifras
      y += 48
      line(y)
      const stats = [
        { value: String(weeks), label: t('home.programComplete.weeks') },
        { value: planned > 0 ? `${done}/${planned}` : String(done), label: t('home.programComplete.adherence') },
        { value: String(recap.setsLogged), label: t('programRecap.setsLogged') },
      ]
      const colW = (w - pad * 2) / stats.length
      stats.forEach((s, i) => {
        const x = pad + colW * i
        ctx.fillStyle = fg
        ctx.font = `400 52px ${BEBAS}`
        ctx.fillText(s.value, x, y + 66)
        ctx.fillStyle = fgMuted
        ctx.font = `500 10px ${MONO}`
        ctx.letterSpacing = '2px'
        ctx.fillText(s.label.toUpperCase(), x, y + 88)
        ctx.letterSpacing = '0px'
      })
      y += 112
      line(y)

      // Semana 1 frente a la última
      if (recap.comparisons.length > 0) {
        y += 40
        ctx.fillStyle = fgDim
        ctx.font = `500 11px ${MONO}`
        ctx.letterSpacing = '3px'
        ctx.fillText(t('programRecap.compareTitle').toUpperCase(), pad, y)
        ctx.letterSpacing = '0px'
        y += 16
        for (const c of recap.comparisons) {
          y += 54
          ctx.fillStyle = fg
          ctx.font = `500 18px ${SANS}`
          ctx.fillText(c.name, pad, y - 6, w - pad * 2 - 170)
          ctx.textAlign = 'right'
          ctx.fillStyle = fgDim
          ctx.font = `400 34px ${BEBAS}`
          const unit = t(`programRecap.unit.${c.unit}`)
          const lastText = `${formatRecapNumber(c.last)} ${unit}`
          // Lima solo si mejoró, igual que en la pantalla.
          ctx.fillStyle = c.delta > 0 ? lime : fg
          ctx.fillText(lastText, w - pad, y)
          const lastW = ctx.measureText(lastText).width
          ctx.fillStyle = fgMuted
          ctx.fillText(`${formatRecapNumber(c.first)} → `, w - pad - lastW, y)
          ctx.textAlign = 'left'
          y += 14
          line(y)
        }
      }

      // Pie
      const footerY = h - 56
      line(footerY - 14)
      if (logo) ctx.drawImage(logo, pad, footerY + 2, 20, 20)
      ctx.fillStyle = fgDim
      ctx.font = `500 12px ${MONO}`
      ctx.letterSpacing = '2px'
      ctx.fillText('CALISTENIA', pad + (logo ? 28 : 0), footerY + 17)
      ctx.letterSpacing = '0px'

      const blob = await canvasToBlob(canvas)
      if (!blob) return
      const outcome = await shareImage(
        blob,
        `programa_${programName.replace(/\W+/g, '_').toLowerCase()}.png`,
        title,
        t('programRecap.shareText', { name: programName, done, planned, weeks }),
      )
      trackShareCardShared({
        surface: 'program_recap', source: 'program_complete', share_type: 'program_recap',
        platform: 'web', result: outcome, share_confirmed: outcome === 'shared', card_type: 'program_recap',
      })
    } catch (e) {
      console.warn('ProgramRecap share error:', e)
    } finally {
      setBusy(false)
    }
  }, [busy, programName, title, weeks, done, planned, recap, userName, t])

  return (
    <Button variant="outline" onClick={() => { void handleShare() }} disabled={busy} className="gap-2">
      <Share2 className="size-4" aria-hidden="true" />
      {t('programRecap.share')}
    </Button>
  )
}
