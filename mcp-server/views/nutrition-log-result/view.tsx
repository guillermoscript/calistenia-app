import { useToolContext, useSendFollowUp } from "mcp-use/react";
import { useAppColors, FONT, FONT_DISPLAY, type AppColors } from "../lib/theme";
import { WidgetLoading, WidgetError, Kicker } from "../lib/ui";
import { WidgetFonts } from "../lib/fonts";
import type { NutritionLogResultProps as Props } from "../../src/views/nutrition-log-result.schema";

const MEAL_LABELS: Record<string, string> = {
  desayuno: "Desayuno",
  almuerzo: "Almuerzo",
  cena: "Cena",
  snack: "Snack",
};

function MacroBar({
  label,
  value,
  goal,
  todayValue,
  color,
  unit = "g",
  c,
}: {
  label: string;
  value: number;
  goal?: number;
  todayValue?: number;
  color: string;
  unit?: string;
  c: AppColors;
}) {
  const pct = goal ? Math.min((todayValue ?? value) / goal, 1) : 0;

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: c.text, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 13, color: c.sub }}>
          +{value}{unit}
          {goal ? ` · ${todayValue ?? value}/${goal}${unit} hoy` : ""}
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 4, backgroundColor: c.chip, overflow: "hidden" }}>
        {goal ? (
          <div style={{ width: `${pct * 100}%`, height: "100%", backgroundColor: color, borderRadius: 4 }} />
        ) : null}
      </div>
    </div>
  );
}

export default function NutritionLogResult() {
  const view = useToolContext();
  const sendFollowUp = useSendFollowUp();
  const c = useAppColors();

  if (view.status === "pending") {
    return <WidgetLoading text="Registrando comida…" />;
  }
  if (view.status === "error") {
    return <WidgetError message={view.error.message} />;
  }
  const props = view.toolOutput as Props;

  const { meal_type, foods, totals, today_totals, goals } = props;

  return (
    <>
      <WidgetFonts />
      <div style={{ padding: 16, backgroundColor: c.bg, color: c.text, fontFamily: FONT, maxWidth: 480 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <div>
            <Kicker>Registrado</Kicker>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{MEAL_LABELS[meal_type] ?? meal_type}</div>
            <div style={{ fontSize: 12, color: c.sub }}>{foods.length} alimento{foods.length !== 1 ? "s" : ""}</div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 400, fontSize: 22, color: c.kcal }}>{totals.calories}</div>
            <div style={{ fontSize: 11, color: c.sub }}>kcal</div>
          </div>
        </div>

        {/* Foods list */}
        <div style={{ backgroundColor: c.card, borderRadius: 8, padding: 10, marginBottom: 14, border: `1px solid ${c.border}` }}>
          {foods.map((f, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: i < foods.length - 1 ? `1px solid ${c.border}` : "none" }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{f.name}</span>
                <span style={{ fontSize: 12, color: c.sub, marginLeft: 6 }}>{f.portion}</span>
              </div>
              <span style={{ fontSize: 13, color: c.sub }}>{f.calories} kcal</span>
            </div>
          ))}
        </div>

        {/* Macro bars */}
        <div style={{ marginBottom: 14 }}>
          <MacroBar label="Proteína" value={Math.round(totals.protein * 10) / 10} goal={goals?.protein} todayValue={today_totals?.protein} color={c.protein} c={c} />
          <MacroBar label="Carbohidratos" value={Math.round(totals.carbs * 10) / 10} goal={goals?.carbs} todayValue={today_totals?.carbs} color={c.carbs} c={c} />
          <MacroBar label="Grasa" value={Math.round(totals.fat * 10) / 10} goal={goals?.fat} todayValue={today_totals?.fat} color={c.fat} c={c} />
          {goals && (
            <MacroBar label="Calorías totales hoy" value={totals.calories} goal={goals.calories} todayValue={today_totals?.calories} color={c.kcal} unit=" kcal" c={c} />
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => void sendFollowUp({ prompt: "Las macros están mal, corrígelas. Te explico qué era realmente." })}
            style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, border: `1px solid ${c.border}`, backgroundColor: c.chip, color: c.text, cursor: "pointer", fontFamily: FONT }}
          >
            Corregir macros
          </button>
          <button
            onClick={() => void sendFollowUp({ prompt: "Quiero registrar otra comida. Analiza la imagen que te muestro ahora." })}
            style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, border: `1px solid ${c.border}`, backgroundColor: c.chip, color: c.text, cursor: "pointer", fontFamily: FONT }}
          >
            + Agregar otra
          </button>
          <button
            onClick={() => void sendFollowUp({ prompt: "¿Cómo va mi nutrición hoy? Dame un resumen y qué me falta para llegar a mis metas." })}
            style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, border: `1px solid ${c.border}`, backgroundColor: c.chip, color: c.text, cursor: "pointer", fontFamily: FONT }}
          >
            Ver resumen diario
          </button>
        </div>
      </div>
    </>
  );
}
