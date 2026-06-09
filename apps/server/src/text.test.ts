import { describe, expect, it } from "vitest";
import { chunkTranscript, cleanSegments, formatTimestamp } from "./text.js";

describe("transcript text utilities", () => {
  it("cleans markup, whitespace, and consecutive duplicate captions", () => {
    expect(cleanSegments([
      { text: " Hello &amp;  welcome ", startMs: 0, durationMs: 1_000 },
      { text: "<b>Hello &amp; welcome</b>", startMs: 1_000, durationMs: 1_000 },
      { text: "Next point", startMs: 2_000, durationMs: 1_000 },
    ])).toEqual([
      { text: "Hello & welcome", startMs: 0, durationMs: 1_000 },
      { text: "Next point", startMs: 2_000, durationMs: 1_000 },
    ]);
  });

  it("chunks without duplicating transcript segments", () => {
    const segments = Array.from({ length: 6 }, (_, index) => ({
      text: `Unique segment number ${index} with enough text.`,
      startMs: index * 1_000,
      durationMs: 1_000,
    }));
    const chunks = chunkTranscript(segments, 100);
    const combined = chunks.map((chunk) => chunk.text).join("\n");
    for (let index = 0; index < segments.length; index += 1) {
      expect(combined.match(new RegExp(`Unique segment number ${index}`, "g"))).toHaveLength(1);
    }
  });

  it("formats timestamps", () => {
    expect(formatTimestamp(65_000)).toBe("1:05");
    expect(formatTimestamp(3_665_000)).toBe("1:01:05");
  });
});
