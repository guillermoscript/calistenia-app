import { McpUseProvider, useWidget, useWidgetTheme, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";

const foodSchema = z.object({
  name: z.string(),
  portion: z.string(),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
});

const propsSchema = z.object({
  entry_id: z.string(),
  meal_type: z.enum(["desayuno", "almuerzo", "cena", "snack"]),
  foods: z.array(foodSchema),
  totals: z.object({ calories: z.number(), protein: z.number(), carbs: z.number(), fat: z.number() }),
  today_totals: z.object({ calories: z.number(), protein: z.number(), carbs: z.number(), fat: z.number() }).optional(),
  goals: z.object({ calories: z.number(), protein: z.number(), carbs: z.number(), fat: z.number() }).nullable().optional(),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Shows a logged meal with macro breakdown and today's progress toward daily goals",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;

const MEAL_LABELS: Record<string, string> = {
  desayuno: "Desayuno",
  almuerzo: "Almuerzo",
  cena: "Cena",
  snack: "Snack",
};

const MEAL_EMOJI: Record<string, string> = {
  desayuno: "🌅",
  almuerzo: "☀️",
  cena: "🌙",
  snack: "🍎",
};

function MacroBar({
  label,
  value,
  goal,
  todayValue,
  color,
  unit = "g",
  dark,
}: {
  label: string;
  value: number;
  goal?: number;
  todayValue?: number;
  color: string;
  unit?: string;
  dark: boolean;
}) {
  const pct = goal ? Math.min((todayValue ?? value) / goal, 1) : 0;
  const bg = dark ? "#2a2a2a" : "#f0f0f0";
  const text = dark ? "#e0e0e0" : "#1a1a1a";
  const sub = dark ? "#888" : "#666";

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: text, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 13, color: sub }}>
          +{value}{unit}
          {goal ? ` · ${todayValue ?? value}/${goal}${unit} today` : ""}
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 4, backgroundColor: bg, overflow: "hidden" }}>
        {goal ? (
          <div style={{ width: `${pct * 100}%`, height: "100%", backgroundColor: color, borderRadius: 4 }} />
        ) : null}
      </div>
    </div>
  );
}

export default function NutritionLogResult() {
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
  const theme = useWidgetTheme();
  const dark = theme === "dark";

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div style={{ padding: 16, color: dark ? "#e0e0e0" : "#333" }}>Logging meal…</div>
      </McpUseProvider>
    );
  }

  const { meal_type, foods, totals, today_totals, goals } = props;
  const bg = dark ? "#1a1a1a" : "#ffffff";
  const card = dark ? "#242424" : "#f8f8f8";
  const border = dark ? "#333" : "#e8e8e8";
  const text = dark ? "#e0e0e0" : "#1a1a1a";
  const sub = dark ? "#888" : "#666";
  const btnBg = dark ? "#2a2a2a" : "#f0f0f0";
  const btnHover = dark ? "#333" : "#e0e0e0";

  return (
    <McpUseProvider autoSize>
      <div style={{ padding: 16, backgroundColor: bg, color: text, fontFamily: "system-ui, sans-serif", maxWidth: 480 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 20 }}>{MEAL_EMOJI[meal_type] ?? "🍽️"}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{MEAL_LABELS[meal_type] ?? meal_type} — registrado</div>
            <div style={{ fontSize: 12, color: sub }}>{foods.length} alimento{foods.length !== 1 ? "s" : ""}</div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ fontWeight: 700, fontSize: 18, color: "#f97316" }}>{totals.calories}</div>
            <div style={{ fontSize: 11, color: sub }}>kcal</div>
          </div>
        </div>

        {/* Foods list */}
        <div style={{ backgroundColor: card, borderRadius: 8, padding: 10, marginBottom: 14, border: `1px solid ${border}` }}>
          {foods.map((f, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: i < foods.length - 1 ? `1px solid ${border}` : "none" }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{f.name}</span>
                <span style={{ fontSize: 12, color: sub, marginLeft: 6 }}>{f.portion}</span>
              </div>
              <span style={{ fontSize: 13, color: sub }}>{f.calories} kcal</span>
            </div>
          ))}
        </div>

        {/* Macro bars */}
        <div style={{ marginBottom: 14 }}>
          <MacroBar label="Proteína" value={Math.round(totals.protein * 10) / 10} goal={goals?.protein} todayValue={today_totals?.protein} color="#3b82f6" dark={dark} />
          <MacroBar label="Carbohidratos" value={Math.round(totals.carbs * 10) / 10} goal={goals?.carbs} todayValue={today_totals?.carbs} color="#eab308" dark={dark} />
          <MacroBar label="Grasa" value={Math.round(totals.fat * 10) / 10} goal={goals?.fat} todayValue={today_totals?.fat} color="#a855f7" dark={dark} />
          {goals && (
            <MacroBar label="Calorías totales hoy" value={totals.calories} goal={goals.calories} todayValue={today_totals?.calories} color="#f97316" unit=" kcal" dark={dark} />
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => sendFollowUpMessage("Las macros están mal, corrígelas. Te explico qué era realmente.")}
            style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, border: `1px solid ${border}`, backgroundColor: btnBg, color: text, cursor: "pointer" }}
          >
            ✏️ Corregir macros
          </button>
          <button
            onClick={() => sendFollowUpMessage("Quiero registrar otra comida. Analiza la imagen que te muestro ahora.")}
            style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, border: `1px solid ${border}`, backgroundColor: btnBg, color: text, cursor: "pointer" }}
          >
            + Agregar otra
          </button>
          <button
            onClick={() => sendFollowUpMessage("¿Cómo va mi nutrición hoy? Dame un resumen y qué me falta para llegar a mis metas.")}
            style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, border: `1px solid ${border}`, backgroundColor: btnBg, color: text, cursor: "pointer" }}
          >
            📊 Ver resumen diario
          </button>
        </div>
      </div>
    </McpUseProvider>
  );
}
