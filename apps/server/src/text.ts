import type { TranscriptBlock, TranscriptChunk, TranscriptSegment } from "./types.js";

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": "\"",
  "&#39;": "'",
  "&nbsp;": " ",
};

export function cleanCaptionText(value: string): string {
  return value
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (entity) => HTML_ENTITIES[entity] ?? entity)
    .replace(/<[^>]*>/g, " ")
    .replace(/\u200b|\ufeff/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  const cleaned: TranscriptSegment[] = [];
  let previous = "";

  for (const segment of segments) {
    const text = cleanCaptionText(segment.text);
    const normalized = text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (!text || normalized === previous) continue;
    cleaned.push({ ...segment, text });
    previous = normalized;
  }
  return cleaned;
}

export function formatTimestamp(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
    : `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function createTranscriptBlocks(
  segments: TranscriptSegment[],
  targetDurationMs = 30_000,
  targetCharacters = 1_200,
): TranscriptBlock[] {
  const blocks: TranscriptBlock[] = [];
  let current: TranscriptSegment[] = [];
  let characters = 0;

  const flush = () => {
    if (current.length === 0) return;
    const first = current[0]!;
    const last = current[current.length - 1]!;
    blocks.push({
      startMs: first.startMs,
      endMs: last.startMs + last.durationMs,
      text: current.map((segment) => segment.text).join(" ").replace(/\s+/g, " ").trim(),
    });
    current = [];
    characters = 0;
  };

  for (const segment of segments) {
    const first = current[0];
    const elapsed = first ? segment.startMs - first.startMs : 0;
    if (current.length > 0 && (elapsed >= targetDurationMs || characters + segment.text.length > targetCharacters)) {
      flush();
    }
    current.push(segment);
    characters += segment.text.length + 1;
  }
  flush();
  return blocks;
}

export function chunkTranscript(
  segments: TranscriptSegment[],
  targetCharacters = 4_700,
): TranscriptChunk[] {
  const blocks = createTranscriptBlocks(segments);
  if (blocks.length === 0) return [];

  const chunks: TranscriptChunk[] = [];
  let current: TranscriptBlock[] = [];
  let previousContext: TranscriptBlock[] = [];
  let characterCount = 0;

  const flush = () => {
    if (current.length === 0) return;
    const first = current[0]!;
    const last = current[current.length - 1]!;
    const contextText = previousContext
      .map((block) => `[${formatTimestamp(block.startMs)}] ${block.text}`)
      .join("\n");
    chunks.push({
      index: chunks.length,
      startMs: first.startMs,
      endMs: last.endMs,
      text: current.map((block) => `[${formatTimestamp(block.startMs)}] ${block.text}`).join("\n"),
      ...(contextText ? { contextText } : {}),
    });
    previousContext = current.slice(-2);
    current = [];
    characterCount = 0;
  };

  for (const block of blocks) {
    const addition = block.text.length + 12;
    if (current.length > 0 && characterCount + addition > targetCharacters) flush();
    current.push(block);
    characterCount += addition;
  }
  flush();
  return chunks;
}
