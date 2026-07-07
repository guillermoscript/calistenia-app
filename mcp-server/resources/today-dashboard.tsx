import { McpUseProvider, useWidget, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";
import { useAppColors, FONT, FONT_DISPLAY, trafficColor } from "./lib/theme";
import { WidgetLoading, Kicker, ghostButtonStyle, primaryButtonStyle } from "./lib/ui";
import { WidgetFonts } from "./lib/fonts";

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
          fontFamily={FONT_DISPLAY} fontSize={size < 64 ? 12 : 15} fontWeight={400}
          style={{ transform: "rotate(90deg)", transformOrigin: `${size / 2}px ${size / 2}px` }}>
          {Math.round(value)}{unit}
        </text>
      </svg>
      <span style={{ fontSize: 10, opacity: 0.7 }}>{label}</span>
    </div>
  );
}

function ReadinessBadge({ score }: { score: number }) {
  const c = useAppColors();
  const color = trafficColor(score, 5, 8, c);
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
        fontFamily={FONT_DISPLAY} fontSize={16} fontWeight={400}
        style={{ transform: "rotate(90deg)", transformOrigin: `${size / 2}px ${size / 2}px` }}>
        {score}
      </text>
    </svg>
  );
}

export default function TodayDashboard() {
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
  const c = useAppColors();

  if (isPending) {
    return <WidgetLoading text="Cargando tu día…" />;
  }

  const bg = c.bg;
  const card = c.card;
  const border = c.border;
  const textColor = c.text;
  const sub = c.sub;
  const accent = c.lime;
  const { readiness, workout, nutrition, streak } = props;

  return (
    <McpUseProvider autoSize>
      <WidgetFonts />
      <div style={{ padding: 16, backgroundColor: bg, color: textColor, fontFamily: FONT, maxWidth: 480 }}>

        <Kicker style={{ marginBottom: 10 }}>Hoy</Kicker>

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
            <div style={{ textAlign: "center", backgroundColor: card, borderRadius: 8, padding: "8px 12px", border: `1px solid ${border}` }}>
              <div style={{ fontSize: 18 }}>🔥</div>
              <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 400, fontSize: 22, color: textColor }}>{streak}</div>
              <div style={{ fontSize: 10, color: sub }}>días</div>
            </div>
          )}
        </div>

        {/* Nutrition rings */}
        <div style={{ backgroundColor: card, borderRadius: 8, padding: "12px 16px", marginBottom: 12, border: `1px solid ${border}` }}>
          <Kicker style={{ marginBottom: 10 }}>
            Nutrición · {nutrition.meals_logged} comida{nutrition.meals_logged !== 1 ? "s" : ""}
          </Kicker>
          <div style={{ display: "flex", justifyContent: "space-around" }}>
            <Ring value={nutrition.calories.consumed} max={nutrition.calories.goal} color={c.kcal} label="Kcal" size={68} />
            <Ring value={nutrition.protein.consumed} max={nutrition.protein.goal} color={c.protein} label="Prot" unit="g" size={56} />
            <Ring value={nutrition.carbs.consumed} max={nutrition.carbs.goal} color={c.carbs} label="Carbs" unit="g" size={56} />
            <Ring value={nutrition.fat.consumed} max={nutrition.fat.goal} color={c.fat} label="Grasa" unit="g" size={56} />
          </div>
        </div>

        {/* Workout card */}
        {workout && (
          <div style={{ backgroundColor: card, borderRadius: 8, padding: "12px 16px", marginBottom: 14, border: `1px solid ${border}` }}>
            <Kicker style={{ marginBottom: 6 }}>
              {workout.program_name} · {workout.week_progress.completed}/{workout.week_progress.total} días
            </Kicker>
            {workout.has_workout ? (
              <>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{workout.day_name}</div>
                <div style={{ fontSize: 13, color: accent, fontWeight: 600, marginBottom: 8 }}>{workout.day_focus}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {workout.exercises.slice(0, 5).map((ex, i) => (
                    <span key={i} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, backgroundColor: c.chip, color: textColor }}>
                      {ex.name}
                    </span>
                  ))}
                  {workout.exercises.length > 5 && (
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, backgroundColor: c.chip, color: sub }}>
                      +{workout.exercises.length - 5} más
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div style={{ color: sub, fontSize: 14 }}>Semana completa — descansa o haz movilidad.</div>
            )}
          </div>
        )}

        {/* Quick actions */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {workout?.has_workout && (
            <button
              onClick={() => sendFollowUpMessage("Muéstrame el entrenamiento de hoy con cal_todays_workout")}
              style={primaryButtonStyle(c, { flex: true })}
            >
              Empezar sesión
            </button>
          )}
          <button
            onClick={() => sendFollowUpMessage("Registra mi comida — describe lo que comí o comparte una foto")}
            style={ghostButtonStyle(c, { flex: true })}
          >
            Registrar comida
          </button>
          <button
            onClick={() => sendFollowUpMessage("Dame recomendaciones para completar mis metas de nutrición y entrenamiento de hoy")}
            style={ghostButtonStyle(c)}
          >
            Consejos
          </button>
        </div>
      </div>
    </McpUseProvider>
  );
}
