import { McpUseProvider, useWidget, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";
import { useAppColors, FONT, FONT_DISPLAY, trafficColor } from "./lib/theme";
import { WidgetLoading, Kicker, DisplayTitle, primaryButtonStyle } from "./lib/ui";
import { WidgetFonts } from "./lib/fonts";

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
  // True when the current phase has no scheduled days (e.g. phase/program
  // mismatch) — `scheduled` is 0 in that case and completion_pct is
  // meaningless, so the widget shows a dedicated neutral state instead of
  // "N sesiones de 0 esperadas · 0% · bajando".
  no_schedule: z.boolean().optional(),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Gap analysis: completion ring, day-by-day breakdown, neglected exercises, and muscle volume",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;

function CompletionRing({ pct, color }: { pct: number; color: string }) {
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
        fontFamily={FONT_DISPLAY} fontSize={26} fontWeight={400}
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
  const c = useAppColors();

  if (isPending) {
    return <WidgetLoading text="Analizando constancia…" />;
  }

  const { weeks, scheduled, completed, completion_pct, day_completion, neglected_exercises, muscle_volume, no_schedule } = props;

  // Dedicated state: no scheduled days for this phase — a 0% ring and
  // "bajando" trend badge would be misleading noise, not a real signal.
  if (no_schedule) {
    return (
      <McpUseProvider autoSize>
        <WidgetFonts />
        <div style={{ padding: 16, backgroundColor: c.bg, color: c.text, fontFamily: FONT, maxWidth: 420 }}>
          <Kicker>Análisis · últimas {weeks} semanas</Kicker>
          <DisplayTitle size={26} style={{ marginTop: 2, marginBottom: 10 }}>Sin días programados</DisplayTitle>
          <div style={{ fontSize: 13, color: c.sub, marginBottom: 14 }}>
            Esta fase no tiene días programados en el programa activo, así que no se puede calcular una adherencia.
          </div>
          <div style={{ backgroundColor: c.card, borderRadius: 8, padding: "10px 14px", border: `1px solid ${c.border}`, marginBottom: 14 }}>
            <Kicker style={{ marginBottom: 2 }}>Sesiones registradas</Kicker>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 400, fontSize: 28 }}>{completed}</div>
          </div>
          <button
            onClick={() => sendFollowUpMessage("Revisa mi fase y programa actual — algo no cuadra en el análisis de constancia")}
            style={{ ...primaryButtonStyle(c), width: "100%" }}
          >
            Revisar programa y fase
          </button>
        </div>
      </McpUseProvider>
    );
  }

  const ringColor = trafficColor(completion_pct, 50, 75, c);

  // Derive consistency trend from completion_pct
  const trendLabel = completion_pct >= 75 ? "mejorando" : completion_pct >= 50 ? "estable" : "bajando";
  const trendColor = trafficColor(completion_pct, 50, 75, c);

  // Sort days by completion_pct asc (worst first)
  const sortedDays = [...day_completion].sort((a, b) => a.completion_pct - b.completion_pct);

  return (
    <McpUseProvider autoSize>
      <WidgetFonts />
      <div style={{ padding: 16, backgroundColor: c.bg, color: c.text, fontFamily: FONT, maxWidth: 420 }}>

        {/* Header row: ring + summary */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
          <CompletionRing pct={completion_pct} color={ringColor} />
          <div style={{ flex: 1 }}>
            <Kicker style={{ marginBottom: 4 }}>Análisis · últimas {weeks} semanas</Kicker>
            <div style={{ fontSize: 12, color: c.sub, marginBottom: 6 }}>
              {completed} sesiones de {scheduled} esperadas
            </div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              fontSize: 11, fontWeight: 700, color: trendColor,
              backgroundColor: trendColor + "18", borderRadius: 6, padding: "3px 8px",
            }}>
              Tendencia: {trendLabel}
            </div>
          </div>
        </div>

        {/* Day completion breakdown */}
        {sortedDays.length > 0 && (
          <div style={{ backgroundColor: c.card, borderRadius: 8, padding: "10px 14px", marginBottom: 10, border: `1px solid ${c.border}` }}>
            <Kicker style={{ marginBottom: 10 }}>Días por sesión</Kicker>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sortedDays.map((d) => {
                const dc = trafficColor(d.completion_pct, 50, 75, c);
                return (
                  <div key={d.day_id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 26, fontSize: 10, fontWeight: 700, color: dc, textTransform: "uppercase" }}>
                      {d.day_id}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: c.text, marginBottom: 3 }}>
                        {d.day_name}
                        {d.day_focus ? <span style={{ color: c.sub }}> · {d.day_focus}</span> : null}
                      </div>
                      <DayBar actual={d.actual} expected={d.expected} color={dc} />
                    </div>
                    <div style={{ fontSize: 11, color: c.sub, minWidth: 44, textAlign: "right" }}>
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
          <div style={{ backgroundColor: c.card, borderRadius: 8, padding: "10px 14px", marginBottom: 10, border: `1px solid ${c.border}` }}>
            <Kicker style={{ marginBottom: 8 }}>Ejercicios sin registrar</Kicker>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {neglected_exercises.slice(0, 8).map((e) => (
                <span key={e.id} style={{
                  fontSize: 11, padding: "3px 8px", borderRadius: 10,
                  backgroundColor: c.dangerSoft,
                  color: c.danger, border: `1px solid ${c.danger}33`,
                }}>
                  {e.name}
                </span>
              ))}
              {neglected_exercises.length > 8 && (
                <span style={{ fontSize: 11, color: c.sub, padding: "3px 8px" }}>
                  +{neglected_exercises.length - 8} más
                </span>
              )}
            </div>
          </div>
        )}

        {/* Muscle volume mini-bars */}
        {muscle_volume.length > 0 && (
          <div style={{ backgroundColor: c.card, borderRadius: 8, padding: "10px 14px", marginBottom: 12, border: `1px solid ${c.border}` }}>
            <Kicker style={{ marginBottom: 8 }}>Volumen por músculo</Kicker>
            {(() => {
              const maxSets = Math.max(...muscle_volume.map((m) => m.total_sets), 1);
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {muscle_volume.slice(0, 6).map((m) => {
                    const barPct = m.total_sets / maxSets;
                    return (
                      <div key={m.muscle} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 80, fontSize: 11, color: c.sub, flexShrink: 0 }}>{m.muscle}</div>
                        <div style={{ flex: 1, height: 6, backgroundColor: c.chip, borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${barPct * 100}%`, backgroundColor: c.lime, borderRadius: 3 }} />
                        </div>
                        <div style={{ fontSize: 10, color: c.sub, minWidth: 30, textAlign: "right" }}>{m.total_sets}s</div>
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
          style={{ ...primaryButtonStyle(c), width: "100%" }}
        >
          Ayúdame a recuperar el ritmo
        </button>
      </div>
    </McpUseProvider>
  );
}
