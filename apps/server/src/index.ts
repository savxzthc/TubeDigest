import { createApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

const server = createApp().listen(config.PORT, () => {
  logger.info("TubeDigest server listening", { port: config.PORT });
});

function shutdown(signal: string) {
  logger.info("Shutting down", { signal });
  server.close((error) => {
    if (error) {
      logger.error("Shutdown failed", { error: error.message });
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
