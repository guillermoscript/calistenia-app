/**
 * PRShareCard — RN View replica of web PRShareCard.
 * Layout mirrors the canvas version: profile row → "NUEVO RÉCORD PERSONAL"
 * badge → trophy + exercise name → old→new values → motivational line → footer.
 *
 * Size: 360×640 (1:1.78, portrait), matches off-screen container in
 * ShareCardCapture.  captureRef at @1x gives 360×640px PNG; caller can pass
 * { width:1080, height:1920 } to captureRef for 3× hi-res if needed.
 */
import React, { forwardRef } from 'react'
import { View, Text, Image, StyleSheet } from 'react-native'

// Colors matching web CARD_COLORS
const C = {
  bg: '#09090b',
  cardBg: '#18181b',
  border: '#27272a',
  fg: '#fafafa',
  fgDim: '#a1a1aa',
  fgMuted: '#52525b',
  lime: '#a3e635',
  limeDim: 'rgba(163,230,53,0.25)',
  limeFaint: 'rgba(163,230,53,0.09)',
  limeRing: 'rgba(163,230,53,0.38)',
}

export interface PRShareCardProps {
  exerciseName: string
  oldValue?: number | null
  newValue: number
  date?: string
  userName?: string
  /** Remote or local image URI */
  avatarUrl?: string | null
  referralCode?: string | null
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return ''
  try {
    const d = new Date(`${dateStr}T12:00:00`)
    return d.toLocaleDateString('es', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

const PRShareCard = forwardRef<View, PRShareCardProps>(
  ({ exerciseName, oldValue, newValue, date, userName, avatarUrl, referralCode }, ref) => {
    const initials = (userName ?? '?')[0].toUpperCase()

    return (
      <View ref={ref} style={styles.card} collapsable={false}>
        {/* Top accent line */}
        <View style={styles.topLine} />

        {/* Lime glow top */}
        <View style={styles.topGlow} />

        {/* ── Profile row ── */}
        <View style={styles.profileRow}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>{initials}</Text>
            </View>
          )}
          <View style={styles.profileText}>
            <Text className="font-sans-medium" style={styles.userName}>
              {userName ?? 'Atleta'}
            </Text>
            <Text className="font-mono" style={styles.dateText}>
              {formatDate(date)}
            </Text>
          </View>
        </View>

        {/* ── "NUEVO RÉCORD PERSONAL" badge ── */}
        <View style={styles.badge}>
          <Text className="font-mono-semibold" style={styles.badgeText}>
            NUEVO RÉCORD PERSONAL
          </Text>
        </View>

        {/* ── Trophy ── */}
        <Text style={styles.trophy}>🏆</Text>

        {/* ── Exercise name ── */}
        <Text className="font-bebas" style={styles.exerciseName} numberOfLines={2}>
          {exerciseName.toUpperCase()}
        </Text>

        {/* ── PR values: old → new ── */}
        <View style={styles.prRow}>
          <Text className="font-bebas" style={styles.oldValue}>
            {oldValue != null ? String(oldValue) : '—'}
          </Text>
          <Text className="font-bebas" style={styles.arrowText}>→</Text>
          <Text className="font-bebas" style={styles.newValue}>
            {String(newValue)}
          </Text>
        </View>

        {/* REPS label */}
        <Text className="font-mono" style={styles.repsLabel}>REPS</Text>

        {/* ── Divider ── */}
        <View style={styles.divider} />

        {/* ── Motivational line ── */}
        <Text className="font-sans-italic" style={styles.motivational}>
          💪 New limits. New strength.
        </Text>

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <View style={styles.footerDivider} />
          <View style={styles.footerRow}>
            <Text className="font-mono-semibold" style={styles.footerBrand}>
              CALISTENIA
            </Text>
            <Text className="font-mono" style={styles.footerUrl}>
              gym.guille.tech
            </Text>
          </View>
        </View>
      </View>
    )
  },
)

PRShareCard.displayName = 'PRShareCard'

export default PRShareCard

const styles = StyleSheet.create({
  card: {
    width: 360,
    height: 640,
    backgroundColor: C.bg,
    padding: 20,
    overflow: 'hidden',
  },
  topLine: {
    position: 'absolute',
    top: 0,
    left: 40,
    right: 40,
    height: 2,
    backgroundColor: C.lime,
    borderRadius: 1,
  },
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 140,
    backgroundColor: 'rgba(163,230,53,0.04)',
  },
  // Profile
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: C.limeRing,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.border,
    borderWidth: 1.5,
    borderColor: C.limeRing,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: C.lime,
    fontSize: 16,
    fontFamily: 'DMSans_700Bold',
  },
  profileText: {
    marginLeft: 10,
    flex: 1,
  },
  userName: {
    color: C.fg,
    fontSize: 13,
    lineHeight: 16,
  },
  dateText: {
    color: C.fgMuted,
    fontSize: 10,
    lineHeight: 13,
    marginTop: 2,
  },
  // Badge
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(163,230,53,0.25)',
    backgroundColor: C.limeFaint,
    marginBottom: 14,
  },
  badgeText: {
    color: C.lime,
    fontSize: 9,
    letterSpacing: 2,
  },
  // Trophy
  trophy: {
    fontSize: 52,
    textAlign: 'center',
    marginBottom: 4,
  },
  // Exercise name
  exerciseName: {
    color: C.fg,
    fontSize: 30,
    textAlign: 'center',
    lineHeight: 34,
    letterSpacing: 1,
    marginBottom: 12,
  },
  // PR values
  prRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 4,
  },
  oldValue: {
    color: C.fgMuted,
    fontSize: 40,
    lineHeight: 46,
  },
  arrowText: {
    color: C.lime,
    fontSize: 28,
    lineHeight: 36,
  },
  newValue: {
    color: C.lime,
    fontSize: 56,
    lineHeight: 60,
  },
  repsLabel: {
    color: C.fgDim,
    fontSize: 10,
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 16,
  },
  // Divider
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginHorizontal: 8,
    marginBottom: 14,
  },
  // Motivational
  motivational: {
    color: 'rgba(250,250,250,0.69)',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 14,
    left: 20,
    right: 20,
  },
  footerDivider: {
    height: 1,
    backgroundColor: C.border,
    marginBottom: 8,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerBrand: {
    color: C.fgDim,
    fontSize: 10,
    letterSpacing: 1.5,
  },
  footerUrl: {
    color: C.fgMuted,
    fontSize: 9,
  },
})
