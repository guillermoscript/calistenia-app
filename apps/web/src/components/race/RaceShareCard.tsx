import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import { loadLogo } from '../../lib/share'
import { createShareCardCanvas, drawRoutePolyline, exportShareCard } from '../../lib/share-card'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent, trackShareCardShared } from '@calistenia/core/lib/analytics'
import { formatPace, formatDuration } from '@calistenia/core/lib/geo'
import { sortRaceParticipants } from '@calistenia/core/lib/race-sort'
import { fillRRect, CARD_COLORS } from '../../lib/canvas-helpers'
import { fitRoutePath } from '@calistenia/core/lib/static-map'
import type { Race, RaceParticipant, RaceGpsPoint } from '@calistenia/core/types/race'

interface RaceShareCardProps {
  race: Race
  participants: RaceParticipant[]
  currentUserId: string
  userName?: string
  /**
   * Recorrido PROPIO, ya cargado de `race_routes` por quien monta esta tarjeta
   * (#316). Nunca el de otro participante: desde #316 el servidor solo entrega
   * el de su dueño, y la tarjeta la genera el dueño para compartirla él mismo.
   * Vacío o ausente: la tarjeta sale sin la zona de recorrido, sin hueco.
   */
  track?: RaceGpsPoint[]
}

const TIER_COLORS = {
  gold:    { accent: '#fbbf24', dim: '#fbbf2415', mid: '#fbbf2440', ring: '#fbbf2470' },
  silver:  { accent: '#c0c0c8', dim: '#c0c0c815', mid: '#c0c0c840', ring: '#c0c0c860' },
  bronze:  { accent: '#cd7f32', dim: '#cd7f3215', mid: '#cd7f3240', ring: '#cd7f3260' },
  default: { accent: '#6b7280', dim: '#6b728015', mid: '#6b728030', ring: '#6b728040' },
} as const

function getTierColors(rank: number) {
  if (rank === 0) return TIER_COLORS.gold
  if (rank === 1) return TIER_COLORS.silver
  if (rank === 2) return TIER_COLORS.bronze
  return TIER_COLORS.default
}

/** Distancia (px) desde el borde inferior de la tarjeta a la línea del pie. */
export const FOOTER_OFFSET = 44
/** Por debajo de esto la zona de recorrido no cabe y se omite entera. */
export const MIN_ROUTE_PANEL_H = 90
const MAX_ROUTE_PANEL_H = 190
/** Aire mínimo entre el panel de recorrido y la línea del pie. */
const ROUTE_FOOTER_GAP = 18

/**
 * Geometría de la zona de recorrido. Vive aparte y exportada porque es la única
 * parte de la tarjeta que puede COLISIONAR: el bloque de arriba es de altura
 * variable (el nombre de la carrera se parte en las líneas que haga falta), así
 * que sin un tope el recorrido acabaría pisando el pie en una carrera con
 * nombre largo. El invariante está en RaceShareCard.test.ts.
 *
 * `visible: false` cuando lo que queda es demasiado poco para dibujar algo que
 * se entienda: mejor una tarjeta sin recorrido que una con un churro de 40 px.
 */
export function routePanelGeometry(listBottom: number, cardHeight: number) {
  const top = listBottom + 16
  const height = Math.min(MAX_ROUTE_PANEL_H, cardHeight - FOOTER_OFFSET - ROUTE_FOOTER_GAP - top)
  return { top, height, visible: height >= MIN_ROUTE_PANEL_H }
}

export default function RaceShareCard({ race, participants, currentUserId, userName, track }: RaceShareCardProps) {
  const { t } = useTranslation()

  const handleShare = useCallback(async () => {
    try {
      const card = createShareCardCanvas()
      if (!card) return
      const { canvas, ctx, w, h } = card
      const pad = 36
      const cw = w - pad * 2
      const logo = await loadLogo()
      const { fg, fgDim, fgMuted, bg, cardBg, borderColor } = CARD_COLORS

      const sorted = sortRaceParticipants(participants, race)
      const myIdx = sorted.findIndex(p => p.user === currentUserId)
      const me = sorted[myIdx]
      if (!me) return

      const rank = myIdx
      const tier = getTierColors(rank)
      const tierLabel = rank === 0 ? t('race.tierChampion')
        : rank === 1 ? t('race.tierSecond')
        : rank === 2 ? t('race.tierThird')
        : t('race.tierFinisher')
      const isWinner = rank === 0
      const isPodium = rank < 3
      const displayName = userName || me.display_name || t('race.athlete')
      const initial = displayName[0].toUpperCase()
      const totalElapsed = race.starts_at && race.finished_at
        ? Math.floor((new Date(race.finished_at!).getTime() - new Date(race.starts_at).getTime()) / 1000)
        : 0

      // ─── Background ───
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)

      // Top thick accent bar
      ctx.fillStyle = tier.accent
      ctx.fillRect(0, 0, w, isWinner ? 6 : 4)

      // Ambient glow from top center
      if (isPodium) {
        const glow = ctx.createRadialGradient(w / 2, 0, 20, w / 2, 0, 400)
        glow.addColorStop(0, tier.accent + (isWinner ? '14' : '0a'))
        glow.addColorStop(1, tier.accent + '00')
        ctx.fillStyle = glow
        ctx.fillRect(0, 0, w, 500)
      }

      // Subtle diagonal lines
      ctx.globalAlpha = isWinner ? 0.025 : 0.012
      ctx.strokeStyle = tier.accent
      ctx.lineWidth = 0.5
      for (let i = -h; i < w + h; i += 22) {
        ctx.beginPath()
        ctx.moveTo(i, 0)
        ctx.lineTo(i + h, h)
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // ─── ZONE 1: Race identity (top) ───

      let y = 32

      // Race name — bold, left-aligned
      ctx.fillStyle = fg
      ctx.font = '800 24px "DM Sans", system-ui, sans-serif'
      const nameUp = race.name.toUpperCase()
      const lines: string[] = []
      let line = ''
      for (const word of nameUp.split(' ')) {
        const test = line ? `${line} ${word}` : word
        if (ctx.measureText(test).width > cw) {
          if (line) lines.push(line)
          line = word
        } else { line = test }
      }
      if (line) lines.push(line)
      lines.forEach((l, i) => ctx.fillText(l, pad, y + 22 + i * 28))
      y += lines.length * 28 + 6

      // Accent underline
      ctx.fillStyle = tier.accent
      ctx.fillRect(pad, y, 50, 3)
      y += 14

      // Meta line
      ctx.fillStyle = fgMuted
      ctx.font = '400 10px "DM Sans", system-ui, sans-serif'
      const meta = [
        totalElapsed > 0 ? formatDuration(totalElapsed) : null,
        `${sorted.length} ${t('race.participantsFull')}`,
      ].filter(Boolean).join(' · ')
      ctx.fillText(meta, pad, y + 10)
      y += 28

      // ─── ZONE 2: Avatar + Crown/Medal + Name (hero, centered) ───

      const avatarR = isWinner ? 38 : isPodium ? 32 : 26
      const avatarCx = w / 2
      const avatarCy = y + avatarR + (isWinner ? 28 : 16)

      // Outer ring (tier color)
      if (isPodium) {
        ctx.beginPath()
        ctx.arc(avatarCx, avatarCy, avatarR + 4, 0, Math.PI * 2)
        ctx.strokeStyle = tier.ring
        ctx.lineWidth = 2
        ctx.stroke()

        // Second outer ring for winner
        if (isWinner) {
          ctx.beginPath()
          ctx.arc(avatarCx, avatarCy, avatarR + 9, 0, Math.PI * 2)
          ctx.strokeStyle = tier.accent + '20'
          ctx.lineWidth = 1
          ctx.stroke()
        }
      }

      // Avatar circle
      ctx.beginPath()
      ctx.arc(avatarCx, avatarCy, avatarR, 0, Math.PI * 2)
      ctx.fillStyle = tier.dim
      ctx.fill()

      // Initial letter
      ctx.fillStyle = tier.accent
      ctx.font = `700 ${avatarR * 0.9}px "DM Sans", system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(initial, avatarCx, avatarCy + 1)
      ctx.textBaseline = 'alphabetic'

      // Crown/medal ON TOP of avatar
      if (isWinner) {
        ctx.font = '32px "Apple Color Emoji", "Segoe UI Emoji", sans-serif'
        ctx.fillText('👑', avatarCx, avatarCy - avatarR - 14)
      } else if (rank === 1) {
        ctx.font = '24px "Apple Color Emoji", "Segoe UI Emoji", sans-serif'
        ctx.fillText('🥈', avatarCx, avatarCy - avatarR - 10)
      } else if (rank === 2) {
        ctx.font = '24px "Apple Color Emoji", "Segoe UI Emoji", sans-serif'
        ctx.fillText('🥉', avatarCx, avatarCy - avatarR - 10)
      }

      y = avatarCy + avatarR + 14

      // Name
      ctx.fillStyle = fg
      ctx.font = '700 18px "DM Sans", system-ui, sans-serif'
      ctx.fillText(displayName, w / 2, y + 16)
      y += 24

      // Rank badge
      ctx.fillStyle = tier.accent
      ctx.font = '700 11px "DM Sans", system-ui, sans-serif'
      ctx.letterSpacing = '3px'
      const badgeText = `#${rank + 1} · ${tierLabel.toUpperCase()}`
      const badgeW = ctx.measureText(badgeText).width + 24
      fillRRect(ctx, w / 2 - badgeW / 2, y + 4, badgeW, 24, 12, tier.dim)
      ctx.fillText(badgeText, w / 2, y + 20)
      ctx.letterSpacing = '0px'

      y += 40
      ctx.textAlign = 'left'

      // ─── ZONE 3: Distance (the number) ───

      const distStr = me.distance_km.toFixed(2)
      const dotP = distStr.indexOf('.')
      const wholeStr = distStr.slice(0, dotP)
      const decStr = distStr.slice(dotP)

      // Size based on digit count to prevent overflow
      const distFontSize = wholeStr.length > 2 ? 72 : 96

      ctx.textAlign = 'center'

      ctx.fillStyle = isPodium ? tier.accent : fg
      ctx.font = `800 ${distFontSize}px "DM Sans", system-ui, sans-serif`
      const wholeW = ctx.measureText(wholeStr).width

      ctx.font = `300 ${Math.round(distFontSize * 0.55)}px "DM Sans", system-ui, sans-serif`
      const decW = ctx.measureText(decStr).width

      const kmFont = `600 ${Math.round(distFontSize * 0.16)}px "DM Sans", system-ui, sans-serif`
      ctx.font = kmFont
      const kmW = ctx.measureText('KM').width

      const totalDistW = wholeW + decW + 6 + kmW
      const distStartX = w / 2 - totalDistW / 2

      ctx.fillStyle = isPodium ? tier.accent : fg
      ctx.font = `800 ${distFontSize}px "DM Sans", system-ui, sans-serif`
      ctx.textAlign = 'left'
      ctx.fillText(wholeStr, distStartX, y + distFontSize * 0.82)

      ctx.fillStyle = isPodium ? tier.accent + 'a0' : fgDim
      ctx.font = `300 ${Math.round(distFontSize * 0.55)}px "DM Sans", system-ui, sans-serif`
      ctx.fillText(decStr, distStartX + wholeW, y + distFontSize * 0.82)

      ctx.fillStyle = isPodium ? tier.accent + '80' : fgMuted
      ctx.font = kmFont
      ctx.fillText('KM', distStartX + wholeW + decW + 6, y + distFontSize * 0.82)

      y += distFontSize + 16

      // ─── ZONE 4: Stats strip ───

      const stripH = 52
      fillRRect(ctx, pad, y, cw, stripH, 10, cardBg)

      const statItems = [
        { label: t('race.pace').toUpperCase(), value: formatPace(me.avg_pace), color: isPodium ? tier.accent : fgDim },
        { label: t('race.time').toUpperCase(), value: formatDuration(me.duration_seconds), color: fg },
        { label: t('race.leader').toUpperCase(), value: `${rank + 1}/${sorted.length}`, color: tier.accent },
      ]

      const colW = cw / statItems.length
      statItems.forEach((s, i) => {
        const cx = pad + colW * i + colW / 2
        ctx.textAlign = 'center'

        ctx.fillStyle = s.color
        ctx.font = '800 18px "DM Sans", system-ui, sans-serif'
        ctx.fillText(s.value, cx, y + 24)

        ctx.fillStyle = fgMuted
        ctx.font = '500 7px "DM Sans", system-ui, sans-serif'
        ctx.letterSpacing = '1px'
        ctx.fillText(s.label, cx, y + stripH - 10)
        ctx.letterSpacing = '0px'
      })

      ctx.textAlign = 'left'
      y += stripH + 20

      // ─── ZONE 5: Leaderboard ───

      ctx.fillStyle = fgMuted
      ctx.font = '500 8px "DM Sans", system-ui, sans-serif'
      ctx.letterSpacing = '2px'
      ctx.fillText(t('race.leaderboard').toUpperCase(), pad, y + 8)
      ctx.letterSpacing = '0px'
      y += 18

      const maxShow = Math.min(sorted.length, 5)
      const rowH = 34
      const listH = maxShow * rowH + 10

      fillRRect(ctx, pad, y, cw, listH, 10, cardBg)

      for (let i = 0; i < maxShow; i++) {
        const p = sorted[i]
        const ry = y + 5 + i * rowH
        const isMe = p.user === currentUserId
        const rt = getTierColors(i)

        if (isMe) {
          fillRRect(ctx, pad + 3, ry, cw - 6, rowH - 2, 6, tier.dim)
        }

        // Rank number
        ctx.fillStyle = i < 3 ? rt.accent : fgMuted
        ctx.font = '700 11px "DM Sans", system-ui, sans-serif'
        ctx.fillText(`${i + 1}`, pad + 16, ry + 21)

        // Name
        ctx.fillStyle = isMe ? fg : fgDim
        ctx.font = `${isMe ? '600' : '400'} 11px "DM Sans", system-ui, sans-serif`
        let pName = p.display_name
        while (ctx.measureText(pName).width > cw - 130 && pName.length > 3) pName = pName.slice(0, -1)
        if (pName !== p.display_name) pName += '…'
        ctx.fillText(pName, pad + 38, ry + 21)

        // Distance
        ctx.fillStyle = isMe ? (isPodium ? tier.accent : fg) : fgMuted
        ctx.font = `${isMe ? '700' : '400'} 11px "DM Sans", system-ui, sans-serif`
        ctx.textAlign = 'right'
        ctx.fillText(`${p.distance_km.toFixed(2)} km`, w - pad - 12, ry + 21)
        ctx.textAlign = 'left'

        if (i < maxShow - 1) {
          ctx.fillStyle = borderColor + '40'
          ctx.fillRect(pad + 38, ry + rowH - 2, cw - 50, 0.5)
        }
      }

      if (sorted.length > maxShow) {
        const extraY = y + listH + 2
        ctx.fillStyle = fgMuted
        ctx.font = '400 9px "DM Sans", system-ui, sans-serif'
        ctx.fillText(t('race.moreItems', { n: sorted.length - maxShow }), pad + 16, extraY + 10)
      }

      // ─── ZONE 6: Recorrido propio ───
      //
      // Se dibuja la POLILÍNEA SOLA, sin teselas de mapa debajo, y no por
      // simplificar: sin basemap la tarjeta enseña la FORMA de la carrera pero
      // no DÓNDE fue. Es la diferencia entre presumir del recorrido y publicar
      // el portal de tu casa, que es justo el problema que cierra #316. Quien
      // quiera la versión con mapa la tiene en «guardar como entrenamiento» →
      // tarjeta de cardio, que sí lo lleva de protagonista.
      //
      // De paso evita depender de CARTO en el momento de compartir: sin red que
      // esperar ni teselas que puedan fallar.

      const listBottom = y + listH + (sorted.length > maxShow ? 16 : 0)
      const { top: routeTop, height: routeH, visible: routeFits } = routePanelGeometry(listBottom, h)

      if (track && track.length >= 2 && routeFits) {
        // Sin caja a propósito. Un recorrido es casi cuadrado y esta banda es
        // 3:1, así que dentro de un `cardBg` el glifo deja los laterales
        // vacíos y el recuadro se lee como un fallo de maquetación. Sin caja,
        // ese mismo aire se lee como respiración — y es lo que pide el sistema
        // de diseño: filetes y tipografía antes que contenedores. Medido:
        // quitando la caja el glifo pasa de 114 a 144 px de alto.
        const rule = ctx.createLinearGradient(pad, routeTop, w - pad, routeTop)
        rule.addColorStop(0, borderColor + '00')
        rule.addColorStop(0.15, borderColor)
        rule.addColorStop(0.85, borderColor)
        rule.addColorStop(1, borderColor + '00')
        ctx.fillStyle = rule
        ctx.fillRect(pad, routeTop, cw, 1)

        ctx.fillStyle = fgMuted
        ctx.font = '500 8px "DM Sans", system-ui, sans-serif'
        ctx.letterSpacing = '2px'
        ctx.textAlign = 'center'
        ctx.fillText(t('race.route').toUpperCase(), w / 2, routeTop + 18)
        ctx.letterSpacing = '0px'
        ctx.textAlign = 'left'

        const glyphTop = 26
        const glyphH = routeH - glyphTop - 8
        const path = fitRoutePath(track, cw, glyphH, { padding: 6 })

        if (path && path.length >= 2) {
          ctx.save()
          ctx.translate(pad, routeTop + glyphTop)

          // Contorno oscuro, trazo de acento, salida hueca y meta llena: el
          // mismo dibujo que la tarjeta de cardio, ahora compartido de verdad.
          drawRoutePolyline(ctx, path, {
            stroke: tier.accent,
            strokeWidth: 3,
            casing: 'rgba(0,0,0,0.55)',
            casingWidth: 5.5,
            dotRadius: 4.5,
            startFill: fg,
            startRingWidth: 2,
            endRing: fg,
            endRingWidth: 1.5,
          })

          ctx.restore()
        }
      }

      // ─── FOOTER ───

      const fy = h - 44
      const fGrad = ctx.createLinearGradient(pad, fy - 6, w - pad, fy - 6)
      fGrad.addColorStop(0, borderColor + '00')
      fGrad.addColorStop(0.15, borderColor)
      fGrad.addColorStop(0.85, borderColor)
      fGrad.addColorStop(1, borderColor + '00')
      ctx.fillStyle = fGrad
      ctx.fillRect(pad, fy - 6, cw, 1)

      if (logo) ctx.drawImage(logo, pad, fy + 6, 16, 16)
      ctx.fillStyle = fgDim
      ctx.font = '600 10px "DM Sans", system-ui, sans-serif'
      ctx.fillText('CALISTENIA', pad + (logo ? 24 : 0), fy + 18)

      ctx.fillStyle = fgMuted
      ctx.font = '400 9px "DM Sans", system-ui, sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText('calistenia-app.com', w - pad, fy + 18)
      ctx.textAlign = 'left'

      // ─── EXPORT ───

      const suffix = isWinner ? 'winner' : `rank${rank + 1}`
      const outcome = await exportShareCard(canvas, {
        fileName: `race_${race.id}_${suffix}.png`,
        title: `${race.name} — #${rank + 1}`,
        text: `#${rank + 1} en ${race.name} — ${me.distance_km.toFixed(2)} km\ncalistenia-app.com`,
      })
      if (!outcome) return
      trackShareCardShared({
        surface: 'race', source: 'race_result', race_id: race.id,
        share_type: 'race_result', participant_count: participants.length,
        platform: 'web', result: outcome, share_confirmed: outcome === 'shared',
        card_type: 'race_result', rank: rank + 1,
      })
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.raceShared, {
        surface: 'race', source: 'race_result', race_id: race.id,
        share_type: 'race_result', participant_count: participants.length,
        platform: 'web', result: outcome, share_confirmed: outcome === 'shared', rank: rank + 1,
      })
    } catch (e) {
      console.warn('Share error:', e)
    }
  }, [race, participants, currentUserId, userName, track, t])

  return (
    <Button
      onClick={handleShare}
      className="w-full h-12 bg-lime hover:bg-lime/90 text-zinc-900 font-bebas text-lg tracking-widest"
    >
      {t('race.shareResults')}
    </Button>
  )
}
