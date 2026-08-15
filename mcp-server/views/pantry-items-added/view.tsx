import { useToolContext, useSendFollowUp } from "mcp-use/react";
import { useAppColors, FONT, FONT_MONO } from "../lib/theme";
import { WidgetLoading, WidgetError, Kicker, DisplayTitle, Banner, ghostButtonStyle } from "../lib/ui";
import { WidgetFonts } from "../lib/fonts";
import { fmtPrice, fmtQty } from "../lib/pantry-ui";
import type { PantryItemsAddedProps as Props } from "../../src/views/pantry-items-added.schema";

const SOURCE_LABELS: Record<string, string> = {
  chat: "vía chat",
  receipt: "desde recibo",
  shopping: "desde compras",
  manual: "manual",
};

export default function PantryItemsAdded() {
  const view = useToolContext();
  const sendFollowUp = useSendFollowUp();
  const c = useAppColors();

  if (view.status === "pending") {
    return <WidgetLoading text="Guardando en tu despensa…" />;
  }
  if (view.status === "error") {
    return <WidgetError message={view.error.message} />;
  }
  const props = view.toolOutput as Props;

  const { created, failed, source } = props;
  const totalUsd = created.reduce((acc, it) => acc + (it.price_usd ?? 0), 0);
  const hasPrices = created.some((it) => it.price_usd != null);

  return (
    <>
      <WidgetFonts />
      <div style={{ padding: 16, backgroundColor: c.bg, color: c.text, fontFamily: FONT, maxWidth: 480 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <Kicker>Despensa actualizada</Kicker>
            <DisplayTitle size={24} style={{ marginTop: 2 }}>
              +{created.length} item{created.length !== 1 ? "s" : ""}
            </DisplayTitle>
            <div style={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: 1, color: c.sub, marginTop: 3, textTransform: "uppercase" }}>
              {SOURCE_LABELS[source] ?? source}
            </div>
          </div>
          {hasPrices && (
            <div style={{ textAlign: "right" }}>
              <DisplayTitle size={22} color={c.lime}>
                {fmtPrice(totalUsd)}
              </DisplayTitle>
              <div style={{ fontSize: 10, color: c.sub }}>total USD</div>
            </div>
          )}
        </div>

        {failed.length > 0 && (
          <Banner kind="error">
            {failed.length} item{failed.length !== 1 ? "s" : ""} no se pudieron guardar: {failed.map((f) => f.name).join(", ")}
          </Banner>
        )}

        {created.length > 0 && (
          <div style={{ backgroundColor: c.card, borderRadius: 8, padding: 10, marginBottom: 12, border: `1px solid ${c.border}` }}>
            {created.map((it, i) => (
              <div
                key={it.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 0",
                  borderBottom: i < created.length - 1 ? `1px solid ${c.border}` : "none",
                }}
              >
                <span style={{ color: c.lime, fontSize: 12 }}>✓</span>
                <span style={{ fontSize: 13, fontWeight: 500, flex: 1, minWidth: 0 }}>{it.name}</span>
                <span style={{ fontSize: 12, color: c.sub, whiteSpace: "nowrap" }}>{fmtQty(it.quantity, it.unit) ?? ""}</span>
                {it.price_usd != null && (
                  <span style={{ fontFamily: FONT_MONO, fontSize: 12, whiteSpace: "nowrap", minWidth: 48, textAlign: "right" }}>
                    {fmtPrice(it.price_usd)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => void sendFollowUp({ prompt: "¿Cuántas comidas completas me alcanzan ahora con mi despensa?" })}
            style={ghostButtonStyle(c)}
          >
            ¿Cuántas comidas me alcanzan?
          </button>
          <button
            onClick={() => void sendFollowUp({ prompt: "Genera un plan de comidas para mañana usando solo mi despensa." })}
            style={ghostButtonStyle(c)}
          >
            Plan del día
          </button>
        </div>
      </div>
    </>
  );
}
