import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface UpstreamConfig {
  command: string;
  args: string[];
}

export interface Config {
  allowedTools: string[];
  upstream: UpstreamConfig;
}

export interface ToolInfo {
  name: string;
  description: string;
  is_allowed: boolean;
}

export interface ListAllUpstreamToolsOutput {
  total_count: number;
  allowed_count: number;
  blocked_count: number;
  tools: ToolInfo[];
}

export interface BlockedToolInfo {
  name: string;
  description: string;
  category: string;
}

export interface ListBlockedToolsOutput {
  count: number;
  tools: BlockedToolInfo[];
  hint: string;
}

export interface SearchResult {
  name: string;
  description: string;
  is_allowed: boolean;
  relevance: "high" | "medium" | "low";
}

export interface SearchUpstreamToolsOutput {
  query: string;
  results: SearchResult[];
  suggestion: string | null;
}

export interface GetToolInfoOutput {
  name: string;
  description?: string;
  input_schema?: unknown;
  is_allowed?: boolean;
  status: "allowed" | "blocked" | "not_found";
  how_to_enable?: string | null;
  message?: string;
}

export type { Tool };
