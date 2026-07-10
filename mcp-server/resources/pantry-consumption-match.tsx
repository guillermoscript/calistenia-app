import { McpUseProvider, useWidget, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";
import { useAppColors, FONT } from "./lib/theme";
import { WidgetLoading, Kicker, primaryButtonStyle, ghostButtonStyle } from "./lib/ui";
import { WidgetFonts } from "./lib/fonts";
import { ConfidenceDot, fmtQty } from "./lib/pantry-ui";

const propsSchema = z.object({
  matches: z.array(
    z.object({
      pantry_item_id: z.string(),
      pantry_item_name: z.string(),
      pantry_item_unit: z.string().nullable(),
      matched_food: z.string(),
      qty_consumed: z.number().nullable(),
      confidence: z.enum(["high", "med", "low"]),
    })
  ),
  unmatched_foods: z.array(z.string()),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Proposed pantry deductions for a logged meal, awaiting explicit user confirmation before consuming",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;

export default function PantryConsumptionMatch() {
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
  const c = useAppColors();

  if (isPending) {
    return <WidgetLoading text="Cruzando tu comida con la despensa…" />;
  }

  const { matches, unmatched_foods } = props;

  return (
    <McpUseProvider autoSize>
      <WidgetFonts />
      <div style={{ padding: 16, backgroundColor: c.bg, color: c.text, fontFamily: FONT, maxWidth: 480 }}>
        <Kicker>Descontar de despensa</Kicker>
        <div style={{ fontWeight: 700, fontSize: 15, margin: "2px 0 12px" }}>
          {matches.length > 0
            ? `${matches.length} match${matches.length !== 1 ? "es" : ""} propuesto${matches.length !== 1 ? "s" : ""}`
            : "Sin matches con tu despensa"}
        </div>

        {matches.length > 0 && (
          <div style={{ backgroundColor: c.card, borderRadius: 8, padding: 10, marginBottom: 10, border: `1px solid ${c.border}` }}>
            {matches.map((m, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 0",
                  borderBottom: i < matches.length - 1 ? `1px solid ${c.border}` : "none",
                }}
              >
                <ConfidenceDot confidence={m.confidence} c={c} />
                <span style={{ fontSize: 13, flex: 1, minWidth: 0 }}>
                  {m.matched_food} <span style={{ color: c.sub }}>→</span>{" "}
                  <span style={{ fontWeight: 600 }}>{m.pantry_item_name}</span>
                </span>
                <span style={{ fontSize: 12, color: c.danger, whiteSpace: "nowrap" }}>
                  {m.qty_consumed != null ? `−${fmtQty(m.qty_consumed, m.pantry_item_unit)}` : "¿cantidad?"}
                </span>
              </div>
            ))}
          </div>
        )}

        {unmatched_foods.length > 0 && (
          <div style={{ fontSize: 12, color: c.sub, marginBottom: 12 }}>
            Sin match en despensa: {unmatched_foods.join(", ")}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {matches.length > 0 && (
            <>
              <button
                onClick={() => sendFollowUpMessage("Sí, confirma y descuenta estos matches de mi despensa.")}
                style={primaryButtonStyle(c)}
              >
                Confirmar y descontar
              </button>
              <button
                onClick={() => sendFollowUpMessage("No descuentes nada de la despensa esta vez.")}
                style={ghostButtonStyle(c)}
              >
                No descontar
              </button>
              <button
                onClick={() => sendFollowUpMessage("Algunas cantidades del descuento están mal, te digo cuáles corregir.")}
                style={ghostButtonStyle(c)}
              >
                Ajustar cantidades
              </button>
            </>
          )}
        </div>
      </div>
    </McpUseProvider>
  );
}
