import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AuthManager } from "../auth.js";
import { errorResult, PaginationSchema, ResponseFormat } from "../utils.js";
import { searchWger, getWgerExerciseInfo, downloadWgerImage } from "../lib/wger.js";
import { mapWgerToExerciseCatalog } from "../lib/wger-mappings.js";

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
          category: r.data.category.name,
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
          const existing = await pb.collection("exercises_catalog").getFirstListItem(`wger_id = ${wger_id}`);
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
  // LIST CATALOG
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_list_catalog",
    {
      title: "List Exercise Catalog",
      description:
        "List or search exercises in the local PocketBase catalog. Filter by name, category, or equipment.",
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
        })
        .strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ limit, offset, search, category, equipment, response_format }) => {
      try {
        const filters: string[] = [];

        if (search) {
          filters.push(`name ~ "${search}"`);
        }
        if (category) {
          filters.push(`category = "${category}"`);
        }
        if (equipment) {
          filters.push(`equipment ~ "${equipment}"`);
        }

        const filter = filters.length > 0 ? filters.join(" && ") : "";

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
}
