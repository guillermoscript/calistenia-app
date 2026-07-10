import { McpUseProvider, useWidget, type WidgetMetadata } from "mcp-use/react";
import { z } from "zod";
import { useAppColors, FONT, FONT_MONO, type AppColors } from "./lib/theme";
import { WidgetLoading, Kicker, DisplayTitle, StatNumber, ghostButtonStyle } from "./lib/ui";
import { WidgetFonts } from "./lib/fonts";
import { fmtQty } from "./lib/pantry-ui";

const ingredientSchema = z.object({
  name: z.string(),
  name_normalized: z.string(),
  qty: z.number().nullable(),
  unit: z.string().nullable(),
  from: z.enum(["pantry", "buy"]),
});

const recipeSchema = z.object({
  steps: z.array(z.string()),
  ingredients: z.array(ingredientSchema),
  prep_minutes: z.number().nullable(),
  servings: z.number().nullable(),
  photo_query: z.string().nullable(),
});

const mealSchema = z.object({
  meal_type: z.enum(["desayuno", "almuerzo", "cena", "snack"]),
  label: z.string(),
  description: z.string(),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  recipe: recipeSchema.nullable(),
});

const propsSchema = z.object({
  target_date: z.string().nullable(),
  meals: z.array(mealSchema),
  notes: z.string(),
});

export const widgetMetadata: WidgetMetadata = {
  description: "A pantry-aware day meal plan — meals with macros, recipes and which ingredients come from the pantry vs need buying",
  props: propsSchema,
  exposeAsTool: false,
};

type Props = z.infer<typeof propsSchema>;
type Meal = z.infer<typeof mealSchema>;

const MEAL_LABELS: Record<string, string> = {
  desayuno: "Desayuno",
  almuerzo: "Almuerzo",
  cena: "Cena",
  snack: "Snack",
};

function IngredientChip({ ing, c }: { ing: z.infer<typeof ingredientSchema>; c: AppColors }) {
  const buy = ing.from === "buy";
  const qty = fmtQty(ing.qty, ing.unit);
  return (
    <span
      title={buy ? "Falta comprarlo" : "Está en tu despensa"}
      style={{
        fontSize: 11,
        padding: "2px 8px",
        borderRadius: 10,
        border: `1px solid ${buy ? c.warn : c.border}`,
        backgroundColor: buy ? "transparent" : c.chip,
        color: buy ? c.warn : c.text,
        whiteSpace: "nowrap",
      }}
    >
      {buy ? "🛒 " : ""}
      {ing.name}
      {qty ? ` · ${qty}` : ""}
    </span>
  );
}

function MealCard({ meal, c, onSave }: { meal: Meal; c: AppColors; onSave: (label: string) => void }) {
  const toBuy = meal.recipe?.ingredients.filter((i) => i.from === "buy").length ?? 0;
  return (
    <div style={{ backgroundColor: c.card, borderRadius: 8, padding: 12, border: `1px solid ${c.border}`, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Kicker>{MEAL_LABELS[meal.meal_type] ?? meal.meal_type}</Kicker>
          <div style={{ fontWeight: 700, fontSize: 15, marginTop: 2 }}>{meal.label}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <StatNumber size={20}>{Math.round(meal.calories)}</StatNumber>
          <div style={{ fontSize: 10, color: c.sub }}>kcal</div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: c.sub, margin: "6px 0 8px" }}>{meal.description}</div>

      <div style={{ fontFamily: FONT_MONO, fontSize: 11, marginBottom: 8, display: "flex", gap: 10 }}>
        <span style={{ color: c.protein }}>P {Math.round(meal.protein)}g</span>
        <span style={{ color: c.carbs }}>C {Math.round(meal.carbs)}g</span>
        <span style={{ color: c.fat }}>G {Math.round(meal.fat)}g</span>
        {meal.recipe?.prep_minutes != null && <span style={{ color: c.sub }}>⏱ {meal.recipe.prep_minutes} min</span>}
      </div>

      {meal.recipe && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {meal.recipe.ingredients.map((ing, i) => (
              <IngredientChip key={i} ing={ing} c={c} />
            ))}
          </div>

          <details>
            <summary style={{ fontSize: 12, color: c.lime, cursor: "pointer", fontWeight: 600 }}>
              Receta paso a paso{toBuy > 0 ? ` · falta comprar ${toBuy}` : ""}
            </summary>
            <ol style={{ margin: "8px 0 4px", paddingLeft: 18 }}>
              {meal.recipe.steps.map((step, i) => (
                <li key={i} style={{ fontSize: 12, color: c.text, marginBottom: 5, lineHeight: 1.45 }}>
                  {step}
                </li>
              ))}
            </ol>
            <button onClick={() => onSave(meal.label)} style={{ ...ghostButtonStyle(c), fontSize: 12, padding: "6px 12px" }}>
              ★ Guardar receta
            </button>
          </details>
        </>
      )}
    </div>
  );
}

export default function PantryDayPlan() {
  const { props, isPending, sendFollowUpMessage } = useWidget<Props>();
  const c = useAppColors();

  if (isPending) {
    return <WidgetLoading text="Cocinando tu plan del día…" />;
  }

  const { target_date, meals, notes } = props;
  const totalKcal = Math.round(meals.reduce((acc, m) => acc + m.calories, 0));

  return (
    <McpUseProvider autoSize>
      <WidgetFonts />
      <div style={{ padding: 16, backgroundColor: c.bg, color: c.text, fontFamily: FONT, maxWidth: 520 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <Kicker>Plan desde tu despensa</Kicker>
            <DisplayTitle size={26} style={{ marginTop: 2 }}>
              {target_date ?? "Plan del día"}
            </DisplayTitle>
          </div>
          <div style={{ textAlign: "right" }}>
            <StatNumber size={22}>{totalKcal}</StatNumber>
            <div style={{ fontSize: 10, color: c.sub }}>kcal totales</div>
          </div>
        </div>

        {meals.map((meal, i) => (
          <MealCard
            key={i}
            meal={meal}
            c={c}
            onSave={(label) => sendFollowUpMessage(`Guarda la receta "${label}" de este plan como favorita.`)}
          />
        ))}

        {notes && <div style={{ fontSize: 12, color: c.sub, marginBottom: 12 }}>{notes}</div>}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => sendFollowUpMessage("¿Cuántas comidas completas me alcanzan con lo que queda en la despensa?")}
            style={ghostButtonStyle(c)}
          >
            ¿Cuántas comidas me quedan?
          </button>
          <button
            onClick={() => sendFollowUpMessage("Genera otro plan del día distinto con mi despensa.")}
            style={ghostButtonStyle(c)}
          >
            Otro plan
          </button>
        </div>
      </div>
    </McpUseProvider>
  );
}
