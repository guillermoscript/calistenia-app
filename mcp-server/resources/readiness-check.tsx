import { McpUseProvider, useWidget, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";
import { useAppColors, FONT, trafficColor } from "./lib/theme";
import { WidgetLoading } from "./lib/ui";

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
  const c = useAppColors();
  const color = trafficColor(score, 5, 8, c);
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
  const c = useAppColors();

  if (isPending) {
    return <WidgetLoading text="Evaluando tu estado…" />;
  }

  const { score, label, factors, recommendations, sessions_this_week, weekly_goal, already_trained_today, days_since_last_workout } = props;

  const scoreColor = trafficColor(score, 5, 8, c);
  const bgLabel = score >= 8 ? c.limeSoft : score >= 5 ? c.warn + "22" : c.dangerSoft;

  return (
    <McpUseProvider autoSize>
      <div style={{ padding: 16, backgroundColor: c.bg, color: c.text, fontFamily: FONT, maxWidth: 420 }}>

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
                <div style={{ fontSize: 11, color: c.sub }}>
                  {sessions_this_week}/{weekly_goal} sesiones esta semana
                </div>
              )}
              {already_trained_today && (
                <div style={{ fontSize: 11, color: c.success }}>✅ Ya entrenaste hoy</div>
              )}
              {days_since_last_workout !== null && !already_trained_today && (
                <div style={{ fontSize: 11, color: c.sub }}>
                  {days_since_last_workout === 0 ? "Entrenaste hoy" : `${days_since_last_workout}d desde último entreno`}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Factors */}
        {factors.length > 0 && (
          <div style={{ backgroundColor: c.card, borderRadius: 10, padding: "10px 14px", marginBottom: 10, border: `1px solid ${c.border}` }}>
            <div style={{ fontSize: 10, color: c.sub, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
              Factores
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {factors.map((f, i) => (
                <div key={i} style={{ fontSize: 12, color: c.text }}>{f}</div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div style={{ backgroundColor: c.card, borderRadius: 10, padding: "10px 14px", marginBottom: 12, border: `1px solid ${c.border}` }}>
            <div style={{ fontSize: 10, color: c.sub, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
              Recomendaciones
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {recommendations.map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
                  <span style={{ color: c.lime, fontSize: 12, marginTop: 1 }}>›</span>
                  <span style={{ fontSize: 12, color: c.text }}>{r}</span>
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
            backgroundColor: c.lime, color: c.limeText,
            fontWeight: 700, fontSize: 13, border: "none", cursor: "pointer",
          }}
        >
          🏋️ ¿Qué entreno hoy?
        </button>
      </div>
    </McpUseProvider>
  );
}
