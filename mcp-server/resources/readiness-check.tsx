import { McpUseProvider, useWidget, useWidgetTheme, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";

export const propsSchema = z.object({
  score: z.number(),
  label: z.string(),
  factors: z.array(z.string()),
  recommendations: z.array(z.string()),
  sessions_this_week: z.number(),
  weekly_goal: z.number(),
  already_trained_today: z.boolean(),
  days_since_last_workout: z.number().nullable(),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Readiness check: score gauge, factors, and recommendations to decide whether/how to train today",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;

function ReadinessGauge({ score }: { score: number }) {
  const color = score >= 8 ? "#22c55e" : score >= 5 ? "#f59e0b" : "#ef4444";
  const size = 96;
  const strokeWidth = 10;
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 10) * circ;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color + "33"} strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color}
          strokeWidth={strokeWidth} strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round" style={{ transition: "stroke-dasharray 0.5s" }}
        />
        <text
          x={size / 2} y={size / 2 - 6}
          textAnchor="middle" dominantBaseline="middle" fill={color}
          fontSize={26} fontWeight={800}
          style={{ transform: "rotate(90deg)", transformOrigin: `${size / 2}px ${size / 2}px` }}
        >
          {score}
        </text>
        <text
          x={size / 2} y={size / 2 + 14}
          textAnchor="middle" dominantBaseline="middle" fill={color}
          fontSize={10} fontWeight={600}
          style={{ transform: "rotate(90deg)", transformOrigin: `${size / 2}px ${size / 2}px` }}
        >
          /10
        </text>
      </svg>
    </div>
  );
}

export default function ReadinessCheck() {
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
  const theme = useWidgetTheme();
  const dark = theme === "dark";

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div style={{ padding: 16, color: dark ? "#e0e0e0" : "#333" }}>Evaluando tu estado…</div>
      </McpUseProvider>
    );
  }

  const bg = dark ? "#1a1a1a" : "#ffffff";
  const card = dark ? "#242424" : "#f8f8f8";
  const border = dark ? "#333" : "#e8e8e8";
  const textColor = dark ? "#e0e0e0" : "#1a1a1a";
  const sub = dark ? "#888" : "#666";
  const accent = "#6366f1";

  const { score, label, factors, recommendations, sessions_this_week, weekly_goal, already_trained_today, days_since_last_workout } = props;

  const scoreColor = score >= 8 ? "#22c55e" : score >= 5 ? "#f59e0b" : "#ef4444";
  const bgLabel = score >= 8 ? "#22c55e18" : score >= 5 ? "#f59e0b18" : "#ef444418";

  return (
    <McpUseProvider autoSize>
      <div style={{ padding: 16, backgroundColor: bg, color: textColor, fontFamily: "system-ui, sans-serif", maxWidth: 420 }}>

        {/* Header: gauge + label */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
          <ReadinessGauge score={score} />
          <div>
            <div style={{
              fontSize: 15, fontWeight: 800, color: scoreColor,
              backgroundColor: bgLabel, borderRadius: 8,
              padding: "4px 10px", display: "inline-block", marginBottom: 6,
            }}>
              {label}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {weekly_goal > 0 && (
                <div style={{ fontSize: 11, color: sub }}>
                  {sessions_this_week}/{weekly_goal} sesiones esta semana
                </div>
              )}
              {already_trained_today && (
                <div style={{ fontSize: 11, color: "#22c55e" }}>✅ Ya entrenaste hoy</div>
              )}
              {days_since_last_workout !== null && !already_trained_today && (
                <div style={{ fontSize: 11, color: sub }}>
                  {days_since_last_workout === 0 ? "Entrenaste hoy" : `${days_since_last_workout}d desde último entreno`}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Factors */}
        {factors.length > 0 && (
          <div style={{ backgroundColor: card, borderRadius: 10, padding: "10px 14px", marginBottom: 10, border: `1px solid ${border}` }}>
            <div style={{ fontSize: 10, color: sub, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
              Factores
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {factors.map((f, i) => (
                <div key={i} style={{ fontSize: 12, color: textColor }}>{f}</div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div style={{ backgroundColor: card, borderRadius: 10, padding: "10px 14px", marginBottom: 12, border: `1px solid ${border}` }}>
            <div style={{ fontSize: 10, color: sub, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
              Recomendaciones
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {recommendations.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
                  <span style={{ color: accent, fontSize: 12, marginTop: 1 }}>›</span>
                  <span style={{ fontSize: 12, color: textColor }}>{r}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Follow-up button */}
        <button
          onClick={() => sendFollowUpMessage("¿Qué entreno hoy? Usa cal_todays_workout para mostrarme el entrenamiento del día")}
          style={{
            width: "100%", padding: "9px 14px", borderRadius: 8,
            backgroundColor: accent, color: "#fff",
            fontWeight: 700, fontSize: 13, border: "none", cursor: "pointer",
          }}
        >
          🏋️ ¿Qué entreno hoy?
        </button>
      </div>
    </McpUseProvider>
  );
}
