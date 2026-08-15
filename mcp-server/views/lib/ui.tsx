/**
 * Shared widget UI primitives — keeps loading states, action buttons and
 * inline feedback banners consistent across every widget so the set reads as
 * one designed system. See [[lib/theme]] for the palette.
 *
 * Lives in views/lib/ (no `view.tsx`) so the mcp-use v2 CLI ignores it as a
 * View entry. In v2 there is no provider wrapper: the runtime bootstraps the
 * host bridge and auto-resizes the iframe, so these components render bare.
 */
import type { CSSProperties } from "react";
import { useAppColors, FONT, FONT_DISPLAY, FONT_MONO, type AppColors } from "./theme";
import { WidgetFonts } from "./fonts";

/** Standard loading state — matches the host surface (bg + muted text + font). */
export function WidgetLoading({ text }: { text: string }) {
  const c = useAppColors();
  return (
    <>
      <WidgetFonts />
      <div style={{ padding: 16, backgroundColor: c.bg, color: c.sub, fontFamily: FONT, fontSize: 13 }}>
        {text}
      </div>
    </>
  );
}

/**
 * Standard error state — rendered when the tool that owns the View answered
 * with `isError: true` (`useToolContext().status === "error"`).
 */
export function WidgetError({ message }: { message: string }) {
  const c = useAppColors();
  return (
    <>
      <WidgetFonts />
      <div style={{ padding: 16, backgroundColor: c.bg, color: c.danger, fontFamily: FONT, fontSize: 13 }}>
        {message}
      </div>
    </>
  );
}

/**
 * Small uppercase mono label that sits above a `DisplayTitle` — the app's
 * header idiom (e.g. "HOY" above a Bebas title). Never bold: JetBrains Mono
 * is a single loaded weight per case, and the wide tracking already reads as
 * emphasis.
 */
export function Kicker({ children, color, style }: { children: React.ReactNode; color?: string; style?: CSSProperties }) {
  const c = useAppColors();
  return (
    <div
      style={{
        fontFamily: FONT_MONO,
        fontSize: 10,
        fontWeight: 400,
        textTransform: "uppercase",
        letterSpacing: 2.5,
        color: color ?? c.sub,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Big condensed Bebas title/number — the app's display idiom. Always normal weight: Bebas is a single loaded face, and faux-bold on a condensed display font looks broken. */
export function DisplayTitle({ children, size = 28, color, style }: { children: React.ReactNode; size?: number; color?: string; style?: CSSProperties }) {
  const c = useAppColors();
  return (
    <div
      style={{
        fontFamily: FONT_DISPLAY,
        fontWeight: 400,
        fontSize: size,
        lineHeight: 1,
        color: color ?? c.text,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Inline Bebas stat number (kcal, %, counts) — same rules as `DisplayTitle` but for use inline/in SVG-adjacent stat tiles. */
export function StatNumber({ children, size = 20, color, style }: { children: React.ReactNode; size?: number; color?: string; style?: CSSProperties }) {
  const c = useAppColors();
  return (
    <span
      style={{
        fontFamily: FONT_DISPLAY,
        fontWeight: 400,
        fontSize: size,
        lineHeight: 1,
        color: color ?? c.text,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** Solid lime CTA — the single primary action in a widget. */
export function primaryButtonStyle(c: AppColors, opts?: { disabled?: boolean; flex?: boolean }): CSSProperties {
  return {
    flex: opts?.flex ? 1 : undefined,
    padding: "9px 16px",
    borderRadius: 8,
    backgroundColor: c.lime,
    color: c.limeText,
    fontWeight: 700,
    fontSize: 13,
    border: "none",
    cursor: opts?.disabled ? "not-allowed" : "pointer",
    opacity: opts?.disabled ? 0.6 : 1,
    fontFamily: FONT,
  };
}

/** Transparent bordered button — secondary actions. */
export function ghostButtonStyle(c: AppColors, opts?: { flex?: boolean }): CSSProperties {
  return {
    flex: opts?.flex ? 1 : undefined,
    padding: "9px 14px",
    borderRadius: 8,
    border: `1px solid ${c.border}`,
    backgroundColor: "transparent",
    color: c.text,
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: FONT,
  };
}

/** Inline feedback banner — replaces blocking alert() dialogs. */
export function Banner({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) {
  const c = useAppColors();
  const isError = kind === "error";
  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: 8,
        marginBottom: 10,
        fontSize: 12,
        fontWeight: 600,
        backgroundColor: isError ? c.dangerSoft : c.limeSoft,
        color: isError ? c.danger : c.lime,
        border: `1px solid ${isError ? c.danger + "55" : c.lime + "55"}`,
      }}
    >
      <span>{isError ? "⚠" : "✓"}</span>
      <span>{children}</span>
    </div>
  );
}
