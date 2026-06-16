import { McpUseProvider, useWidget, useWidgetTheme, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";

const propsSchema = z.object({
  from: z.string(),
  to: z.string(),
  days_logged: z.number(),
  total_entries: z.number(),
  adherence_pct: z.number().nullable(),
  daily_avg: z.object({
    calories: z.number(),
    protein: z.number(),
    carbs: z.number(),
    fat: z.number(),
  }),
  goals: z
    .object({
      calories: z.number(),
      protein: z.number(),
      carbs: z.number(),
      fat: z.number(),
    })
    .nullable(),
  most_logged_meals: z.array(z.object({ name: z.string(), count: z.number() })),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Nutrition summary over a date range: daily averages vs goals, adherence, and most-logged meals",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;

function MacroBar({
  label,
  avg,
  goal,
  color,
  unit,
  dark,
  border,
  sub,
  textColor,
}: {
  label: string;
  avg: number;
  goal: number | null;
  color: string;
  unit: string;
  dark: boolean;
  border: string;
  sub: string;
  textColor: string;
}) {
  const pct = goal && goal > 0 ? Math.min(avg / goal, 1) : null;
  const pctNum = goal && goal > 0 ? Math.round((avg / goal) * 100) : null;
  const barBg = dark ? "#2a2a2a" : "#eeeeee";

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: textColor }}>{label}</span>
        <span style={{ fontSize: 12, color: sub }}>
          {goal !== null ? (
            <>
              <span style={{ color: color, fontWeight: 700 }}>{avg}{unit}</span>
              <span> / {goal}{unit}</span>
              {pctNum !== null && (
                <span style={{ marginLeft: 6, fontWeight: 700, color: pctNum >= 90 ? "#22c55e" : pctNum >= 70 ? "#f59e0b" : "#ef4444" }}>
                  {pctNum}%
                </span>
              )}
            </>
          ) : (
            <span style={{ color: color, fontWeight: 700 }}>{avg}{unit}</span>
          )}
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 4, backgroundColor: barBg, overflow: "hidden" }}>
        {pct !== null && (
          <div
            style={{
              width: `${Math.min(pct * 100, 100)}%`,
              height: "100%",
              backgroundColor: color,
              borderRadius: 4,
              transition: "width 0.4s ease",
            }}
          />
        )}
      </div>
    </div>
  );
}

export default function NutritionSummary() {
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
  const theme = useWidgetTheme();
  const dark = theme === "dark";

  const bg = dark ? "#1a1a1a" : "#ffffff";
  const card = dark ? "#242424" : "#f8f8f8";
  const border = dark ? "#333" : "#e8e8e8";
  const textColor = dark ? "#e0e0e0" : "#1a1a1a";
  const sub = dark ? "#888" : "#666";
  const chipBg = dark ? "#333" : "#e8e8e8";

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div style={{ padding: 16, color: sub, fontFamily: "system-ui, sans-serif" }}>
          Calculando resumen de nutrición…
        </div>
      </McpUseProvider>
    );
  }

  const { from, to, days_logged, total_entries, adherence_pct, daily_avg, goals, most_logged_meals } = props;

  const adherenceColor =
    adherence_pct === null
      ? sub
      : adherence_pct >= 90
      ? "#22c55e"
      : adherence_pct >= 70
      ? "#f59e0b"
      : "#ef4444";

  const dateLabel = from === to ? from : `${from} → ${to}`;

  return (
    <McpUseProvider autoSize>
      <div style={{ padding: 16, backgroundColor: bg, color: textColor, fontFamily: "system-ui, sans-serif", maxWidth: 480 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>📊 Resumen nutricional</div>
            <div style={{ fontSize: 12, color: sub, marginTop: 2 }}>{dateLabel}</div>
            <div style={{ fontSize: 12, color: sub }}>
              {days_logged} día{days_logged !== 1 ? "s" : ""} registrado{days_logged !== 1 ? "s" : ""} · {total_entries} comida{total_entries !== 1 ? "s" : ""}
            </div>
          </div>

          {/* Adherence badge */}
          {adherence_pct !== null && (
            <div
              style={{
                backgroundColor: card,
                border: `1px solid ${border}`,
                borderRadius: 10,
                padding: "8px 14px",
                textAlign: "center",
                minWidth: 64,
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 800, color: adherenceColor, lineHeight: 1 }}>
                {adherence_pct}%
              </div>
              <div style={{ fontSize: 10, color: sub, marginTop: 2 }}>adherencia</div>
            </div>
          )}
        </div>

        {/* Macro bars */}
        <div
          style={{
            backgroundColor: card,
            borderRadius: 10,
            padding: "12px 16px",
            marginBottom: 12,
            border: `1px solid ${border}`,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: sub,
              textTransform: "uppercase",
              letterSpacing: 1,
              marginBottom: 10,
            }}
          >
            Promedio diario{goals ? " vs meta" : ""}
          </div>

          <MacroBar
            label="Calorías"
            avg={daily_avg.calories}
            goal={goals?.calories ?? null}
            color="#f97316"
            unit=" kcal"
            dark={dark}
            border={border}
            sub={sub}
            textColor={textColor}
          />
          <MacroBar
            label="Proteína"
            avg={daily_avg.protein}
            goal={goals?.protein ?? null}
            color="#3b82f6"
            unit="g"
            dark={dark}
            border={border}
            sub={sub}
            textColor={textColor}
          />
          <MacroBar
            label="Carbohidratos"
            avg={daily_avg.carbs}
            goal={goals?.carbs ?? null}
            color="#eab308"
            unit="g"
            dark={dark}
            border={border}
            sub={sub}
            textColor={textColor}
          />
          <MacroBar
            label="Grasa"
            avg={daily_avg.fat}
            goal={goals?.fat ?? null}
            color="#a855f7"
            unit="g"
            dark={dark}
            border={border}
            sub={sub}
            textColor={textColor}
          />
        </div>

        {/* Most logged meals */}
        {most_logged_meals.length > 0 && (
          <div
            style={{
              backgroundColor: card,
              borderRadius: 10,
              padding: "12px 16px",
              marginBottom: 14,
              border: `1px solid ${border}`,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: sub,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 8,
              }}
            >
              Más registrados
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {most_logged_meals.map((meal, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: 12,
                    padding: "4px 10px",
                    borderRadius: 14,
                    backgroundColor: chipBg,
                    color: textColor,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  {meal.name}
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: sub,
                    }}
                  >
                    ×{meal.count}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Action button */}
        <button
          onClick={() => sendFollowUpMessage("🍽 Dame consejos para mejorar mi nutrición basándote en este resumen")}
          style={{
            width: "100%",
            padding: "9px 12px",
            borderRadius: 8,
            border: `1px solid ${border}`,
            backgroundColor: "transparent",
            color: textColor,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          🍽 Dame consejos para mejorar mi nutrición
        </button>
      </div>
    </McpUseProvider>
  );
}
