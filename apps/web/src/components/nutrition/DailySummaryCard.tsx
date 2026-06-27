import { useCallback, useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../../lib/i18n'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import { shareImage, canvasToBlob, loadLogo } from '../../lib/share'
import { loadImage, fillRRect } from '../../lib/canvas-helpers'
import { op } from '@calistenia/core/lib/analytics'
import { buildShareMeals } from '@calistenia/core/lib/share-meals'
import type { DailyTotals, NutritionGoal, NutritionEntry, QualityScore } from '@calistenia/core/types'

// ── Brand palette (mirrors NutritionShareCard.tsx native) ────────────────────
const CARD_BG   = '#0a0a0b'
const SURFACE   = '#141416'
const INK       = '#f5f5f4'
const INK_DIM   = 'rgba(245,245,244,0.66)'
const INK_FAINT = 'rgba(245,245,244,0.38)'
const HAIRLINE  = 'rgba(245,245,244,0.14)'
const LIME      = '#a3e635'
const BLUE      = '#38bdf8'
const AMBER     = '#fbbf24'
const PINK      = '#f472b6'
const RED       = '#ef4444'

const QUALITY_COLOR: Record<string, string> = {
  A: '#a3e635',
  B: '#84cc16',
  C: '#fbbf24',
  D: '#f97316',
  E: '#ef4444',
}

// Meal-type accent hex values (canvas hex, not Tailwind classes)
const MEAL_TYPE_HEX: Record<string, string> = {
  desayuno: AMBER,
  almuerzo: BLUE,
  cena:     PINK,
  snack:    LIME,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function rrect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

/** Clip ctx to a rounded rect, draw image cover-fit, then restore. */
function drawRoundedImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number, y: number,
  size: number, r: number,
) {
  ctx.save()
  rrect(ctx, x, y, size, size, r)
  ctx.clip()
  // cover-fit
  const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight)
  const sw = img.naturalWidth * scale
  const sh = img.naturalHeight * scale
  ctx.drawImage(img, x + (size - sw) / 2, y + (size - sh) / 2, sw, sh)
  ctx.restore()
}

/** Draw a filled rounded rect (local – DailySummaryCard uses a private rrect) */
function localFillRRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  r: number, color: string,
) {
  rrect(ctx, x, y, w, h, r)
  ctx.fillStyle = color
  ctx.fill()
}

/** Draw a circular arc gauge (used by the summary variant) */
function drawGauge(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  radius: number, pct: number,
  trackColor: string, fillColor: string, lineWidth: number,
) {
  ctx.beginPath()
  ctx.arc(cx, cy, radius, -Math.PI / 2, Math.PI * 1.5)
  ctx.strokeStyle = trackColor
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.stroke()
  if (pct > 0) {
    const endAngle = -Math.PI / 2 + Math.PI * 2 * Math.min(pct, 1)
    ctx.beginPath()
    ctx.arc(cx, cy, radius, -Math.PI / 2, endAngle)
    ctx.strokeStyle = fillColor
    ctx.lineWidth = lineWidth
    ctx.lineCap = 'round'
    ctx.stroke()
  }
}

/** Truncate text with ellipsis to fit maxWidth. */
function ellipsis(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let lo = 0, hi = text.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2)
    if (ctx.measureText(text.slice(0, mid) + '…').width <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return text.slice(0, lo) + '…'
}

/** Ensure brand fonts are loaded before drawing. */
async function ensureFontsLoaded() {
  try {
    await document.fonts.ready
    await Promise.allSettled([
      document.fonts.load('400 64px "Bebas Neue"'),
      document.fonts.load('400 20px "JetBrains Mono"'),
      document.fonts.load('500 16px "DM Sans"'),
    ])
  } catch {
    // fonts unavailable — canvas will fall back to system-ui
  }
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return dateStr
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface DailySummaryCardProps {
  date: string
  totals: DailyTotals
  goals: NutritionGoal | null
  waterMl: number
  waterGoal: number
  entries?: NutritionEntry[]
  dailyQualityScore?: QualityScore
}

// ── Draw: SUMMARY variant (original, refactored out of handleShare) ───────────

interface DrawSummaryOpts {
  date: string
  totals: DailyTotals
  goals: NutritionGoal | null
  waterMl: number
  waterGoal: number
  logo: HTMLImageElement | null
  t: (key: string) => string
}

function drawSummaryCard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: DrawSummaryOpts,
) {
  const { date, totals, goals, waterMl, waterGoal, logo, t } = opts
  const pad = 36

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, '#0a0a0a')
  grad.addColorStop(0.5, '#0f0f0f')
  grad.addColorStop(1, '#0a0a0a')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)

  // Header with logo
  const logoSize = 44
  const headerY = 40
  if (logo) {
    ctx.drawImage(logo, pad, headerY, logoSize, logoSize)
  }
  const textX = logo ? pad + logoSize + 12 : pad

  ctx.fillStyle = '#fafafa'
  ctx.font = '700 16px system-ui, -apple-system, sans-serif'
  ctx.fillText('CALISTENIA APP', textX, headerY + 20)

  ctx.fillStyle = '#525252'
  ctx.font = '400 12px system-ui, -apple-system, sans-serif'
  ctx.fillText(formatDate(date), textX, headerY + 38)

  // Section label
  ctx.fillStyle = '#404040'
  ctx.font = '600 11px system-ui, -apple-system, sans-serif'
  ctx.fillText(t('nutrition.summary.sectionLabel'), pad, 120)

  // Calorie gauge
  const calVal = Math.round(totals.calories)
  const calGoal = goals?.dailyCalories ?? 0
  const calPct = calGoal > 0 ? calVal / calGoal : 0
  const gaugeR = 80
  const gaugeCx = w / 2
  const gaugeCy = 240

  drawGauge(ctx, gaugeCx, gaugeCy, gaugeR, calPct, '#1a1a1a', calVal > calGoal ? RED : LIME, 10)

  ctx.fillStyle = '#fafafa'
  ctx.font = '700 48px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(`${calVal}`, gaugeCx, gaugeCy + 8)

  ctx.fillStyle = '#525252'
  ctx.font = '400 14px system-ui, -apple-system, sans-serif'
  ctx.fillText('kcal', gaugeCx, gaugeCy + 28)

  if (calGoal > 0) {
    ctx.fillStyle = '#404040'
    ctx.font = '400 13px system-ui, -apple-system, sans-serif'
    ctx.fillText(`de ${calGoal} kcal`, gaugeCx, gaugeCy + gaugeR + 28)
  }

  ctx.textAlign = 'left'

  // Percentage chip
  if (calGoal > 0) {
    const pctText = `${Math.round(calPct * 100)}%`
    const chipW = ctx.measureText(pctText).width + 20
    const chipColor = calVal > calGoal ? RED : calPct >= 0.8 ? LIME : '#525252'
    fillRRect(ctx, gaugeCx - chipW / 2, gaugeCy + gaugeR + 40, chipW, 26, 13, chipColor + '20')
    ctx.fillStyle = chipColor
    ctx.font = '600 12px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(pctText, gaugeCx, gaugeCy + gaugeR + 57)
    ctx.textAlign = 'left'
  }

  // Macro cards
  const macros = [
    { label: t('nutrition.protein'), val: Math.round(totals.protein), goal: goals?.dailyProtein, unit: 'g', color: BLUE },
    { label: t('nutrition.carbs'),   val: Math.round(totals.carbs),   goal: goals?.dailyCarbs,   unit: 'g', color: AMBER },
    { label: t('nutrition.fat'),     val: Math.round(totals.fat),     goal: goals?.dailyFat,     unit: 'g', color: PINK },
  ]

  const cardStartY = gaugeCy + gaugeR + 90
  const cardH = 80
  const cardGap = 12
  const barW = w - pad * 2

  macros.forEach((m, i) => {
    const y = cardStartY + i * (cardH + cardGap)
    const pct = m.goal ? Math.min(m.val / m.goal, 1) : 0

    fillRRect(ctx, pad, y, barW, cardH, 14, '#141414')

    ctx.fillStyle = m.color
    ctx.font = '700 28px system-ui, -apple-system, sans-serif'
    ctx.fillText(`${m.val}${m.unit}`, pad + 20, y + 36)

    ctx.fillStyle = '#737373'
    ctx.font = '400 13px system-ui, -apple-system, sans-serif'
    const goalStr = m.goal ? ` / ${m.goal}${m.unit}` : ''
    ctx.fillText(`${m.label}${goalStr}`, pad + 20, y + 56)

    const pbX = pad + 20
    const pbY = y + 66
    const pbW = barW - 40
    fillRRect(ctx, pbX, pbY, pbW, 4, 2, '#1f1f1f')
    if (pct > 0) {
      fillRRect(ctx, pbX, pbY, pbW * pct, 4, 2, m.color)
    }
  })

  // Water card
  const waterY = cardStartY + macros.length * (cardH + cardGap)
  const waterPct = waterGoal > 0 ? Math.min(waterMl / waterGoal, 1) : 0
  fillRRect(ctx, pad, waterY, barW, cardH, 14, '#141414')

  ctx.fillStyle = BLUE
  ctx.font = '700 28px system-ui, -apple-system, sans-serif'
  ctx.fillText(`${waterMl}ml`, pad + 20, waterY + 36)

  ctx.fillStyle = '#737373'
  ctx.font = '400 13px system-ui, -apple-system, sans-serif'
  ctx.fillText(`${t('nutrition.summary.water')} / ${waterGoal}ml`, pad + 20, waterY + 56)

  const wpbX = pad + 20
  const wpbY = waterY + 66
  const wpbW = barW - 40
  fillRRect(ctx, wpbX, wpbY, wpbW, 4, 2, '#1f1f1f')
  if (waterPct > 0) {
    fillRRect(ctx, wpbX, wpbY, wpbW * waterPct, 4, 2, BLUE)
  }

  // Footer
  const footerY = h - 60
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(pad, footerY, barW, 1)

  const footerLogoSize = 22
  if (logo) {
    ctx.drawImage(logo, pad, footerY + 12, footerLogoSize, footerLogoSize)
  }
  ctx.fillStyle = '#404040'
  ctx.font = '400 12px system-ui, -apple-system, sans-serif'
  ctx.fillText('calistenia-app.com', pad + (logo ? footerLogoSize + 8 : 0), footerY + 28)
}

// ── Draw: RICH variant ────────────────────────────────────────────────────────

interface ShareMealWithImg {
  mealType: string
  photoUrl?: string
  title: string
  protein: number
  carbs: number
  fat: number
  calories: number
  qualityScore?: QualityScore
  img?: HTMLImageElement | null
}

interface DrawRichOpts {
  date: string
  totals: DailyTotals
  goals: NutritionGoal | null
  logo: HTMLImageElement | null
  mealsWithImages: ShareMealWithImg[]
  overflow: number
  dailyQualityScore?: QualityScore
  t: (key: string, opts?: Record<string, unknown>) => string
}

function drawRichCard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: DrawRichOpts,
) {
  const { date, totals, goals, logo, mealsWithImages, overflow, dailyQualityScore, t } = opts
  const pad = 28

  // ── Background ──
  ctx.fillStyle = CARD_BG
  ctx.fillRect(0, 0, w, h)

  // ── Top lime hairline ──
  const hairlineInset = 40
  ctx.fillStyle = LIME
  ctx.fillRect(hairlineInset, 0, w - hairlineInset * 2, 2)

  // ── HEADER ──
  let y = 32

  // Kicker row: lime dot + "NUTRICION"
  const dotR = 4
  ctx.fillStyle = LIME
  ctx.beginPath()
  ctx.arc(pad + dotR, y + dotR, dotR, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = LIME
  ctx.font = '700 10px "JetBrains Mono", monospace'
  ctx.letterSpacing = '3px'
  ctx.fillText('NUTRICIÓN', pad + dotR * 2 + 7, y + dotR + 4)
  ctx.letterSpacing = '0px'

  // Date on the right
  const dateStr = formatDate(date)
  ctx.fillStyle = INK_DIM
  ctx.font = '500 11px "DM Sans", system-ui, sans-serif'
  ctx.textAlign = 'right'
  const dateX = dailyQualityScore ? w - pad - 54 : w - pad
  ctx.fillText(dateStr, dateX, y + dotR + 4)
  ctx.textAlign = 'left'

  // Daily grade badge (top-right)
  if (dailyQualityScore) {
    const qColor = QUALITY_COLOR[dailyQualityScore] ?? INK_FAINT
    const badgeW = 44
    const badgeH = 44
    const bx = w - pad - badgeW
    const by = y - 4
    localFillRRect(ctx, bx, by, badgeW, badgeH, 8, qColor + '18')
    // border
    rrect(ctx, bx, by, badgeW, badgeH, 8)
    ctx.strokeStyle = qColor + '55'
    ctx.lineWidth = 1
    ctx.stroke()
    // letter
    ctx.fillStyle = qColor
    ctx.font = '400 26px "Bebas Neue", system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(dailyQualityScore, bx + badgeW / 2, by + badgeH / 2 + 10)
    // label
    ctx.font = '400 7px "JetBrains Mono", monospace'
    ctx.letterSpacing = '1px'
    ctx.fillText('CALIDAD', bx + badgeW / 2, by + badgeH - 5)
    ctx.letterSpacing = '0px'
    ctx.textAlign = 'left'
  }

  y += 36

  // ── HERO (compact) ──
  const calVal   = Math.round(totals.calories)
  const calGoal  = goals?.dailyCalories ?? 0
  const calPct   = calGoal > 0 ? Math.min(calVal / calGoal, 1) : 0
  const overGoal = calGoal > 0 && calVal > calGoal

  // Calorie number (Bebas)
  ctx.fillStyle = INK
  ctx.font = '400 64px "Bebas Neue", system-ui, sans-serif'
  ctx.fillText(`${calVal}`, pad, y + 56)
  const calNumW = ctx.measureText(`${calVal}`).width

  // "/ GOAL KCAL" stacked to the right of the number
  const rightX = pad + calNumW + 10
  ctx.fillStyle = INK_FAINT
  ctx.font = '400 14px "JetBrains Mono", monospace'
  if (calGoal > 0) {
    ctx.fillText(`/ ${calGoal}`, rightX, y + 38)
  }
  ctx.fillStyle = LIME
  ctx.font = '400 18px "Bebas Neue", system-ui, sans-serif'
  ctx.fillText('KCAL', rightX, y + 56)

  y += 68

  // Calorie progress bar
  const barW = w - pad * 2
  localFillRRect(ctx, pad, y, barW, 4, 2, SURFACE)
  if (calPct > 0) {
    localFillRRect(ctx, pad, y, barW * calPct, 4, 2, overGoal ? RED : LIME)
  }
  y += 14

  // ── MACRO LINE (compact, single row) ──
  const macroGroups = [
    { label: 'P', val: Math.round(totals.protein), color: BLUE },
    { label: 'C', val: Math.round(totals.carbs),   color: AMBER },
    { label: 'G', val: Math.round(totals.fat),     color: PINK },
  ]
  const macroW = (barW - 16) / 3
  macroGroups.forEach((mg, i) => {
    const mx = pad + i * (macroW + 8)

    ctx.fillStyle = INK_DIM
    ctx.font = '400 9px "JetBrains Mono", monospace'
    ctx.letterSpacing = '1px'
    ctx.fillText(mg.label, mx, y + 10)
    ctx.letterSpacing = '0px'

    const labelW = ctx.measureText(mg.label).width + 4
    ctx.fillStyle = INK
    ctx.font = '400 16px "Bebas Neue", system-ui, sans-serif'
    ctx.fillText(`${mg.val}g`, mx + labelW, y + 10)

    // Thin 3px bar
    localFillRRect(ctx, mx, y + 14, macroW, 3, 1, SURFACE)
    const goalVal = i === 0 ? goals?.dailyProtein : i === 1 ? goals?.dailyCarbs : goals?.dailyFat
    const mpct = goalVal && goalVal > 0 ? Math.min(mg.val / goalVal, 1) : 0
    if (mpct > 0) {
      localFillRRect(ctx, mx, y + 14, macroW * mpct, 3, 1, mg.color)
    }
  })
  y += 28

  // ── Hairline divider ──
  ctx.fillStyle = HAIRLINE
  ctx.fillRect(pad, y, barW, 1)
  y += 12

  // ── COMIDAS section label ──
  ctx.fillStyle = INK_FAINT
  ctx.font = '400 8px "JetBrains Mono", monospace'
  ctx.letterSpacing = '2.5px'
  ctx.fillText(t('nutrition.summary.mealsLabel'), pad, y + 8)
  ctx.letterSpacing = '0px'
  y += 18

  // ── MEAL ROWS ──
  const thumbSize = 44
  const thumbRadius = 6
  const rowH = 54
  const rowGap = 6

  for (const meal of mealsWithImages) {
    const mColor = MEAL_TYPE_HEX[meal.mealType] ?? INK_DIM
    const mx = pad
    const my = y

    // Thumbnail
    if (meal.img) {
      // 2px left accent ring color (subtle border)
      localFillRRect(ctx, mx - 2, my + (rowH - thumbSize) / 2 - 2, thumbSize + 4, thumbSize + 4, thumbRadius + 2, mColor + '33')
      drawRoundedImage(ctx, meal.img, mx, my + (rowH - thumbSize) / 2, thumbSize, thumbRadius)
    } else {
      // Letter tile fallback
      localFillRRect(ctx, mx, my + (rowH - thumbSize) / 2, thumbSize, thumbSize, thumbRadius, mColor + '24')
      ctx.fillStyle = mColor
      ctx.font = '400 20px "DM Sans", system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText((meal.title[0] ?? '?').toUpperCase(), mx + thumbSize / 2, my + (rowH - thumbSize) / 2 + thumbSize / 2 + 8)
      ctx.textAlign = 'left'
    }

    // Title + macro subtitle
    const textX = mx + thumbSize + 10
    const availW = barW - thumbSize - 10 - 60 // leave room for kcal chip

    ctx.fillStyle = INK
    ctx.font = '500 13px "DM Sans", system-ui, sans-serif'
    ctx.fillText(ellipsis(ctx, meal.title, availW), textX, my + (rowH - thumbSize) / 2 + 14)

    ctx.fillStyle = INK_DIM
    ctx.font = '400 10px "JetBrains Mono", monospace'
    ctx.fillText(`${meal.protein}P  ${meal.carbs}C  ${meal.fat}G`, textX, my + (rowH - thumbSize) / 2 + 30)

    // Kcal (Bebas, right-aligned)
    const kcalStr = `${meal.calories}`
    ctx.fillStyle = INK
    ctx.font = '400 16px "Bebas Neue", system-ui, sans-serif'
    ctx.textAlign = 'right'

    // Per-meal quality chip
    let kcalRightX = pad + barW
    if (meal.qualityScore) {
      const qColor = QUALITY_COLOR[meal.qualityScore] ?? INK_FAINT
      const chipW = 20
      const chipH = 20
      const chipX = pad + barW - chipW
      const chipY = my + (rowH - chipH) / 2 + 2
      localFillRRect(ctx, chipX, chipY, chipW, chipH, 4, qColor + '18')
      rrect(ctx, chipX, chipY, chipW, chipH, 4)
      ctx.strokeStyle = qColor + '55'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = qColor
      ctx.font = '400 12px "Bebas Neue", system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(meal.qualityScore, chipX + chipW / 2, chipY + chipH / 2 + 5)
      kcalRightX = chipX - 4
    }

    ctx.fillStyle = INK
    ctx.font = '400 16px "Bebas Neue", system-ui, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(kcalStr, kcalRightX, my + (rowH - thumbSize) / 2 + 14)
    ctx.textAlign = 'left'

    y += rowH + rowGap
  }

  // Overflow line
  if (overflow > 0) {
    ctx.fillStyle = INK_FAINT
    ctx.font = '400 10px "JetBrains Mono", monospace'
    ctx.fillText(t('nutrition.summary.moreMeals', { count: overflow }), pad, y + 10)
    y += 20
  }

  // ── Brand footer ──
  const footerY = h - 40
  ctx.fillStyle = HAIRLINE
  ctx.fillRect(pad, footerY - 12, barW, 1)

  const footerLogoSize = 20
  if (logo) {
    ctx.drawImage(logo, pad, footerY, footerLogoSize, footerLogoSize)
  }
  const footerTextX = logo ? pad + footerLogoSize + 8 : pad

  ctx.fillStyle = INK_DIM
  ctx.font = '700 11px "DM Sans", system-ui, sans-serif'
  ctx.letterSpacing = '1.5px'
  ctx.fillText('CALISTENIA', footerTextX, footerY + 14)
  ctx.letterSpacing = '0px'

  ctx.fillStyle = INK_FAINT
  ctx.font = '400 10px "DM Sans", system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText('calistenia-app.com', pad + barW, footerY + 14)
  ctx.textAlign = 'left'
}

// ── Canvas setup helper ───────────────────────────────────────────────────────

function makeCanvas(w: number, h: number, scale: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width  = w * scale
  canvas.height = h * scale
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)
  return { canvas, ctx }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DailySummaryCard({
  date,
  totals,
  goals,
  waterMl,
  waterGoal,
  entries = [],
  dailyQualityScore,
}: DailySummaryCardProps) {
  const { t } = useTranslation()
  const [variant, setVariant] = useState<'summary' | 'rich'>('summary')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // Memoize the share-meals result so we don't recompute on every render
  const { meals, overflow } = useMemo(() => buildShareMeals(entries, 4), [entries])

  // ── Live preview: redraw whenever variant or data changes ──
  useEffect(() => {
    let cancelled = false

    const draw = async () => {
      const scale = 2

      // Load logo and fonts in parallel
      const [logo] = await Promise.all([loadLogo(), ensureFontsLoaded()])
      if (cancelled) return

      if (variant === 'summary') {
        const W = 540, H = 960
        const { canvas, ctx } = makeCanvas(W, H, scale)
        drawSummaryCard(ctx, W, H, { date, totals, goals, waterMl, waterGoal, logo, t })
        if (!cancelled) setPreviewUrl(canvas.toDataURL('image/png'))
      } else {
        // Preload meal thumbnails (catch failures → null)
        const mealsWithImages: ShareMealWithImg[] = await Promise.all(
          meals.map(async (m) => {
            if (!m.photoUrl) return { ...m, img: null }
            try {
              const img = await loadImage(m.photoUrl)
              return { ...m, img }
            } catch {
              return { ...m, img: null }
            }
          })
        )
        if (cancelled) return

        // Dynamic height: base + per-row
        const BASE_H = 380
        const PER_ROW = 60
        const OVERFLOW_H = overflow > 0 ? 28 : 0
        const W = 540
        const H = BASE_H + mealsWithImages.length * PER_ROW + OVERFLOW_H
        const { canvas, ctx } = makeCanvas(W, H, scale)
        drawRichCard(ctx, W, H, { date, totals, goals, logo, mealsWithImages, overflow, dailyQualityScore, t })
        if (!cancelled) setPreviewUrl(canvas.toDataURL('image/png'))
      }
    }

    draw().catch(console.warn)
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, date, totals, goals, waterMl, waterGoal, meals, overflow, dailyQualityScore])

  // ── Share handler ──────────────────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    try {
      const scale = 2
      const [logo] = await Promise.all([loadLogo(), ensureFontsLoaded()])

      let canvas: HTMLCanvasElement
      let ctx: CanvasRenderingContext2D

      if (variant === 'summary') {
        const W = 540, H = 960
        ;({ canvas, ctx } = makeCanvas(W, H, scale))
        drawSummaryCard(ctx, W, H, { date, totals, goals, waterMl, waterGoal, logo, t })
      } else {
        const mealsWithImages: ShareMealWithImg[] = await Promise.all(
          meals.map(async (m) => {
            if (!m.photoUrl) return { ...m, img: null }
            try {
              const img = await loadImage(m.photoUrl)
              return { ...m, img }
            } catch {
              return { ...m, img: null }
            }
          })
        )
        const BASE_H = 380
        const PER_ROW = 60
        const OVERFLOW_H = overflow > 0 ? 28 : 0
        const W = 540
        const H = BASE_H + mealsWithImages.length * PER_ROW + OVERFLOW_H
        ;({ canvas, ctx } = makeCanvas(W, H, scale))
        drawRichCard(ctx, W, H, { date, totals, goals, logo, mealsWithImages, overflow, dailyQualityScore, t })
      }

      const blob = await canvasToBlob(canvas)
      if (!blob) return
      await shareImage(blob, `nutricion_${date}.png`, `Mi nutricion ${formatDate(date)}`)
      op.track('share_card_shared', { card_type: variant === 'rich' ? 'nutrition_rich' : 'nutrition' })
    } catch (e) {
      console.warn('Share error:', e)
    }
  }, [date, totals, goals, waterMl, waterGoal, meals, overflow, dailyQualityScore, variant, t])

  const calPct  = goals ? Math.round((totals.calories / goals.dailyCalories) * 100) : 0
  const waterPct = Math.round((waterMl / waterGoal) * 100)

  return (
    <div>
      {/* Summary mini-widget (unchanged DOM widget) */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <div className="text-[9px] text-muted-foreground tracking-widest uppercase">{t('nutrition.summary.title')}</div>
            <div className="text-[11px] text-muted-foreground font-mono">{date}</div>
          </div>
          <div className="text-right">
            <div className={cn('font-bebas text-2xl leading-none', calPct >= 90 ? 'text-emerald-500' : 'text-foreground')}>
              {Math.round(totals.calories)}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {goals ? `/ ${goals.dailyCalories} kcal` : 'kcal'}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3 text-center">
          <div>
            <div className="text-[13px] font-mono text-sky-400">{Math.round(totals.protein)}g</div>
            <div className="text-[9px] text-muted-foreground">{t('nutrition.protein')}</div>
          </div>
          <div>
            <div className="text-[13px] font-mono text-amber-400">{Math.round(totals.carbs)}g</div>
            <div className="text-[9px] text-muted-foreground">{t('nutrition.carbs')}</div>
          </div>
          <div>
            <div className="text-[13px] font-mono text-pink-400">{Math.round(totals.fat)}g</div>
            <div className="text-[9px] text-muted-foreground">{t('nutrition.fat')}</div>
          </div>
          <div>
            <div className={cn('text-[13px] font-mono', waterPct >= 100 ? 'text-sky-400' : 'text-sky-600')}>{waterMl}ml</div>
            <div className="text-[9px] text-muted-foreground">{t('nutrition.summary.water')}</div>
          </div>
        </div>
      </div>

      {/* Variant toggle */}
      <div className="flex gap-1 mt-3 bg-card border border-border rounded-lg p-1">
        <button
          onClick={() => setVariant('summary')}
          className={cn(
            'flex-1 py-1.5 rounded-md text-[10px] font-mono tracking-widest transition-colors uppercase',
            variant === 'summary'
              ? 'bg-lime-400/15 text-lime-400 border border-lime-400/30'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t('nutrition.summary.variantSummary')}
        </button>
        <button
          onClick={() => setVariant('rich')}
          className={cn(
            'flex-1 py-1.5 rounded-md text-[10px] font-mono tracking-widest transition-colors uppercase',
            variant === 'rich'
              ? 'bg-lime-400/15 text-lime-400 border border-lime-400/30'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t('nutrition.summary.variantMeals')}
        </button>
      </div>

      {/* Live canvas preview */}
      {previewUrl && (
        <div className="mt-3 rounded-xl overflow-hidden border border-border">
          <img
            src={previewUrl}
            alt="Share card preview"
            className="w-full h-auto block"
          />
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={handleShare}
        className="mt-2 text-[10px] tracking-widest hover:border-lime hover:text-lime w-full"
      >
        {t('nutrition.summary.share')}
      </Button>
    </div>
  )
}
