import { describe, expect, it } from "vitest";
import { extractVideoId } from "./youtube-url.js";

const id = "dQw4w9WgXcQ";

describe("extractVideoId", () => {
  it.each([
    [`https://www.youtube.com/watch?v=${id}&t=42s`, id],
    [`https://youtu.be/${id}?si=abc`, id],
    [`https://youtube.com/shorts/${id}?feature=share`, id],
    [`https://m.youtube.com/embed/${id}`, id],
    [`https://youtube.com/live/${id}?feature=shared`, id],
  ])("extracts supported URL %s", (url, expected) => {
    expect(extractVideoId(url)).toBe(expected);
  });

  it.each([
    "not a url",
    "http://youtube.com/watch?v=dQw4w9WgXcQ",
    "https://evil.example/?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?v=too-short",
  ])("rejects unsafe or invalid input %s", (url) => {
    expect(() => extractVideoId(url)).toThrow();
  });
});
