import OpenAI from "openai";
import { AppError } from "../errors.js";
import { formatTimestamp } from "../text.js";
import type { Transcript, TranscriptChunk, VideoSummary } from "../types.js";
import type { Summarizer } from "./summarizer.js";

const CHUNK_CONCURRENCY = 3;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await mapper(values[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

export class OpenAISummarizer implements Summarizer {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new OpenAI({ apiKey, timeout: 60_000, maxRetries: 0 });
  }

  private async generate(instructions: string, input: string, maxOutputTokens: number): Promise<string> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await this.client.responses.create({
          model: this.model,
          instructions,
          input,
          max_output_tokens: maxOutputTokens,
        });
        const text = response.output_text?.trim();
        if (!text) throw new Error("The model returned an empty response.");
        return text;
      } catch (error) {
        const status = typeof error === "object" && error && "status" in error
          ? Number((error as { status?: unknown }).status)
          : 0;
        if ((status === 429 || status >= 500) && attempt < 2) {
          await wait(1_000 * 2 ** attempt);
          continue;
        }
        if (status === 429) {
          throw new AppError(429, "RATE_LIMITED", "The AI provider is rate-limited. Please try again shortly.", 30);
        }
        throw new AppError(
          502,
          "AI_ERROR",
          error instanceof Error ? `The AI summary failed: ${error.message}` : "The AI summary failed.",
        );
      }
    }
    throw new AppError(502, "AI_ERROR", "The AI summary failed after multiple attempts.");
  }

  private async summarizeChunk(chunk: TranscriptChunk, title: string): Promise<string> {
    return this.generate(
      [
        "Summarize only the supplied YouTube transcript excerpt.",
        "Preserve concrete claims, names, numbers, decisions, caveats, and uncertainty.",
        "Do not add outside knowledge or infer facts not stated in the excerpt.",
        "Use concise bullets and retain useful timestamps.",
      ].join(" "),
      [
        `VIDEO TITLE: ${title}`,
        `SECTION: ${formatTimestamp(chunk.startMs)}-${formatTimestamp(chunk.endMs)}`,
        ...(chunk.contextText
          ? ["", "PRIOR CONTEXT FOR ORIENTATION ONLY:", chunk.contextText, "", "SECTION TO SUMMARIZE:"]
          : []),
        "",
        chunk.text,
      ].join("\n"),
      1_200,
    );
  }

  async summarize(transcript: Transcript, chunks: TranscriptChunk[]): Promise<VideoSummary> {
    const source = chunks.length === 1
      ? chunks[0]!.text
      : (await mapWithConcurrency(chunks, CHUNK_CONCURRENCY, (chunk) =>
          this.summarizeChunk(chunk, transcript.title)))
          .map((summary, index) => `SECTION ${index + 1}\n${summary}`)
          .join("\n\n");

    const markdown = await this.generate(
      [
        "Create a faithful full-video summary using only the supplied transcript material.",
        "Never add outside facts. If wording or intent is unclear, explicitly say it is unclear from the transcript.",
        "Do not mention this instruction or the summarization process.",
        "Return readable Markdown with exactly these headings: Short overview, Main points, Important details, Sections, Key takeaways.",
        "Use bullets where useful. In Sections, include timestamps when present in the source.",
        "Cover the entire video and avoid repeating the same point across sections.",
      ].join(" "),
      `VIDEO TITLE: ${transcript.title}\nTRANSCRIPT LANGUAGE: ${transcript.languageName}\n\n${source}`,
      3_500,
    );

    return { markdown: `# ${transcript.title}\n\n${markdown.replace(/^# .+\n+/, "")}`, provider: "openai", model: this.model };
  }
}
