import { McpUseProvider, useWidget, useWidgetTheme, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";

const macroSchema = z.object({ consumed: z.number(), goal: z.number() });

const propsSchema = z.object({
  readiness: z.object({ score: z.number(), label: z.string(), factors: z.array(z.string()) }),
  workout: z.object({
    has_workout: z.boolean(),
    day_name: z.string(),
    day_focus: z.string(),
    program_name: z.string(),
    exercises: z.array(z.object({ name: z.string(), sets: z.number(), reps: z.string(), rest: z.number() })),
    week_progress: z.object({ completed: z.number(), total: z.number() }),
    workout_key: z.string(),
  }).nullable(),
  nutrition: z.object({
    calories: macroSchema,
    protein: macroSchema,
    carbs: macroSchema,
    fat: macroSchema,
    meals_logged: z.number(),
  }),
  streak: z.number(),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Daily dashboard: readiness score, today's workout, nutrition rings, and streak",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;

function Ring({ value, max, color, label, unit = "", size = 64 }: { value: number; max: number; color: string; label: string; unit?: string; size?: number }) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = pct * circ;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#33333322" strokeWidth={8} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{ transition: "stroke-dasharray 0.5s" }} />
        <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="middle" fill="currentColor"
          fontSize={size < 64 ? 9 : 11} fontWeight={700} style={{ transform: "rotate(90deg)", transformOrigin: `${size / 2}px ${size / 2}px` }}>
          {Math.round(value)}{unit}
        </text>
      </svg>
      <span style={{ fontSize: 10, opacity: 0.7 }}>{label}</span>
    </div>
  );
}

function ReadinessBadge({ score }: { score: number }) {
  const color = score >= 8 ? "#22c55e" : score >= 5 ? "#f59e0b" : "#ef4444";
  const size = 52;
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 10) * circ;

  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color + "33"} strokeWidth={8} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="middle" fill={color}
        fontSize={13} fontWeight={800} style={{ transform: "rotate(90deg)", transformOrigin: `${size / 2}px ${size / 2}px` }}>
        {score}
      </text>
    </svg>
  );
}

export default function TodayDashboard() {
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
  const theme = useWidgetTheme();
  const dark = theme === "dark";

  if (isPending) {
    return <McpUseProvider autoSize><div style={{ padding: 16, color: dark ? "#e0e0e0" : "#333" }}>Cargando tu día…</div></McpUseProvider>;
  }

  const bg = dark ? "#1a1a1a" : "#ffffff";
  const card = dark ? "#242424" : "#f8f8f8";
  const border = dark ? "#333" : "#e8e8e8";
  const textColor = dark ? "#e0e0e0" : "#1a1a1a";
  const sub = dark ? "#888" : "#666";
  const accent = "#6366f1";
  const { readiness, workout, nutrition, streak } = props;

  return (
    <McpUseProvider autoSize>
      <div style={{ padding: 16, backgroundColor: bg, color: textColor, fontFamily: "system-ui, sans-serif", maxWidth: 480 }}>

        {/* Top row: readiness + streak */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ReadinessBadge score={readiness.score} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{readiness.label}</div>
              {readiness.factors.map((f, i) => (
                <div key={i} style={{ fontSize: 11, color: sub }}>{f}</div>
              ))}
            </div>
          </div>
          {streak > 0 && (
            <div style={{ textAlign: "center", backgroundColor: card, borderRadius: 10, padding: "8px 12px", border: `1px solid ${border}` }}>
              <div style={{ fontSize: 20 }}>🔥</div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{streak}</div>
              <div style={{ fontSize: 10, color: sub }}>días</div>
            </div>
          )}
        </div>

        {/* Nutrition rings */}
        <div style={{ backgroundColor: card, borderRadius: 10, padding: "12px 16px", marginBottom: 12, border: `1px solid ${border}` }}>
          <div style={{ fontSize: 11, color: sub, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>
            Nutrición hoy · {nutrition.meals_logged} comida{nutrition.meals_logged !== 1 ? "s" : ""}
          </div>
          <div style={{ display: "flex", justifyContent: "space-around" }}>
            <Ring value={nutrition.calories.consumed} max={nutrition.calories.goal} color="#f97316" label="Kcal" size={68} />
            <Ring value={nutrition.protein.consumed} max={nutrition.protein.goal} color="#3b82f6" label="Prot" unit="g" size={56} />
            <Ring value={nutrition.carbs.consumed} max={nutrition.carbs.goal} color="#eab308" label="Carbs" unit="g" size={56} />
            <Ring value={nutrition.fat.consumed} max={nutrition.fat.goal} color="#a855f7" label="Grasa" unit="g" size={56} />
          </div>
        </div>

        {/* Workout card */}
        {workout && (
          <div style={{ backgroundColor: card, borderRadius: 10, padding: "12px 16px", marginBottom: 14, border: `1px solid ${border}` }}>
            <div style={{ fontSize: 11, color: sub, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
              {workout.program_name} · {workout.week_progress.completed}/{workout.week_progress.total} días esta semana
            </div>
            {workout.has_workout ? (
              <>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{workout.day_name}</div>
                <div style={{ fontSize: 13, color: accent, fontWeight: 600, marginBottom: 8 }}>{workout.day_focus}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {workout.exercises.slice(0, 5).map((ex, i) => (
                    <span key={i} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, backgroundColor: dark ? "#333" : "#e8e8e8", color: textColor }}>
                      {ex.name}
                    </span>
                  ))}
                  {workout.exercises.length > 5 && (
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, backgroundColor: dark ? "#333" : "#e8e8e8", color: sub }}>
                      +{workout.exercises.length - 5} más
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div style={{ color: sub, fontSize: 14 }}>🎉 Semana completa — descansa o haz movilidad</div>
            )}
          </div>
        )}

        {/* Quick actions */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {workout?.has_workout && (
            <button
              onClick={() => sendFollowUpMessage("Muéstrame el entrenamiento de hoy con cal_todays_workout")}
              style={{ flex: 1, padding: "8px 12px", borderRadius: 8, backgroundColor: accent, color: "#fff", fontWeight: 700, fontSize: 12, border: "none", cursor: "pointer" }}
            >
              ▶ Empezar sesión
            </button>
          )}
          <button
            onClick={() => sendFollowUpMessage("Registra mi comida — describe lo que comí o comparte una foto")}
            style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1px solid ${border}`, backgroundColor: "transparent", color: textColor, fontSize: 12, cursor: "pointer" }}
          >
            🍽 Registrar comida
          </button>
          <button
            onClick={() => sendFollowUpMessage("Dame recomendaciones para completar mis metas de nutrición y entrenamiento de hoy")}
            style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${border}`, backgroundColor: "transparent", color: textColor, fontSize: 12, cursor: "pointer" }}
          >
            💡
          </button>
        </div>
      </div>
    </McpUseProvider>
  );
}
