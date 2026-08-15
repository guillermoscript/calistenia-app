import { useToolContext, useSendFollowUp } from "mcp-use/react";
import { useAppColors, FONT, FONT_MONO } from "../lib/theme";
import { WidgetLoading, WidgetError, Kicker, primaryButtonStyle, ghostButtonStyle } from "../lib/ui";
import { WidgetFonts } from "../lib/fonts";
import { CategoryChip, ConfidenceDot, fmtPrice, fmtQty } from "../lib/pantry-ui";
import type { PantryParsePreviewProps as Props } from "../../src/views/pantry-parse-preview.schema";

const INTENT_LABELS: Record<string, string> = {
  add: "Agregar",
  consume: "Consumir",
  discard: "Descartar",
  query: "Consulta",
  unknown: "Sin intención clara",
};

export default function PantryParsePreview() {
  const view = useToolContext();
  const sendFollowUp = useSendFollowUp();
  const c = useAppColors();

  if (view.status === "pending") {
    return <WidgetLoading text="Leyendo tu mensaje de despensa…" />;
  }
  if (view.status === "error") {
    return <WidgetError message={view.error.message} />;
  }
  const props = view.toolOutput as Props;

  const { intent, items, reply } = props;

  return (
    <>
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
              onClick={() => void sendFollowUp({ prompt: "Sí, guarda estos items en mi despensa tal como están." })}
              style={primaryButtonStyle(c)}
            >
              Guardar en despensa
            </button>
          )}
          {items.length > 0 && (
            <button
              onClick={() => void sendFollowUp({ prompt: "Espera, hay items mal detectados. Te digo qué corregir antes de guardar." })}
              style={ghostButtonStyle(c)}
            >
              Corregir items
            </button>
          )}
          <button
            onClick={() => void sendFollowUp({ prompt: "¿Qué tengo ahora mismo en la despensa?" })}
            style={ghostButtonStyle(c)}
          >
            Ver mi despensa
          </button>
        </div>
      </div>
    </>
  );
}
