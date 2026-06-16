import { McpUseProvider, useWidget, useWidgetTheme, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";

export const propsSchema = z.object({
  weeks: z.number(),
  scheduled: z.number(),
  completed: z.number(),
  completion_pct: z.number(),
  day_completion: z.array(
    z.object({
      day_id: z.string(),
      day_name: z.string(),
      day_focus: z.string(),
      expected: z.number(),
      actual: z.number(),
      completion_pct: z.number(),
      missed: z.number(),
    })
  ),
  neglected_exercises: z.array(z.object({ id: z.string(), name: z.string() })),
  muscle_volume: z.array(z.object({ muscle: z.string(), total_sets: z.number() })),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Gap analysis: completion ring, day-by-day breakdown, neglected exercises, and muscle volume",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;

function CompletionRing({ pct }: { pct: number }) {
  const color = pct >= 75 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#ef4444";
  const size = 96;
  const strokeWidth = 10;
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(pct, 100) / 100) * circ;

  return (
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
        fontSize={22} fontWeight={800}
        style={{ transform: "rotate(90deg)", transformOrigin: `${size / 2}px ${size / 2}px` }}
      >
        {Math.round(pct)}%
      </text>
      <text
        x={size / 2} y={size / 2 + 14}
        textAnchor="middle" dominantBaseline="middle" fill={color}
        fontSize={9} fontWeight={500}
        style={{ transform: "rotate(90deg)", transformOrigin: `${size / 2}px ${size / 2}px` }}
      >
        completado
      </text>
    </svg>
  );
}

function DayBar({ actual, expected, color }: { actual: number; expected: number; color: string }) {
  const pct = expected > 0 ? Math.min(actual / expected, 1) : 0;
  const W = 72;
  const H = 6;
  return (
    <svg width={W} height={H} style={{ borderRadius: 3, overflow: "hidden" }}>
      <rect x={0} y={0} width={W} height={H} rx={3} fill={color + "33"} />
      <rect x={0} y={0} width={pct * W} height={H} rx={3} fill={color} />
    </svg>
  );
}

export default function GapAnalysis() {
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
  const theme = useWidgetTheme();
  const dark = theme === "dark";

  if (isPending) {
    return (
      <McpUseProvider autoSize>
        <div style={{ padding: 16, color: dark ? "#e0e0e0" : "#333" }}>Analizando constancia…</div>
      </McpUseProvider>
    );
  }

  const bg = dark ? "#1a1a1a" : "#ffffff";
  const card = dark ? "#242424" : "#f8f8f8";
  const border = dark ? "#333" : "#e8e8e8";
  const textColor = dark ? "#e0e0e0" : "#1a1a1a";
  const sub = dark ? "#888" : "#666";
  const accent = "#6366f1";

  const { weeks, scheduled, completed, completion_pct, day_completion, neglected_exercises, muscle_volume } = props;

  const ringColor = completion_pct >= 75 ? "#22c55e" : completion_pct >= 50 ? "#f59e0b" : "#ef4444";

  // Derive consistency trend from completion_pct
  const trendLabel = completion_pct >= 75 ? "mejorando" : completion_pct >= 50 ? "estable" : "bajando";
  const trendColor = completion_pct >= 75 ? "#22c55e" : completion_pct >= 50 ? "#f59e0b" : "#ef4444";
  const trendEmoji = completion_pct >= 75 ? "📈" : completion_pct >= 50 ? "➡️" : "📉";

  // Sort days by completion_pct asc (worst first)
  const sortedDays = [...day_completion].sort((a, b) => a.completion_pct - b.completion_pct);

  function dayColor(pct: number) {
    return pct >= 75 ? "#22c55e" : pct >= 50 ? "#f59e0b" : pct > 0 ? "#f97316" : "#ef4444";
  }

  return (
    <McpUseProvider autoSize>
      <div style={{ padding: 16, backgroundColor: bg, color: textColor, fontFamily: "system-ui, sans-serif", maxWidth: 420 }}>

        {/* Header row: ring + summary */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
          <CompletionRing pct={completion_pct} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>
              Análisis · últimas {weeks} semanas
            </div>
            <div style={{ fontSize: 12, color: sub, marginBottom: 6 }}>
              {completed} sesiones de {scheduled} esperadas
            </div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              fontSize: 11, fontWeight: 700, color: trendColor,
              backgroundColor: trendColor + "18", borderRadius: 6, padding: "3px 8px",
            }}>
              {trendEmoji} Tendencia: {trendLabel}
            </div>
          </div>
        </div>

        {/* Day completion breakdown */}
        {sortedDays.length > 0 && (
          <div style={{ backgroundColor: card, borderRadius: 10, padding: "10px 14px", marginBottom: 10, border: `1px solid ${border}` }}>
            <div style={{ fontSize: 10, color: sub, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
              Días por sesión
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sortedDays.map((d) => {
                const dc = dayColor(d.completion_pct);
                return (
                  <div key={d.day_id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 26, fontSize: 10, fontWeight: 700, color: dc, textTransform: "uppercase" }}>
                      {d.day_id}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: textColor, marginBottom: 3 }}>
                        {d.day_name}
                        {d.day_focus ? <span style={{ color: sub }}> · {d.day_focus}</span> : null}
                      </div>
                      <DayBar actual={d.actual} expected={d.expected} color={dc} />
                    </div>
                    <div style={{ fontSize: 11, color: sub, minWidth: 44, textAlign: "right" }}>
                      {d.actual}/{d.expected}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: dc, minWidth: 34, textAlign: "right" }}>
                      {d.completion_pct}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Neglected exercises */}
        {neglected_exercises.length > 0 && (
          <div style={{ backgroundColor: card, borderRadius: 10, padding: "10px 14px", marginBottom: 10, border: `1px solid ${border}` }}>
            <div style={{ fontSize: 10, color: sub, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
              ⚠️ Ejercicios sin registrar
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {neglected_exercises.slice(0, 8).map((e) => (
                <span key={e.id} style={{
                  fontSize: 11, padding: "3px 8px", borderRadius: 10,
                  backgroundColor: dark ? "#3a2020" : "#fff0f0",
                  color: "#ef4444", border: "1px solid #ef444433",
                }}>
                  {e.name}
                </span>
              ))}
              {neglected_exercises.length > 8 && (
                <span style={{ fontSize: 11, color: sub, padding: "3px 8px" }}>
                  +{neglected_exercises.length - 8} más
                </span>
              )}
            </div>
          </div>
        )}

        {/* Muscle volume mini-bars */}
        {muscle_volume.length > 0 && (
          <div style={{ backgroundColor: card, borderRadius: 10, padding: "10px 14px", marginBottom: 12, border: `1px solid ${border}` }}>
            <div style={{ fontSize: 10, color: sub, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
              Volumen por músculo
            </div>
            {(() => {
              const maxSets = Math.max(...muscle_volume.map((m) => m.total_sets), 1);
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {muscle_volume.slice(0, 6).map((m) => {
                    const barPct = m.total_sets / maxSets;
                    return (
                      <div key={m.muscle} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 80, fontSize: 11, color: sub, flexShrink: 0 }}>{m.muscle}</div>
                        <div style={{ flex: 1, height: 6, backgroundColor: dark ? "#333" : "#e8e8e8", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${barPct * 100}%`, backgroundColor: accent, borderRadius: 3 }} />
                        </div>
                        <div style={{ fontSize: 10, color: sub, minWidth: 30, textAlign: "right" }}>{m.total_sets}s</div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* Follow-up button */}
        <button
          onClick={() => sendFollowUpMessage("Ayúdame a recuperar el ritmo: ¿qué debo hacer esta semana para ponerme al día con mi programa?")}
          style={{
            width: "100%", padding: "9px 14px", borderRadius: 8,
            backgroundColor: accent, color: "#fff",
            fontWeight: 700, fontSize: 13, border: "none", cursor: "pointer",
          }}
        >
          📅 Ayúdame a recuperar el ritmo
        </button>
      </div>
    </McpUseProvider>
  );
}
