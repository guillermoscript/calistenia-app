import dotenv from "dotenv";
dotenv.config();

export interface AppConfig {
  port: number;
  pocketbaseUrl: string;
  providers: { anthropic: boolean; google: boolean; openai: boolean };
  rateLimit: { windowMs: number; maxRequests: number };
  upload: { maxSizeMb: number; allowedMimeTypes: string[] };
  defaultProvider: string;
  defaultModelFree: string;
  defaultModelPro: string;
}

const config: AppConfig = {
  port: parseInt(process.env.PORT ?? process.env.MCP_SERVER_PORT ?? "3001", 10),
  pocketbaseUrl: process.env.POCKETBASE_URL ?? "http://127.0.0.1:8090",
  providers: {
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    google: !!process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? "60000", 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX ?? "10", 10),
  },
  upload: {
    maxSizeMb: parseInt(process.env.UPLOAD_MAX_SIZE_MB ?? "10", 10),
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  },
  defaultProvider: process.env.DEFAULT_AI_PROVIDER ?? "",
  defaultModelFree: process.env.DEFAULT_MODEL_FREE ?? "",
  defaultModelPro: process.env.DEFAULT_MODEL_PRO ?? "",
};

export default config;
