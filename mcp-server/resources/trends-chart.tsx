import { useState } from "react";
import { McpUseProvider, useWidget, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";
import { useAppColors, FONT } from "./lib/theme";
import { WidgetLoading } from "./lib/ui";

const propsSchema = z.object({
  period_days: z.number(),
  weight: z.object({
    points: z.array(z.object({ date: z.string(), kg: z.number() })),
    first: z.number().nullable(),
    last: z.number().nullable(),
    delta: z.number().nullable(),
    min: z.number(),
    max: z.number(),
  }),
  weekly: z.array(z.object({ label: z.string(), sets: z.number(), sessions: z.number() })),
  totals: z.object({ sets: z.number(), sessions: z.number() }),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Interactive charts: body weight line, weekly training volume and sessions bars",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;
type Tab = "peso" | "volumen" | "sesiones";

const W = 440;
const H = 160;
const PAD = { l: 34, r: 12, t: 12, b: 22 };

function WeightLine({ points, min, max, stroke, grid, sub }: {
  points: { date: string; kg: number }[]; min: number; max: number; stroke: string; grid: string; sub: string;
}) {
  if (points.length < 2) {
    return <div style={{ padding: 28, textAlign: "center", color: sub, fontSize: 13 }}>Registra peso al menos 2 días para ver la línea 📉</div>;
  }
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  // pad the value range a touch so the line isn't glued to edges
  const span = Math.max(max - min, 1);
  const lo = min - span * 0.1;
  const hi = max + span * 0.1;
  const x = (i: number) => PAD.l + (i / (points.length - 1)) * innerW;
  const y = (kg: number) => PAD.t + innerH - ((kg - lo) / (hi - lo)) * innerH;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.kg).toFixed(1)}`).join(" ");
  const area = `${path} L ${x(points.length - 1).toFixed(1)} ${(PAD.t + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(PAD.t + innerH).toFixed(1)} Z`;
  const ticks = [hi, (hi + lo) / 2, lo];

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      {ticks.map((t, i) => {
        const yy = PAD.t + (i / (ticks.length - 1)) * innerH;
        return (
          <g key={i}>
            <line x1={PAD.l} y1={yy} x2={W - PAD.r} y2={yy} stroke={grid} strokeWidth={1} />
            <text x={PAD.l - 5} y={yy + 3} textAnchor="end" fontSize={9} fill={sub}>{Math.round(t)}</text>
          </g>
        );
      })}
      <path d={area} fill={stroke} opacity={0.12} />
      <path d={path} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.kg)} r={2.5} fill={stroke} />)}
      <text x={x(0)} y={H - 6} textAnchor="start" fontSize={9} fill={sub}>{points[0].date.slice(5)}</text>
      <text x={x(points.length - 1)} y={H - 6} textAnchor="end" fontSize={9} fill={sub}>{points[points.length - 1].date.slice(5)}</text>
    </svg>
  );
}

function Bars({ data, color, grid, sub, unit }: {
  data: { label: string; value: number }[]; color: string; grid: string; sub: string; unit: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const gap = data.length > 1 ? 3 : 0;
  const bw = (innerW - gap * (data.length - 1)) / data.length;
  const ticks = [max, Math.round(max / 2), 0];
  // label every Nth week to avoid crowding
  const step = Math.ceil(data.length / 8);

  if (data.every((d) => d.value === 0)) {
    return <div style={{ padding: 28, textAlign: "center", color: sub, fontSize: 13 }}>Sin datos en el periodo 🫥</div>;
  }

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      {ticks.map((t, i) => {
        const yy = PAD.t + (i / (ticks.length - 1)) * innerH;
        return (
          <g key={i}>
            <line x1={PAD.l} y1={yy} x2={W - PAD.r} y2={yy} stroke={grid} strokeWidth={1} />
            <text x={PAD.l - 5} y={yy + 3} textAnchor="end" fontSize={9} fill={sub}>{t}</text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const h = (d.value / max) * innerH;
        const xx = PAD.l + i * (bw + gap);
        const yy = PAD.t + innerH - h;
        return (
          <g key={i}>
            <rect x={xx} y={yy} width={bw} height={h} rx={2} fill={color} opacity={d.value === 0 ? 0.25 : 1} />
            {i % step === 0 && <text x={xx + bw / 2} y={H - 6} textAnchor="middle" fontSize={8} fill={sub}>{d.label}</text>}
          </g>
        );
      })}
      <text x={W - PAD.r} y={PAD.t - 1} textAnchor="end" fontSize={9} fill={sub}>{unit}</text>
    </svg>
  );
}

export default function TrendsChart() {
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
  const c = useAppColors();
  const [tab, setTab] = useState<Tab>("peso");

  const bg = c.bg;
  const card = c.card;
  const border = c.border;
  const textColor = c.text;
  const sub = c.sub;
  const grid = c.grid;

  if (isPending) {
    return <WidgetLoading text="Cargando gráficas…" />;
  }

  const { period_days, weight, weekly, totals } = props;

  const tabs: { id: Tab; label: string; color: string }[] = [
    { id: "peso", label: "⚖️ Peso", color: c.lime },
    { id: "volumen", label: "💪 Volumen", color: c.success },
    { id: "sesiones", label: "🔥 Sesiones", color: c.kcal },
  ];
  const active = tabs.find((t) => t.id === tab)!;

  let summary: string;
  if (tab === "peso") {
    summary = weight.delta !== null
      ? `${weight.first} → ${weight.last} kg · ${weight.delta >= 0 ? "+" : ""}${weight.delta} kg`
      : "Sin registros de peso";
  } else if (tab === "volumen") {
    summary = `${totals.sets} series totales`;
  } else {
    summary = `${totals.sessions} sesiones totales`;
  }

  const tabStyle = (t: { id: Tab; color: string }): React.CSSProperties => ({
    flex: 1, padding: "7px 4px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
    border: `1px solid ${tab === t.id ? t.color : border}`,
    backgroundColor: tab === t.id ? t.color : "transparent",
    color: tab === t.id ? (t.id === "peso" ? c.limeText : "#fff") : textColor,
    transition: "all 0.15s",
  });

  return (
    <McpUseProvider autoSize>
      <div style={{ padding: 16, backgroundColor: bg, color: textColor, fontFamily: FONT, maxWidth: 480 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Tendencias</div>
          <div style={{ fontSize: 11, color: sub }}>últimos {period_days} días</div>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {tabs.map((t) => <button key={t.id} onClick={() => setTab(t.id)} style={tabStyle(t)}>{t.label}</button>)}
        </div>

        <div style={{ backgroundColor: card, borderRadius: 10, padding: "12px 10px 8px", border: `1px solid ${border}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: active.color, marginBottom: 6, paddingLeft: 4 }}>{summary}</div>
          {tab === "peso" && <WeightLine points={weight.points} min={weight.min} max={weight.max} stroke={active.color} grid={grid} sub={sub} />}
          {tab === "volumen" && <Bars data={weekly.map((w) => ({ label: w.label, value: w.sets }))} color={active.color} grid={grid} sub={sub} unit="series/sem" />}
          {tab === "sesiones" && <Bars data={weekly.map((w) => ({ label: w.label, value: w.sessions }))} color={active.color} grid={grid} sub={sub} unit="ses/sem" />}
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          <button
            onClick={() => sendFollowUpMessage("Compara este periodo con el anterior usando cal_compare_periods")}
            style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1px solid ${border}`, backgroundColor: "transparent", color: textColor, fontSize: 12, cursor: "pointer" }}
          >
            ↔ Comparar periodos
          </button>
          <button
            onClick={() => sendFollowUpMessage("Analiza mis tendencias y dame 3 recomendaciones accionables")}
            style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1px solid ${border}`, backgroundColor: "transparent", color: textColor, fontSize: 12, cursor: "pointer" }}
          >
            💡 Analizar
          </button>
        </div>
      </div>
    </McpUseProvider>
  );
}
