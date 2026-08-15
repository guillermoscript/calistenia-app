import { useToolContext, useSendFollowUp } from "mcp-use/react";
import { useAppColors, FONT, FONT_MONO } from "../lib/theme";
import { WidgetLoading, WidgetError, Kicker, DisplayTitle, Banner, ghostButtonStyle } from "../lib/ui";
import { WidgetFonts } from "../lib/fonts";
import type { PantryConsumedProps as Props } from "../../src/views/pantry-consumed.schema";

export default function PantryConsumed() {
  const view = useToolContext();
  const sendFollowUp = useSendFollowUp();
  const c = useAppColors();

  if (view.status === "pending") {
    return <WidgetLoading text="Descontando de tu despensa…" />;
  }
  if (view.status === "error") {
    return <WidgetError message={view.error.message} />;
  }
  const props = view.toolOutput as Props;

  const { results, failed } = props;
  const depleted = results.filter((r) => r.status === "depleted");

  return (
    <>
      <WidgetFonts />
      <div style={{ padding: 16, backgroundColor: c.bg, color: c.text, fontFamily: FONT, maxWidth: 480 }}>
        <Kicker>Despensa descontada</Kicker>
        <DisplayTitle size={24} style={{ margin: "2px 0 12px" }}>
          {results.length} item{results.length !== 1 ? "s" : ""} actualizado{results.length !== 1 ? "s" : ""}
        </DisplayTitle>

        {failed.length > 0 && (
          <Banner kind="error">
            {failed.length} item{failed.length !== 1 ? "s" : ""} no se pudieron descontar
          </Banner>
        )}

        {results.length > 0 && (
          <div style={{ backgroundColor: c.card, borderRadius: 8, padding: 10, marginBottom: 12, border: `1px solid ${c.border}` }}>
            {results.map((r, i) => (
              <div
                key={r.item_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 0",
                  borderBottom: i < results.length - 1 ? `1px solid ${c.border}` : "none",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 500, flex: 1, minWidth: 0 }}>{r.name}</span>
                <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: c.danger, whiteSpace: "nowrap" }}>−{r.consumed}</span>
                <span style={{ fontSize: 12, color: c.sub, whiteSpace: "nowrap", minWidth: 76, textAlign: "right" }}>
                  {r.status === "depleted" ? (
                    <span style={{ color: c.warn, fontWeight: 600 }}>agotado</span>
                  ) : r.remaining != null ? (
                    `quedan ${r.remaining}`
                  ) : (
                    "sin dato"
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {depleted.length > 0 && (
            <button
              onClick={() =>
                void sendFollowUp({
                  prompt: `Se me agotó: ${depleted.map((d) => d.name).join(", ")}. Agrégalo a lo que debo comprar y dime qué más me falta.`,
                })
              }
              style={ghostButtonStyle(c)}
            >
              Anotar agotados para comprar
            </button>
          )}
          <button
            onClick={() => void sendFollowUp({ prompt: "¿Cuántas comidas completas me alcanzan ahora con mi despensa?" })}
            style={ghostButtonStyle(c)}
          >
            ¿Cuántas comidas me quedan?
          </button>
        </div>
      </div>
    </>
  );
}
