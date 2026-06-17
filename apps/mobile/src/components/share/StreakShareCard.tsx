/**
 * StreakShareCard — full-bleed shareable image for a streak milestone.
 * Mirrors WorkoutShareCard's brand styling (dark bg, lime accents, top glow):
 *   header → profile row + "RACHA EN LLAMAS" badge
 *   hero   → big 🔥 + streak count + "DÍAS DE RACHA" + tagline (fills frame)
 *   footer → brand footer
 *
 * Size defaults to 360×640 (9:16) but accepts width/height so the caller can
 * render it at the device screen size for a full-bleed story image. All
 * type/spacing scales off S = width / 360.
 */
import React, { forwardRef } from 'react'
import { View, Text, Image, StyleSheet } from 'react-native'

const C = {
  bg: '#09090b',
  cardBg: '#18181b',
  border: '#27272a',
  fg: '#fafafa',
  fgDim: '#a1a1aa',
  fgMuted: '#52525b',
  lime: '#a3e635',
  limeRing: 'rgba(163,230,53,0.38)',
}

const BASE_W = 360

export interface StreakShareCardProps {
  streak: number
  userName?: string
  avatarUrl?: string | null
  date?: string
  width?: number
  height?: number
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return ''
  try {
    const d = new Date(`${dateStr}T12:00:00`)
    return d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return dateStr
  }
}

/** Tagline scales with the milestone so bigger streaks feel bigger. */
function streakTagline(streak: number): string {
  if (streak >= 100) return '100 días. Eres imparable. 🐐'
  if (streak >= 60) return 'Dos meses sin fallar. Élite.'
  if (streak >= 30) return 'Un mes entero. Esto ya es identidad.'
  if (streak >= 14) return 'Dos semanas seguidas. Imparable.'
  return 'La constancia es tu superpoder.'
}

const StreakShareCard = forwardRef<View, StreakShareCardProps>(
  ({ streak, userName, avatarUrl, date, width = BASE_W, height = 640 }, ref) => {
    const s = makeStyles(width, height)
    const initials = (userName ?? '?')[0].toUpperCase()

    return (
      <View ref={ref} style={s.card} collapsable={false}>
        <View style={s.topLine} />
        <View style={s.topGlow} />

        {/* Header */}
        <View>
          <View style={s.profileRow}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={s.avatar} />
            ) : (
              <View style={s.avatarPlaceholder}>
                <Text style={s.avatarInitial}>{initials}</Text>
              </View>
            )}
            <View style={s.profileText}>
              <Text className="font-sans-medium" style={s.userName}>
                {userName ?? 'Atleta'}
              </Text>
              <Text className="font-mono" style={s.dateText}>
                {formatDate(date)}
              </Text>
            </View>
          </View>

          <View style={s.badge}>
            <Text className="font-mono-semibold" style={s.badgeText}>
              RACHA EN LLAMAS
            </Text>
          </View>
        </View>

        {/* Hero */}
        <View style={s.hero}>
          <Text style={s.fire}>🔥</Text>
          <Text className="font-bebas" style={s.streakNum}>
            {streak}
          </Text>
          <Text className="font-bebas" style={s.streakLabel}>
            DÍAS DE RACHA
          </Text>
          <Text className="font-sans-medium" style={s.tagline}>
            {streakTagline(streak)}
          </Text>
        </View>

        {/* Footer */}
        <View>
          <View style={s.footerDivider} />
          <View style={s.footerRow}>
            <Text className="font-mono-semibold" style={s.footerBrand}>
              CALISTENIA
            </Text>
            <Text className="font-mono" style={s.footerUrl}>
              gym.guille.tech
            </Text>
          </View>
        </View>
      </View>
    )
  },
)

StreakShareCard.displayName = 'StreakShareCard'

export default StreakShareCard

function makeStyles(width: number, height: number) {
  const S = width / BASE_W
  const r = (n: number) => Math.round(n * S)
  return StyleSheet.create({
    card: {
      width,
      height,
      backgroundColor: C.bg,
      padding: r(16),
      overflow: 'hidden',
      justifyContent: 'space-between',
    },
    topLine: {
      position: 'absolute',
      top: 0,
      left: r(40),
      right: r(40),
      height: 2,
      backgroundColor: C.lime,
      borderRadius: 1,
    },
    topGlow: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: r(160),
      backgroundColor: 'rgba(163,230,53,0.05)',
    },
    profileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: r(10),
      marginBottom: r(10),
    },
    avatar: {
      width: r(36),
      height: r(36),
      borderRadius: r(18),
      borderWidth: 1.5,
      borderColor: C.limeRing,
    },
    avatarPlaceholder: {
      width: r(36),
      height: r(36),
      borderRadius: r(18),
      backgroundColor: C.border,
      borderWidth: 1.5,
      borderColor: C.limeRing,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitial: {
      color: C.lime,
      fontSize: r(14),
      lineHeight: r(18),
      fontFamily: 'DMSans_700Bold',
    },
    profileText: {
      marginLeft: r(8),
      flex: 1,
    },
    userName: {
      color: C.fg,
      fontSize: r(12),
      lineHeight: r(15),
    },
    dateText: {
      color: C.fgMuted,
      fontSize: r(9),
      lineHeight: r(12),
      marginTop: 2,
    },
    badge: {
      alignSelf: 'flex-start',
      paddingHorizontal: r(8),
      paddingVertical: r(4),
      borderRadius: r(10),
      borderWidth: 1,
      borderColor: 'rgba(163,230,53,0.25)',
      backgroundColor: 'rgba(163,230,53,0.09)',
    },
    badgeText: {
      color: C.lime,
      fontSize: r(8),
      letterSpacing: 1.8,
    },
    // Hero (centered, absorbs the slack so it stays centered in the frame)
    hero: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fire: {
      fontSize: r(72),
      lineHeight: r(92),
      textAlign: 'center',
      marginBottom: r(4),
    },
    streakNum: {
      color: C.lime,
      fontSize: r(120),
      lineHeight: r(124),
      letterSpacing: 1,
    },
    streakLabel: {
      color: C.fg,
      fontSize: r(28),
      lineHeight: r(32),
      letterSpacing: r(4),
      marginTop: r(2),
    },
    tagline: {
      color: C.fgDim,
      fontSize: r(13),
      lineHeight: r(18),
      textAlign: 'center',
      marginTop: r(14),
      paddingHorizontal: r(24),
    },
    footerDivider: {
      height: 1,
      backgroundColor: C.border,
      marginBottom: r(6),
    },
    footerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    footerBrand: {
      color: C.fgDim,
      fontSize: r(9),
      letterSpacing: 1.5,
    },
    footerUrl: {
      color: C.fgMuted,
      fontSize: r(8),
    },
  })
}
