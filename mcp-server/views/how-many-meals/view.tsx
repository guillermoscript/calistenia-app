import { useToolContext, useSendFollowUp } from "mcp-use/react";
import { useAppColors, FONT, FONT_MONO } from "../lib/theme";
import { WidgetLoading, WidgetError, Kicker, DisplayTitle, ghostButtonStyle } from "../lib/ui";
import { WidgetFonts } from "../lib/fonts";
import type { HowManyMealsProps as Props } from "../../src/views/how-many-meals.schema";

export default function HowManyMeals() {
  const view = useToolContext();
  const sendFollowUp = useSendFollowUp();
  const c = useAppColors();

  if (view.status === "pending") {
    return <WidgetLoading text="Contando lo que alcanza tu despensa…" />;
  }
  if (view.status === "error") {
    return <WidgetError message={view.error.message} />;
  }
  const props = view.toolOutput as Props;

  const { total_meals, days_covered, breakdown, summary } = props;
  const maxTimes = Math.max(1, ...breakdown.map((b) => b.times_possible));

  return (
    <>
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
            onClick={() => void sendFollowUp({ prompt: "Genera un plan de comidas para mañana usando solo mi despensa." })}
            style={ghostButtonStyle(c)}
          >
            Plan del día
          </button>
          <button
            onClick={() => void sendFollowUp({ prompt: "Genera un plan semanal completo desde mi despensa." })}
            style={ghostButtonStyle(c)}
          >
            Plan semanal
          </button>
          <button
            onClick={() => void sendFollowUp({ prompt: "¿Qué debería comprar para cubrir toda la semana?" })}
            style={ghostButtonStyle(c)}
          >
            ¿Qué me falta comprar?
          </button>
        </div>
      </div>
    </>
  );
}
