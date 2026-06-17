import { McpUseProvider, useWidget, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";
import { useAppColors, FONT } from "./lib/theme";
import { WidgetLoading } from "./lib/ui";

const exerciseSchema = z.object({
  name: z.string(),
  reps: z.string().nullable(),
});

const configSchema = z.object({
  work_seconds: z.number().nullable(),
  rest_seconds: z.number().nullable(),
  rest_between_exercises: z.number().nullable(),
  rest_between_rounds: z.number().nullable(),
}).nullable();

const propsSchema = z.object({
  circuit_name: z.string(),
  mode: z.enum(["circuit", "timed"]),
  rounds_completed: z.number(),
  rounds_target: z.number(),
  duration_seconds: z.number(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  note: z.string().nullable(),
  exercises: z.array(exerciseSchema),
  config: configSchema,
});

export const widgetMetadata: WidgetMetadata = {
  description: "Result card for a completed circuit or HIIT session: name, mode badge, duration, rounds, exercises list, and timing config",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;

// Accent colour per mode — resolved against the live palette
function getModeColor(mode: string, c: ReturnType<typeof useAppColors>): string {
  if (mode === "circuit") return c.lime;
  if (mode === "timed") return c.kcal; // orange (#f97316) — HIIT/Tabata
  return c.lime;
}

const MODE_LABELS: Record<string, string> = {
  circuit: "Circuit",
  timed: "HIIT",
};

const MODE_ICONS: Record<string, string> = {
  circuit: "⚡",
  timed: "🔥",
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

// Circular progress ring for rounds completion
function RoundsRing({ completed, target, color }: { completed: number; target: number; color: string }) {
  const size = 52;
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const pct = target > 0 ? Math.min(completed / target, 1) : 0;
  const dash = pct * circ;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color + "33"} strokeWidth={8} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={8}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
        />
        <text
          x={size / 2} y={size / 2}
          textAnchor="middle" dominantBaseline="middle"
          fill={color} fontSize={11} fontWeight={800}
          style={{ transform: "rotate(90deg)", transformOrigin: `${size / 2}px ${size / 2}px` }}
        >
          {completed}/{target}
        </text>
      </svg>
      <span style={{ fontSize: 9, color: color }}>rondas</span>
    </div>
  );
}

// Pill badge for mode
function ModeBadge({ mode, color }: { mode: string; color: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 10px", borderRadius: 20,
      backgroundColor: color + "22", border: `1px solid ${color}55`,
      color: color, fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
    }}>
      {MODE_ICONS[mode] ?? "⚙"} {MODE_LABELS[mode] ?? mode.toUpperCase()}
    </span>
  );
}

export default function CircuitResult() {
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
  const c = useAppColors();

  if (isPending) {
    return <WidgetLoading text="Cargando circuito…" />;
  }

  const {
    circuit_name,
    mode,
    rounds_completed,
    rounds_target,
    duration_seconds,
    started_at,
    note,
    exercises,
    config,
  } = props;

  const accent = getModeColor(mode, c);

  return (
    <McpUseProvider autoSize>
      <div style={{ padding: 16, backgroundColor: c.bg, color: c.text, fontFamily: FONT, maxWidth: 480 }}>

        {/* ── Header: name + mode badge ── */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
            <div style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.2, flex: 1 }}>{circuit_name}</div>
            <ModeBadge mode={mode} color={accent} />
          </div>
          <div style={{ fontSize: 11, color: c.sub }}>{formatDate(started_at)}</div>
        </div>

        {/* ── Stats row: duration + rounds ring ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          backgroundColor: c.card, borderRadius: 10, padding: "12px 16px",
          border: `1px solid ${c.border}`, marginBottom: 12,
        }}>
          {/* Duration block */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: c.sub, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Duración</div>
            <div style={{ fontWeight: 800, fontSize: 26, color: accent }}>{formatDuration(duration_seconds)}</div>
          </div>

          {/* Rounds ring */}
          <RoundsRing completed={rounds_completed} target={rounds_target} color={accent} />

          {/* Timing config quick-view for timed mode */}
          {config && (config.work_seconds != null || config.rest_seconds != null) && (
            <div style={{ textAlign: "center" }}>
              {config.work_seconds != null && (
                <div style={{ fontSize: 13, fontWeight: 700, color: c.text }}>{config.work_seconds}s</div>
              )}
              {config.rest_seconds != null && (
                <div style={{ fontSize: 13, fontWeight: 700, color: c.sub }}>/{config.rest_seconds}s</div>
              )}
              <div style={{ fontSize: 9, color: c.sub, marginTop: 2 }}>on/off</div>
            </div>
          )}
        </div>

        {/* ── Session note ── */}
        {note && (
          <div style={{
            backgroundColor: accent + "11", borderLeft: `3px solid ${accent}`,
            borderRadius: "0 8px 8px 0", padding: "8px 12px", marginBottom: 12,
            fontSize: 12, color: c.text, fontStyle: "italic",
          }}>
            {note}
          </div>
        )}

        {/* ── Exercises list ── */}
        {exercises.length > 0 && (
          <div style={{
            backgroundColor: c.card, borderRadius: 10,
            border: `1px solid ${c.border}`, marginBottom: 14, overflow: "hidden",
          }}>
            <div style={{ fontSize: 10, color: c.sub, textTransform: "uppercase", letterSpacing: 1, padding: "10px 14px 6px" }}>
              Ejercicios · {exercises.length}
            </div>
            {exercises.map((ex, i) => (
              <div
                key={i}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "7px 14px",
                  backgroundColor: i % 2 === 1 ? c.raised : "transparent",
                  borderTop: i === 0 ? `1px solid ${c.border}` : "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: "50%",
                    backgroundColor: accent + "22", color: accent,
                    fontSize: 10, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    {i + 1}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{ex.name}</span>
                </div>
                {ex.reps && (
                  <span style={{ fontSize: 11, color: c.sub, marginLeft: 8, whiteSpace: "nowrap" }}>
                    {ex.reps}
                  </span>
                )}
              </div>
            ))}

            {/* Timing config detail for timed/HIIT */}
            {config && mode === "timed" && (config.rest_between_exercises != null || config.rest_between_rounds != null) && (
              <div style={{
                padding: "8px 14px", borderTop: `1px solid ${c.border}`,
                display: "flex", gap: 16, flexWrap: "wrap",
              }}>
                {config.rest_between_exercises != null && config.rest_between_exercises > 0 && (
                  <span style={{ fontSize: 11, color: c.sub }}>⏱ Descanso entre ejercicios: {config.rest_between_exercises}s</span>
                )}
                {config.rest_between_rounds != null && config.rest_between_rounds > 0 && (
                  <span style={{ fontSize: 11, color: c.sub }}>⏱ Descanso entre rondas: {config.rest_between_rounds}s</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Follow-up button ── */}
        <button
          onClick={() => sendFollowUpMessage("🔥 Ver mis estadísticas de circuitos con cal_circuit_stats")}
          style={{
            width: "100%", padding: "9px 12px", borderRadius: 8,
            border: `1px solid ${c.border}`, backgroundColor: "transparent",
            color: c.text, fontSize: 12, cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          🔥 Ver mis estadísticas de circuitos
        </button>

      </div>
    </McpUseProvider>
  );
}
