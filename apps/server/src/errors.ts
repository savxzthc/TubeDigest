export type ErrorCode =
  | "INVALID_URL"
  | "VIDEO_UNAVAILABLE"
  | "TRANSCRIPT_UNAVAILABLE"
  | "LANGUAGE_UNAVAILABLE"
  | "UPSTREAM_ERROR"
  | "AI_ERROR"
  | "RATE_LIMITED";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "AppError";
  }
}
