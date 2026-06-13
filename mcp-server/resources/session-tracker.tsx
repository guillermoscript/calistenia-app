import { McpUseProvider, useWidget, useWidgetTheme, useCallTool, type WidgetMetadata } from "mcp-use/react";
import { useState } from "react";
import { z } from "zod";

const exerciseSchema = z.object({
  name: z.string(),
  sets: z.number(),
  reps: z.string(),
  rest: z.number(),
  muscles: z.string().optional(),
});

const propsSchema = z.object({
  day_id: z.string(),
  day_name: z.string(),
  day_focus: z.string(),
  phase: z.number(),
  program_name: z.string(),
  workout_key: z.string(),
  exercises: z.array(exerciseSchema),
  week_progress: z.object({ completed: z.number(), total: z.number() }),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Interactive session tracker — check off sets as you train and log the session when done",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;

export default function SessionTracker() {
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
  const theme = useWidgetTheme();
  const dark = theme === "dark";
  const { callTool: logWorkout, isPending: isLogging } = useCallTool("cal_log_full_workout");
  const [completedSets, setCompletedSets] = useState<Record<string, boolean>>({});

  if (isPending) {
    return <McpUseProvider autoSize><div style={{ padding: 16, color: dark ? "#e0e0e0" : "#333" }}>Cargando entrenamiento…</div></McpUseProvider>;
  }

  const bg = dark ? "#1a1a1a" : "#ffffff";
  const card = dark ? "#242424" : "#f8f8f8";
  const border = dark ? "#333" : "#e8e8e8";
  const textColor = dark ? "#e0e0e0" : "#1a1a1a";
  const sub = dark ? "#888" : "#666";
  const accent = "#6366f1";
  const green = dark ? "#22c55e" : "#16a34a";

  const totalSets = props.exercises.reduce((s, e) => s + e.sets, 0);
  const doneSets = Object.values(completedSets).filter(Boolean).length;
  const pct = totalSets > 0 ? doneSets / totalSets : 0;

  const toggleSet = (key: string) => {
    setCompletedSets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleLog = () => {
    logWorkout(
      { workout_key: props.workout_key, notes: `Sesión completada — ${props.day_name}` },
      { onError: () => alert("Error al registrar sesión") }
    );
  };

  return (
    <McpUseProvider autoSize>
      <div style={{ padding: 16, backgroundColor: bg, color: textColor, fontFamily: "system-ui, sans-serif", maxWidth: 500 }}>
        {/* Header */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 11, color: sub, textTransform: "uppercase", letterSpacing: 1 }}>{props.program_name} · Fase {props.phase}</div>
              <div style={{ fontWeight: 700, fontSize: 17, marginTop: 2 }}>{props.day_name}</div>
              <div style={{ fontSize: 13, color: accent, fontWeight: 600 }}>{props.day_focus}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: sub }}>Esta semana</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{props.week_progress.completed}/{props.week_progress.total} días</div>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ marginTop: 10, height: 6, borderRadius: 3, backgroundColor: dark ? "#333" : "#e8e8e8", overflow: "hidden" }}>
            <div style={{ width: `${pct * 100}%`, height: "100%", backgroundColor: pct === 1 ? green : accent, borderRadius: 3, transition: "width 0.3s" }} />
          </div>
          <div style={{ fontSize: 11, color: sub, marginTop: 4 }}>{doneSets}/{totalSets} series completadas</div>
        </div>

        {/* Exercise list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {props.exercises.map((ex, ei) => (
            <div key={ei} style={{ backgroundColor: card, borderRadius: 8, padding: 10, border: `1px solid ${border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{ex.name}</div>
                  {ex.muscles && <div style={{ fontSize: 11, color: sub }}>{ex.muscles}</div>}
                </div>
                <div style={{ fontSize: 12, color: sub, textAlign: "right" }}>
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
                        width: 32, height: 32, borderRadius: 6,
                        border: `2px solid ${done ? green : border}`,
                        backgroundColor: done ? (dark ? "#16532d" : "#dcfce7") : "transparent",
                        color: done ? green : sub,
                        fontSize: 13, fontWeight: 700, cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.15s",
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

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={handleLog}
            disabled={isLogging}
            style={{
              flex: 1, padding: "9px 16px", borderRadius: 8,
              backgroundColor: pct === 1 ? green : accent,
              color: "#fff", fontWeight: 700, fontSize: 13,
              border: "none", cursor: isLogging ? "not-allowed" : "pointer", opacity: isLogging ? 0.6 : 1,
            }}
          >
            {isLogging ? "Guardando…" : pct === 1 ? "✓ Registrar sesión" : `Registrar sesión (${doneSets}/${totalSets})`}
          </button>
          <button
            onClick={() => sendFollowUpMessage("Cambia el orden o reemplaza algún ejercicio de este entrenamiento")}
            style={{ padding: "9px 12px", borderRadius: 8, border: `1px solid ${border}`, backgroundColor: "transparent", color: textColor, fontSize: 12, cursor: "pointer" }}
          >
            ✏️ Modificar
          </button>
        </div>
      </div>
    </McpUseProvider>
  );
}
