/**
 * #336: post-proceso DETERMINISTA de los campos de texto que devuelve el LLM
 * en meal-analyzer / food-lookup. El prompt prohíbe citar fuentes, pero cuando
 * el modelo usa web_search a veces arrastra citas markdown al output
 * (ej. real: `([files.givewell.org](https://files.givewell.org/....pdf?utm_source=openai))`)
 * y la UI las renderiza tal cual, tapando la cantidad. Esto lo GARANTIZA en código:
 * - links markdown `[texto](url)` → se conserva el texto; si el texto es en sí
 *   un dominio/URL (una cita), se elimina entero
 * - URLs sueltas (https://…, www.…) eliminadas
 * - paréntesis que quedan vacíos o solo con puntuación, eliminados
 * - espacios colapsados y puntuación huérfana recortada en los extremos
 * - cap de longitud opcional en límite de palabra (portionNote ≤ 120 chars)
 */

const MD_LINK = /\[([^\]]*)\]\(([^()\s]*(?:\([^()]*\)[^()\s]*)*)\)/g;
const BARE_URL = /(?:https?:\/\/|www\.)[^\s)]+/gi;
// dominio o URL "a pelo" como texto de link → es una cita, no contenido
const DOMAIN_LIKE = /^(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?$/i;
// paréntesis cuyo contenido quedó vacío o es solo puntuación/espacios
const EMPTY_PARENS = /\(\s*[,;:·.|–—-]*\s*\)/g;

export function sanitizeAiText(text: string, maxLen?: number): string {
  let out = text
    .replace(MD_LINK, (_m, label: string) =>
      DOMAIN_LIKE.test(label.trim()) ? "" : label
    )
    .replace(BARE_URL, "")
    .replace(EMPTY_PARENS, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:·|–—-]+/, "")
    .replace(/[\s,;:·|–—-]+$/, "")
    .trim();

  if (maxLen && out.length > maxLen) {
    const cut = out.slice(0, maxLen);
    const lastSpace = cut.lastIndexOf(" ");
    out = (lastSpace > maxLen * 0.5 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
  }
  return out;
}

const PORTION_NOTE_MAX = 120;

interface SanitizableFood {
  portionNote?: string;
}

/** Limpia in-place los textos de un FoodItemSchema (meal-analyzer y food-lookup). */
export function sanitizeFoodTexts<T extends SanitizableFood>(food: T): T {
  if (typeof food.portionNote === "string") {
    food.portionNote = sanitizeAiText(food.portionNote, PORTION_NOTE_MAX);
  }
  return food;
}

interface SanitizableQuality {
  message?: string;
  breakdown?: {
    positives?: string[];
    negatives?: string[];
    summary?: string;
  } | null;
  suggestion?: {
    text?: string;
    alternatives?: Array<{ portionNote?: string }>;
  } | null;
}

/** Limpia in-place los textos del bloque quality (QualityBlockSchema). */
export function sanitizeQualityTexts<T extends SanitizableQuality>(quality: T): T {
  if (typeof quality.message === "string") {
    quality.message = sanitizeAiText(quality.message);
  }
  if (quality.breakdown) {
    if (typeof quality.breakdown.summary === "string") {
      quality.breakdown.summary = sanitizeAiText(quality.breakdown.summary);
    }
    if (Array.isArray(quality.breakdown.positives)) {
      quality.breakdown.positives = quality.breakdown.positives.map((p) => sanitizeAiText(p));
    }
    if (Array.isArray(quality.breakdown.negatives)) {
      quality.breakdown.negatives = quality.breakdown.negatives.map((n) => sanitizeAiText(n));
    }
  }
  if (quality.suggestion) {
    if (typeof quality.suggestion.text === "string") {
      quality.suggestion.text = sanitizeAiText(quality.suggestion.text);
    }
    for (const alt of quality.suggestion.alternatives ?? []) {
      if (typeof alt.portionNote === "string") {
        alt.portionNote = sanitizeAiText(alt.portionNote, PORTION_NOTE_MAX);
      }
    }
  }
  return quality;
}

interface SanitizableMealAnalysis {
  foods?: SanitizableFood[];
  meal_description?: string;
  quality?: SanitizableQuality | null;
}

/** Limpia in-place todos los textos de un MealAnalysisSchema. */
export function sanitizeMealAnalysis<T extends SanitizableMealAnalysis>(analysis: T): T {
  for (const food of analysis.foods ?? []) {
    sanitizeFoodTexts(food);
  }
  if (typeof analysis.meal_description === "string") {
    analysis.meal_description = sanitizeAiText(analysis.meal_description);
  }
  if (analysis.quality) {
    sanitizeQualityTexts(analysis.quality);
  }
  return analysis;
}
