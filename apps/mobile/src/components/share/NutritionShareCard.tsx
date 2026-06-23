/**
 * NutritionShareCard — shareable image for a nutrition day summary.
 *
 * Layout (dark spec-sheet, 360×640 scalable):
 *   Header row  — accent dot + mono "NUTRICIÓN" kicker + date + avatar initial
 *   Hero        — Bebas calorie number + "/ GOAL KCAL" + thin lime progress bar
 *   Quality badge — letter A–E with semantic colour
 *   Macro rows  — PROTEÍNA / CARBOS / GRASA, value + thin progress bar
 *   Water row   — AGUA  X.X / Y.Y L  (if provided)
 *   Brand footer hairline — "CALISTENIA" / "calistenia-app.com"
 *
 * Pure RN Views + Text — no charting libs.  `collapsable={false}` on root so
 * react-native-view-shot can capture every pixel.
 *
 * FONT RULE: never pair fontWeight:'bold' with custom fonts.
 * Use family variant names: BebasNeue_400Regular, DMSans_*Bold, etc.
 */
import React, { memo } from 'react'
import { View, Text, StyleSheet } from 'react-native'

const BASE_W = 360
const BASE_H = 640

// ── Palette ──────────────────────────────────────────────────────────────────
const INK       = '#f5f5f4'
const INK_DIM   = 'rgba(245,245,244,0.66)'
const INK_FAINT = 'rgba(245,245,244,0.38)'
const CARD_BG   = '#0a0a0b'
const SURFACE   = '#141416'
const HAIRLINE  = 'rgba(245,245,244,0.14)'

const LIME  = '#a3e635'
const BLUE  = '#38bdf8'
const AMBER = '#fbbf24'
const PINK  = '#f472b6'
const RED   = '#ef4444'

// Quality score colours
const QUALITY_COLOR: Record<string, string> = {
  A: LIME,
  B: '#84cc16',
  C: AMBER,
  D: '#f97316',
  E: RED,
}

// ── Props ─────────────────────────────────────────────────────────────────────
export interface NutritionShareCardProps {
  date: string
  totals: { calories: number; protein: number; carbs: number; fat: number }
  goals: {
    dailyCalories: number
    dailyProtein: number
    dailyCarbs: number
    dailyFat: number
  } | null
  waterMl?: number
  waterGoal?: number
  qualityScore?: 'A' | 'B' | 'C' | 'D' | 'E'
  mealCount?: number
  userName?: string
  avatarUrl?: string | null
  width?: number
  height?: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatNutritionDate(iso: string): string {
  try {
    const d = new Date(iso + 'T12:00:00')
    return d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })
  } catch {
    return iso
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface MacroRowProps {
  label: string
  value: number
  goal: number | undefined
  unit: string
  color: string
  r: (n: number) => number
}

function MacroRow({ label, value, goal, unit, color, r }: MacroRowProps) {
  const pct = goal && goal > 0 ? clamp(value / goal, 0, 1) : 0
  const showGoal = goal != null && goal > 0

  return (
    <View style={{ marginBottom: r(14) }}>
      {/* Label row */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: r(5) }}>
        <Text style={{
          fontFamily: 'JetBrainsMono_400Regular',
          color: INK_DIM,
          fontSize: r(9),
          letterSpacing: r(2),
        }}>
          {label}
        </Text>
        <Text style={{
          fontFamily: 'BebasNeue_400Regular',
          color: INK,
          fontSize: r(18),
          letterSpacing: r(0.5),
        }}>
          {Math.round(value)}{unit}
          {showGoal ? (
            <Text style={{ color: INK_FAINT, fontSize: r(13) }}>
              {' / '}{goal}{unit}
            </Text>
          ) : null}
        </Text>
      </View>
      {/* Progress bar */}
      <View style={{ height: r(3), backgroundColor: SURFACE, borderRadius: r(2) }}>
        {showGoal && pct > 0 ? (
          <View style={{
            height: r(3),
            width: `${pct * 100}%`,
            backgroundColor: color,
            borderRadius: r(2),
          }} />
        ) : null}
      </View>
    </View>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const NutritionShareCard = memo(function NutritionShareCard({
  date,
  totals,
  goals,
  waterMl,
  waterGoal,
  qualityScore,
  mealCount,
  userName,
  width = BASE_W,
  height = BASE_H,
}: NutritionShareCardProps) {
  const S = width / BASE_W
  const r = (n: number) => Math.round(n * S)
  const s = makeStyles(width, height, r)

  const initials = (userName ?? 'A').trim()[0]?.toUpperCase() ?? 'A'
  const displayName = userName ?? 'Atleta'

  // Calorie hero
  const calories = Math.round(totals.calories)
  const goalCal  = goals?.dailyCalories ?? 0
  const calPct   = goalCal > 0 ? clamp(calories / goalCal, 0, 1) : 0
  const showCalGoal = goalCal > 0

  // Quality badge colour
  const qColor = qualityScore ? QUALITY_COLOR[qualityScore] : INK_FAINT

  // Water
  const showWater  = waterMl != null && waterMl > 0
  const waterLitres = showWater ? (waterMl! / 1000).toFixed(1) : '0.0'
  const waterGoalL  = waterGoal && waterGoal > 0 ? (waterGoal / 1000).toFixed(1) : null
  const waterPct    = waterGoal && waterGoal > 0 && waterMl != null
    ? clamp(waterMl / waterGoal, 0, 1)
    : 0

  return (
    <View style={s.card} collapsable={false}>
      {/* ── Top lime accent line ── */}
      <View style={s.topLine} />

      {/* ── Header ── */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={s.kickerRow}>
            <View style={s.accentDot} />
            <Text style={s.kicker}>NUTRICIÓN</Text>
          </View>
          <Text style={s.dateText}>{formatNutritionDate(date)}</Text>
          {mealCount != null && mealCount > 0 && (
            <Text style={s.mealCount}>{mealCount} COMIDA{mealCount !== 1 ? 'S' : ''}</Text>
          )}
        </View>
        <View style={s.avatar}>
          <Text style={s.avatarInitial}>{initials}</Text>
        </View>
      </View>

      {/* ── Hero: calories ── */}
      <View style={s.hero}>
        <View style={s.heroRow}>
          <Text style={s.heroNumber}>{calories}</Text>
          <View style={s.heroRight}>
            {showCalGoal && (
              <Text style={s.heroGoal}>/ {goalCal}</Text>
            )}
            <Text style={s.heroUnit}>KCAL</Text>
          </View>
          {/* Quality score badge */}
          {qualityScore && (
            <View style={[s.qualityBadge, { borderColor: qColor + '55', backgroundColor: qColor + '18' }]}>
              <Text style={[s.qualityLetter, { color: qColor }]}>{qualityScore}</Text>
              <Text style={[s.qualityLabel, { color: qColor }]}>CALIDAD</Text>
            </View>
          )}
        </View>

        {/* Calorie progress bar */}
        <View style={s.calBarTrack}>
          <View style={[s.calBarFill, {
            width: `${calPct * 100}%` as any,
            backgroundColor: calories > goalCal && goalCal > 0 ? RED : LIME,
          }]} />
        </View>

        {/* Byline */}
        <Text style={s.byline}>{displayName}</Text>
      </View>

      {/* ── Divider ── */}
      <View style={s.divider} />

      {/* ── Macros ── */}
      <View style={s.macros}>
        <Text style={s.sectionLabel}>MACRONUTRIENTES</Text>
        <MacroRow label="PROTEÍNA" value={totals.protein} goal={goals?.dailyProtein}   unit="g" color={BLUE}  r={r} />
        <MacroRow label="CARBOS"   value={totals.carbs}   goal={goals?.dailyCarbs}     unit="g" color={AMBER} r={r} />
        <MacroRow label="GRASA"    value={totals.fat}     goal={goals?.dailyFat}       unit="g" color={PINK}  r={r} />
      </View>

      {/* ── Water row ── */}
      {showWater && (
        <>
          <View style={s.divider} />
          <View style={s.waterSection}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: r(5) }}>
              <Text style={s.sectionLabel}>AGUA</Text>
              <Text style={s.waterValue}>
                {waterLitres} L
                {waterGoalL ? (
                  <Text style={{ color: INK_FAINT, fontFamily: 'BebasNeue_400Regular', fontSize: r(13) }}>
                    {' / '}{waterGoalL} L
                  </Text>
                ) : null}
              </Text>
            </View>
            <View style={{ height: r(3), backgroundColor: SURFACE, borderRadius: r(2) }}>
              {waterPct > 0 && (
                <View style={{ height: r(3), width: `${waterPct * 100}%`, backgroundColor: BLUE, borderRadius: r(2) }} />
              )}
            </View>
          </View>
        </>
      )}

      {/* ── Brand footer ── */}
      <View style={s.brandRow}>
        <Text style={s.brand}>CALISTENIA</Text>
        <Text style={s.brandUrl}>calistenia-app.com</Text>
      </View>
    </View>
  )
})

NutritionShareCard.displayName = 'NutritionShareCard'
export default NutritionShareCard

// ── Styles ────────────────────────────────────────────────────────────────────

function makeStyles(width: number, height: number, r: (n: number) => number) {
  return StyleSheet.create({
    card: {
      width,
      height,
      backgroundColor: CARD_BG,
      overflow: 'hidden',
      paddingHorizontal: r(22),
      paddingTop: r(22),
      paddingBottom: r(16),
      justifyContent: 'space-between',
    },

    topLine: {
      position: 'absolute',
      top: 0,
      left: r(40),
      right: r(40),
      height: 2,
      backgroundColor: LIME,
      borderRadius: 1,
    },

    // ── Header ──
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginTop: r(8),
    },
    headerLeft: { flex: 1 },
    kickerRow: { flexDirection: 'row', alignItems: 'center' },
    accentDot: {
      width: r(7),
      height: r(7),
      borderRadius: r(4),
      backgroundColor: LIME,
      marginRight: r(7),
    },
    kicker: {
      fontFamily: 'JetBrainsMono_700Bold',
      color: LIME,
      fontSize: r(10),
      letterSpacing: r(3),
    },
    dateText: {
      fontFamily: 'DMSans_500Medium',
      color: INK_DIM,
      fontSize: r(11),
      marginTop: r(4),
      textTransform: 'capitalize',
    },
    mealCount: {
      fontFamily: 'JetBrainsMono_400Regular',
      color: INK_FAINT,
      fontSize: r(9),
      letterSpacing: r(1.5),
      marginTop: r(2),
    },
    avatar: {
      width: r(36),
      height: r(36),
      borderRadius: r(18),
      backgroundColor: 'rgba(163,230,53,0.12)',
      borderWidth: 1,
      borderColor: 'rgba(163,230,53,0.38)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitial: {
      fontFamily: 'DMSans_700Bold',
      color: LIME,
      fontSize: r(15),
    },

    // ── Hero ──
    hero: { marginTop: r(20) },
    heroRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
    },
    heroNumber: {
      fontFamily: 'BebasNeue_400Regular',
      color: INK,
      fontSize: r(86),
      lineHeight: r(82),
      letterSpacing: r(1),
    },
    heroRight: {
      marginLeft: r(10),
      marginBottom: r(8),
      alignItems: 'flex-start',
    },
    heroGoal: {
      fontFamily: 'BebasNeue_400Regular',
      color: INK_FAINT,
      fontSize: r(18),
      lineHeight: r(20),
    },
    heroUnit: {
      fontFamily: 'BebasNeue_400Regular',
      color: LIME,
      fontSize: r(22),
      lineHeight: r(24),
    },
    qualityBadge: {
      marginLeft: 'auto' as any,
      marginBottom: r(8),
      alignSelf: 'flex-end',
      alignItems: 'center',
      justifyContent: 'center',
      width: r(44),
      height: r(44),
      borderRadius: r(8),
      borderWidth: 1,
    },
    qualityLetter: {
      fontFamily: 'BebasNeue_400Regular',
      fontSize: r(26),
      lineHeight: r(28),
    },
    qualityLabel: {
      fontFamily: 'JetBrainsMono_400Regular',
      fontSize: r(7),
      letterSpacing: r(1),
      marginTop: r(-2),
    },

    calBarTrack: {
      height: r(4),
      backgroundColor: SURFACE,
      borderRadius: r(2),
      marginTop: r(10),
      overflow: 'hidden',
    },
    calBarFill: {
      height: r(4),
      borderRadius: r(2),
    },
    byline: {
      fontFamily: 'DMSans_600SemiBold',
      color: INK_DIM,
      fontSize: r(12),
      marginTop: r(8),
    },

    // ── Divider ──
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: HAIRLINE,
      marginVertical: r(16),
    },

    // ── Macros ──
    macros: {},
    sectionLabel: {
      fontFamily: 'JetBrainsMono_400Regular',
      color: INK_FAINT,
      fontSize: r(8),
      letterSpacing: r(2.5),
      marginBottom: r(12),
    },

    // ── Water ──
    waterSection: {},
    waterValue: {
      fontFamily: 'BebasNeue_400Regular',
      color: BLUE,
      fontSize: r(18),
      letterSpacing: r(0.5),
    },

    // ── Brand footer ──
    brandRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: r(12),
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: HAIRLINE,
    },
    brand: {
      fontFamily: 'DMSans_700Bold',
      color: INK_DIM,
      fontSize: r(11),
      letterSpacing: r(1.5),
    },
    brandUrl: {
      fontFamily: 'DMSans_400Regular',
      color: INK_FAINT,
      fontSize: r(10),
    },
  })
}
