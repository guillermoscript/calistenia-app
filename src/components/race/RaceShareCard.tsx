import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import { shareImage, canvasToBlob, loadLogo } from '../../lib/share'
import { op } from '../../lib/analytics'
import { formatPace, formatDuration } from '../../lib/geo'
import { fillRRect, CARD_COLORS } from '../../lib/canvas-helpers'
import type { Race, RaceParticipant } from '../../types/race'

interface RaceShareCardProps {
  race: Race
  participants: RaceParticipant[]
  currentUserId: string
  userName?: string
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

export default function RaceShareCard({ race, participants, currentUserId, userName }: RaceShareCardProps) {
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
      const pad = 36
      const cw = w - pad * 2
      const logo = await loadLogo()
      const { fg, fgDim, fgMuted, bg, cardBg, borderColor } = CARD_COLORS

      // Sort: if race has a target, finished first by finish time, then by distance.
      // DNF always at the bottom.
      const hasTarget = race.target_distance_km > 0 || race.target_duration_seconds > 0
      const sorted = [...participants].sort((a, b) => {
        if (a.status === 'dnf' && b.status !== 'dnf') return 1
        if (b.status === 'dnf' && a.status !== 'dnf') return -1
        if (hasTarget) {
          const aFin = a.status === 'finished' && a.finished_at
          const bFin = b.status === 'finished' && b.finished_at
          if (aFin && bFin) return new Date(a.finished_at!).getTime() - new Date(b.finished_at!).getTime()
          if (aFin) return -1
          if (bFin) return 1
        }
        if (b.distance_km !== a.distance_km) return b.distance_km - a.distance_km
        if (a.duration_seconds !== b.duration_seconds) return a.duration_seconds - b.duration_seconds
        return a.display_name.localeCompare(b.display_name)
      })
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

      const blob = await canvasToBlob(canvas)
      if (!blob) return
      const suffix = isWinner ? 'winner' : `rank${rank + 1}`
      await shareImage(
        blob,
        `race_${race.id}_${suffix}.png`,
        `${race.name} — #${rank + 1}`,
        `#${rank + 1} en ${race.name} — ${me.distance_km.toFixed(2)} km\ncalistenia-app.com`,
      )
      op.track('share_card_shared', { card_type: 'race_result', rank: rank + 1 })
    } catch (e) {
      console.warn('Share error:', e)
    }
  }, [race, participants, currentUserId, userName])

  return (
    <Button
      onClick={handleShare}
      className="w-full h-12 bg-lime hover:bg-lime/90 text-zinc-900 font-bebas text-lg tracking-widest"
    >
      {t('race.shareResults')}
    </Button>
  )
}
