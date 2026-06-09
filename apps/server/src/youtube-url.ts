import { AppError } from "./errors.js";

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const ALLOWED_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

export function extractVideoId(input: string): string {
  const value = input.trim();
  if (!value || value.length > 2_048) {
    throw new AppError(400, "INVALID_URL", "Enter a valid YouTube URL.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError(400, "INVALID_URL", "Enter a complete YouTube URL, including https://.");
  }

  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new AppError(400, "INVALID_URL", "Only HTTPS YouTube URLs are supported.");
  }

  let candidate: string | null = null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  if (host.endsWith("youtu.be")) {
    candidate = parts[0] ?? null;
  } else if (url.pathname === "/watch") {
    candidate = url.searchParams.get("v");
  } else if (["shorts", "embed", "live"].includes(parts[0] ?? "")) {
    candidate = parts[1] ?? null;
  }

  if (!candidate || !VIDEO_ID_PATTERN.test(candidate)) {
    throw new AppError(400, "INVALID_URL", "The URL does not contain a valid YouTube video ID.");
  }

  return candidate;
}
