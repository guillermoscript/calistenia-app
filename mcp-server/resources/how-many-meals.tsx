import { McpUseProvider, useWidget, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";
import { useAppColors, FONT, FONT_MONO } from "./lib/theme";
import { WidgetLoading, Kicker, DisplayTitle, ghostButtonStyle } from "./lib/ui";
import { WidgetFonts } from "./lib/fonts";

const propsSchema = z.object({
  total_meals: z.number(),
  days_covered: z.number(),
  breakdown: z.array(
    z.object({
      meal_label: z.string(),
      times_possible: z.number(),
      limiting_ingredient: z.string(),
    })
  ),
  summary: z.string(),
});

export const widgetMetadata: WidgetMetadata = {
  description: "How many complete meals the current pantry can produce, broken down by meal type with the limiting ingredient",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;

export default function HowManyMeals() {
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
  const c = useAppColors();

  if (isPending) {
    return <WidgetLoading text="Contando lo que alcanza tu despensa…" />;
  }

  const { total_meals, days_covered, breakdown, summary } = props;
  const maxTimes = Math.max(1, ...breakdown.map((b) => b.times_possible));

  return (
    <McpUseProvider autoSize>
      <WidgetFonts />
      <div style={{ padding: 16, backgroundColor: c.bg, color: c.text, fontFamily: FONT, maxWidth: 480 }}>
        <Kicker>Tu despensa alcanza para</Kicker>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "4px 0 14px" }}>
          <DisplayTitle size={48} color={c.lime}>
            {total_meals}
          </DisplayTitle>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>comidas completas</div>
            <div style={{ fontSize: 12, color: c.sub }}>~{days_covered} día{days_covered !== 1 ? "s" : ""} cubiertos</div>
          </div>
        </div>

        <div style={{ backgroundColor: c.card, borderRadius: 8, padding: 12, marginBottom: 12, border: `1px solid ${c.border}` }}>
          {breakdown.map((b, i) => (
            <div key={i} style={{ marginBottom: i < breakdown.length - 1 ? 10 : 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{b.meal_label}</span>
                <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: c.sub }}>
                  {b.times_possible}× · limita: <span style={{ color: c.warn }}>{b.limiting_ingredient}</span>
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 3, backgroundColor: c.chip, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${Math.min((b.times_possible / maxTimes) * 100, 100)}%`,
                    height: "100%",
                    backgroundColor: c.lime,
                    borderRadius: 3,
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {summary && <div style={{ fontSize: 12, color: c.sub, marginBottom: 12 }}>{summary}</div>}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => sendFollowUpMessage("Genera un plan de comidas para mañana usando solo mi despensa.")}
            style={ghostButtonStyle(c)}
          >
            Plan del día
          </button>
          <button
            onClick={() => sendFollowUpMessage("Genera un plan semanal completo desde mi despensa.")}
            style={ghostButtonStyle(c)}
          >
            Plan semanal
          </button>
          <button
            onClick={() => sendFollowUpMessage("¿Qué debería comprar para cubrir toda la semana?")}
            style={ghostButtonStyle(c)}
          >
            ¿Qué me falta comprar?
          </button>
        </div>
      </div>
    </McpUseProvider>
  );
}
