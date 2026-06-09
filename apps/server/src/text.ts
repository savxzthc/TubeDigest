import type { TranscriptChunk, TranscriptSegment } from "./types.js";

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

export function chunkTranscript(
  segments: TranscriptSegment[],
  targetCharacters = 18_000,
): TranscriptChunk[] {
  if (segments.length === 0) return [];

  const chunks: TranscriptChunk[] = [];
  let current: TranscriptSegment[] = [];
  let characterCount = 0;

  const flush = () => {
    if (current.length === 0) return;
    const first = current[0]!;
    const last = current[current.length - 1]!;
    chunks.push({
      index: chunks.length,
      startMs: first.startMs,
      endMs: last.startMs + last.durationMs,
      text: current.map((segment) => `[${formatTimestamp(segment.startMs)}] ${segment.text}`).join("\n"),
    });
    current = [];
    characterCount = 0;
  };

  for (const segment of segments) {
    const addition = segment.text.length + 12;
    if (current.length > 0 && characterCount + addition > targetCharacters) flush();
    current.push(segment);
    characterCount += addition;
  }
  flush();
  return chunks;
}
