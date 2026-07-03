/**
 * ProgressPhotoShareCard — shareable before/after image for body progress photos.
 *
 * Standard transformation layout (Gymshark / BodySpace / before-after apps):
 * two FULL photos side by side, each complete inside its own half-panel, split
 * by a lime seam, labelled ANTES / DESPUÉS with dates — NOT a 50%-slice reveal
 * (that only reads correctly while you drag it live). A solid footer strip keeps
 * the stats + brand off the photos for legibility.
 *
 * Pure RN views + expo-image + react-native-svg so react-native-view-shot can
 * capture it. The seam + top accent live in the SVG layer (a thin RN View over
 * images gets dropped by view-shot on Android — see CardioShareCard); labels use
 * solid-bg RN pills (those capture fine).
 *
 * FONT RULE: never pair fontWeight:'bold' with custom fonts — use the family
 * variant names (BebasNeue_400Regular / DMSans_*) directly.
 */
import React, { memo } from 'react'
import { View, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import Svg, { Rect, Line } from 'react-native-svg'

import { Text } from '@/components/ui/text'
import type { BodyPhoto } from '@calistenia/core/hooks/useBodyPhotos'

const BASE_W = 360
const BASE_H = 640

const INK = '#f5f5f4'
const INK_DIM = 'rgba(245,245,244,0.66)'
const INK_FAINT = 'rgba(245,245,244,0.40)'
const CARD_BG = '#0a0a0b'
const LIME = '#c6f42f'

const CATEGORY_LABEL: Record<string, string> = {
  front: 'FRONTAL',
  side: 'PERFIL',
  back: 'ESPALDA',
}

/** Whole days between two YYYY-MM-DD strings (after − before, never negative). */
export function daysBetween(before: string, after: string): number {
  const a = Date.parse(`${before}T00:00:00`)
  const b = Date.parse(`${after}T00:00:00`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

export interface ProgressShareLabels {
  before: string
  after: string
  transformation: string
  days: string
  weeks: string
  sameDay: string
}

export interface ProgressPhotoShareCardProps {
  before: BodyPhoto
  after: BodyPhoto
  userName?: string
  labels: ProgressShareLabels
  width?: number
  height?: number
}

const ProgressPhotoShareCard = memo(function ProgressPhotoShareCard({
  before,
  after,
  userName,
  labels,
  width = BASE_W,
  height = BASE_H,
}: ProgressPhotoShareCardProps) {
  const S = width / BASE_W
  const r = (n: number) => Math.round(n * S)
  const s = makeStyles(width, height, r)

  const footerH = r(96)
  const imageH = height - footerH
  const panelW = Math.round(width / 2)

  const days = daysBetween(before.date, after.date)
  const useWeeks = days >= 14
  const deltaValue = useWeeks ? Math.round(days / 7) : days
  const deltaUnit = useWeeks ? labels.weeks : labels.days

  const category = after.category || before.category
  const catLabel = CATEGORY_LABEL[category] ?? category?.toUpperCase() ?? ''
  const displayName = userName?.trim() || 'Atleta'

  const panel = (photo: BodyPhoto, tag: string, isAfter: boolean) => (
    <View style={{ width: panelW, height: imageH, overflow: 'hidden' }}>
      <Image
        source={{ uri: photo.url }}
        style={{ width: panelW, height: imageH }}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
      {/* Label bar (solid bg → captures reliably) */}
      <View style={s.labelBar}>
        <Text style={[s.labelTag, isAfter && { color: LIME }]}>{tag.toUpperCase()}</Text>
        <Text style={s.labelDate}>{photo.date}</Text>
      </View>
    </View>
  )

  return (
    <View style={s.card} collapsable={false}>
      {/* ── Side-by-side photos ── */}
      <View style={{ flexDirection: 'row', width, height: imageH }}>
        {panel(before, labels.before, false)}
        {panel(after, labels.after, true)}
      </View>

      {/* ── SVG layer: top accent + centre seam over the seam gap ── */}
      <Svg width={width} height={imageH} style={s.svgFill}>
        <Rect x={r(22)} y={0} width={width - r(44)} height={r(4)} rx={r(2)} fill={LIME} />
        <Line x1={panelW} y1={0} x2={panelW} y2={imageH} stroke={CARD_BG} strokeWidth={r(4)} />
        <Line x1={panelW} y1={0} x2={panelW} y2={imageH} stroke={LIME} strokeWidth={r(2)} />
      </Svg>

      {/* ── Footer strip: transformation delta + brand ── */}
      <View style={[s.footer, { height: footerH }]}>
        <View style={s.footerLeft}>
          <Text style={s.kicker} numberOfLines={1}>
            {displayName} · {labels.transformation}
            {catLabel ? ` · ${catLabel}` : ''}
          </Text>
          {days > 0 ? (
            <View style={s.heroRow}>
              <Text style={s.heroValue}>{deltaValue}</Text>
              <Text style={s.heroUnit}>{deltaUnit.toUpperCase()}</Text>
            </View>
          ) : (
            <Text style={s.heroValue}>{labels.sameDay.toUpperCase()}</Text>
          )}
        </View>
        <View style={s.footerRight}>
          <Text style={s.brand}>CALISTENIA</Text>
          <Text style={s.brandUrl}>calistenia-app.com</Text>
        </View>
      </View>
    </View>
  )
})

ProgressPhotoShareCard.displayName = 'ProgressPhotoShareCard'
export default ProgressPhotoShareCard

// ── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(width: number, height: number, r: (n: number) => number) {
  return StyleSheet.create({
    card: { width, height, backgroundColor: CARD_BG, overflow: 'hidden', position: 'relative' },
    svgFill: { position: 'absolute', left: 0, top: 0 },

    labelBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: 'rgba(10,10,11,0.72)',
      paddingHorizontal: r(10),
      paddingVertical: r(6),
    },
    labelTag: { fontFamily: 'DMSans_700Bold', color: INK, fontSize: r(11), letterSpacing: r(2) },
    labelDate: { fontFamily: 'DMSans_500Medium', color: INK_DIM, fontSize: r(10), marginTop: r(1) },

    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: CARD_BG,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: r(20),
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(245,245,244,0.14)',
    },
    footerLeft: { flex: 1, paddingRight: r(12) },
    kicker: { fontFamily: 'DMSans_600SemiBold', color: INK_DIM, fontSize: r(10), letterSpacing: r(1) },
    heroRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: r(2) },
    heroValue: { fontFamily: 'BebasNeue_400Regular', color: INK, fontSize: r(44), lineHeight: r(46), letterSpacing: r(1) },
    heroUnit: { fontFamily: 'BebasNeue_400Regular', color: LIME, fontSize: r(20), marginLeft: r(6), marginBottom: r(6) },

    footerRight: { alignItems: 'flex-end' },
    brand: { fontFamily: 'DMSans_700Bold', color: INK, fontSize: r(13), letterSpacing: r(1.5) },
    brandUrl: { fontFamily: 'DMSans_400Regular', color: INK_FAINT, fontSize: r(10), marginTop: r(1) },
  })
}
