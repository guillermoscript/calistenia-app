import { useToolContext, useSendFollowUp } from "mcp-use/react";
import { useAppColors, FONT, FONT_MONO } from "../lib/theme";
import { WidgetLoading, WidgetError, Kicker, DisplayTitle, StatNumber, primaryButtonStyle, ghostButtonStyle } from "../lib/ui";
import { WidgetFonts } from "../lib/fonts";
import { CategoryChip, ConfidenceDot, fmtPrice, fmtQty } from "../lib/pantry-ui";
import type { ReceiptScanResultProps as Props } from "../../src/views/receipt-scan-result.schema";

export default function ReceiptScanResult() {
  const view = useToolContext();
  const sendFollowUp = useSendFollowUp();
  const c = useAppColors();

  if (view.status === "pending") {
    return <WidgetLoading text="Escaneando recibo…" />;
  }
  if (view.status === "error") {
    return <WidgetError message={view.error.message} />;
  }
  const props = view.toolOutput as Props;

  const { store_name, purchase_date, currency, exchange_rate_usd, items, ignored_lines, total } = props;
  const meta = [
    purchase_date,
    currency ? `${currency}${exchange_rate_usd ? ` · tasa ${exchange_rate_usd}` : ""}` : null,
  ].filter(Boolean);

  return (
    <>
      <WidgetFonts />
      <div style={{ padding: 16, backgroundColor: c.bg, color: c.text, fontFamily: FONT, maxWidth: 480 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Kicker>Recibo escaneado</Kicker>
            <DisplayTitle size={24} style={{ marginTop: 2 }}>
              {store_name ?? "Recibo"}
            </DisplayTitle>
            {meta.length > 0 && (
              <div style={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: 1, color: c.sub, marginTop: 3 }}>
                {meta.join("  ·  ")}
              </div>
            )}
          </div>
          {total != null && (
            <div style={{ textAlign: "right" }}>
              <StatNumber size={24} color={c.lime}>
                {fmtPrice(total, currency)}
              </StatNumber>
              <div style={{ fontSize: 10, color: c.sub }}>
                {items.length} item{items.length !== 1 ? "s" : ""}
              </div>
            </div>
          )}
        </div>

        <div style={{ backgroundColor: c.card, borderRadius: 8, padding: 10, marginBottom: 10, border: `1px solid ${c.border}` }}>
          {items.map((it, i) => (
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
              <span style={{ fontSize: 13, fontWeight: 500, flex: 1, minWidth: 0 }} title={it.raw_line}>
                {it.name}
              </span>
              <CategoryChip category={it.category} c={c} />
              <span style={{ fontSize: 12, color: c.sub, whiteSpace: "nowrap" }}>{fmtQty(it.quantity, it.unit) ?? "—"}</span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: c.text, whiteSpace: "nowrap", minWidth: 52, textAlign: "right" }}>
                {fmtPrice(it.price_total, currency) ?? "—"}
              </span>
            </div>
          ))}
        </div>

        {ignored_lines.length > 0 && (
          <div style={{ fontSize: 11, color: c.sub, marginBottom: 12 }}>
            {ignored_lines.length} línea{ignored_lines.length !== 1 ? "s" : ""} ignorada
            {ignored_lines.length !== 1 ? "s" : ""} (totales, IVA, no-comida…)
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() =>
              void sendFollowUp({ prompt: "Sí, guarda todos los items del recibo en mi despensa con sus precios (source receipt)." })
            }
            style={primaryButtonStyle(c)}
          >
            Guardar en despensa
          </button>
          <button
            onClick={() => void sendFollowUp({ prompt: "Hay items mal leídos en el recibo. Te digo qué corregir antes de guardar." })}
            style={ghostButtonStyle(c)}
          >
            Corregir items
          </button>
        </div>
      </div>
    </>
  );
}
