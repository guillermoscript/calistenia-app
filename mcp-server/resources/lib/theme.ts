/**
 * Shared widget palette — mirrors the Calistenia app design system so MCP
 * widgets match the web/mobile look & feel.
 *
 * Source of truth: apps/web/src/index.css (CSS custom properties) and
 * apps/mobile/src/lib/theme.ts. The HSL tokens there are converted to hex
 * below since widgets style with inline `style={{}}` (no Tailwind/CSS vars).
 *
 * NOTE: lives in resources/lib/ (a subdirectory without a `widget.tsx`) so the
 * mcp-use widget bundler does NOT treat it as a widget entry — it only globs
 * files directly under resources/ and directories containing widget.tsx.
 */
import { useWidgetTheme } from "mcp-use/react";

export interface AppColors {
  /* chrome */
  bg: string;        // --background
  card: string;      // --card
  raised: string;    // slightly elevated surface (hover / nested)
  border: string;    // --border
  text: string;      // --foreground
  sub: string;       // --muted-foreground
  chip: string;      // --secondary / --muted background
  grid: string;      // chart gridlines / faint dividers
  axis: string;      // --chart-axis

  /* brand — lime is the app's only accent (active / completed / primary CTA) */
  lime: string;      // --lime
  limeText: string;  // --lime-foreground (text on a lime fill)
  limeSoft: string;  // translucent lime for soft fills / tracks

  /* neutral solid button (shadcn `primary`) */
  primary: string;
  primaryText: string;

  /* semantic */
  success: string;
  warn: string;
  danger: string;
  dangerSoft: string;

  /* data-viz (nutrition macros / chart series) */
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;

  /* medals */
  gold: string;
  silver: string;
  bronze: string;
  diamond: string;
}

export function getAppColors(dark: boolean): AppColors {
  return {
    bg: dark ? "#0a0a0a" : "#f7f7f5",
    card: dark ? "#121212" : "#ffffff",
    raised: dark ? "#1e1e1e" : "#f1f1ef",
    border: dark ? "#262626" : "#e4e4e1",
    text: dark ? "#fafafa" : "#141414",
    sub: dark ? "#a3a3a3" : "#666666",
    chip: dark ? "#262626" : "#ededeb",
    grid: dark ? "#ffffff14" : "#00000010",
    axis: dark ? "#a1a1aa" : "#71717a",

    lime: dark ? "#c6f42f" : "#8fb80a",
    limeText: dark ? "#0a0a0a" : "#ffffff",
    limeSoft: dark ? "#c6f42f24" : "#8fb80a1f",

    primary: dark ? "#fafafa" : "#141414",
    primaryText: dark ? "#0a0a0a" : "#fafafa",

    success: dark ? "#22c55e" : "#16a34a",
    warn: "#f59e0b",
    danger: dark ? "#ef4444" : "#dc2626",
    dangerSoft: dark ? "#ef444422" : "#ef44441a",

    kcal: "#f97316",
    protein: "#3b82f6",
    carbs: "#eab308",
    fat: "#a855f7",

    gold: "#ffd700",
    silver: "#a8a9ad",
    bronze: "#cd7f32",
    diamond: "#b9f2ff",
  };
}

export function useAppColors(): AppColors {
  return getAppColors(useWidgetTheme() === "dark");
}

/**
 * Traffic-light color for a quality metric on a bad→good gradient (readiness,
 * completion %, adherence). This is the ONLY place green/amber/red are used —
 * a spectrum needs three hues. Binary "done / active / primary" states use
 * `c.lime` instead, so lime stays the single brand signal. See [[lib/ui]].
 *
 * @param value  the metric
 * @param ok     at/above this → amber (caution)
 * @param good   at/above this → success (green)
 */
export function trafficColor(value: number, ok: number, good: number, c: AppColors): string {
  return value >= good ? c.success : value >= ok ? c.warn : c.danger;
}

/**
 * Font stacks. The app uses DM Sans (body) + Bebas Neue (display headings).
 * Those webfonts aren't guaranteed inside the host iframe, so we lead with them
 * and fall back to the system stack. Use FONT_DISPLAY + uppercase/letterSpacing
 * for titles to evoke the condensed Bebas look even on the fallback.
 */
export const FONT = "'DM Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
export const FONT_DISPLAY = "'Bebas Neue', 'DM Sans', ui-sans-serif, system-ui, sans-serif";
