/**
 * WorkoutShareCard — RN View replica of web WorkoutShareCard.
 * Layout (flex column, space-between so it fills the frame at any height):
 *   header  → profile row + "SESIÓN COMPLETADA" badge + title + 3-stat row
 *   middle  → exercise list (max 8) with sets×reps AND time spent per exercise
 *   footer  → optional quote + brand footer
 *
 * Size: defaults to 360×640 (9:16) but accepts width/height so the caller can
 * render it at the full device screen size for a full-bleed story image. All
 * type/spacing scales off S = width / 360.
 */
import React, { forwardRef } from 'react'
import { View, Text, Image, StyleSheet } from 'react-native'
import type { Exercise, ExerciseTiming } from '@calistenia/core/types'
import { formatTimingClock } from '@calistenia/core/lib/exerciseTiming'

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

const BASE_W = 360

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
  /** Per-exercise wall-clock time; joined to exercises by id to show time spent. */
  timings?: ExerciseTiming[]
  quote?: Quote | null
  userName?: string
  avatarUrl?: string | null
  referralCode?: string | null
  /** Render size. Defaults to 360×640; pass screen dims for a full-bleed story. */
  width?: number
  height?: number
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
  s: ReturnType<typeof makeStyles>
}

function StatBox({ icon, value, label, color, s }: StatBoxProps) {
  return (
    <View style={[s.statBox, { borderTopColor: color }]}>
      <Text style={s.statIcon}>{icon}</Text>
      <Text className="font-bebas" style={[s.statValue, { color }]}>
        {value}
      </Text>
      <Text className="font-mono" style={s.statLabel}>
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
      timings,
      quote,
      userName,
      avatarUrl,
      referralCode: _referralCode,
      width = BASE_W,
      height = 640,
    },
    ref,
  ) => {
    const s = makeStyles(width, height)
    const initials = (userName ?? '?')[0].toUpperCase()
    const exList = (exercises ?? []).slice(0, 8)
    const extraCount = (exercises?.length ?? 0) - 8
    const secById = new Map(
      (timings ?? []).filter((t) => t.seconds > 0).map((t) => [t.exerciseId, t.seconds]),
    )

    return (
      <View ref={ref} style={s.card} collapsable={false}>
        {/* Top accent line */}
        <View style={s.topLine} />
        {/* Lime glow top */}
        <View style={s.topGlow} />

        {/* ── Header group ── */}
        <View>
          {/* Profile row */}
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

          {/* "SESIÓN COMPLETADA" badge */}
          <View style={s.badge}>
            <Text className="font-mono-semibold" style={s.badgeText}>
              SESIÓN COMPLETADA
            </Text>
          </View>

          {/* Workout title */}
          <Text className="font-bebas" style={s.workoutTitle} numberOfLines={2}>
            {workoutTitle.toUpperCase()}
          </Text>

          {/* Stats row */}
          <View style={s.statsRow}>
            <StatBox icon="🔥" value={String(totalSets)} label="SERIES" color={C.lime} s={s} />
            <StatBox icon="⏱" value={String(durationMin)} label="MINUTOS" color={C.blue} s={s} />
            <StatBox icon="💪" value={String(exercises?.length ?? 0)} label="EJERCICIOS" color={C.pink} s={s} />
          </View>
        </View>

        {/* ── Exercise list ── */}
        {exList.length > 0 && (
          <View style={s.exListContainer}>
            <Text className="font-mono" style={s.exListHeader}>
              EJERCICIOS · TIEMPO
            </Text>
            <View style={s.exListCard}>
              {exList.map((ex, i) => {
                const secs = secById.get(ex.id)
                return (
                  <View key={`ex-${i}`} style={s.exRow}>
                    <View style={s.exBadge}>
                      <Text className="font-mono-semibold" style={s.exBadgeNum}>
                        {i + 1}
                      </Text>
                    </View>
                    <Text
                      className="font-sans-medium"
                      style={s.exName}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {ex.name}
                    </Text>
                    <View style={s.exMeta}>
                      <Text className="font-mono" style={s.exSetsReps}>
                        {ex.sets}×{ex.reps}
                      </Text>
                      {secs != null && (
                        <Text className="font-mono" style={s.exTime}>
                          {formatTimingClock(secs)}
                        </Text>
                      )}
                    </View>
                  </View>
                )
              })}
              {extraCount > 0 && (
                <Text className="font-mono" style={s.exMore}>
                  +{extraCount} más
                </Text>
              )}
            </View>
          </View>
        )}

        {/* ── Quote + footer group ── */}
        <View>
          {quote?.q ? (
            <View style={s.quoteContainer}>
              <View style={s.quoteDivider} />
              <Text style={s.quoteGlyph}>"</Text>
              <Text className="font-sans-italic" style={s.quoteText} numberOfLines={4}>
                {quote.q}
              </Text>
              <Text className="font-mono" style={s.quoteAuthor}>
                — {quote.a}
              </Text>
            </View>
          ) : null}

          <View style={s.footer}>
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
      </View>
    )
  },
)

WorkoutShareCard.displayName = 'WorkoutShareCard'

export default WorkoutShareCard

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
      height: r(120),
      backgroundColor: 'rgba(163,230,53,0.04)',
    },
    // Profile
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
    // Badge
    badge: {
      alignSelf: 'flex-start',
      paddingHorizontal: r(8),
      paddingVertical: r(4),
      borderRadius: r(10),
      borderWidth: 1,
      borderColor: 'rgba(163,230,53,0.25)',
      backgroundColor: 'rgba(163,230,53,0.09)',
      marginBottom: r(8),
    },
    badgeText: {
      color: C.lime,
      fontSize: r(8),
      letterSpacing: 1.8,
    },
    // Workout title
    workoutTitle: {
      color: C.fg,
      fontSize: r(26),
      lineHeight: r(30),
      letterSpacing: 1,
      marginBottom: r(10),
    },
    // Stats row
    statsRow: {
      flexDirection: 'row',
      gap: r(6),
      marginBottom: r(10),
    },
    statBox: {
      flex: 1,
      backgroundColor: C.cardBg,
      borderRadius: r(8),
      borderWidth: 1,
      borderColor: C.border,
      borderTopWidth: 2,
      alignItems: 'center',
      paddingVertical: r(6),
      paddingHorizontal: r(4),
    },
    statIcon: {
      fontSize: r(14),
      lineHeight: r(19),
      marginBottom: 2,
    },
    statValue: {
      fontSize: r(22),
      lineHeight: r(26),
    },
    statLabel: {
      color: C.fgMuted,
      fontSize: r(7),
      letterSpacing: 1,
      marginTop: 1,
    },
    // Exercise list
    exListContainer: {
      marginVertical: r(8),
    },
    exListHeader: {
      color: C.fgMuted,
      fontSize: r(8),
      letterSpacing: 2,
      marginBottom: r(4),
    },
    exListCard: {
      backgroundColor: C.cardBg,
      borderRadius: r(8),
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: r(10),
      paddingVertical: r(4),
    },
    exRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: r(5),
    },
    exBadge: {
      width: r(18),
      height: r(18),
      borderRadius: r(4),
      backgroundColor: 'rgba(163,230,53,0.15)',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: r(8),
    },
    exBadgeNum: {
      color: C.lime,
      fontSize: r(8),
    },
    exName: {
      flex: 1,
      color: C.fg,
      fontSize: r(11),
      lineHeight: r(14),
    },
    exMeta: {
      alignItems: 'flex-end',
      marginLeft: r(8),
    },
    exSetsReps: {
      color: C.fgDim,
      fontSize: r(10),
    },
    exTime: {
      color: C.lime,
      fontSize: r(9),
      marginTop: 1,
    },
    exMore: {
      color: C.fgMuted,
      fontSize: r(10),
      paddingBottom: r(4),
      paddingLeft: r(26),
    },
    // Quote
    quoteContainer: {
      marginTop: r(4),
    },
    quoteDivider: {
      height: 1,
      backgroundColor: C.border,
      marginBottom: r(6),
    },
    quoteGlyph: {
      color: 'rgba(163,230,53,0.19)',
      fontSize: r(32),
      fontFamily: 'DMSans_700Bold',
      lineHeight: r(32),
      marginBottom: r(-8),
    },
    quoteText: {
      color: 'rgba(250,250,250,0.69)',
      fontSize: r(11),
      lineHeight: r(16),
      paddingLeft: r(10),
    },
    quoteAuthor: {
      color: C.fgMuted,
      fontSize: r(9),
      marginTop: r(4),
      paddingLeft: r(10),
    },
    // Footer
    footer: {
      marginTop: r(12),
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
