import { McpUseProvider, useWidget, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";
import { useAppColors, FONT, FONT_MONO } from "./lib/theme";
import { WidgetLoading, Kicker, primaryButtonStyle, ghostButtonStyle } from "./lib/ui";
import { WidgetFonts } from "./lib/fonts";
import { CategoryChip, ConfidenceDot, fmtPrice, fmtQty } from "./lib/pantry-ui";

const itemSchema = z.object({
  name: z.string(),
  name_normalized: z.string(),
  category: z.string(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  price_total: z.number().nullable(),
  expiry_days: z.number().nullable(),
  confidence: z.enum(["high", "med", "low"]),
});

const propsSchema = z.object({
  intent: z.enum(["add", "consume", "discard", "query", "unknown"]),
  items: z.array(itemSchema),
  reply: z.string(),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Preview of pantry items parsed from a chat message, pending user confirmation before saving",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;

const INTENT_LABELS: Record<string, string> = {
  add: "Agregar",
  consume: "Consumir",
  discard: "Descartar",
  query: "Consulta",
  unknown: "Sin intención clara",
};

export default function PantryParsePreview() {
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
  const c = useAppColors();

  if (isPending) {
    return <WidgetLoading text="Leyendo tu mensaje de despensa…" />;
  }

  const { intent, items, reply } = props;

  return (
    <McpUseProvider autoSize>
      <WidgetFonts />
      <div style={{ padding: 16, backgroundColor: c.bg, color: c.text, fontFamily: FONT, maxWidth: 480 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Kicker>Despensa</Kicker>
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 9,
              letterSpacing: 1,
              textTransform: "uppercase",
              padding: "2px 6px",
              borderRadius: 4,
              backgroundColor: c.limeSoft,
              color: c.lime,
            }}
          >
            {INTENT_LABELS[intent] ?? intent}
          </span>
        </div>

        <div style={{ fontSize: 13, color: c.text, marginBottom: 12 }}>{reply}</div>

        {items.length > 0 && (
          <div style={{ backgroundColor: c.card, borderRadius: 8, padding: 10, marginBottom: 12, border: `1px solid ${c.border}` }}>
            {items.map((it, i) => {
              const qty = fmtQty(it.quantity, it.unit);
              const price = fmtPrice(it.price_total);
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 0",
                    borderBottom: i < items.length - 1 ? `1px solid ${c.border}` : "none",
                  }}
                >
                  <ConfidenceDot confidence={it.confidence} c={c} />
                  <span style={{ fontSize: 13, fontWeight: 500, flex: 1, minWidth: 0 }}>{it.name}</span>
                  <CategoryChip category={it.category} c={c} />
                  <span style={{ fontSize: 12, color: c.sub, whiteSpace: "nowrap" }}>
                    {qty ?? "¿cantidad?"}
                    {price ? ` · ${price}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {intent === "add" && items.length > 0 && (
            <button
              onClick={() => sendFollowUpMessage("Sí, guarda estos items en mi despensa tal como están.")}
              style={primaryButtonStyle(c)}
            >
              Guardar en despensa
            </button>
          )}
          {items.length > 0 && (
            <button
              onClick={() => sendFollowUpMessage("Espera, hay items mal detectados. Te digo qué corregir antes de guardar.")}
              style={ghostButtonStyle(c)}
            >
              Corregir items
            </button>
          )}
          <button
            onClick={() => sendFollowUpMessage("¿Qué tengo ahora mismo en la despensa?")}
            style={ghostButtonStyle(c)}
          >
            Ver mi despensa
          </button>
        </div>
      </div>
    </McpUseProvider>
  );
}
