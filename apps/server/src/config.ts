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
  SUMMARIZER_MODE: z.enum(["auto", "openai", "mock"]).default("auto"),
  TRANSCRIPT_CACHE_TTL_HOURS: z.coerce.number().positive().default(24),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export const config = schema.parse(process.env);
