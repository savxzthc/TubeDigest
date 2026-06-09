import { config } from "./config.js";

const priorities = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof priorities;

function write(level: Level, message: string, fields: Record<string, unknown> = {}) {
  if (priorities[level] < priorities[config.LOG_LEVEL]) return;
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...fields,
  });
  (level === "error" ? console.error : console.log)(entry);
}

export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) => write("debug", message, fields),
  info: (message: string, fields?: Record<string, unknown>) => write("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write("error", message, fields),
};
