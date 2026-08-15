import { z } from "zod";

export const pantryConsumptionMatchPropsSchema = z.object({
  matches: z.array(
    z.object({
      pantry_item_id: z.string(),
      pantry_item_name: z.string(),
      pantry_item_unit: z.string().nullable(),
      matched_food: z.string(),
      qty_consumed: z.number().nullable(),
      confidence: z.enum(["high", "med", "low"]),
    })
  ),
  unmatched_foods: z.array(z.string()),
});

export type PantryConsumptionMatchProps = z.infer<typeof pantryConsumptionMatchPropsSchema>;
