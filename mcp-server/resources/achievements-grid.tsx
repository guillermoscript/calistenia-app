import { useState } from "react";
import { McpUseProvider, useWidget, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";
import { useAppColors, FONT } from "./lib/theme";
import { WidgetLoading } from "./lib/ui";

const achievementSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  description: z.string(),
  category: z.string(),
  tier: z.string(),
  xp_reward: z.number(),
  unlocked: z.boolean(),
  progress_pct: z.number(),
  unlocked_at: z.string().nullable(),
});

const propsSchema = z.object({
  total_unlocked: z.number(),
  total: z.number(),
  xp: z.number().optional(),
  level: z.number().optional(),
  xp_to_next_level: z.number().optional(),
  level_progress_pct: z.number().optional(),
  achievements: z.array(achievementSchema),
});

export const widgetMetadata: WidgetMetadata = {
  description: "Badge grid of all achievements with unlock status, progress bars, and XP/level header",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;
type Tab = "todos" | "desbloqueados" | "en_progreso";

const TIER_COLORS: Record<string, string> = {
  bronze: "#cd7f32",
  silver: "#a8a9ad",
  gold: "#ffd700",
  diamond: "#b9f2ff",
};

function ProgressRing({ pct, size, color }: { pct: number; size: number; color: string }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const dash = Math.min(pct / 100, 1) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)", position: "absolute", top: 0, left: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color + "33"} strokeWidth={6} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.4s" }}
      />
    </svg>
  );
}

export default function AchievementsGrid() {
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
  const c = useAppColors();
  const [tab, setTab] = useState<Tab>("todos");

  if (isPending) {
    return <WidgetLoading text="Cargando logros…" />;
  }

  const { total_unlocked, total, xp, level, xp_to_next_level, level_progress_pct, achievements } = props;

  const filtered = achievements.filter((a) => {
    if (tab === "desbloqueados") return a.unlocked;
    if (tab === "en_progreso") return !a.unlocked && a.progress_pct > 0;
    return true;
  });

  const tabs: { id: Tab; label: string }[] = [
    { id: "todos", label: "Todos" },
    { id: "desbloqueados", label: "✅ Desbloqueados" },
    { id: "en_progreso", label: "⏳ En progreso" },
  ];

  const tabStyle = (t: Tab): React.CSSProperties => ({
    flex: 1,
    padding: "6px 4px",
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    border: `1px solid ${tab === t ? c.lime : c.border}`,
    backgroundColor: tab === t ? c.lime : "transparent",
    color: tab === t ? c.limeText : c.text,
    transition: "all 0.15s",
  });

  // Group by category
  const grouped: Record<string, typeof filtered> = {};
  for (const a of filtered) {
    if (!grouped[a.category]) grouped[a.category] = [];
    grouped[a.category].push(a);
  }

  const categoryLabels: Record<string, string> = {
    consistency: "Constancia",
    strength: "Fuerza",
    health: "Salud",
    nutrition: "Nutrición",
    milestone: "Hitos",
  };

  return (
    <McpUseProvider autoSize>
      <div style={{ padding: 16, backgroundColor: c.bg, color: c.text, fontFamily: FONT, maxWidth: 480 }}>

        {/* Header: unlock count + XP/level */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Logros</div>
            <div style={{ fontSize: 12, color: c.sub, marginTop: 2 }}>
              {total_unlocked} / {total} desbloqueados
            </div>
          </div>
          {level !== undefined && (
            <div style={{ backgroundColor: c.card, borderRadius: 10, padding: "8px 12px", border: `1px solid ${c.border}`, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: c.sub, marginBottom: 2 }}>Nivel</div>
              <div style={{ fontWeight: 800, fontSize: 18, color: c.lime }}>{level}</div>
              {xp !== undefined && (
                <div style={{ fontSize: 10, color: c.sub }}>{xp.toLocaleString()} XP</div>
              )}
            </div>
          )}
        </div>

        {/* Level progress bar */}
        {level_progress_pct !== undefined && xp_to_next_level !== undefined && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: c.sub, marginBottom: 4 }}>
              <span>Nivel {level}</span>
              <span>{xp_to_next_level.toLocaleString()} XP para nivel {(level ?? 0) + 1}</span>
            </div>
            <div style={{ height: 6, borderRadius: 4, backgroundColor: c.chip, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${level_progress_pct}%`,
                  borderRadius: 4,
                  backgroundColor: c.lime,
                  transition: "width 0.5s",
                }}
              />
            </div>
          </div>
        )}

        {/* Tab filter */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={tabStyle(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Badge grid by category */}
        {Object.keys(grouped).length === 0 ? (
          <div style={{ textAlign: "center", color: c.sub, padding: "24px 0", fontSize: 13 }}>
            Sin logros en esta categoría 🫥
          </div>
        ) : (
          Object.entries(grouped).map(([cat, achs]) => (
            <div key={cat} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: c.sub, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                {categoryLabels[cat] ?? cat}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8 }}>
                {achs.map((a) => {
                  const tierColor = TIER_COLORS[a.tier] ?? c.sub;
                  const isLocked = !a.unlocked;
                  const badgeBg = isLocked ? c.raised : c.card;
                  const iconSize = 44;

                  return (
                    <div
                      key={a.id}
                      style={{
                        backgroundColor: badgeBg,
                        borderRadius: 10,
                        border: `1px solid ${a.unlocked ? tierColor + "55" : c.border}`,
                        padding: "10px 8px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 6,
                        opacity: isLocked && a.progress_pct === 0 ? 0.55 : 1,
                        position: "relative",
                      }}
                    >
                      {/* Icon with optional progress ring */}
                      <div style={{ position: "relative", width: iconSize, height: iconSize, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {!a.unlocked && a.progress_pct > 0 && (
                          <ProgressRing pct={a.progress_pct} size={iconSize} color={tierColor} />
                        )}
                        <span style={{ fontSize: 22, filter: isLocked ? "grayscale(0.7)" : "none" }}>{a.icon}</span>
                        {a.unlocked && (
                          <span style={{
                            position: "absolute", top: -2, right: -4,
                            fontSize: 13, backgroundColor: c.bg, borderRadius: "50%", lineHeight: 1,
                          }}>✅</span>
                        )}
                      </div>

                      {/* Name */}
                      <div style={{
                        fontWeight: 700,
                        fontSize: 11,
                        textAlign: "center",
                        color: a.unlocked ? c.text : c.sub,
                        lineHeight: 1.3,
                      }}>
                        {a.name}
                      </div>

                      {/* Tier badge */}
                      <div style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: tierColor,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}>
                        {a.tier}
                      </div>

                      {/* Progress bar (locked, has some progress) */}
                      {isLocked && a.progress_pct > 0 && (
                        <div style={{ width: "100%", height: 4, borderRadius: 3, backgroundColor: c.chip, overflow: "hidden" }}>
                          <div style={{
                            height: "100%",
                            width: `${a.progress_pct}%`,
                            borderRadius: 3,
                            backgroundColor: tierColor,
                          }} />
                        </div>
                      )}

                      {/* Progress pct label */}
                      {isLocked && (
                        <div style={{ fontSize: 9, color: c.sub }}>{a.progress_pct}%</div>
                      )}

                      {/* XP reward */}
                      {a.xp_reward > 0 && (
                        <div style={{ fontSize: 9, color: a.unlocked ? c.lime : c.sub }}>
                          +{a.xp_reward} XP
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}

        {/* Follow-up button */}
        <div style={{ marginTop: 14 }}>
          <button
            onClick={() => sendFollowUpMessage("🎯 ¿Cómo desbloqueo los logros que me faltan? Dame un plan específico según mi progreso actual")}
            style={{
              width: "100%",
              padding: "9px 12px",
              borderRadius: 8,
              border: `1px solid ${c.border}`,
              backgroundColor: "transparent",
              color: c.text,
              fontSize: 12,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            🎯 ¿Cómo desbloqueo los que faltan?
          </button>
        </div>
      </div>
    </McpUseProvider>
  );
}
