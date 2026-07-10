import { McpUseProvider, useWidget, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";
import { useAppColors, FONT, FONT_MONO } from "./lib/theme";
import { WidgetLoading, Kicker, DisplayTitle, Banner, ghostButtonStyle } from "./lib/ui";
import { WidgetFonts } from "./lib/fonts";

const propsSchema = z.object({
  results: z.array(
    z.object({
      item_id: z.string(),
      name: z.string(),
      consumed: z.number(),
      remaining: z.number().nullable(),
      status: z.string(),
    })
  ),
  failed: z.array(z.object({ item_id: z.string(), error: z.string() })),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Result of deducting consumed quantities from the pantry, with remaining amounts and depleted items",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;

export default function PantryConsumed() {
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
  const c = useAppColors();

  if (isPending) {
    return <WidgetLoading text="Descontando de tu despensa…" />;
  }

  const { results, failed } = props;
  const depleted = results.filter((r) => r.status === "depleted");

  return (
    <McpUseProvider autoSize>
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
                sendFollowUpMessage(
                  `Se me agotó: ${depleted.map((d) => d.name).join(", ")}. Agrégalo a lo que debo comprar y dime qué más me falta.`
                )
              }
              style={ghostButtonStyle(c)}
            >
              Anotar agotados para comprar
            </button>
          )}
          <button
            onClick={() => sendFollowUpMessage("¿Cuántas comidas completas me alcanzan ahora con mi despensa?")}
            style={ghostButtonStyle(c)}
          >
            ¿Cuántas comidas me quedan?
          </button>
        </div>
      </div>
    </McpUseProvider>
  );
}
