import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({
  path: [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env"),
  ],
  quiet: true,
});

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-5.4-mini"),
  OLLAMA_BASE_URL: z.string().url().default("http://127.0.0.1:11434"),
  OLLAMA_MODEL: z.string().min(1).default("qwen2.5:1.5b"),
  OLLAMA_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),
  SUMMARIZER_MODE: z.enum(["auto", "ollama", "openai", "extractive", "mock"]).default("auto"),
  TRANSCRIPT_CACHE_TTL_HOURS: z.coerce.number().positive().default(24),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export const config = schema.parse(process.env);
