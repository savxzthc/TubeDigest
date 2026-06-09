import { formatTimestamp } from "../text.js";
import type { Transcript, TranscriptChunk, VideoSummary } from "../types.js";
import type { Summarizer } from "./summarizer.js";

function sentences(text: string): string[] {
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  return [...segmenter.segment(text)]
    .map(({ segment }) => segment.trim())
    .filter((sentence) => sentence.length >= 35 && sentence.length <= 500);
}

function distinct(items: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").slice(0, 100);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
    if (result.length === limit) break;
  }
  return result;
}

export class MockSummarizer implements Summarizer {
  async summarize(transcript: Transcript, chunks: TranscriptChunk[]): Promise<VideoSummary> {
    const allSentences = sentences(transcript.text);
    const selected = distinct(
      chunks.flatMap((chunk) => {
        const chunkSentences = sentences(chunk.text);
        return [chunkSentences[0], chunkSentences[Math.floor(chunkSentences.length / 2)]]
          .filter((value): value is string => Boolean(value));
      }),
      10,
    );
    const points = selected.length > 0 ? selected : allSentences.slice(0, 6);
    const overview = points.slice(0, 2).join(" ") || "The transcript does not contain enough prose for an extractive overview.";
    const sectionRows = chunks.slice(0, 8).map((chunk) => {
      const point = sentences(chunk.text)[0] ?? "This section contains transcript content that could not be condensed automatically.";
      return `- **${formatTimestamp(chunk.startMs)}** ${point}`;
    });

    const markdown = [
      `# ${transcript.title}`,
      "",
      "## Short overview",
      overview,
      "",
      "## Main points",
      ...points.slice(0, 7).map((point) => `- ${point}`),
      "",
      "## Important details",
      ...points.slice(2, 8).map((point) => `- ${point}`),
      "",
      "## Sections",
      ...sectionRows,
      "",
      "## Key takeaways",
      ...points.slice(-3).map((point) => `- ${point}`),
      "",
      "> Development mock: this is an extractive summary assembled from transcript sentences. Add `OPENAI_API_KEY` for an abstractive summary.",
    ].join("\n");

    return { markdown, provider: "mock", model: "extractive-v1" };
  }
}
