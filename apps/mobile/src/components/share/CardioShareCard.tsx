/**
 * CardioShareCard — shareable image for a cardio GPS session.
 *
 * Aesthetic: "race bib / map-as-hero" (Strava-grade, editorial). The GPS route
 * is the art — full-bleed CARTO tiles behind everything — with the stats set
 * over a gradient scrim at the foot of the card. One accent (the activity
 * colour), display + sans type (no monospace), left-aligned composition.
 * When there's no route, a tinted typographic fallback replaces the empty map.
 *
 * Pure RN views + react-native-svg (no MapLibre GL) so react-native-view-shot
 * can capture it. Scrims are SVG gradients (no expo-linear-gradient dep).
 *
 * FONT RULE: never pair fontWeight:'bold' with custom fonts — use the family
 * variant names (BebasNeue_400Regular / DMSans_*) directly.
 */
import React, { memo } from 'react'
import { View, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import Svg, { Polyline, Circle, Rect, Defs, LinearGradient, Stop } from 'react-native-svg'

import { Text } from '@/components/ui/text'
import {
  fitViewport,
  tilesForViewport,
  cartoTileUrl,
  pointToPixel,
  ROUTE_COLOR,
} from '@calistenia/core/lib/static-map'
import { formatPace, formatDuration, formatSpeed } from '@calistenia/core/lib/geo'
import type { CardioSession, GpsPoint } from '@calistenia/core/types'

const BASE_W = 360
const BASE_H = 640
const MAP_PADDING = 40

// Warm-tinted neutrals — never pure black/white.
const INK = '#f5f5f4'
const INK_DIM = 'rgba(245,245,244,0.66)'
const INK_FAINT = 'rgba(245,245,244,0.40)'
const CARD_BG = '#0a0a0b'

const ACTIVITY_LABEL: Record<string, string> = {
  running: 'CARRERA',
  walking: 'CAMINATA',
  cycling: 'CICLISMO',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCardioDate(iso?: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso.replace(' ', 'T'))
    return d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })
  } catch {
    return iso
  }
}

/** Split GPS points into continuous segments, breaking at gap===true markers. */
function segmentPoints(points: GpsPoint[]): GpsPoint[][] {
  if (points.length === 0) return []
  const segs: GpsPoint[][] = []
  let cur: GpsPoint[] = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const p = points[i]
    if (p.gap) {
      if (cur.length > 1) segs.push(cur)
      cur = [p]
    } else {
      cur.push(p)
    }
  }
  if (cur.length > 1) segs.push(cur)
  return segs
}

// Export so CardioShareButton can prefetch the exact same tiles before capture.
export function cardioTileUrls(session: CardioSession, width = BASE_W, height = BASE_H): string[] {
  if (session.gps_points.length < 2) return []
  const vp = fitViewport(session.gps_points, width, height, { padding: MAP_PADDING })
  if (!vp) return []
  return tilesForViewport(vp).map((t) => cartoTileUrl(t, 'dark', true))
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface CardioShareCardProps {
  session: CardioSession
  userName?: string
  referralCode?: string | null
  width?: number
  height?: number
}

// ── Component ─────────────────────────────────────────────────────────────────

const CardioShareCard = memo(function CardioShareCard({
  session,
  userName,
  width = BASE_W,
  height = BASE_H,
}: CardioShareCardProps) {
  const S = width / BASE_W
  const r = (n: number) => Math.round(n * S)
  const s = makeStyles(width, height, r)

  const activity = session.activity_type
  const isCycling = activity === 'cycling'
  const accent = ROUTE_COLOR[activity] ?? ROUTE_COLOR.running

  const hasRoute = session.gps_points.length >= 2
  const vp = hasRoute ? fitViewport(session.gps_points, width, height, { padding: MAP_PADDING }) : null
  const tiles = vp ? tilesForViewport(vp) : []
  const segments = vp ? segmentPoints(session.gps_points) : []
  const startPt = vp ? pointToPixel(session.gps_points[0].lat, session.gps_points[0].lng, vp) : null
  const endPt = vp
    ? pointToPixel(
        session.gps_points[session.gps_points.length - 1].lat,
        session.gps_points[session.gps_points.length - 1].lng,
        vp,
      )
    : null

  // Stats
  const distStr = session.distance_km.toFixed(2)
  const stats: { value: string; label: string }[] = [
    { value: formatDuration(session.duration_seconds), label: 'Tiempo' },
    {
      value: isCycling ? `${formatSpeed(session.avg_speed_kmh ?? 0)}` : formatPace(session.avg_pace),
      label: isCycling ? 'km/h' : 'min/km',
    },
    { value: String(session.calories_burned ?? 0), label: 'kcal' },
  ]

  // Splits micro bar-chart (pace per km; faster = taller, best km in accent).
  const splits = (session.splits ?? []).filter((sp) => sp.pace > 0).slice(0, 12)
  const bestPace = splits.length ? Math.min(...splits.map((sp) => sp.pace)) : 0
  const worstPace = splits.length ? Math.max(...splits.map((sp) => sp.pace)) : 1
  const paceRange = worstPace - bestPace || 1

  const initials = (userName ?? '?').trim()[0]?.toUpperCase() ?? '?'
  const displayName = userName ?? 'Atleta'

  return (
    <View style={s.card} collapsable={false}>
      {/* ── Background: tiles (route) or accent-tinted gradient (no route) ── */}
      <View style={s.fill}>
        {hasRoute && vp ? (
          tiles.map((t) => (
            <Image
              key={`${t.z}/${t.x}/${t.y}`}
              source={{ uri: cartoTileUrl(t, 'dark', true) }}
              style={{ position: 'absolute', left: t.px, top: t.py, width: 256, height: 256 }}
              contentFit="fill"
              cachePolicy="memory-disk"
            />
          ))
        ) : null}
      </View>

      {/* ── SVG layer: scrims + route + endpoints ── */}
      <Svg width={width} height={height} style={s.fill}>
        <Defs>
          <LinearGradient id="top" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000" stopOpacity={hasRoute ? 0.55 : 0} />
            <Stop offset="1" stopColor="#000" stopOpacity="0" />
          </LinearGradient>
          {/* Mood scrim under the route — gentle, so the route stays visible on top */}
          <LinearGradient id="bottom" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={CARD_BG} stopOpacity="0" />
            <Stop offset="0.5" stopColor={CARD_BG} stopOpacity="0.35" />
            <Stop offset="1" stopColor={CARD_BG} stopOpacity="0.6" />
          </LinearGradient>
          {/* Stats scrim over the route — fades the path out behind the stat block */}
          <LinearGradient id="foot" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={CARD_BG} stopOpacity="0" />
            <Stop offset="0.55" stopColor={CARD_BG} stopOpacity="0.82" />
            <Stop offset="1" stopColor={CARD_BG} stopOpacity="0.97" />
          </LinearGradient>
          <LinearGradient id="empty" x1="0" y1="0" x2="0.5" y2="1">
            <Stop offset="0" stopColor={accent} stopOpacity="0.18" />
            <Stop offset="0.65" stopColor={CARD_BG} stopOpacity="1" />
          </LinearGradient>
        </Defs>

        {/* No-route background wash */}
        {!hasRoute && <Rect x="0" y="0" width={width} height={height} fill="url(#empty)" />}

        {/* Top scrim for header legibility */}
        <Rect x="0" y="0" width={width} height={height * 0.32} fill="url(#top)" />

        {/* Mood scrim BELOW the route — darkens the raw map without hiding the path */}
        <Rect x="0" y={height * 0.46} width={width} height={height * 0.54} fill="url(#bottom)" />

        {/* Route — dark casing then accent. Drawn AFTER the scrims so the GPS
            path is never buried (previously the bottom scrim painted over it). */}
        {vp &&
          segments.map((seg, i) => {
            const pts = seg
              .map((p) => {
                const px = pointToPixel(p.lat, p.lng, vp)
                return `${px.x.toFixed(1)},${px.y.toFixed(1)}`
              })
              .join(' ')
            return (
              <React.Fragment key={i}>
                <Polyline points={pts} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={r(9)} strokeLinejoin="round" strokeLinecap="round" />
                <Polyline points={pts} fill="none" stroke={accent} strokeWidth={r(5)} strokeLinejoin="round" strokeLinecap="round" />
              </React.Fragment>
            )
          })}
        {startPt && <Circle cx={startPt.x} cy={startPt.y} r={r(7)} fill="#fafafa" stroke={accent} strokeWidth={r(3)} />}
        {endPt && <Circle cx={endPt.x} cy={endPt.y} r={r(7)} fill={accent} stroke="#fafafa" strokeWidth={r(2.5)} />}

        {/* Stats scrim OVER the route — only the bottom third, so the path fades
            gently behind the stat block while staying visible across the map. */}
        <Rect x="0" y={height * 0.68} width={width} height={height * 0.32} fill="url(#foot)" />

        {/* Top accent line — drawn in the SVG layer so it captures reliably
            (a plain RN View over the map/SVG gets dropped by view-shot on Android) */}
        <Rect x={r(22)} y={0} width={width - r(44)} height={r(4)} rx={r(2)} fill={accent} />
      </Svg>

      {/* ── Header ── */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={s.activityRow}>
            <View style={[s.accentDot, { backgroundColor: accent }]} />
            <Text style={[s.activityLabel, { color: accent }]}>{ACTIVITY_LABEL[activity] ?? activity.toUpperCase()}</Text>
          </View>
          <Text style={s.dateText}>{formatCardioDate(session.finished_at)}</Text>
        </View>
        <View style={s.avatar}>
          <Text style={s.avatarInitial}>{initials}</Text>
        </View>
      </View>

      {/* No-route ghost wordmark fills the void typographically */}
      {!hasRoute && (
        <Text style={[s.ghostWord, { color: accent }]} numberOfLines={1}>
          {ACTIVITY_LABEL[activity] ?? activity.toUpperCase()}
        </Text>
      )}

      {/* ── Foot: name · distance hero · stats · splits · brand ── */}
      <View style={s.foot}>
        <Text style={s.byline}>{displayName}</Text>

        <View style={s.heroRow}>
          <Text style={s.heroDistance}>{distStr}</Text>
          <Text style={[s.heroUnit, { color: accent }]}>KM</Text>
        </View>
        <View style={[s.heroRule, { backgroundColor: accent }]} />

        <View style={s.statRow}>
          {stats.map((st, i) => (
            <React.Fragment key={st.label}>
              {i > 0 && <View style={s.statDivider} />}
              <View style={s.statCell}>
                <Text style={s.statValue}>{st.value}</Text>
                <Text style={s.statLabel}>{st.label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        {splits.length >= 2 && (
          <View style={s.splitsRow}>
            {splits.map((sp, i) => {
              const ratio = 1 - ((sp.pace - bestPace) / paceRange) * 0.7 // best=1, worst=0.3
              const isBest = sp.pace === bestPace
              return (
                <View
                  key={i}
                  style={{
                    flex: 1,
                    height: Math.max(r(4), r(26) * ratio),
                    marginRight: i === splits.length - 1 ? 0 : r(3),
                    borderRadius: r(2),
                    backgroundColor: isBest ? accent : INK_FAINT,
                  }}
                />
              )
            })}
          </View>
        )}

        <View style={s.brandRow}>
          <Text style={s.brand}>CALISTENIA</Text>
          <Text style={s.brandUrl}>calistenia-app.com</Text>
        </View>
      </View>
    </View>
  )
})

CardioShareCard.displayName = 'CardioShareCard'
export default CardioShareCard

// ── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(width: number, height: number, r: (n: number) => number) {
  return StyleSheet.create({
    card: { width, height, backgroundColor: CARD_BG, overflow: 'hidden', position: 'relative' },
    fill: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },

    // Header
    header: {
      position: 'absolute',
      top: r(24),
      left: r(22),
      right: r(22),
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    headerLeft: { flex: 1 },
    activityRow: { flexDirection: 'row', alignItems: 'center' },
    accentDot: { width: r(7), height: r(7), borderRadius: r(4), marginRight: r(7) },
    activityLabel: { fontFamily: 'DMSans_700Bold', fontSize: r(13), letterSpacing: r(3) },
    dateText: {
      fontFamily: 'DMSans_500Medium',
      color: INK_DIM,
      fontSize: r(11),
      marginTop: r(3),
    },
    avatar: {
      width: r(34),
      height: r(34),
      borderRadius: r(17),
      backgroundColor: 'rgba(10,10,11,0.55)',
      borderWidth: 1,
      borderColor: 'rgba(245,245,244,0.25)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitial: { fontFamily: 'DMSans_700Bold', color: INK, fontSize: r(15) },

    // No-route ghost
    ghostWord: {
      position: 'absolute',
      top: height * 0.2,
      left: -r(8),
      right: 0,
      opacity: 0.08,
      fontFamily: 'BebasNeue_400Regular',
      fontSize: r(130),
      letterSpacing: r(2),
    },

    // Foot
    foot: { position: 'absolute', left: r(22), right: r(22), bottom: r(22) },
    byline: { fontFamily: 'DMSans_600SemiBold', color: INK, fontSize: r(15), marginBottom: r(6) },
    heroRow: { flexDirection: 'row', alignItems: 'flex-end' },
    heroDistance: {
      fontFamily: 'BebasNeue_400Regular',
      color: INK,
      fontSize: r(88),
      lineHeight: r(84),
      letterSpacing: r(1),
    },
    heroUnit: { fontFamily: 'BebasNeue_400Regular', fontSize: r(26), marginLeft: r(8), marginBottom: r(12) },
    heroRule: { width: r(52), height: r(4), borderRadius: r(2), marginTop: r(10), marginBottom: r(16) },

    // Stats — clean inline row, no boxes
    statRow: { flexDirection: 'row', alignItems: 'center' },
    statCell: { flex: 1 },
    statValue: { fontFamily: 'BebasNeue_400Regular', color: INK, fontSize: r(30), lineHeight: r(32) },
    statLabel: {
      fontFamily: 'DMSans_500Medium',
      color: INK_DIM,
      fontSize: r(10),
      letterSpacing: r(1),
      marginTop: r(1),
    },
    statDivider: { width: 1, height: r(28), backgroundColor: 'rgba(245,245,244,0.15)', marginHorizontal: r(12) },

    // Splits micro bars
    splitsRow: { flexDirection: 'row', alignItems: 'flex-end', height: r(26), marginTop: r(18) },

    // Brand
    brandRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: r(18),
      paddingTop: r(12),
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(245,245,244,0.18)',
    },
    brand: { fontFamily: 'DMSans_700Bold', color: INK, fontSize: r(12), letterSpacing: r(1.5) },
    brandUrl: { fontFamily: 'DMSans_400Regular', color: INK_FAINT, fontSize: r(11) },
  })
}
