import { McpUseProvider, useWidget, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";
import { useAppColors, FONT, FONT_MONO } from "./lib/theme";
import { WidgetLoading, Kicker, DisplayTitle, ghostButtonStyle } from "./lib/ui";
import { WidgetFonts } from "./lib/fonts";
import { fmtQty } from "./lib/pantry-ui";

const recipeSchema = z.object({
  steps: z.array(z.string()),
  ingredients: z.array(
    z.object({
      name: z.string(),
      name_normalized: z.string(),
      qty: z.number().nullable(),
      unit: z.string().nullable(),
      from: z.enum(["pantry", "buy"]),
    })
  ),
  prep_minutes: z.number().nullable(),
  servings: z.number().nullable().optional(),
  photo_query: z.string().nullable().optional(),
});

const propsSchema = z.object({
  count: z.number(),
  recipes: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      recipe: recipeSchema,
      times_used: z.number(),
    })
  ),
});

export const widgetMetadata: WidgetMetadata = {
  description: "The user's saved favorite recipes with ingredients, steps and usage count",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;

export default function SavedRecipes() {
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
  const c = useAppColors();

  if (isPending) {
    return <WidgetLoading text="Buscando tus recetas guardadas…" />;
  }

  const { count, recipes } = props;

  return (
    <McpUseProvider autoSize>
      <WidgetFonts />
      <div style={{ padding: 16, backgroundColor: c.bg, color: c.text, fontFamily: FONT, maxWidth: 520 }}>
        <Kicker>Recetas guardadas</Kicker>
        <DisplayTitle size={26} style={{ margin: "2px 0 12px" }}>
          {count} favorita{count !== 1 ? "s" : ""}
        </DisplayTitle>

        {count === 0 && (
          <div style={{ fontSize: 13, color: c.sub, marginBottom: 12 }}>
            No tienes recetas guardadas todavía. Genera un plan desde tu despensa y guarda las que te gusten.
          </div>
        )}

        {recipes.map((r) => {
          const meta = [
            `${r.recipe.ingredients.length} ingrediente${r.recipe.ingredients.length !== 1 ? "s" : ""}`,
            r.recipe.prep_minutes != null ? `${r.recipe.prep_minutes} min` : null,
            r.recipe.servings ? `${r.recipe.servings} porción${r.recipe.servings !== 1 ? "es" : ""}` : null,
            r.times_used > 0 ? `usada ${r.times_used}×` : null,
          ].filter(Boolean);
          return (
            <div
              key={r.id}
              style={{ backgroundColor: c.card, borderRadius: 8, padding: 12, border: `1px solid ${c.border}`, marginBottom: 10 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{r.label}</div>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: 0.5, color: c.sub, marginTop: 3 }}>
                    {meta.join("  ·  ")}
                  </div>
                </div>
                <button
                  onClick={() => sendFollowUpMessage(`Quiero cocinar mi receta guardada "${r.label}" hoy. ¿Tengo todo en la despensa?`)}
                  style={{ ...ghostButtonStyle(c), fontSize: 12, padding: "6px 12px" }}
                >
                  Cocinar
                </button>
              </div>

              <details style={{ marginTop: 8 }}>
                <summary style={{ fontSize: 12, color: c.lime, cursor: "pointer", fontWeight: 600 }}>Ver receta</summary>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0" }}>
                  {r.recipe.ingredients.map((ing, i) => {
                    const qty = fmtQty(ing.qty, ing.unit);
                    return (
                      <span
                        key={i}
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 10,
                          backgroundColor: c.chip,
                          border: `1px solid ${c.border}`,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {ing.name}
                        {qty ? ` · ${qty}` : ""}
                      </span>
                    );
                  })}
                </div>
                <ol style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                  {r.recipe.steps.map((step, i) => (
                    <li key={i} style={{ fontSize: 12, marginBottom: 5, lineHeight: 1.45 }}>
                      {step}
                    </li>
                  ))}
                </ol>
              </details>
            </div>
          );
        })}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => sendFollowUpMessage("Genera un plan del día desde mi despensa para descubrir recetas nuevas.")}
            style={ghostButtonStyle(c)}
          >
            Descubrir recetas nuevas
          </button>
        </div>
      </div>
    </McpUseProvider>
  );
}
