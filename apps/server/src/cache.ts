import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import type { Transcript } from "./types.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

interface CacheEntry {
  expiresAt: number;
  transcript: Transcript;
}

const memory = new Map<string, CacheEntry>();
const cacheDirectory = path.resolve(process.cwd(), "apps/server/data/cache");

function cacheKey(videoId: string, language?: string): string {
  return createHash("sha256").update(`${videoId}:${language ?? "default"}`).digest("hex");
}

export async function getCachedTranscript(videoId: string, language?: string): Promise<Transcript | null> {
  const key = cacheKey(videoId, language);
  const inMemory = memory.get(key);
  if (inMemory && inMemory.expiresAt > Date.now()) return inMemory.transcript;

  try {
    const value = JSON.parse(await readFile(path.join(cacheDirectory, `${key}.json`), "utf8")) as CacheEntry;
    if (value.expiresAt > Date.now()) {
      memory.set(key, value);
      return value.transcript;
    }
  } catch {
    // A cache miss or corrupt cache entry should never break transcript retrieval.
  }
  return null;
}

export async function setCachedTranscript(transcript: Transcript, requestedLanguage?: string): Promise<void> {
  const key = cacheKey(transcript.videoId, requestedLanguage);
  const entry: CacheEntry = {
    expiresAt: Date.now() + config.TRANSCRIPT_CACHE_TTL_HOURS * 3_600_000,
    transcript,
  };
  memory.set(key, entry);
  try {
    await mkdir(cacheDirectory, { recursive: true });
    await writeFile(path.join(cacheDirectory, `${key}.json`), JSON.stringify(entry), "utf8");
  } catch (error) {
    logger.warn("Unable to persist transcript cache", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
