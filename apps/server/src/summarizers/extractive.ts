import { createTranscriptBlocks, formatTimestamp } from "../text.js";
import type { Transcript, TranscriptChunk, VideoSummary } from "../types.js";
import type { Summarizer } from "./summarizer.js";

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "because", "been", "before", "being", "between", "could",
  "from", "going", "have", "here", "into", "just", "like", "more", "most", "only", "other",
  "really", "should", "some", "than", "that", "their", "them", "then", "there", "these", "they",
  "this", "through", "very", "want", "were", "what", "when", "where", "which", "while", "with",
  "would", "your",
]);

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]{2,}/gu) ?? [];
}

function truncate(text: string, limit = 360): string {
  if (text.length <= limit) return text;
  const shortened = text.slice(0, limit);
  const boundary = Math.max(shortened.lastIndexOf(". "), shortened.lastIndexOf(", "), shortened.lastIndexOf(" "));
  return `${shortened.slice(0, Math.max(boundary, limit - 60)).trim()}...`;
}

function selectHighlights(transcript: Transcript, limit: number) {
  const blocks = createTranscriptBlocks(transcript.segments, 45_000, 1_600);
  const frequencies = new Map<string, number>();
  for (const block of blocks) {
    for (const word of new Set(words(block.text).filter((value) => !STOP_WORDS.has(value)))) {
      frequencies.set(word, (frequencies.get(word) ?? 0) + 1);
    }
  }
  const titleWords = new Set(words(transcript.title));
  return blocks
    .map((block, index) => {
      const blockWords = words(block.text).filter((value) => !STOP_WORDS.has(value));
      const relevance = blockWords.reduce(
        (score, word) => score + (frequencies.get(word) ?? 0) + (titleWords.has(word) ? 5 : 0),
        0,
      ) / Math.max(blockWords.length, 1);
      return { block, index, relevance };
    })
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, limit)
    .sort((a, b) => a.index - b.index);
}

export class ExtractiveSummarizer implements Summarizer {
  async summarize(transcript: Transcript, chunks: TranscriptChunk[]): Promise<VideoSummary> {
    const blocks = createTranscriptBlocks(transcript.segments, 45_000, 1_600);
    const highlights = selectHighlights(transcript, 7);
    const overview = blocks[0]
      ? truncate(blocks[0].text, 520)
      : "The transcript does not contain enough text for an overview.";
    const sectionStep = Math.max(1, Math.floor(blocks.length / 6));
    const sections = blocks.filter((_block, index) => index % sectionStep === 0).slice(0, 7);

    const markdown = [
      `# ${transcript.title}`,
      "",
      "## Short overview",
      overview,
      "",
      "## Main points",
      ...highlights.slice(0, 5).map(({ block }) => `- ${truncate(block.text)}`),
      "",
      "## Important details",
      ...highlights.slice(2, 7).map(({ block }) => `- **${formatTimestamp(block.startMs)}** ${truncate(block.text)}`),
      "",
      "## Sections",
      ...sections.map((block) => `- **${formatTimestamp(block.startMs)}** ${truncate(block.text, 300)}`),
      "",
      "## Key takeaways",
      ...highlights.slice(-3).map(({ block }) => `- ${truncate(block.text)}`),
      "",
      "> Basic fallback summary: install and run Ollama for a higher-quality free local AI summary.",
    ].join("\n");

    return { markdown, provider: "extractive", model: "timed-keyword-v2" };
  }
}
