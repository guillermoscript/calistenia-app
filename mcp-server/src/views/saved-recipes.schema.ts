import { z } from "zod";

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

export const savedRecipesPropsSchema = z.object({
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

export type SavedRecipesProps = z.infer<typeof savedRecipesPropsSchema>;
