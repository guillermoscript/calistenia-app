import { McpUseProvider, useWidget, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";
import { useAppColors, FONT, FONT_DISPLAY } from "./lib/theme";
import { WidgetLoading, Kicker, DisplayTitle, primaryButtonStyle, ghostButtonStyle } from "./lib/ui";
import { WidgetFonts } from "./lib/fonts";

// ── Schema ────────────────────────────────────────────────────────────────────

const setSchema = z.object({
  reps: z.string(),
  note: z.string().optional(),
});

export const propsSchema = z.object({
  exercise_id: z.string(),
  exercise_name: z.string().optional(),
  days: z.number(),
  total_sets: z.number(),
  sessions: z.array(
    z.object({
      date: z.string(),
      sets: z.array(setSchema),
    })
  ),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Exercise progression chart and session-by-session set history",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;

// ── Rep parsing ───────────────────────────────────────────────────────────────

/** Parse the leading integer from a reps string: "10" → 10, "8-10" → 8, "30s" → 30, "5 + 3 negatives" → 5, unparseable → null */
function parseReps(reps: string): number | null {
  const m = reps.match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return isNaN(n) ? null : n;
}

/** Max parsed reps across a session's sets, or null if none parseable */
function sessionMax(sets: { reps: string }[]): number | null {
  let best: number | null = null;
  for (const s of sets) {
    const v = parseReps(s.reps);
    if (v !== null && (best === null || v > best)) best = v;
  }
  return best;
}

// ── Chart constants ───────────────────────────────────────────────────────────

const W = 440;
const H = 160;
const PAD = { l: 34, r: 12, t: 12, b: 22 };

// ── ProgressionLine component ─────────────────────────────────────────────────

function ProgressionLine({
  sessions,
  stroke,
  grid,
  sub,
}: {
  sessions: Props["sessions"];
  stroke: string;
  grid: string;
  sub: string;
}) {
  // Build chart points — only sessions with parseable reps
  const points = sessions
    .map((s) => ({ date: s.date, value: sessionMax(s.sets) }))
    .filter((p): p is { date: string; value: number } => p.value !== null);

  if (points.length < 2) {
    return (
      <div style={{ padding: 28, textAlign: "center", color: sub, fontSize: 13 }}>
        Necesitas al menos 2 sesiones con datos numéricos para ver la progresión.
      </div>
    );
  }

  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  const values = points.map((p) => p.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const span = Math.max(rawMax - rawMin, 1);
  const lo = rawMin - span * 0.1;
  const hi = rawMax + span * 0.1;

  const x = (i: number) => PAD.l + (i / (points.length - 1)) * innerW;
  const y = (v: number) => PAD.t + innerH - ((v - lo) / (hi - lo)) * innerH;

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(" ");
  const area = `${path} L ${x(points.length - 1).toFixed(1)} ${(PAD.t + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(PAD.t + innerH).toFixed(1)} Z`;

  const ticks = [hi, (hi + lo) / 2, lo];

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      {ticks.map((t, i) => {
        const yy = PAD.t + (i / (ticks.length - 1)) * innerH;
        return (
          <g key={i}>
            <line x1={PAD.l} y1={yy} x2={W - PAD.r} y2={yy} stroke={grid} strokeWidth={1} />
            <text x={PAD.l - 5} y={yy + 3} textAnchor="end" fontSize={9} fill={sub}>
              {Math.round(t)}
            </text>
          </g>
        );
      })}

      <path d={area} fill={stroke} opacity={0.12} />
      <path d={path} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.value)} r={3} fill={stroke} />
      ))}

      {/* Date labels: first and last */}
      <text x={x(0)} y={H - 6} textAnchor="start" fontSize={9} fill={sub}>
        {points[0].date.slice(5)}
      </text>
      <text x={x(points.length - 1)} y={H - 6} textAnchor="end" fontSize={9} fill={sub}>
        {points[points.length - 1].date.slice(5)}
      </text>

      {/* Highlight best point */}
      {(() => {
        const bestIdx = values.indexOf(Math.max(...values));
        return (
          <text
            x={x(bestIdx)}
            y={y(points[bestIdx].value) - 6}
            textAnchor="middle"
            fontSize={9}
            fontWeight={700}
            fill={stroke}
          >
            {points[bestIdx].value}
          </text>
        );
      })()}
    </svg>
  );
}

// ── SetChip component ─────────────────────────────────────────────────────────

function SetChip({
  reps,
  chipBg,
  textColor,
}: {
  reps: string;
  chipBg: string;
  textColor: string;
}) {
  return (
    <span
      style={{
        fontSize: 11,
        padding: "2px 7px",
        borderRadius: 10,
        backgroundColor: chipBg,
        color: textColor,
        display: "inline-block",
      }}
    >
      {reps}
    </span>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────

export default function ExerciseHistory() {
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
  const c = useAppColors();

  if (isPending) {
    return <WidgetLoading text="Cargando historial…" />;
  }

  const { exercise_id, exercise_name, days, total_sets, sessions } = props;

  const displayName = exercise_name ?? exercise_id;
  const sessionCount = sessions.length;

  // Compute overall best parsed rep value
  const bestRep = sessions.reduce<number | null>((best, s) => {
    const m = sessionMax(s.sets);
    if (m === null) return best;
    return best === null || m > best ? m : best;
  }, null);

  // Date range
  const firstDate = sessions.length > 0 ? sessions[0].date : null;
  const lastDate = sessions.length > 0 ? sessions[sessions.length - 1].date : null;

  // Recent sessions to show in list (most recent first, cap at 8)
  const recentSessions = [...sessions].reverse().slice(0, 8);

  const hasChart = sessions.length >= 2;

  return (
    <McpUseProvider autoSize>
      <WidgetFonts />
      <div
        style={{
          padding: 16,
          backgroundColor: c.bg,
          color: c.text,
          fontFamily: FONT,
          maxWidth: 480,
        }}
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <div style={{ marginBottom: 8 }}>
          <Kicker>Últimos {days} días</Kicker>
          <DisplayTitle size={24} style={{ marginTop: 2 }}>{displayName}</DisplayTitle>
        </div>

        {/* ── Stats row ───────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div
            style={{
              flex: 1,
              backgroundColor: c.card,
              borderRadius: 8,
              padding: "8px 10px",
              border: `1px solid ${c.border}`,
            }}
          >
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 400, fontSize: 22, color: c.lime }}>{total_sets}</div>
            <div style={{ fontSize: 10, color: c.sub }}>series totales</div>
          </div>
          <div
            style={{
              flex: 1,
              backgroundColor: c.card,
              borderRadius: 8,
              padding: "8px 10px",
              border: `1px solid ${c.border}`,
            }}
          >
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 400, fontSize: 22, color: c.lime }}>{sessionCount}</div>
            <div style={{ fontSize: 10, color: c.sub }}>sesiones</div>
          </div>
          {bestRep !== null && (
            <div
              style={{
                flex: 1,
                backgroundColor: c.card,
                borderRadius: 8,
                padding: "8px 10px",
                border: `1px solid ${c.border}`,
              }}
            >
              <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 400, fontSize: 22, color: c.lime }}>
                {bestRep}
              </div>
              <div style={{ fontSize: 10, color: c.sub }}>mejor marca</div>
            </div>
          )}
        </div>

        {/* Date range sub-label */}
        {firstDate && lastDate && firstDate !== lastDate && (
          <div style={{ fontSize: 11, color: c.sub, marginBottom: 10 }}>
            {firstDate} → {lastDate}
          </div>
        )}

        {/* ── Progression chart ───────────────────────────────────── */}
        {hasChart ? (
          <div
            style={{
              backgroundColor: c.card,
              borderRadius: 8,
              padding: "12px 10px 8px",
              border: `1px solid ${c.border}`,
              marginBottom: 12,
            }}
          >
            <div style={{ paddingLeft: 4, marginBottom: 6 }}>
              <Kicker>Progresión — máx. reps por sesión</Kicker>
            </div>
            <ProgressionLine sessions={sessions} stroke={c.lime} grid={c.grid} sub={c.sub} />
          </div>
        ) : (
          <div
            style={{
              backgroundColor: c.card,
              borderRadius: 8,
              padding: 12,
              border: `1px solid ${c.border}`,
              marginBottom: 12,
              fontSize: 13,
              color: c.sub,
              textAlign: "center",
            }}
          >
            {sessionCount === 0
              ? "Sin sesiones registradas en este periodo."
              : "Con 2 o más sesiones aparecerá el gráfico de progresión. Sigue entrenando."}
          </div>
        )}

        {/* ── Session list ─────────────────────────────────────────── */}
        {recentSessions.length > 0 && (
          <div
            style={{
              backgroundColor: c.card,
              borderRadius: 8,
              border: `1px solid ${c.border}`,
              overflow: "hidden",
              marginBottom: 12,
            }}
          >
            <div
              style={{
                padding: "8px 12px 6px",
                borderBottom: `1px solid ${c.border}`,
              }}
            >
              <Kicker>Sesiones recientes</Kicker>
            </div>
            {recentSessions.map((session, idx) => (
              <div
                key={session.date}
                style={{
                  padding: "8px 12px",
                  borderBottom:
                    idx < recentSessions.length - 1 ? `1px solid ${c.border}` : "none",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: c.sub,
                    marginBottom: 4,
                    fontWeight: 600,
                  }}
                >
                  {session.date}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {session.sets.map((s, si) => (
                    <SetChip key={si} reps={s.reps} chipBg={c.chip} textColor={c.text} />
                  ))}
                </div>
                {/* Show notes if any */}
                {session.sets.some((s) => s.note) && (
                  <div style={{ fontSize: 11, color: c.sub, marginTop: 4, fontStyle: "italic" }}>
                    {session.sets
                      .filter((s) => s.note)
                      .map((s) => s.note)
                      .join(" · ")}
                  </div>
                )}
              </div>
            ))}
            {sessions.length > 8 && (
              <div
                style={{
                  padding: "6px 12px",
                  fontSize: 11,
                  color: c.sub,
                  textAlign: "center",
                }}
              >
                +{sessions.length - 8} sesiones más (amplía el rango para verlas todas)
              </div>
            )}
          </div>
        )}

        {/* ── Follow-up actions ────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() =>
              sendFollowUpMessage(
                `¿Estoy listo para progresar en ${displayName}? Usa cal_check_progression_readiness con exercise_id "${exercise_id}"`
              )
            }
            style={primaryButtonStyle(c, { flex: true })}
          >
            ¿Listo para progresar?
          </button>
          <button
            onClick={() =>
              sendFollowUpMessage(
                `Analiza mi historial de ${displayName} y dame 2-3 recomendaciones concretas para mejorar`
              )
            }
            style={ghostButtonStyle(c)}
          >
            Consejos
          </button>
        </div>
      </div>
    </McpUseProvider>
  );
}
