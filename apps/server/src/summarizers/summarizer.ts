import type { Transcript, TranscriptChunk, VideoSummary } from "../types.js";

export interface Summarizer {
  summarize(transcript: Transcript, chunks: TranscriptChunk[]): Promise<VideoSummary>;
}
