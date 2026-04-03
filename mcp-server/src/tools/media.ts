import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AuthManager } from "../auth.js";
import { errorResult, ResponseFormat } from "../utils.js";
import { localize } from "../lib/i18n.js";

export function registerMediaTools(server: McpServer, auth: AuthManager) {
  const pb = auth.getClient();

  // ──────────────────────────────────────────────────────────────
  // LIST EXERCISE MEDIA
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_list_exercise_media",
    {
      title: "List Exercise Media",
      description:
        "List all media (images and videos) attached to exercises in a program, or to a specific exercise in the catalog. Returns file URLs.",
      inputSchema: z
        .object({
          program_id: z
            .string()
            .optional()
            .describe("Program ID to list media for all its exercises"),
          exercise_record_id: z
            .string()
            .optional()
            .describe("Specific program_exercises record ID to get media for"),
          catalog_exercise_id: z
            .string()
            .optional()
            .describe("Specific exercises_catalog record ID to get default media for"),
          response_format: z
            .nativeEnum(ResponseFormat)
            .default(ResponseFormat.MARKDOWN)
            .describe("Output format"),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ program_id, exercise_record_id, catalog_exercise_id, response_format }) => {
      try {
        const results: Array<{
          id: string;
          collection: string;
          name: string;
          images: string[];
          image_urls: string[];
          video: string | null;
          video_url: string | null;
        }> = [];

        // Program exercises media
        if (exercise_record_id) {
          const rec = await pb.collection("program_exercises").getOne(exercise_record_id);
          const images = (rec.demo_images as string[]) || [];
          const video = (rec.demo_video as string) || null;
          results.push({
            id: rec.id,
            collection: "program_exercises",
            name: localize(rec.exercise_name),
            images,
            image_urls: images.map((f) => pb.files.getUrl(rec, f)),
            video,
            video_url: video ? pb.files.getUrl(rec, video) : null,
          });
        } else if (program_id) {
          const exercises = await pb.collection("program_exercises").getFullList({
            filter: pb.filter('program = {:program_id}', { program_id }),
            sort: "phase_number,sort_order",
          });
          for (const rec of exercises) {
            const images = (rec.demo_images as string[]) || [];
            const video = (rec.demo_video as string) || null;
            if (images.length > 0 || video) {
              results.push({
                id: rec.id,
                collection: "program_exercises",
                name: localize(rec.exercise_name),
                images,
                image_urls: images.map((f) => pb.files.getUrl(rec, f)),
                video,
                video_url: video ? pb.files.getUrl(rec, video) : null,
              });
            }
          }
        }

        // Catalog exercise media
        if (catalog_exercise_id) {
          const rec = await pb.collection("exercises_catalog").getOne(catalog_exercise_id);
          const images = (rec.default_images as string[]) || [];
          const video = (rec.default_video as string) || null;
          results.push({
            id: rec.id,
            collection: "exercises_catalog",
            name: localize(rec.name),
            images,
            image_urls: images.map((f) => pb.files.getUrl(rec, f)),
            video,
            video_url: video ? pb.files.getUrl(rec, video) : null,
          });
        }

        const output = { count: results.length, exercises: results };

        let text: string;
        if (response_format === ResponseFormat.JSON) {
          text = JSON.stringify(output, null, 2);
        } else {
          if (results.length === 0) {
            text = "No media found for the specified exercises.";
          } else {
            const lines = [`# Exercise Media\n`];
            for (const ex of results) {
              lines.push(`## ${ex.name} (\`${ex.id}\` in ${ex.collection})`);
              if (ex.images.length > 0) {
                lines.push(`**Images** (${ex.images.length}):`);
                ex.image_urls.forEach((url, i) => lines.push(`  ${i + 1}. ${url}`));
              } else {
                lines.push("**Images**: none");
              }
              lines.push(ex.video_url ? `**Video**: ${ex.video_url}` : "**Video**: none");
              lines.push("");
            }
            text = lines.join("\n");
          }
        }

        return { content: [{ type: "text", text }], structuredContent: output };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // UPLOAD EXERCISE MEDIA
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_upload_exercise_media",
    {
      title: "Upload Exercise Media",
      description:
        "Upload images or video to an exercise. Supports program_exercises (demo_images/demo_video) and exercises_catalog (default_images/default_video). Pass image data as base64.",
      inputSchema: z
        .object({
          record_id: z.string().describe("The record ID to upload media to"),
          collection: z
            .enum(["program_exercises", "exercises_catalog"])
            .describe("Which collection the record belongs to"),
          field: z
            .enum(["images", "video"])
            .describe("Whether uploading to the images field or video field"),
          file_name: z.string().describe("File name with extension (e.g. 'pushup-demo.jpg', 'tutorial.mp4')"),
          base64_data: z
            .string()
            .describe(
              "Base64-encoded file data. For images: JPEG/PNG/WebP (max 5MB). For video: MP4/WebM (max 50MB)."
            ),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ record_id, collection, field, file_name, base64_data }) => {
      try {
        // Decode base64 to buffer
        const buffer = Buffer.from(base64_data, "base64");

        // Create a File-like object for PocketBase
        const blob = new Blob([buffer]);
        const file = new File([blob], file_name);

        // Build FormData
        const formData = new FormData();
        const fieldName =
          collection === "program_exercises"
            ? field === "images"
              ? "demo_images"
              : "demo_video"
            : field === "images"
              ? "default_images"
              : "default_video";

        formData.append(fieldName, file);

        // Upload via PocketBase update
        const updated = await pb.collection(collection).update(record_id, formData);

        const uploadedFiles =
          field === "images"
            ? (updated[fieldName] as string[]) || []
            : (updated[fieldName] as string) ? [updated[fieldName] as string] : [];

        const urls = uploadedFiles.map((f) => pb.files.getUrl(updated, f));

        return {
          content: [
            {
              type: "text",
              text: `Uploaded **${file_name}** to \`${collection}/${record_id}\` (${fieldName}). ${urls.length} file(s) now attached.\n\nURLs:\n${urls.map((u, i) => `${i + 1}. ${u}`).join("\n")}`,
            },
          ],
          structuredContent: {
            record_id,
            collection,
            field: fieldName,
            files: uploadedFiles,
            urls,
          },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // DELETE EXERCISE MEDIA
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_delete_exercise_media",
    {
      title: "Delete Exercise Media",
      description:
        "Remove a specific media file from an exercise. Pass the file name to remove from the images array, or clear the video field.",
      inputSchema: z
        .object({
          record_id: z.string().describe("The record ID to remove media from"),
          collection: z
            .enum(["program_exercises", "exercises_catalog"])
            .describe("Which collection the record belongs to"),
          field: z
            .enum(["images", "video"])
            .describe("Whether removing from the images field or video field"),
          file_name: z
            .string()
            .optional()
            .describe("For images: the specific file name to remove. For video: omit to clear the video."),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ record_id, collection, field, file_name }) => {
      try {
        const fieldName =
          collection === "program_exercises"
            ? field === "images"
              ? "demo_images"
              : "demo_video"
            : field === "images"
              ? "default_images"
              : "default_video";

        if (field === "video") {
          // Clear the video field
          await pb.collection(collection).update(record_id, { [fieldName]: null });
          return {
            content: [{ type: "text", text: `Cleared video from \`${collection}/${record_id}\`.` }],
            structuredContent: { record_id, collection, field: fieldName, removed: true },
          };
        }

        if (!file_name) {
          return errorResult("file_name is required when removing an image.");
        }

        // For images, use PocketBase's file removal syntax: fieldName- with the filename
        // PocketBase SDK: pass `fieldName-` key to remove specific files
        await pb.collection(collection).update(record_id, { [`${fieldName}-`]: [file_name] } as any);

        const updated = await pb.collection(collection).getOne(record_id);
        const remaining = (updated[fieldName] as string[]) || [];

        return {
          content: [
            {
              type: "text",
              text: `Removed **${file_name}** from \`${collection}/${record_id}\`. ${remaining.length} image(s) remaining.`,
            },
          ],
          structuredContent: {
            record_id,
            collection,
            field: fieldName,
            removed: file_name,
            remaining_files: remaining,
          },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );

  // ──────────────────────────────────────────────────────────────
  // GET EXERCISE MEDIA URL
  // ──────────────────────────────────────────────────────────────
  server.registerTool(
    "cal_get_media_url",
    {
      title: "Get Exercise Media URL",
      description:
        "Get the direct download URL for a specific media file. Useful for displaying or sharing exercise media.",
      inputSchema: z
        .object({
          record_id: z.string().describe("The record ID"),
          collection: z
            .enum(["program_exercises", "exercises_catalog"])
            .describe("Which collection"),
          file_name: z.string().describe("The file name (from list_exercise_media)"),
          thumb: z
            .string()
            .optional()
            .describe("Optional thumbnail size (e.g. '200x200', '100x0' for width-only). Only for images."),
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ record_id, collection, file_name, thumb }) => {
      try {
        const rec = await pb.collection(collection).getOne(record_id);
        const url = pb.files.getUrl(rec, file_name, thumb ? { thumb } : undefined);

        return {
          content: [{ type: "text", text: url }],
          structuredContent: { record_id, collection, file_name, url, thumb: thumb || null },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    }
  );
}
