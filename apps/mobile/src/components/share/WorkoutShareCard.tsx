/**
 * WorkoutShareCard — RN View replica of web WorkoutShareCard.
 * Layout: profile row → "SESIÓN COMPLETADA" badge → workout title →
 * 3-stat row (series / minutos / ejercicios) → exercise list (max 8) →
 * optional quote → footer.
 *
 * Size: 360×640. For hi-res PNG capture pass { width:1080, height:1920 }
 * to captureRef (3× scale).
 */
import React, { forwardRef } from 'react'
import { View, Text, Image, StyleSheet } from 'react-native'
import type { Exercise } from '@calistenia/core/types'

const C = {
  bg: '#09090b',
  cardBg: '#18181b',
  border: '#27272a',
  fg: '#fafafa',
  fgDim: '#a1a1aa',
  fgMuted: '#52525b',
  lime: '#a3e635',
  limeFaint: 'rgba(163,230,53,0.09)',
  limeRing: 'rgba(163,230,53,0.38)',
  blue: '#38bdf8',
  pink: '#f472b6',
}

export interface Quote {
  q: string
  a: string
}

export interface WorkoutShareCardProps {
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

interface StatBoxProps {
  icon: string
  value: string
  label: string
  color: string
}

function StatBox({ icon, value, label, color }: StatBoxProps) {
  return (
    <View style={[styles.statBox, { borderTopColor: color }]}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text className="font-bebas" style={[styles.statValue, { color }]}>
        {value}
      </Text>
      <Text className="font-mono" style={styles.statLabel}>
        {label}
      </Text>
    </View>
  )
}

const WorkoutShareCard = forwardRef<View, WorkoutShareCardProps>(
  (
    {
      workoutTitle,
      totalSets,
      durationMin,
      date,
      exercises,
      quote,
      userName,
      avatarUrl,
      referralCode: _referralCode,
    },
    ref,
  ) => {
    const initials = (userName ?? '?')[0].toUpperCase()
    const exList = (exercises ?? []).slice(0, 8)
    const extraCount = (exercises?.length ?? 0) - 8

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

        {/* ── "SESIÓN COMPLETADA" badge ── */}
        <View style={styles.badge}>
          <Text className="font-mono-semibold" style={styles.badgeText}>
            SESIÓN COMPLETADA
          </Text>
        </View>

        {/* ── Workout title ── */}
        <Text className="font-bebas" style={styles.workoutTitle} numberOfLines={2}>
          {workoutTitle.toUpperCase()}
        </Text>

        {/* ── Stats row ── */}
        <View style={styles.statsRow}>
          <StatBox icon="🔥" value={String(totalSets)} label="SERIES" color={C.lime} />
          <StatBox icon="⏱" value={String(durationMin)} label="MINUTOS" color={C.blue} />
          <StatBox icon="💪" value={String(exercises?.length ?? 0)} label="EJERCICIOS" color={C.pink} />
        </View>

        {/* ── Exercise list ── */}
        {exList.length > 0 && (
          <View style={styles.exListContainer}>
            <Text className="font-mono" style={styles.exListHeader}>
              EJERCICIOS
            </Text>
            <View style={styles.exListCard}>
              {exList.map((ex, i) => (
                <View key={`ex-${i}`} style={styles.exRow}>
                  <View style={styles.exBadge}>
                    <Text className="font-mono-semibold" style={styles.exBadgeNum}>
                      {i + 1}
                    </Text>
                  </View>
                  <Text
                    className="font-sans-medium"
                    style={styles.exName}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {ex.name}
                  </Text>
                  <Text className="font-mono" style={styles.exSetsReps}>
                    {ex.sets}×{ex.reps}
                  </Text>
                </View>
              ))}
              {extraCount > 0 && (
                <Text className="font-mono" style={styles.exMore}>
                  +{extraCount} más
                </Text>
              )}
            </View>
          </View>
        )}

        {/* ── Quote ── */}
        {quote?.q ? (
          <View style={styles.quoteContainer}>
            <View style={styles.quoteDivider} />
            <Text style={styles.quoteGlyph}>"</Text>
            <Text className="font-sans-italic" style={styles.quoteText} numberOfLines={4}>
              {quote.q}
            </Text>
            <Text className="font-mono" style={styles.quoteAuthor}>
              — {quote.a}
            </Text>
          </View>
        ) : null}

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

WorkoutShareCard.displayName = 'WorkoutShareCard'

export default WorkoutShareCard

const styles = StyleSheet.create({
  card: {
    width: 360,
    height: 640,
    backgroundColor: C.bg,
    padding: 16,
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
    height: 120,
    backgroundColor: 'rgba(163,230,53,0.04)',
  },
  // Profile
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: C.limeRing,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.border,
    borderWidth: 1.5,
    borderColor: C.limeRing,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: C.lime,
    fontSize: 14,
    fontFamily: 'DMSans_700Bold',
  },
  profileText: {
    marginLeft: 8,
    flex: 1,
  },
  userName: {
    color: C.fg,
    fontSize: 12,
    lineHeight: 15,
  },
  dateText: {
    color: C.fgMuted,
    fontSize: 9,
    lineHeight: 12,
    marginTop: 2,
  },
  // Badge
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(163,230,53,0.25)',
    backgroundColor: 'rgba(163,230,53,0.09)',
    marginBottom: 8,
  },
  badgeText: {
    color: C.lime,
    fontSize: 8,
    letterSpacing: 1.8,
  },
  // Workout title
  workoutTitle: {
    color: C.fg,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: 1,
    marginBottom: 10,
  },
  // Stats row
  statsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  statBox: {
    flex: 1,
    backgroundColor: C.cardBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    borderTopWidth: 2,
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  statIcon: {
    fontSize: 14,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 22,
    lineHeight: 26,
  },
  statLabel: {
    color: C.fgMuted,
    fontSize: 7,
    letterSpacing: 1,
    marginTop: 1,
  },
  // Exercise list
  exListContainer: {
    marginBottom: 8,
  },
  exListHeader: {
    color: C.fgMuted,
    fontSize: 8,
    letterSpacing: 2,
    marginBottom: 4,
  },
  exListCard: {
    backgroundColor: C.cardBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
  },
  exBadge: {
    width: 18,
    height: 18,
    borderRadius: 4,
    backgroundColor: 'rgba(163,230,53,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  exBadgeNum: {
    color: C.lime,
    fontSize: 8,
  },
  exName: {
    flex: 1,
    color: C.fg,
    fontSize: 11,
    lineHeight: 14,
  },
  exSetsReps: {
    color: C.fgDim,
    fontSize: 10,
    marginLeft: 8,
  },
  exMore: {
    color: C.fgMuted,
    fontSize: 10,
    paddingBottom: 4,
    paddingLeft: 26,
  },
  // Quote
  quoteContainer: {
    marginTop: 4,
  },
  quoteDivider: {
    height: 1,
    backgroundColor: C.border,
    marginBottom: 6,
  },
  quoteGlyph: {
    color: 'rgba(163,230,53,0.19)',
    fontSize: 32,
    fontFamily: 'DMSans_700Bold',
    lineHeight: 32,
    marginBottom: -8,
  },
  quoteText: {
    color: 'rgba(250,250,250,0.69)',
    fontSize: 11,
    lineHeight: 16,
    paddingLeft: 10,
  },
  quoteAuthor: {
    color: C.fgMuted,
    fontSize: 9,
    marginTop: 4,
    paddingLeft: 10,
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    right: 16,
  },
  footerDivider: {
    height: 1,
    backgroundColor: C.border,
    marginBottom: 6,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerBrand: {
    color: C.fgDim,
    fontSize: 9,
    letterSpacing: 1.5,
  },
  footerUrl: {
    color: C.fgMuted,
    fontSize: 8,
  },
})
