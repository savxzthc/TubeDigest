import { describe, expect, it } from "vitest";
import { formatDuration, safeFilename } from "./utils";

describe("client utilities", () => {
  it("formats video durations", () => {
    expect(formatDuration(75)).toBe("1m 15s");
    expect(formatDuration(3_661)).toBe("1h 1m");
  });

  it("creates safe text filenames", () => {
    expect(safeFilename("A Video: Test / Demo")).toBe("a-video-test-demo.txt");
  });
});
