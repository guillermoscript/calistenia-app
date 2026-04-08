import { streamText, tool, stepCountIs, convertToModelMessages } from "ai";
import { z } from "zod";
import { resolveModel, type Tier } from "./model-resolver.js";
import { getPromptWithMeta } from "./prompts.js";
import config from "./config.js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ── Load exercise catalog from JSON ────────────────────────────────────────

interface CatalogExercise {
  id: string;
  name: { es?: string; en?: string } | string;
  muscles: { es?: string; en?: string } | string;
  sets?: number;
  reps?: string;
  rest?: number;
  category?: string;
  difficulty?: string;
  equipment?: string[];
  isTimer?: boolean;
  timerSeconds?: number;
}

let exerciseCatalog: CatalogExercise[] = [];

function loadCatalog() {
  if (exerciseCatalog.length > 0) return;
  try {
    // Try multiple paths: CWD/data (Docker), relative to file (dev), monorepo (dev fallback)
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      resolve(process.cwd(), "data/exercise-catalog.json"),           // Docker: /app/data/
      resolve(__dirname, "../../data/exercise-catalog.json"),          // Compiled: build/api/ → data/
      resolve(__dirname, "../../../src/data/exercise-catalog.json"),   // Dev: src/api/ → ../../../src/data/
    ];
    let catalogPath = "";
    for (const p of candidates) {
      try { readFileSync(p); catalogPath = p; break; } catch { /* try next */ }
    }
    if (!catalogPath) throw new Error(`Catalog not found. Tried: ${candidates.join(", ")}`);
    const raw = JSON.parse(readFileSync(catalogPath, "utf-8"));
    const categories = raw.categories || {};
    for (const [catKey, catData] of Object.entries(categories) as any[]) {
      for (const ex of catData.exercises || []) {
        exerciseCatalog.push({ ...ex, category: ex.category || catKey });
      }
    }
    console.log(`[free-session] Loaded ${exerciseCatalog.length} exercises from catalog`);
  } catch (err) {
    console.error("[free-session] Failed to load exercise catalog:", err);
  }
}

function getStr(val: { es?: string; en?: string } | string | undefined): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  return val.es || val.en || "";
}

// ── search_exercises tool ───────────────────────────────────────────────────

const searchExercisesTool = tool({
  description:
    "Busca ejercicios en el catálogo por grupo muscular, equipamiento, dificultad o categoría. " +
    "Usa esto para encontrar ejercicios reales del catálogo y construir la rutina.",
  inputSchema: z.object({
    category: z
      .enum(["push", "pull", "legs", "core", "lumbar", "full", "skill", "movilidad", "yoga"])
      .optional()
      .describe("Categoría de ejercicio (incluye yoga para posturas de yoga)"),
    muscles: z.string().optional().describe("Grupo muscular a buscar (ej: 'pecho', 'espalda', 'piernas', 'caderas')"),
    equipment: z
      .enum(["ninguno", "barra_dominadas", "banco", "paralelas", "anillas", "banda_elastica", "toalla", "pared", "lastre", "escalon", "cuerda"])
      .optional()
      .describe("Equipamiento disponible (ninguno = solo peso corporal)"),
    difficulty: z
      .enum(["beginner", "intermediate", "advanced"])
      .optional()
      .describe("Nivel de dificultad"),
    limit: z.number().int().min(1).max(20).default(10).describe("Máximo de resultados"),
  }),
  execute: async ({ category, muscles, equipment, difficulty, limit }) => {
    loadCatalog();

    let results = [...exerciseCatalog];

    if (category) {
      results = results.filter((ex) => ex.category === category);
    }
    if (muscles) {
      const q = muscles.toLowerCase();
      results = results.filter((ex) => getStr(ex.muscles).toLowerCase().includes(q));
    }
    if (equipment) {
      if (equipment === "ninguno") {
        results = results.filter((ex) => !ex.equipment || ex.equipment.length === 0 || ex.equipment.includes("ninguno"));
      } else {
        results = results.filter((ex) => ex.equipment?.includes(equipment));
      }
    }
    if (difficulty) {
      results = results.filter((ex) => ex.difficulty === difficulty);
    }

    const limited = results.slice(0, limit);

    return {
      found: limited.length,
      total_available: results.length,
      exercises: limited.map((ex) => ({
        id: ex.id,
        name: getStr(ex.name),
        muscles: getStr(ex.muscles),
        equipment: ex.equipment || [],
        difficulty: ex.difficulty || "intermediate",
        default_sets: ex.sets ?? 3,
        default_reps: ex.reps || "8-12",
        default_rest_seconds: ex.rest ?? 60,
        is_timer: ex.isTimer || false,
      })),
    };
  },
});

// ── User context type ───────────────────────────────────────────────────────

interface SessionUserContext {
  age?: number;
  weight?: number;
  height?: number;
  sex?: string;
  level?: string;
  goal?: string;
  equipment?: string[];
  location?: string;
  availableTime?: number;
}

// ── System prompt fallback ──────────────────────────────────────────────────

const SYSTEM_PROMPT_FALLBACK = `Eres un entrenador experto en calistenia, yoga y entrenamiento funcional.
Tu tarea es generar sesiones de entrenamiento personalizadas usando ÚNICAMENTE ejercicios encontrados con la herramienta search_exercises.

## Flujo de trabajo OBLIGATORIO

1. PRIMERO: Analiza el contexto del usuario (edad, peso, nivel, objetivo, equipamiento, tiempo disponible, ubicación).
2. SEGUNDO: Haz MÚLTIPLES búsquedas con search_exercises para encontrar suficientes ejercicios. Busca por categoría SIN filtro de dificultad primero para obtener más resultados. Ejemplo de búsquedas:
   - search_exercises({ category: "push", limit: 10 })
   - search_exercises({ category: "pull", limit: 10 })
   - search_exercises({ category: "legs", limit: 10 })
   - search_exercises({ category: "core", limit: 10 })
   - search_exercises({ category: "movilidad", limit: 10 })
   Si el usuario tiene equipamiento específico, también filtra por equipamiento.
   Si necesitas más ejercicios, busca también por músculo: search_exercises({ muscles: "pecho" })
3. TERCERO: De los resultados obtenidos, selecciona los ejercicios apropiados y diseña la rutina.

## REGLA CRÍTICA: Solo IDs del catálogo

⚠️ NUNCA inventes IDs de ejercicios. NUNCA uses nombres descriptivos como "CALENTAMIENTO_GENERAL" o "TRABAJO_EMPUJE".
SOLO puedes usar IDs que hayas recibido en los resultados de search_exercises.
Cada ID en tu respuesta JSON DEBE ser un ID exacto que aparezca en el campo "id" de algún resultado de search_exercises.
Si search_exercises no devuelve suficientes ejercicios, haz más búsquedas con filtros diferentes.

## Reglas

- Responde SIEMPRE en español.
- SOLO usa ejercicios encontrados con search_exercises. Si no los buscaste, no los uses.
- Copia los IDs exactamente como aparecen en los resultados (ej: "push_up_standard", "pull_up", "sentadilla_bulgara").
- Ajusta sets, reps y descanso según el nivel y objetivo del usuario.
- Respeta el tiempo disponible del usuario.
- Respeta el equipamiento disponible.
- Incluye calentamiento si el tiempo lo permite (busca en categoría "movilidad").
- Varía los grupos musculares según el objetivo.
- HAZ búsquedas amplias primero (solo por categoría), luego filtra tú mismo por nivel/equipamiento de los resultados.

## Formato de respuesta

Responde con un breve comentario en español explicando la rutina (qué trabajará, por qué la diseñaste así, tips).
NO muestres detalles técnicos como IDs, series, o repeticiones en el texto — eso lo verá el usuario en la interfaz de sesión.
Al FINAL de tu respuesta (después de todo el texto), incluye UN SOLO bloque JSON con los ejercicios:

\`\`\`json
{
  "exercises": [
    { "id": "push_up_standard", "sets": 3, "reps": "8-10", "rest": 90 },
    { "id": "hollow_body_hold", "sets": 3, "reps": "30s", "rest": 60 }
  ]
}
\`\`\`

Los IDs de arriba son EJEMPLOS. Usa los IDs reales que obtengas de search_exercises.
El JSON es procesado por la app, el usuario NO lo ve — así que no lo expliques ni hagas referencia a él.

## Categorías para buscar

push, pull, legs, core, lumbar, full, skill, movilidad, yoga

## Disciplinas

- Calistenia: ejercicios con peso corporal (push, pull, legs, core, lumbar, full, skill, movilidad)
- Yoga: posturas y flujos (categoría: yoga)
- Circuitos: combinación de ejercicios en formato HIIT, Tabata (20s/10s), EMOM (por minuto), o rondas

## Equipamiento posible

ninguno (solo peso corporal), barra_dominadas, banco, paralelas, anillas, banda_elastica, toalla, pared, lastre, escalon, cuerda

## Niveles de dificultad

beginner, intermediate, advanced (usa esto para ajustar sets/reps, NO para filtrar búsquedas)

## Formato circuito

Si el usuario pide un circuito, incluye el campo "format" en el JSON:
\`\`\`json
{
  "format": "circuit",
  "circuit_type": "tabata" | "emom" | "rounds",
  "rounds": 3,
  "work_seconds": 30,
  "rest_seconds": 15,
  "exercises": [...]
}
\`\`\``;

// ── Main handler ────────────────────────────────────────────────────────────

export async function handleGenerateFreeSession(req: any, res: any) {
  const { messages = [], userContext = {} } = req.body ?? {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Se requiere al menos un mensaje" });
  }

  const tier: Tier = req.user?.tier === "pro" || req.user?.tier === "premium" ? "pro" : "free";
  const { model, name: modelName } = resolveModel(tier);
  const { prompt: systemPrompt, langfusePrompt } = await getPromptWithMeta("free-session-generator");

  const ctx: SessionUserContext = userContext;

  // Build system message with user context
  let system = systemPrompt || SYSTEM_PROMPT_FALLBACK;
  const contextLines: string[] = [];
  if (ctx.age) contextLines.push(`- Edad: ${ctx.age} años`);
  if (ctx.weight) contextLines.push(`- Peso: ${ctx.weight} kg`);
  if (ctx.height) contextLines.push(`- Altura: ${ctx.height} cm`);
  if (ctx.sex) contextLines.push(`- Sexo: ${ctx.sex}`);
  if (ctx.level) contextLines.push(`- Nivel: ${ctx.level}`);
  if (ctx.goal) contextLines.push(`- Objetivo de la sesión: ${ctx.goal}`);
  if (ctx.equipment?.length) contextLines.push(`- Equipamiento disponible: ${ctx.equipment.join(", ")}`);
  if (ctx.location) contextLines.push(`- Ubicación: ${ctx.location}`);
  if (ctx.availableTime) contextLines.push(`- Tiempo disponible: ${ctx.availableTime} minutos`);

  if (contextLines.length > 0) {
    system += `\n\n## Contexto del usuario\n\n${contextLines.join("\n")}`;
  }

  // Truncate to last 10 messages to bound token cost
  const truncatedMessages = messages.slice(-10);

  let modelMessages;
  try {
    modelMessages = await convertToModelMessages(truncatedMessages);
  } catch (err) {
    console.error("[free-session] convertToModelMessages failed:", err, "messages:", JSON.stringify(truncatedMessages).slice(0, 500));
    return res.status(400).json({ error: "Formato de mensajes inválido" });
  }

  const result = streamText({
    model,
    system,
    messages: modelMessages,
    tools: { search_exercises: searchExercisesTool },
    maxOutputTokens: 4000,
    stopWhen: stepCountIs(8),
    experimental_telemetry: {
      isEnabled: true,
      functionId: "free-session-generator",
      metadata: { tier, modelName, ...(langfusePrompt && { langfusePrompt }) },
    },
  });

  result.pipeUIMessageStreamToResponse(res);
}
