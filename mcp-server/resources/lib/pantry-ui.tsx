/**
 * Shared primitives for the pantry/recipe widget family — quantity/price
 * formatting, confidence dots and category chips, so the whole despensa set
 * reads consistent with [[lib/ui]] and [[lib/theme]].
 *
 * Lives in resources/lib/ (no `widget.tsx`) so the mcp-use bundler ignores it
 * as a widget entry.
 */
import { FONT_MONO, type AppColors } from "./theme";

export const CATEGORY_LABELS: Record<string, string> = {
  proteina: "Proteína",
  vegetal: "Vegetal",
  fruta: "Fruta",
  carbohidrato: "Carbohidrato",
  lacteo: "Lácteo",
  grasa: "Grasa",
  condimento: "Condimento",
  bebida: "Bebida",
  otro: "Otro",
};

export const CONFIDENCE_LABELS: Record<string, string> = {
  high: "confianza alta",
  med: "confianza media",
  low: "confianza baja",
};

/** "2 kg" | "3 unidad" | null when quantity is unknown. */
export function fmtQty(quantity: number | null | undefined, unit: string | null | undefined): string | null {
  if (quantity == null) return null;
  return `${quantity}${unit ? ` ${unit}` : ""}`;
}

/** Price in whatever currency the source used; symbol only for USD. */
export function fmtPrice(amount: number | null | undefined, currency?: string | null): string | null {
  if (amount == null) return null;
  const n = Math.round(amount * 100) / 100;
  const cur = currency ?? "USD";
  return cur === "USD" || cur === "$" ? `$${n}` : `${n} ${cur}`;
}

export function confidenceColor(confidence: string | null | undefined, c: AppColors): string {
  if (confidence === "high") return c.lime;
  if (confidence === "med") return c.warn;
  if (confidence === "low") return c.danger;
  return c.sub;
}

/** Small colored dot encoding extraction/match confidence (lime/amber/red). */
export function ConfidenceDot({ confidence, c }: { confidence: string | null | undefined; c: AppColors }) {
  if (!confidence) return null;
  return (
    <span
      title={CONFIDENCE_LABELS[confidence] ?? confidence}
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        backgroundColor: confidenceColor(confidence, c),
        flexShrink: 0,
      }}
    />
  );
}

/** Uppercase mono category tag, the app's chip idiom. */
export function CategoryChip({ category, c }: { category: string | null | undefined; c: AppColors }) {
  if (!category) return null;
  return (
    <span
      style={{
        fontFamily: FONT_MONO,
        fontSize: 9,
        letterSpacing: 1,
        textTransform: "uppercase",
        padding: "2px 6px",
        borderRadius: 4,
        backgroundColor: c.chip,
        color: c.sub,
        whiteSpace: "nowrap",
      }}
    >
      {CATEGORY_LABELS[category] ?? category}
    </span>
  );
}
