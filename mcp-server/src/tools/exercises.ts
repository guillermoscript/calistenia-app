import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AuthManager } from "../auth.js";
import { errorResult, PaginationSchema, ResponseFormat } from "../utils.js";
import { searchWger, getWgerExerciseInfo, downloadWgerImage } from "../lib/wger.js";
import { mapWgerToExerciseCatalog } from "../lib/wger-mappings.js";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function registerExerciseTools(server: McpServer, auth: AuthManager) {
  const pb = auth.getClient();

  // ──────────────────────────────────────────────────────────────
  // SEARCH WGER
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_search_wger",
    {
      title: "Search wger Exercise Database",
      description:
        "Search the wger open-source exercise database for exercises by name. Returns exercise names, categories, and IDs that can be imported into the local catalog.",
      inputSchema: z
        .object({
          term: z
            .string()
            .min(2)
            .describe("Search term (exercise name or muscle group)"),
          language: z
            .string()
            .default("es")
            .describe("Language code for results (default: 'es')"),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ term, language }) => {
      try {
        const results = await searchWger(term, language);

        if (results.length === 0) {
          return { content: [{ type: "text", text: `No exercises found for "${term}" in wger.` }] };
        }

        const exercises = results.map((r) => ({
          wger_id: r.data.id,
          name: r.data.name,
          category: typeof r.data.category === "string" ? r.data.category : (r.data.category as any)?.name ?? "Unknown",
        }));

        const output = { count: exercises.length, term, language, exercises };

        const lines = [
          `# wger Search: "${term}"`,
          `Found **${exercises.length}** exercise(s)\n`,
        ];
        for (const ex of exercises) {
          lines.push(`- **${ex.name}** (${ex.category}) — wger_id: ${ex.wger_id}`);
        }
        lines.push(`\nUse \`cal_import_wger_exercise\` with the wger_id to import.`);

        return { content: [{ type: "text", text: lines.join("\n") }], structuredContent: output };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // IMPORT WGER EXERCISE
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_import_wger_exercise",
    {
      title: "Import Exercise from wger",
      description:
        "Import an exercise from the wger database into the local PocketBase catalog. Idempotent: if the exercise (by wger_id) already exists, returns the existing record.",
      inputSchema: z
        .object({
          wger_id: z
            .number()
            .int()
            .positive()
            .describe("The wger exercise ID to import"),
          language: z
            .string()
            .default("es")
            .describe("Preferred language for name/description (default: 'es')"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ wger_id, language }) => {
      try {
        // Check deduplication
        try {
          const existing = await pb.collection("exercises_catalog").getFirstListItem(pb.filter('wger_id = {:wger_id}', { wger_id }));
          return {
            content: [{ type: "text", text: `Exercise already exists: **${existing.name}** (ID: ${existing.id})` }],
            structuredContent: { id: existing.id, name: existing.name, already_existed: true },
          };
        } catch {
          // Not found — proceed
        }

        // Fetch from wger
        const info = await getWgerExerciseInfo(wger_id);
        if (!info) {
          return errorResult(`Could not fetch exercise info from wger for ID ${wger_id}`);
        }

        const mapped = mapWgerToExerciseCatalog(info, language);

        // Download up to 2 images
        const mainImages = info.images
          .sort((a, b) => (b.is_main ? 1 : 0) - (a.is_main ? 1 : 0))
          .slice(0, 2);

        const formData = new FormData();
        formData.append("name", mapped.name);
        formData.append("slug", mapped.slug);
        formData.append("description", mapped.description);
        formData.append("muscles", mapped.muscles);
        formData.append("category", mapped.category);
        formData.append("equipment", JSON.stringify(mapped.equipment));
        formData.append("priority", mapped.priority);
        formData.append("default_sets", String(mapped.default_sets));
        formData.append("default_reps", mapped.default_reps);
        formData.append("default_rest_seconds", String(mapped.default_rest_seconds));
        formData.append("source", mapped.source);
        formData.append("wger_id", String(mapped.wger_id));
        formData.append("wger_language", mapped.wger_language);
        formData.append("status", "official");

        for (const img of mainImages) {
          const imageData = await downloadWgerImage(img.image);
          if (imageData) {
            const ext = img.image.split(".").pop()?.split("?")[0] || "jpg";
            const fileName = `wger_${wger_id}_${img.id}.${ext}`;
            formData.append("default_images", new Blob([new Uint8Array(imageData)]), fileName);
          }
        }

        const record = await pb.collection("exercises_catalog").create(formData);

        const output = {
          id: record.id,
          name: mapped.name,
          category: mapped.category,
          muscles: mapped.muscles,
          equipment: mapped.equipment,
          wger_id,
          already_existed: false,
        };

        return {
          content: [
            {
              type: "text",
              text: `Imported **${mapped.name}** from wger!\n- Category: ${mapped.category}\n- Muscles: ${mapped.muscles}\n- Equipment: ${mapped.equipment.join(", ")}\n- PB ID: ${record.id}`,
            },
          ],
          structuredContent: output,
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // CHECK EXERCISE DUPLICATE
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_check_exercise_duplicate",
    {
      title: "Check Exercise Duplicate",
      description:
        "Check if an exercise name already exists in the catalog. Returns exact slug matches and fuzzy name matches from official/promoted exercises. Use before creating a new exercise.",
      inputSchema: z
        .object({
          name: z.string().min(2).describe("Exercise name to check for duplicates"),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ name }) => {
      try {
        const slug = slugify(name);

        // Exact slug match across all statuses
        let exactMatch: { id: string; name: string; slug: string; status: string } | null = null;
        try {
          const existing = await pb.collection("exercises_catalog").getFirstListItem(pb.filter('slug = {:slug}', { slug }));
          exactMatch = { id: existing.id, name: existing.name, slug: existing.slug, status: existing.status };
        } catch {
          // Not found
        }

        // Fuzzy search: split name into words, search each with ~ operator against official+promoted
        const words = name.trim().split(/\s+/).filter((w) => w.length >= 2);
        let fuzzyMatches: { id: string; name: string; slug: string; status: string }[] = [];

        if (words.length > 0) {
          const fuzzyConditions = words.map((_, i) => `name ~ {:word${i}}`).join(" || ");
          const fuzzyParams: Record<string, unknown> = {};
          words.forEach((w, i) => { fuzzyParams[`word${i}`] = w; });

          const filter = pb.filter(
            `(status = "official" || status = "promoted") && (${fuzzyConditions})`,
            fuzzyParams
          );

          const result = await pb.collection("exercises_catalog").getList(1, 5, {
            filter,
            sort: "name",
          });

          fuzzyMatches = result.items
            .filter((r) => !exactMatch || r.id !== exactMatch.id)
            .map((r) => ({ id: r.id, name: r.name, slug: r.slug, status: r.status }));
        }

        const output = { slug, exact_match: exactMatch, fuzzy_matches: fuzzyMatches };

        const lines: string[] = [`# Duplicate Check: "${name}" (slug: \`${slug}\`)\n`];
        if (exactMatch) {
          lines.push(`**Exact match found:** ${exactMatch.name} (ID: ${exactMatch.id}, status: ${exactMatch.status})`);
        } else {
          lines.push("No exact slug match found.");
        }
        if (fuzzyMatches.length > 0) {
          lines.push(`\n**Similar exercises (${fuzzyMatches.length}):**`);
          for (const m of fuzzyMatches) {
            lines.push(`- **${m.name}** (${m.status}) — ID: ${m.id}`);
          }
        } else {
          lines.push("\nNo similar exercises found.");
        }

        return { content: [{ type: "text", text: lines.join("\n") }], structuredContent: output };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // LIST CATALOG
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_list_catalog",
    {
      title: "List Exercise Catalog",
      description:
        "List or search exercises in the local PocketBase catalog. Filter by name, category, equipment, status, or creator.",
      inputSchema: z
        .object({
          ...PaginationSchema,
          search: z
            .string()
            .optional()
            .describe("Search by exercise name (partial match)"),
          category: z
            .string()
            .optional()
            .describe("Filter by category: push, pull, legs, core, full, lumbar, skill, movilidad"),
          equipment: z
            .string()
            .optional()
            .describe("Filter by equipment ID (e.g. 'barra_dominadas', 'lastre', 'ninguno')"),
          status: z
            .enum(["official", "private", "promoted", "all"])
            .optional()
            .describe("Filter by status. Default shows official + promoted. Use 'all' to include private exercises."),
          created_by: z
            .string()
            .optional()
            .describe("Filter by creator user ID. Useful for listing a user's private exercises."),
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ limit, offset, search, category, equipment, status, created_by, response_format }) => {
      try {
        const conditions: string[] = [];
        const params: Record<string, unknown> = {};

        // Status filter: default to official + promoted
        if (status === "all") {
          // No status filter
        } else if (status === "official" || status === "private" || status === "promoted") {
          conditions.push('status = {:status}');
          params.status = status;
        } else {
          // Default: official + promoted
          conditions.push('(status = "official" || status = "promoted")');
        }

        if (created_by) {
          conditions.push('created_by = {:created_by}');
          params.created_by = created_by;
        }

        if (search) {
          conditions.push('name ~ {:search}');
          params.search = search;
        }
        if (category) {
          conditions.push('category = {:category}');
          params.category = category;
        }
        if (equipment) {
          conditions.push('equipment ~ {:equipment}');
          params.equipment = equipment;
        }

        const filter = conditions.length > 0 ? pb.filter(conditions.join(' && '), params) : "";

        const result = await pb.collection("exercises_catalog").getList(offset / limit + 1, limit, {
          filter,
          sort: "name",
        });

        if (result.items.length === 0) {
          return { content: [{ type: "text", text: "No exercises found in the catalog with the given filters." }] };
        }

        const exercises = result.items.map((r) => ({
          id: r.id,
          name: r.name,
          slug: r.slug,
          category: r.category,
          muscles: r.muscles,
          equipment: r.equipment,
          priority: r.priority,
          default_sets: r.default_sets,
          default_reps: r.default_reps,
          source: r.source || "manual",
          wger_id: r.wger_id || null,
          status: r.status || "official",
          created_by: r.created_by || null,
          variant_of: r.variant_of || null,
        }));

        const output = { total: result.totalItems, count: exercises.length, exercises };

        let text: string;
        if (response_format === ResponseFormat.JSON) {
          text = JSON.stringify(output, null, 2);
        } else {
          const lines = [
            `# Exercise Catalog`,
            `Showing **${exercises.length}** of **${result.totalItems}** exercise(s)\n`,
          ];
          for (const ex of exercises) {
            const source = ex.source === "wger" ? " [wger]" : "";
            lines.push(`- **${ex.name}**${source} — ${ex.category} · ${ex.muscles || "—"}`);
          }
          text = lines.join("\n");
        }

        return { content: [{ type: "text", text }], structuredContent: output };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // CREATE EXERCISE
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_create_exercise",
    {
      title: "Create Custom Exercise",
      description:
        "Create a new exercise in the local catalog. Use this to add custom exercises that can then be used in programs.",
      inputSchema: z
        .object({
          name: z.string().min(2).describe("Exercise name"),
          category: z
            .enum(["push", "pull", "legs", "core", "full", "lumbar", "skill", "movilidad"])
            .describe("Exercise category"),
          muscles: z.string().optional().describe("Target muscles (e.g. 'Pecho, Tríceps')"),
          description: z.string().optional().describe("Exercise description or technique cues"),
          default_sets: z.number().int().min(1).default(3).describe("Default number of sets"),
          default_reps: z.string().default("8-12").describe("Default reps (e.g. '8-12', '30s', 'max')"),
          default_rest_seconds: z.number().int().default(60).describe("Default rest between sets in seconds"),
          equipment: z
            .array(z.string())
            .optional()
            .describe("Equipment needed (e.g. ['barra_dominadas', 'lastre'])"),
          youtube: z.string().optional().describe("YouTube URL for demo video"),
          is_timer: z.boolean().default(false).describe("Whether this is a timed exercise"),
          default_timer_seconds: z.number().int().optional().describe("Timer duration if is_timer is true"),
          note: z.string().optional().describe("Additional notes"),
          priority: z
            .enum(["primary", "secondary", "accessory"])
            .default("primary")
            .describe("Exercise priority level"),
          created_by: z
            .string()
            .optional()
            .describe("User ID of the creator. If provided, exercise is created as private. If omitted, created as official."),
          variant_of: z
            .string()
            .optional()
            .describe("ID of the parent exercise this is a variant of"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (input) => {
      try {
        const slug = slugify(input.name);
        const status = input.created_by ? "private" : "official";

        // Check for exact slug duplicates
        try {
          const existing = await pb.collection("exercises_catalog").getFirstListItem(pb.filter('slug = {:slug}', { slug }));
          // Block if found in official/promoted
          if (existing.status === "official" || existing.status === "promoted") {
            return {
              content: [{ type: "text", text: `This exercise already exists in the catalog: **${existing.name}** (ID: ${existing.id}, status: ${existing.status})` }],
              structuredContent: { id: existing.id, name: existing.name, already_existed: true, blocked: true },
            };
          }
          // Block if same user's private exercise
          if (existing.status === "private" && input.created_by && existing.created_by === input.created_by) {
            return {
              content: [{ type: "text", text: `You already have this exercise: **${existing.name}** (ID: ${existing.id})` }],
              structuredContent: { id: existing.id, name: existing.name, already_existed: true, blocked: true },
            };
          }
        } catch {
          // Not found — proceed
        }

        // Fuzzy search against official+promoted
        const words = input.name.trim().split(/\s+/).filter((w) => w.length >= 2);
        let fuzzyMatches: { id: string; name: string; slug: string }[] = [];

        if (words.length > 0) {
          const fuzzyConditions = words.map((_, i) => `name ~ {:word${i}}`).join(" || ");
          const fuzzyParams: Record<string, unknown> = {};
          words.forEach((w, i) => { fuzzyParams[`word${i}`] = w; });

          const filter = pb.filter(
            `(status = "official" || status = "promoted") && (${fuzzyConditions})`,
            fuzzyParams
          );

          const result = await pb.collection("exercises_catalog").getList(1, 5, { filter, sort: "name" });
          fuzzyMatches = result.items.map((r) => ({ id: r.id, name: r.name, slug: r.slug }));
        }

        const record = await pb.collection("exercises_catalog").create({
          name: input.name,
          slug,
          description: input.description || "",
          muscles: input.muscles || "",
          category: input.category,
          equipment: input.equipment || [],
          priority: input.priority,
          default_sets: input.default_sets,
          default_reps: input.default_reps,
          default_rest_seconds: input.default_rest_seconds,
          youtube: input.youtube || "",
          is_timer: input.is_timer,
          default_timer_seconds: input.default_timer_seconds || 0,
          note: input.note || "",
          source: "manual",
          status,
          created_by: input.created_by || null,
          variant_of: input.variant_of || null,
        });

        const lines = [
          `Created exercise **${input.name}** (ID: ${record.id})`,
          `- Status: ${status}`,
          `- Category: ${input.category}`,
          `- Muscles: ${input.muscles || "—"}`,
          `- Defaults: ${input.default_sets} × ${input.default_reps}, ${input.default_rest_seconds}s rest`,
        ];

        if (fuzzyMatches.length > 0) {
          lines.push(`\n**Similar exercises found (consider using variant_of):**`);
          for (const m of fuzzyMatches) {
            lines.push(`- **${m.name}** — ID: ${m.id}`);
          }
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          structuredContent: {
            id: record.id, name: input.name, slug, category: input.category,
            status, created_by: input.created_by || null, variant_of: input.variant_of || null,
            fuzzy_matches: fuzzyMatches,
          },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // PROMOTE EXERCISE
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_promote_exercise",
    {
      title: "Promote Exercise",
      description:
        "Admin-only. Promote a private exercise to 'promoted' status, making it visible to all users. Optionally override fields during promotion.",
      inputSchema: z
        .object({
          exercise_id: z.string().describe("ID of the private exercise to promote"),
          name: z.string().optional().describe("Override exercise name"),
          description: z.string().optional().describe("Override description"),
          muscles: z.string().optional().describe("Override target muscles"),
          category: z
            .enum(["push", "pull", "legs", "core", "full", "lumbar", "skill", "movilidad"])
            .optional()
            .describe("Override category"),
          youtube: z.string().optional().describe("Override YouTube URL"),
          slug: z.string().optional().describe("Override slug"),
          variant_of: z.string().nullable().optional().describe("Override variant_of (set to null to clear)"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ exercise_id, ...overrides }) => {
      try {
        const exercise = await pb.collection("exercises_catalog").getOne(exercise_id);

        if (exercise.status !== "private") {
          return errorResult(`Exercise "${exercise.name}" has status "${exercise.status}" — only private exercises can be promoted.`);
        }

        const updateData: Record<string, unknown> = { status: "promoted" };

        if (overrides.name !== undefined) {
          updateData.name = overrides.name;
          // Regenerate slug if name changed and no explicit slug override
          if (overrides.slug === undefined) {
            updateData.slug = slugify(overrides.name);
          }
        }
        if (overrides.slug !== undefined) updateData.slug = overrides.slug;
        if (overrides.description !== undefined) updateData.description = overrides.description;
        if (overrides.muscles !== undefined) updateData.muscles = overrides.muscles;
        if (overrides.category !== undefined) updateData.category = overrides.category;
        if (overrides.youtube !== undefined) updateData.youtube = overrides.youtube;
        if (overrides.variant_of !== undefined) updateData.variant_of = overrides.variant_of;

        const updated = await pb.collection("exercises_catalog").update(exercise_id, updateData);

        return {
          content: [
            {
              type: "text",
              text: `Promoted **${updated.name}** (ID: ${updated.id}) to community status.\n- Created by: ${updated.created_by}\n- Category: ${updated.category}\n- Overrides applied: ${Object.keys(updateData).filter((k) => k !== "status").join(", ") || "none"}`,
            },
          ],
          structuredContent: { id: updated.id, name: updated.name, status: "promoted", created_by: updated.created_by },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // DEMOTE EXERCISE
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_demote_exercise",
    {
      title: "Demote Exercise",
      description:
        "Admin-only. Revert a promoted exercise back to private status. The exercise will only be visible to its creator.",
      inputSchema: z
        .object({
          exercise_id: z.string().describe("ID of the promoted exercise to demote"),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ exercise_id }) => {
      try {
        const exercise = await pb.collection("exercises_catalog").getOne(exercise_id);

        if (exercise.status !== "promoted") {
          return errorResult(`Exercise "${exercise.name}" has status "${exercise.status}" — only promoted exercises can be demoted.`);
        }

        const updated = await pb.collection("exercises_catalog").update(exercise_id, { status: "private" });

        return {
          content: [
            {
              type: "text",
              text: `Demoted **${updated.name}** (ID: ${updated.id}) back to private status.\n- Owner: ${updated.created_by}`,
            },
          ],
          structuredContent: { id: updated.id, name: updated.name, status: "private", created_by: updated.created_by },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
