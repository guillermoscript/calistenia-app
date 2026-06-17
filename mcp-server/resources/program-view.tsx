import { McpUseProvider, useWidget, useCallTool, type WidgetMetadata } from "mcp-use/react";
import { useState } from "react";
import { z } from "zod";
import { useAppColors, FONT } from "./lib/theme";
import { WidgetLoading, Banner, primaryButtonStyle, ghostButtonStyle } from "./lib/ui";

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

function getDifficultyColor(difficulty: string, c: ReturnType<typeof useAppColors>): string {
  if (difficulty === "beginner") return c.success;
  if (difficulty === "intermediate") return c.warn;
  return c.danger;
}

export default function ProgramView() {
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
  const c = useAppColors();
  const { callTool: activateProgram, isPending: isActivating, isSuccess: isActivated, isError: activateFailed } = useCallTool("cal_set_current_program");
  const [expandedPhase, setExpandedPhase] = useState(0);
  const [expandedDay, setExpandedDay] = useState<number | null>(null);

  if (isPending) {
    return <WidgetLoading text="Construyendo programa…" />;
  }

  const handleActivate = () => {
    activateProgram({ program_id: props.id });
  };

  return (
    <McpUseProvider autoSize>
      <div style={{ padding: 16, backgroundColor: c.bg, color: c.text, fontFamily: FONT, maxWidth: 520 }}>
        {/* Header */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{props.name}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                {props.difficulty && (
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, backgroundColor: getDifficultyColor(props.difficulty, c) + "33", color: getDifficultyColor(props.difficulty, c), fontWeight: 600 }}>
                    {props.difficulty}
                  </span>
                )}
                {props.duration_weeks ? (
                  <span style={{ fontSize: 11, color: c.sub }}>{props.duration_weeks} semanas</span>
                ) : null}
                <span style={{ fontSize: 11, color: c.sub }}>{props.phases_count} fases · {props.total_exercises} ejercicios</span>
              </div>
            </div>
            {props.is_current && (
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, backgroundColor: c.limeSoft, color: c.lime, fontWeight: 700 }}>
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
                backgroundColor: expandedPhase === pi ? c.lime : c.chip,
                color: expandedPhase === pi ? c.limeText : c.text,
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
              <div key={di} style={{ backgroundColor: c.card, borderRadius: 8, border: `1px solid ${c.border}`, overflow: "hidden" }}>
                <button
                  onClick={() => setExpandedDay(expandedDay === di ? null : di)}
                  style={{
                    width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 12px", background: "none", border: "none", cursor: "pointer", color: c.text,
                  }}
                >
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{day.day_name}</div>
                    {day.day_focus && <div style={{ fontSize: 11, color: c.sub }}>{day.day_focus}</div>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: c.sub }}>{day.exercises.length} ejercicios</span>
                    <span style={{ fontSize: 12, color: c.sub }}>{expandedDay === di ? "▲" : "▼"}</span>
                  </div>
                </button>

                {expandedDay === di && (
                  <div style={{ borderTop: `1px solid ${c.border}`, padding: "8px 12px" }}>
                    {day.exercises.map((ex, ei) => (
                      <div key={ei} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: ei < day.exercises.length - 1 ? `1px solid ${c.chip}` : "none" }}>
                        <div>
                          <span style={{ fontSize: 12, fontWeight: 500 }}>{ex.name}</span>
                          {ex.muscles && <div style={{ fontSize: 10, color: c.sub }}>{ex.muscles}</div>}
                        </div>
                        <span style={{ fontSize: 12, color: c.sub, whiteSpace: "nowrap" }}>{ex.sets} × {ex.reps}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Inline feedback — replaces blocking alert() */}
        {isActivated && <Banner kind="success">Programa activado</Banner>}
        {activateFailed && <Banner kind="error">No se pudo activar el programa. Inténtalo de nuevo.</Banner>}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!props.is_current && (
            <button
              onClick={handleActivate}
              disabled={isActivating || isActivated}
              style={primaryButtonStyle(c, { flex: true, disabled: isActivating || isActivated })}
            >
              {isActivating ? "Activando…" : isActivated ? "✓ Activado" : "Activar este programa"}
            </button>
          )}
          <button
            onClick={() => sendFollowUpMessage("Muéstrame el entrenamiento de hoy con cal_todays_workout")}
            style={ghostButtonStyle(c, { flex: true })}
          >
            {props.is_current ? "▶ Ver entrenamiento de hoy" : "Vista previa del primer día"}
          </button>
          <button
            onClick={() => sendFollowUpMessage("Modifica este programa: cambia algún ejercicio o ajusta los sets/reps")}
            style={ghostButtonStyle(c)}
          >
            ✏️
          </button>
        </div>
      </div>
    </McpUseProvider>
  );
}
