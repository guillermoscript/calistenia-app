import { McpUseProvider, useWidget, useWidgetTheme, useCallTool, type WidgetMetadata } from "mcp-use/react";
import { useState } from "react";
import { z } from "zod";

const exerciseSchema = z.object({ name: z.string(), sets: z.number(), reps: z.string(), rest_seconds: z.number(), muscles: z.string().optional() });
const daySchema = z.object({ day_name: z.string(), day_focus: z.string().optional(), exercises: z.array(exerciseSchema) });
const phaseSchema = z.object({ name: z.string(), days: z.array(daySchema) });

const propsSchema = z.object({
  id: z.string(),
  name: z.string(),
  difficulty: z.string().optional(),
  duration_weeks: z.number().optional(),
  is_current: z.boolean(),
  phases_count: z.number(),
  total_exercises: z.number(),
  phases: z.array(phaseSchema),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Program card showing phases, days, and exercises — with activate and start buttons",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;

const DIFFICULTY_COLOR: Record<string, string> = {
  beginner: "#22c55e",
  intermediate: "#f59e0b",
  advanced: "#ef4444",
};

export default function ProgramView() {
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
  const theme = useWidgetTheme();
  const dark = theme === "dark";
  const { callTool: activateProgram, isPending: isActivating } = useCallTool("cal_set_current_program");
  const [expandedPhase, setExpandedPhase] = useState(0);
  const [expandedDay, setExpandedDay] = useState<number | null>(null);

  if (isPending) {
    return <McpUseProvider autoSize><div style={{ padding: 16, color: dark ? "#e0e0e0" : "#333" }}>Construyendo programa…</div></McpUseProvider>;
  }

  const bg = dark ? "#1a1a1a" : "#ffffff";
  const card = dark ? "#242424" : "#f8f8f8";
  const card2 = dark ? "#2a2a2a" : "#f0f0f0";
  const border = dark ? "#333" : "#e8e8e8";
  const textColor = dark ? "#e0e0e0" : "#1a1a1a";
  const sub = dark ? "#888" : "#666";
  const accent = "#6366f1";

  const handleActivate = () => {
    activateProgram(
      { program_id: props.id },
      { onError: () => alert("Error al activar programa") }
    );
  };

  return (
    <McpUseProvider autoSize>
      <div style={{ padding: 16, backgroundColor: bg, color: textColor, fontFamily: "system-ui, sans-serif", maxWidth: 520 }}>
        {/* Header */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{props.name}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                {props.difficulty && (
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, backgroundColor: DIFFICULTY_COLOR[props.difficulty] + "33", color: DIFFICULTY_COLOR[props.difficulty], fontWeight: 600 }}>
                    {props.difficulty}
                  </span>
                )}
                {props.duration_weeks ? (
                  <span style={{ fontSize: 11, color: sub }}>{props.duration_weeks} semanas</span>
                ) : null}
                <span style={{ fontSize: 11, color: sub }}>{props.phases_count} fases · {props.total_exercises} ejercicios</span>
              </div>
            </div>
            {props.is_current && (
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, backgroundColor: accent + "22", color: accent, fontWeight: 700 }}>
                ✓ Activo
              </span>
            )}
          </div>
        </div>

        {/* Phase tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {props.phases.map((phase, pi) => (
            <button
              key={pi}
              onClick={() => { setExpandedPhase(pi); setExpandedDay(null); }}
              style={{
                padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none",
                backgroundColor: expandedPhase === pi ? accent : (dark ? "#333" : "#e8e8e8"),
                color: expandedPhase === pi ? "#fff" : textColor,
              }}
            >
              Fase {pi + 1}: {phase.name}
            </button>
          ))}
        </div>

        {/* Current phase days */}
        {props.phases[expandedPhase] && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
            {props.phases[expandedPhase].days.map((day, di) => (
              <div key={di} style={{ backgroundColor: card, borderRadius: 8, border: `1px solid ${border}`, overflow: "hidden" }}>
                <button
                  onClick={() => setExpandedDay(expandedDay === di ? null : di)}
                  style={{
                    width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 12px", background: "none", border: "none", cursor: "pointer", color: textColor,
                  }}
                >
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{day.day_name}</div>
                    {day.day_focus && <div style={{ fontSize: 11, color: sub }}>{day.day_focus}</div>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: sub }}>{day.exercises.length} ejercicios</span>
                    <span style={{ fontSize: 12, color: sub }}>{expandedDay === di ? "▲" : "▼"}</span>
                  </div>
                </button>

                {expandedDay === di && (
                  <div style={{ borderTop: `1px solid ${border}`, padding: "8px 12px" }}>
                    {day.exercises.map((ex, ei) => (
                      <div key={ei} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: ei < day.exercises.length - 1 ? `1px solid ${dark ? "#333" : "#f0f0f0"}` : "none" }}>
                        <div>
                          <span style={{ fontSize: 12, fontWeight: 500 }}>{ex.name}</span>
                          {ex.muscles && <div style={{ fontSize: 10, color: sub }}>{ex.muscles}</div>}
                        </div>
                        <span style={{ fontSize: 12, color: sub, whiteSpace: "nowrap" }}>{ex.sets} × {ex.reps}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!props.is_current && (
            <button
              onClick={handleActivate}
              disabled={isActivating}
              style={{
                flex: 1, padding: "9px 16px", borderRadius: 8,
                backgroundColor: accent, color: "#fff", fontWeight: 700, fontSize: 13,
                border: "none", cursor: isActivating ? "not-allowed" : "pointer", opacity: isActivating ? 0.6 : 1,
              }}
            >
              {isActivating ? "Activando…" : "🚀 Activar este programa"}
            </button>
          )}
          <button
            onClick={() => sendFollowUpMessage("Muéstrame el entrenamiento de hoy con cal_todays_workout")}
            style={{ flex: 1, padding: "9px 16px", borderRadius: 8, border: `1px solid ${border}`, backgroundColor: "transparent", color: textColor, fontWeight: 600, fontSize: 13, cursor: "pointer" }}
          >
            {props.is_current ? "▶ Ver entrenamiento de hoy" : "👁 Vista previa del primer día"}
          </button>
          <button
            onClick={() => sendFollowUpMessage("Modifica este programa: cambia algún ejercicio o ajusta los sets/reps")}
            style={{ padding: "9px 12px", borderRadius: 8, border: `1px solid ${border}`, backgroundColor: "transparent", color: textColor, fontSize: 12, cursor: "pointer" }}
          >
            ✏️
          </button>
        </div>
      </div>
    </McpUseProvider>
  );
}
