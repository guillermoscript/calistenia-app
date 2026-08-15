import { z } from "zod";

export const pantryConsumedPropsSchema = z.object({
  results: z.array(
    z.object({
      item_id: z.string(),
      name: z.string(),
      consumed: z.number(),
      remaining: z.number().nullable(),
      status: z.string(),
    })
  ),
  failed: z.array(z.object({ item_id: z.string(), error: z.string() })),
});

export type PantryConsumedProps = z.infer<typeof pantryConsumedPropsSchema>;
