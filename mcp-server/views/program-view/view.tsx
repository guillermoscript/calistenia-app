import { useToolContext, useCallTool, useSendFollowUp } from "mcp-use/react";
import { useState } from "react";
import { useAppColors, FONT, FONT_MONO } from "../lib/theme";
import { WidgetLoading, WidgetError, Banner, DisplayTitle, Kicker, primaryButtonStyle, ghostButtonStyle } from "../lib/ui";
import { WidgetFonts } from "../lib/fonts";
import type { ProgramViewProps as Props } from "../../src/views/program-view.schema";

function getDifficultyColor(difficulty: string, c: ReturnType<typeof useAppColors>): string {
  if (difficulty === "beginner") return c.success;
  if (difficulty === "intermediate") return c.warn;
  return c.danger;
}

export default function ProgramView() {
  const view = useToolContext();
  const sendFollowUp = useSendFollowUp();
  const c = useAppColors();
  const { callTool: activateProgram, isPending: isActivating, data: activateData, error: activateError } = useCallTool("cal_set_current_program");
  const isActivated = activateData !== undefined;
  const activateFailed = activateError !== undefined;
  const [expandedPhase, setExpandedPhase] = useState(0);
  const [expandedDay, setExpandedDay] = useState<number | null>(null);

  if (view.status === "pending") {
    return <WidgetLoading text="Construyendo programa…" />;
  }
  if (view.status === "error") {
    return <WidgetError message={view.error.message} />;
  }
  const props = view.toolOutput as Props;

  const handleActivate = () => {
    void activateProgram({ program_id: props.id }).catch(() => {});
  };

  return (
    <>
      <WidgetFonts />
      <div style={{ padding: 16, backgroundColor: c.bg, color: c.text, fontFamily: FONT, maxWidth: 520 }}>
        {/* Header */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <Kicker>{props.phases_count} fases · {props.total_exercises} ejercicios</Kicker>
              <DisplayTitle size={26} style={{ marginTop: 2 }}>{props.name}</DisplayTitle>
              <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                {props.difficulty && (
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, backgroundColor: getDifficultyColor(props.difficulty, c) + "33", color: getDifficultyColor(props.difficulty, c), fontWeight: 600 }}>
                    {props.difficulty}
                  </span>
                )}
                {props.duration_weeks ? (
                  <span style={{ fontSize: 11, color: c.sub }}>{props.duration_weeks} semanas</span>
                ) : null}
              </div>
            </div>
            {props.is_current && (
              <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, backgroundColor: c.limeSoft, color: c.lime, fontWeight: 400, fontFamily: FONT_MONO, letterSpacing: 1.5, textTransform: "uppercase" }}>
                Activo
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
                fontFamily: FONT,
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
                    fontFamily: FONT,
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
              {isActivating ? "Activando…" : isActivated ? "Activado" : "Activar este programa"}
            </button>
          )}
          <button
            onClick={() => void sendFollowUp({ prompt: "Muéstrame el entrenamiento de hoy con cal_todays_workout" })}
            style={ghostButtonStyle(c, { flex: true })}
          >
            {props.is_current ? "Ver entrenamiento de hoy" : "Vista previa del primer día"}
          </button>
          <button
            onClick={() => void sendFollowUp({ prompt: "Modifica este programa: cambia algún ejercicio o ajusta los sets/reps" })}
            style={ghostButtonStyle(c)}
          >
            Modificar
          </button>
        </div>
      </div>
    </>
  );
}
