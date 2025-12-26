#!/usr/bin/env node

import { loadConfig } from "./config.js";
import { LightweightGitHubServer } from "./server.js";

let server: LightweightGitHubServer | null = null;

async function main(): Promise<void> {
  // Check for required environment variable
  if (!process.env.GITHUB_PERSONAL_ACCESS_TOKEN) {
    console.error("Error: GITHUB_PERSONAL_ACCESS_TOKEN environment variable is required");
    process.exit(1);
  }

  // Load configuration
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error(`Configuration error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }

  // Create and start server
  server = new LightweightGitHubServer(config);

  try {
    await server.run();
  } catch (error) {
    console.error(`Server error: ${error instanceof Error ? error.message : error}`);
    await gracefulShutdown();
    process.exit(1);
  }
}

async function gracefulShutdown(): Promise<void> {
  if (server) {
    try {
      await server.shutdown();
    } catch {
      // Ignore shutdown errors
    }
  }
}

// Signal handlers for graceful shutdown
process.on("SIGINT", async () => {
  await gracefulShutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await gracefulShutdown();
  process.exit(0);
});

// Handle uncaught errors
process.on("uncaughtException", async (error) => {
  console.error("Uncaught exception:", error);
  await gracefulShutdown();
  process.exit(1);
});

process.on("unhandledRejection", async (reason) => {
  console.error("Unhandled rejection:", reason);
  await gracefulShutdown();
  process.exit(1);
});

// Start the server
main().catch(async (error) => {
  console.error("Fatal error:", error);
  await gracefulShutdown();
  process.exit(1);
});
