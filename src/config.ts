import { readFileSync, existsSync } from "fs";
import { parse } from "yaml";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import type { Config } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function findConfigFile(): string {
  // 1. Environment variable
  if (process.env.CONFIG_PATH) {
    if (existsSync(process.env.CONFIG_PATH)) {
      return process.env.CONFIG_PATH;
    }
    throw new Error(`Config file not found at CONFIG_PATH: ${process.env.CONFIG_PATH}`);
  }

  // 2. Current directory
  const cwdConfig = join(process.cwd(), "config.yaml");
  if (existsSync(cwdConfig)) {
    return cwdConfig;
  }

  // 3. Project root (relative to dist/config.ts -> ../)
  const projectRoot = join(__dirname, "..", "config.yaml");
  if (existsSync(projectRoot)) {
    return projectRoot;
  }

  // 4. Try one more level up (in case running from dist/)
  const parentRoot = join(__dirname, "..", "..", "config.yaml");
  if (existsSync(parentRoot)) {
    return parentRoot;
  }

  throw new Error(
    "Config file not found. Please create config.yaml in the current directory or set CONFIG_PATH environment variable."
  );
}

export function loadConfig(): Config {
  const configPath = findConfigFile();

  let content: string;
  try {
    content = readFileSync(configPath, "utf-8");
  } catch (error) {
    throw new Error(`Failed to read config file: ${configPath}`);
  }

  let config: Config;
  try {
    config = parse(content) as Config;
  } catch (error) {
    throw new Error(`Failed to parse config file: ${error}`);
  }

  // Validation
  if (!config.allowedTools || !Array.isArray(config.allowedTools)) {
    throw new Error("Config error: 'allowedTools' must be an array");
  }

  if (config.allowedTools.length === 0) {
    throw new Error("Config error: 'allowedTools' must not be empty");
  }

  if (!config.upstream) {
    throw new Error("Config error: 'upstream' configuration is required");
  }

  if (!config.upstream.command) {
    throw new Error("Config error: 'upstream.command' is required");
  }

  if (!config.upstream.args || !Array.isArray(config.upstream.args)) {
    throw new Error("Config error: 'upstream.args' must be an array");
  }

  return config;
}
