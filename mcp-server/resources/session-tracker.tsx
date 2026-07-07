import { McpUseProvider, useWidget, useCallTool, type WidgetMetadata } from "mcp-use/react";
import { useState } from "react";
import { z } from "zod";
import { useAppColors, FONT, FONT_MONO } from "./lib/theme";
import { WidgetLoading, Banner, Kicker, DisplayTitle, primaryButtonStyle, ghostButtonStyle } from "./lib/ui";
import { WidgetFonts } from "./lib/fonts";

const exerciseSchema = z.object({
  name: z.string(),
  sets: z.number(),
  reps: z.string(),
  rest: z.number(),
  muscles: z.string().optional(),
});

const propsSchema = z.object({
  // All-complete variant: every workout day this week is already logged.
  // There's no "next" day to track, so most fields below are irrelevant —
  // the widget renders a dedicated rest-day state instead of a broken
  // exercise tracker. See mcp-server/src/tools/smart.ts cal_todays_workout.
  all_complete: z.boolean().optional(),
  day_id: z.string().optional(),
  day_name: z.string().optional(),
  day_focus: z.string().optional(),
  phase: z.number().optional(),
  program_name: z.string().optional(),
  workout_key: z.string().optional(),
  exercises: z.array(exerciseSchema).optional(),
  week_progress: z.object({ completed: z.number(), total: z.number() }),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Interactive session tracker — check off sets as you train and log the session when done",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;

function AllCompleteState({ weekProgress }: { weekProgress: { completed: number; total: number } }) {
  const c = useAppColors();
  return (
    <McpUseProvider autoSize>
      <WidgetFonts />
      <div style={{ padding: 16, backgroundColor: c.bg, color: c.text, fontFamily: FONT, maxWidth: 500 }}>
        <Kicker>Semana completa</Kicker>
        <DisplayTitle size={30} style={{ marginTop: 2, marginBottom: 8 }}>Todo hecho</DisplayTitle>
        <div style={{
          display: "inline-block", fontSize: 13, fontWeight: 700, color: c.lime,
          backgroundColor: c.limeSoft, borderRadius: 8, padding: "4px 10px", marginBottom: 12,
        }}>
          {weekProgress.completed}/{weekProgress.total} días
        </div>
        <div style={{ fontSize: 13, color: c.sub }}>Descansa o haz movilidad.</div>
      </div>
    </McpUseProvider>
  );
}

export default function SessionTracker() {
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
  const c = useAppColors();
  const { callTool: logWorkout, isPending: isLogging, isSuccess: isLogged, isError: logFailed } = useCallTool("cal_log_full_workout");
  const [completedSets, setCompletedSets] = useState<Record<string, boolean>>({});

  if (isPending) {
    return <WidgetLoading text="Cargando entrenamiento…" />;
  }

  if (props.all_complete) {
    return <AllCompleteState weekProgress={props.week_progress} />;
  }

  const exercises = props.exercises ?? [];
  const totalSets = exercises.reduce((s, e) => s + e.sets, 0);
  const doneSets = Object.values(completedSets).filter(Boolean).length;
  const pct = totalSets > 0 ? doneSets / totalSets : 0;

  const toggleSet = (key: string) => {
    setCompletedSets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleLog = () => {
    logWorkout({ workout_key: props.workout_key, notes: `Sesión completada — ${props.day_name}` });
  };

  return (
    <McpUseProvider autoSize>
      <WidgetFonts />
      <div style={{ padding: 16, backgroundColor: c.bg, color: c.text, fontFamily: FONT, maxWidth: 500 }}>
        {/* Header */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <Kicker>{props.program_name} · Fase {props.phase}</Kicker>
              <DisplayTitle size={24} style={{ marginTop: 2 }}>{props.day_name}</DisplayTitle>
              <div style={{ fontSize: 13, color: c.lime, fontWeight: 600 }}>{props.day_focus}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <Kicker>Esta semana</Kicker>
              <div style={{ fontFamily: FONT_MONO, fontSize: 15, fontWeight: 700, marginTop: 2 }}>{props.week_progress.completed}/{props.week_progress.total} días</div>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ marginTop: 10, height: 6, borderRadius: 3, backgroundColor: c.chip, overflow: "hidden" }}>
            <div style={{ width: `${pct * 100}%`, height: "100%", backgroundColor: c.lime, borderRadius: 3, transition: "width 0.3s" }} />
          </div>
          <div style={{ fontSize: 11, color: c.sub, marginTop: 4 }}>{doneSets}/{totalSets} series completadas</div>
        </div>

        {/* Exercise list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {exercises.map((ex, ei) => (
            <div key={ei} style={{ backgroundColor: c.card, borderRadius: 8, padding: 10, border: `1px solid ${c.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{ex.name}</div>
                  {ex.muscles && <div style={{ fontSize: 11, color: c.sub }}>{ex.muscles}</div>}
                </div>
                <div style={{ fontSize: 12, color: c.sub, textAlign: "right" }}>
                  <div>{ex.sets} × {ex.reps}</div>
                  <div>{ex.rest}s descanso</div>
                </div>
              </div>
              {/* Set checkboxes */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Array.from({ length: ex.sets }).map((_, si) => {
                  const key = `${ei}-${si}`;
                  const done = completedSets[key];
                  return (
                    <button
                      key={si}
                      onClick={() => toggleSet(key)}
                      style={{
                        width: 36, height: 36, borderRadius: 6,
                        border: `2px solid ${done ? c.lime : c.border}`,
                        backgroundColor: done ? c.limeSoft : "transparent",
                        color: done ? c.lime : c.sub,
                        fontSize: 13, fontWeight: 700, cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.15s",
                        fontFamily: FONT,
                      }}
                    >
                      {done ? "✓" : si + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Inline feedback — replaces blocking alert() */}
        {isLogged && <Banner kind="success">Sesión registrada</Banner>}
        {logFailed && <Banner kind="error">No se pudo registrar la sesión. Inténtalo de nuevo.</Banner>}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={handleLog}
            disabled={isLogging || isLogged}
            style={primaryButtonStyle(c, { flex: true, disabled: isLogging || isLogged })}
          >
            {isLogging ? "Guardando…" : isLogged ? "Registrada" : pct === 1 ? "Registrar sesión" : `Registrar sesión (${doneSets}/${totalSets})`}
          </button>
          <button
            onClick={() => sendFollowUpMessage("Cambia el orden o reemplaza algún ejercicio de este entrenamiento")}
            style={ghostButtonStyle(c)}
          >
            Modificar
          </button>
        </div>
      </div>
    </McpUseProvider>
  );
}
