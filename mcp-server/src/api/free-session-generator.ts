import { streamText, tool, isStepCount, convertToModelMessages } from "ai";
import { z } from "zod";
import { resolveModel, type Tier } from "./model-resolver.js";
import { getPromptWithMeta } from "./prompts.js";
import { langfuseTelemetry } from "./telemetry.js";
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
  source?: string;
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

// Gym-only equipment (ExerciseDB import). Excluded from searches unless the
// user explicitly has gym access — this app is calisthenics-first.
const GYM_EQUIPMENT = new Set([
  "mancuernas", "barra", "polea", "maquina", "balon_medicinal", "bosu", "rodillo", "otro",
]);

const isGymExercise = (ex: { equipment?: string[] }): boolean =>
  (ex.equipment ?? []).some((e) => GYM_EQUIPMENT.has(e));

// Curated sources first (they carry tempo/media/hand-written descriptions),
// imported ExerciseDB entries after. Stable within each group.
const curationRank = (ex: { source?: string }): number =>
  ex.source === "exercisedb" ? 1 : 0;

const searchExercisesTool = tool({
  description:
    "Busca ejercicios en el catálogo por grupo muscular, equipamiento, dificultad o categoría. " +
    "Usa esto para encontrar ejercicios reales del catálogo y construir la rutina. " +
    "Por defecto solo devuelve ejercicios de calistenia; usa include_gym o equipamiento de gym SOLO si el usuario entrena en gimnasio.",
  inputSchema: z.object({
    category: z
      .enum(["push", "pull", "legs", "core", "lumbar", "full", "skill", "movilidad", "yoga"])
      .optional()
      .describe("Categoría de ejercicio (incluye yoga para posturas de yoga)"),
    muscles: z.string().optional().describe("Grupo muscular a buscar (ej: 'pecho', 'espalda', 'piernas', 'caderas')"),
    equipment: z
      .enum([
        "ninguno", "barra_dominadas", "banco", "paralelas", "anillas", "banda_elastica", "toalla", "pared", "lastre", "escalon", "cuerda",
        // gym (solo si el usuario tiene acceso a gimnasio)
        "mancuernas", "barra", "polea", "maquina", "balon_medicinal", "bosu", "rodillo",
      ])
      .optional()
      .describe("Equipamiento disponible (ninguno = solo peso corporal; mancuernas/barra/polea/maquina/... solo si el usuario entrena en gimnasio)"),
    difficulty: z
      .enum(["beginner", "intermediate", "advanced"])
      .optional()
      .describe("Nivel de dificultad"),
    include_gym: z
      .boolean()
      .default(false)
      .describe("Incluir ejercicios de gimnasio (mancuernas, barra, polea, máquinas). SOLO true si el usuario tiene acceso a gimnasio."),
    limit: z.number().int().min(1).max(20).default(10).describe("Máximo de resultados"),
  }),
  execute: async ({ category, muscles, equipment, difficulty, include_gym, limit }) => {
    loadCatalog();

    let results = [...exerciseCatalog];

    // Calisthenics-first: drop gym exercises unless explicitly requested
    // (either include_gym or searching by a gym equipment id).
    const gymAllowed = include_gym || (equipment !== undefined && GYM_EQUIPMENT.has(equipment));
    if (!gymAllowed) {
      results = results.filter((ex) => !isGymExercise(ex));
    }

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

    // Curated catalog entries before imported ones so sessions favor them.
    results.sort((a, b) => curationRank(a) - curationRank(b));

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

// ── create_session tool ────────────────────────────────────────────────────

const createSessionTool = tool({
  description:
    "Crea la sesión de entrenamiento final con los ejercicios seleccionados del catálogo. " +
    "Llama esta herramienta UNA VEZ al final, después de buscar y seleccionar ejercicios con search_exercises. " +
    "Cada ID DEBE ser un ID exacto obtenido de resultados de search_exercises.",
  inputSchema: z.object({
    exercises: z.array(z.object({
      id: z.string().describe("ID exacto del ejercicio del catálogo"),
      sets: z.number().int().min(1).max(10).describe("Número de series"),
      reps: z.string().describe("Repeticiones o duración (ej: '8-12', '30s', '5')"),
      rest: z.number().int().min(0).max(300).describe("Descanso en segundos entre series"),
      phase: z.enum(["warmup", "main", "cooldown"]).default("main").describe("Fase del ejercicio: warmup (calentamiento), main (principal), cooldown (vuelta a la calma)"),
    })).min(1).describe("Lista de ejercicios para la sesión, ordenados por fase: warmup → main → cooldown"),
    format: z.enum(["standard", "circuit"]).default("standard").describe("Formato de la sesión"),
    circuit_type: z.enum(["tabata", "emom", "rounds"]).optional().describe("Tipo de circuito (solo si format=circuit)"),
    rounds: z.number().int().optional().describe("Rondas del circuito"),
    work_seconds: z.number().int().optional().describe("Segundos de trabajo por ejercicio (circuito)"),
    rest_seconds: z.number().int().optional().describe("Segundos de descanso entre ejercicios (circuito)"),
  }),
  execute: async (input) => {
    // Validate exercise IDs against catalog
    loadCatalog();
    const catalogIds = new Set(exerciseCatalog.map((ex) => ex.id));
    const validExercises = input.exercises.filter((ex) => catalogIds.has(ex.id));
    const invalidIds = input.exercises.filter((ex) => !catalogIds.has(ex.id)).map((ex) => ex.id);

    return {
      success: validExercises.length > 0,
      exercises: validExercises,
      exercise_count: validExercises.length,
      format: input.format,
      ...(input.circuit_type && { circuit_type: input.circuit_type }),
      ...(input.rounds && { rounds: input.rounds }),
      ...(input.work_seconds && { work_seconds: input.work_seconds }),
      ...(input.rest_seconds && { rest_seconds: input.rest_seconds }),
      ...(invalidIds.length > 0 && { invalid_ids: invalidIds }),
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

/**
 * Sección de contexto que se anexa al system prompt. Devuelve "" si el usuario
 * no aportó ningún dato, para no colgar un encabezado vacío del prompt.
 *
 * Vive en TypeScript a propósito (#298): son nueve condicionales, y en una
 * plantilla de Langfuse ni `tsc` ni un test los cubrirían. Langfuse manda sobre
 * la redacción que los rodea; el bloque entra como UNA variable.
 */
function buildUserContextBlock(ctx: SessionUserContext): string {
  const lines: string[] = [];
  if (ctx.age) lines.push(`- Edad: ${ctx.age} años`);
  if (ctx.weight) lines.push(`- Peso: ${ctx.weight} kg`);
  if (ctx.height) lines.push(`- Altura: ${ctx.height} cm`);
  if (ctx.sex) lines.push(`- Sexo: ${ctx.sex}`);
  if (ctx.level) lines.push(`- Nivel: ${ctx.level}`);
  if (ctx.goal) lines.push(`- Objetivo de la sesión: ${ctx.goal}`);
  if (ctx.equipment?.length) lines.push(`- Equipamiento disponible: ${ctx.equipment.join(", ")}`);
  if (ctx.location) lines.push(`- Ubicación: ${ctx.location}`);
  if (ctx.availableTime) lines.push(`- Tiempo disponible: ${ctx.availableTime} minutos`);

  if (lines.length === 0) return "";
  return `\n\n## Contexto del usuario\n\n${lines.join("\n")}`;
}

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

  // Build the instructions message with user context
  const instructions = systemPrompt + buildUserContextBlock(ctx);

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
    instructions,
    messages: modelMessages,
    tools: { search_exercises: searchExercisesTool, create_session: createSessionTool },
    maxOutputTokens: 4000,
    stopWhen: isStepCount(12),
    telemetry: langfuseTelemetry("free-session-generator", { prompt: langfusePrompt, metadata: { tier, modelName } }),
  });

  result.pipeUIMessageStreamToResponse(res);
}

/**
 * Hono-compatible entry point. Caller validates inputs before calling.
 * Returns a Web API Response — either SSE stream or error.
 */
export async function runFreeSession(
  messages: any[],
  userContext: any,
  user: any
): Promise<Response> {
  const tier: Tier = user?.tier === "pro" || user?.tier === "premium" ? "pro" : "free";
  const { model, name: modelName } = resolveModel(tier);
  const { prompt: systemPrompt, langfusePrompt } = await getPromptWithMeta("free-session-generator");

  const ctx: SessionUserContext = userContext;
  const instructions = systemPrompt + buildUserContextBlock(ctx);

  const truncatedMessages = messages.slice(-10);
  let modelMessages: any;
  try {
    modelMessages = await convertToModelMessages(truncatedMessages);
  } catch (err) {
    console.error("[free-session] convertToModelMessages failed:", err, "messages:", JSON.stringify(truncatedMessages).slice(0, 500));
    return Response.json({ error: "Formato de mensajes inválido" }, { status: 400 });
  }

  const result = streamText({
    model,
    instructions,
    messages: modelMessages,
    tools: { search_exercises: searchExercisesTool, create_session: createSessionTool },
    maxOutputTokens: 4000,
    stopWhen: isStepCount(12),
    telemetry: langfuseTelemetry("free-session-generator", { prompt: langfusePrompt, metadata: { tier, modelName } }),
  });

  return result.toUIMessageStreamResponse();
}
