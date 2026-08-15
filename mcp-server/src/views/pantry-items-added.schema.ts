import { z } from "zod";

export const pantryItemsAddedPropsSchema = z.object({
  created: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      quantity: z.number().nullable(),
      unit: z.string().nullable(),
      price_usd: z.number().nullable(),
    })
  ),
  failed: z.array(z.object({ name: z.string(), error: z.string() })),
  source: z.enum(["chat", "receipt", "shopping", "manual"]),
});

export type PantryItemsAddedProps = z.infer<typeof pantryItemsAddedPropsSchema>;
