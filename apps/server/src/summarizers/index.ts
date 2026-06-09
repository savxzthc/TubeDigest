import { config } from "../config.js";
import { AppError } from "../errors.js";
import { logger } from "../logger.js";
import { ExtractiveSummarizer } from "./extractive.js";
import { OllamaSummarizer } from "./ollama.js";
import { OpenAISummarizer } from "./openai.js";
import type { Summarizer } from "./summarizer.js";

class AutoSummarizer implements Summarizer {
  private readonly ollama = new OllamaSummarizer(
    config.OLLAMA_BASE_URL,
    config.OLLAMA_MODEL,
    config.OLLAMA_TIMEOUT_MS,
  );
  private readonly openai = config.OPENAI_API_KEY
    ? new OpenAISummarizer(config.OPENAI_API_KEY, config.OPENAI_MODEL)
    : null;
  private readonly extractive = new ExtractiveSummarizer();

  async summarize(...arguments_: Parameters<Summarizer["summarize"]>) {
    if (await this.ollama.isAvailable()) {
      try {
        return await this.ollama.summarize(...arguments_);
      } catch (error) {
        logger.warn("Local Ollama summary failed; trying the next configured provider", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (this.openai) return this.openai.summarize(...arguments_);
    return this.extractive.summarize(...arguments_);
  }
}

export function createSummarizer(): Summarizer {
  if (config.SUMMARIZER_MODE === "auto") return new AutoSummarizer();
  if (config.SUMMARIZER_MODE === "extractive" || config.SUMMARIZER_MODE === "mock") {
    return new ExtractiveSummarizer();
  }
  if (config.SUMMARIZER_MODE === "ollama") {
    return new OllamaSummarizer(config.OLLAMA_BASE_URL, config.OLLAMA_MODEL, config.OLLAMA_TIMEOUT_MS);
  }
  if (config.SUMMARIZER_MODE === "openai" && config.OPENAI_API_KEY) {
    return new OpenAISummarizer(config.OPENAI_API_KEY, config.OPENAI_MODEL);
  }
  if (config.SUMMARIZER_MODE === "openai") {
    throw new AppError(503, "AI_ERROR", "OPENAI_API_KEY is required when SUMMARIZER_MODE=openai.");
  }
  return new ExtractiveSummarizer();
}
