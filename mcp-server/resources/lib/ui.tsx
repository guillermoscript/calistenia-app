/**
 * Shared widget UI primitives — keeps loading states, action buttons and
 * inline feedback banners consistent across every widget so the set reads as
 * one designed system. See [[lib/theme]] for the palette.
 *
 * Lives in resources/lib/ (no `widget.tsx`) so the mcp-use bundler ignores it
 * as a widget entry.
 */
import type { CSSProperties } from "react";
import { McpUseProvider } from "mcp-use/react";
import { useAppColors, FONT, type AppColors } from "./theme";

/** Standard loading state — matches the host surface (bg + muted text + font). */
export function WidgetLoading({ text }: { text: string }) {
  const c = useAppColors();
  return (
    <McpUseProvider autoSize>
      <div style={{ padding: 16, backgroundColor: c.bg, color: c.sub, fontFamily: FONT, fontSize: 13 }}>
        {text}
      </div>
    </McpUseProvider>
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
