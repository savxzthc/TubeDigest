import { config } from "../config.js";
import { AppError } from "../errors.js";
import { MockSummarizer } from "./mock.js";
import { OpenAISummarizer } from "./openai.js";
import type { Summarizer } from "./summarizer.js";

export function createSummarizer(): Summarizer {
  if (config.SUMMARIZER_MODE === "mock") return new MockSummarizer();
  if (config.OPENAI_API_KEY) return new OpenAISummarizer(config.OPENAI_API_KEY, config.OPENAI_MODEL);
  if (config.SUMMARIZER_MODE === "openai") {
    throw new AppError(503, "AI_ERROR", "OPENAI_API_KEY is required when SUMMARIZER_MODE=openai.");
  }
  return new MockSummarizer();
}
