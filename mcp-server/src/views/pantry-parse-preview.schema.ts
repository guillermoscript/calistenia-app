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


/**
 * Model + token accounting the AI helpers attach to their result (see
 * src/api/pantry-parser.ts). The View ignores it, but the tool spreads it into
 * `structuredContent`, and MCP hosts validate that against the outputSchema
 * (additionalProperties: false) — so it has to be declared.
 */
const modelUsageFields = {
  model_used: z.string().optional(),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      total_tokens: z.number().optional(),
    })
    .optional(),
};

export const pantryParsePreviewPropsSchema = z.object({
  intent: z.enum(["add", "consume", "discard", "query", "unknown"]),
  items: z.array(itemSchema),
  reply: z.string(),
  ...modelUsageFields,
});

export type PantryParsePreviewProps = z.infer<typeof pantryParsePreviewPropsSchema>;
