/**
 * NutritionShareCard — shareable image for a nutrition day summary.
 *
 * Layout (dark spec-sheet, 360×640 scalable):
 *   variant="summary" (default) — unchanged original layout:
 *     Header row  — accent dot + mono "NUTRICIÓN" kicker + date + avatar initial
 *     Hero        — Bebas calorie number + "/ GOAL KCAL" + thin lime progress bar
 *     Quality badge — letter A–E with semantic colour
 *     Macro rows  — PROTEÍNA / CARBOS / GRASA, value + thin progress bar
 *     Water row   — AGUA  X.X / Y.Y L  (if provided)
 *     Brand footer hairline — "CALISTENIA" / "calistenia-app.com"
 *
 *   variant="rich" — compact hero/macros + COMIDAS section with meal thumbnails.
 *
 * Pure RN Views + Text — no charting libs.  `collapsable={false}` on root so
 * react-native-view-shot can capture every pixel.
 *
 * FONT RULE: never pair fontWeight:'bold' with custom fonts.
 * Use family variant names: BebasNeue_400Regular, DMSans_*Bold, etc.
 */
import React, { memo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Image } from 'expo-image'

import type { ShareMeal } from '@calistenia/core/lib/share-meals'

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

// Meal-type accent colours (hex, for use in RN StyleSheet)
const MEAL_TYPE_HEX: Record<string, string> = {
  desayuno: AMBER,
  almuerzo: BLUE,
  cena:     PINK,
  snack:    LIME,
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
  /** Render variant. Default: "summary" (original layout unchanged). */
  variant?: 'summary' | 'rich'
  /** Meal rows for rich variant — output of buildShareMeals(entries). */
  meals?: ShareMeal[]
  /** How many entries were cut off after max rows. */
  mealsOverflow?: number
  /** Precomputed daily quality score string ("A"–"E") for the header badge. */
  dailyQualityScore?: 'A' | 'B' | 'C' | 'D' | 'E'
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

// ── Rich variant sub-components ───────────────────────────────────────────────

interface CompactMacroLineProps {
  protein: number
  carbs: number
  fat: number
  goalProtein?: number
  goalCarbs?: number
  goalFat?: number
  r: (n: number) => number
}

function CompactMacroLine({ protein, carbs, fat, goalProtein, goalCarbs, goalFat, r }: CompactMacroLineProps) {
  const items = [
    { label: 'P', value: protein, goal: goalProtein, color: BLUE },
    { label: 'C', value: carbs,   goal: goalCarbs,   color: AMBER },
    { label: 'G', value: fat,     goal: goalFat,     color: PINK },
  ]

  return (
    <View style={{ flexDirection: 'row', gap: r(16), marginTop: r(6) }}>
      {items.map(({ label, value, goal, color }) => {
        const pct = goal && goal > 0 ? Math.min(value / goal, 1) : 0
        const pctStr = `${Math.round(pct * 100)}%`
        return (
          <View key={label} style={{ alignItems: 'center', flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: r(3) }}>
              <Text style={{
                fontFamily: 'JetBrainsMono_400Regular',
                color: INK_FAINT,
                fontSize: r(8),
                letterSpacing: r(1.5),
                marginRight: r(3),
              }}>
                {label}
              </Text>
              <Text style={{
                fontFamily: 'BebasNeue_400Regular',
                color: INK,
                fontSize: r(16),
              }}>
                {value}g
              </Text>
            </View>
            <View style={{ height: r(3), width: '100%', backgroundColor: SURFACE, borderRadius: r(2) }}>
              {pct > 0 ? (
                <View style={{ height: r(3), width: pctStr as any, backgroundColor: color, borderRadius: r(2), opacity: 0.7 }} />
              ) : null}
            </View>
          </View>
        )
      })}
    </View>
  )
}

interface MealRowProps {
  meal: ShareMeal
  r: (n: number) => number
}

function MealRow({ meal, r }: MealRowProps) {
  const accentColor = MEAL_TYPE_HEX[meal.mealType] ?? LIME
  const firstLetter = (meal.title || meal.mealType || '?').trim()[0]?.toUpperCase() ?? '?'
  const qColor = meal.qualityScore ? QUALITY_COLOR[meal.qualityScore] : null

  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: r(8),
    }}>
      {/* 2px left accent bar */}
      <View style={{
        width: r(2),
        height: r(44),
        backgroundColor: accentColor,
        borderRadius: r(1),
        marginRight: r(8),
        opacity: 0.6,
      }} />

      {/* Thumbnail or letter tile */}
      <View style={{
        width: r(44),
        height: r(44),
        borderRadius: r(6),
        overflow: 'hidden',
        marginRight: r(10),
        borderWidth: 1,
        borderColor: accentColor + '33',
      }}>
        {meal.photoUrl ? (
          <Image
            source={{ uri: meal.photoUrl }}
            style={{ width: r(44), height: r(44) }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={{
            flex: 1,
            backgroundColor: accentColor + '24',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Text style={{
              fontFamily: 'JetBrainsMono_700Bold',
              color: accentColor,
              fontSize: r(18),
            }}>
              {firstLetter}
            </Text>
          </View>
        )}
      </View>

      {/* Text: title + macros */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: 'DMSans_500Medium',
            color: INK,
            fontSize: r(12),
            marginBottom: r(2),
          }}
        >
          {meal.title || meal.mealType}
        </Text>
        <Text style={{
          fontFamily: 'JetBrainsMono_400Regular',
          color: INK_FAINT,
          fontSize: r(8.5),
          letterSpacing: r(0.5),
        }}>
          {meal.protein}P  {meal.carbs}C  {meal.fat}G
        </Text>
      </View>

      {/* Kcal + quality chip */}
      <View style={{ alignItems: 'flex-end', marginLeft: r(8) }}>
        <Text style={{
          fontFamily: 'BebasNeue_400Regular',
          color: INK,
          fontSize: r(16),
          lineHeight: r(18),
        }}>
          {meal.calories}
        </Text>
        <Text style={{
          fontFamily: 'JetBrainsMono_400Regular',
          color: INK_FAINT,
          fontSize: r(7),
          letterSpacing: r(0.5),
        }}>
          kcal
        </Text>
        {qColor && meal.qualityScore ? (
          <View style={{
            marginTop: r(1),
            width: r(18),
            height: r(18),
            borderRadius: r(4),
            borderWidth: 1,
            borderColor: qColor + '55',
            backgroundColor: qColor + '18',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Text style={{
              fontFamily: 'BebasNeue_400Regular',
              color: qColor,
              fontSize: r(12),
              lineHeight: r(14),
            }}>
              {meal.qualityScore}
            </Text>
          </View>
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
  variant = 'summary',
  meals = [],
  mealsOverflow = 0,
  dailyQualityScore,
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

  // ── RICH VARIANT ─────────────────────────────────────────────────────────────
  if (variant === 'rich') {
    const headerQScore = dailyQualityScore ?? qualityScore
    const headerQColor = headerQScore ? QUALITY_COLOR[headerQScore] : null

    return (
      <View style={s.card} collapsable={false}>
        {/* ── Top lime accent line ── */}
        <View style={s.topLine} />

        {/* ── Header ── */}
        <View style={[s.header, { marginTop: r(8) }]}>
          <View style={s.headerLeft}>
            <View style={s.kickerRow}>
              <View style={s.accentDot} />
              <Text style={s.kicker}>NUTRICIÓN</Text>
            </View>
            <Text style={s.dateText}>{formatNutritionDate(date)}</Text>
          </View>
          {/* Daily grade badge — only when available */}
          {headerQScore && headerQColor ? (
            <View style={[s.qualityBadge, { borderColor: headerQColor + '55', backgroundColor: headerQColor + '18' }]}>
              <Text style={[s.qualityLetter, { color: headerQColor }]}>{headerQScore}</Text>
              <Text style={[s.qualityLabel, { color: headerQColor }]}>CALIDAD</Text>
            </View>
          ) : null}
        </View>

        {/* ── HERO (compact) ── */}
        <View style={{ marginTop: r(14) }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
            <Text style={[s.heroNumber, { fontSize: r(54), lineHeight: r(52) }]}>{calories}</Text>
            <View style={{ marginLeft: r(8), marginBottom: r(4), alignItems: 'flex-start' }}>
              {showCalGoal && (
                <Text style={[s.heroGoal, { fontSize: r(13) }]}>/ {goalCal}</Text>
              )}
              <Text style={[s.heroUnit, { fontSize: r(16), lineHeight: r(18) }]}>KCAL</Text>
            </View>
          </View>
          {/* Calorie progress bar */}
          <View style={[s.calBarTrack, { marginTop: r(6) }]}>
            <View style={[s.calBarFill, {
              width: `${calPct * 100}%` as any,
              backgroundColor: calories > goalCal && goalCal > 0 ? RED : LIME,
            }]} />
          </View>
        </View>

        {/* ── Compact macro line ── */}
        <CompactMacroLine
          protein={Math.round(totals.protein)}
          carbs={Math.round(totals.carbs)}
          fat={Math.round(totals.fat)}
          goalProtein={goals?.dailyProtein}
          goalCarbs={goals?.dailyCarbs}
          goalFat={goals?.dailyFat}
          r={r}
        />

        {/* ── Divider + COMIDAS label ── */}
        <View style={[s.divider, { marginTop: r(12), marginBottom: r(10) }]} />
        <Text style={s.sectionLabel}>COMIDAS</Text>

        {/* ── Meal rows (up to 4) ── */}
        <View style={{ flex: 1 }}>
          {meals.map((meal, idx) => (
            <MealRow key={`${meal.mealType}-${idx}`} meal={meal} r={r} />
          ))}
          {mealsOverflow > 0 && (
            <Text style={{
              fontFamily: 'JetBrainsMono_400Regular',
              color: INK_FAINT,
              fontSize: r(9),
              letterSpacing: r(1),
              marginTop: r(2),
            }}>
              +{mealsOverflow} más
            </Text>
          )}
        </View>

        {/* ── Divider + Brand footer ── */}
        <View style={s.brandRow}>
          <Text style={s.brand}>CALISTENIA</Text>
          <Text style={s.brandUrl}>calistenia-app.com</Text>
        </View>
      </View>
    )
  }

  // ── SUMMARY VARIANT (original, byte-for-byte) ─────────────────────────────
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
