import { z } from "zod";

const itemSchema = z.object({
  name: z.string(),
  name_normalized: z.string(),
  category: z.string(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  price_total: z.number().nullable(),
  expiry_days: z.number().nullable(),
  confidence: z.enum(["high", "med", "low"]),
});

export const pantryParsePreviewPropsSchema = z.object({
  intent: z.enum(["add", "consume", "discard", "query", "unknown"]),
  items: z.array(itemSchema),
  reply: z.string(),
});

export type PantryParsePreviewProps = z.infer<typeof pantryParsePreviewPropsSchema>;
