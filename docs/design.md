# Lightweight GitHub MCP Design Document

## Overview

GitHub MCP (`@modelcontextprotocol/server-github`) exposes approximately 100 tools, consuming a significant amount of context window. This project implements a lightweight proxy server that wraps the original GitHub MCP and exposes only whitelisted tools.

## Goals

- Significant reduction in context consumption (100 tools → 10-20 tools)
- Simple YAML-based configuration
- Transparent proxy to the original MCP
- Easy setup in local environments

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Claude Desktop / Claude Code                               │
└─────────────────┬───────────────────────────────────────────┘
                  │ MCP Protocol (stdio)
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  lightweight-github-mcp (this project)                      │
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ MCP Server  │───▶│ Tool Filter │───▶│ MCP Client  │     │
│  │ (stdio)     │    │ (whitelist) │    │ (child proc)│     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│         ▲                                     │             │
│         │              config.yaml            │             │
│         │              (allowedTools)         ▼             │
└─────────┼───────────────────────────────────────────────────┘
          │                                     │
          │ MCP Protocol (stdio)                │ spawn
          │                                     ▼
          │           ┌───────────────────────────────────────┐
          │           │  @modelcontextprotocol/server-github  │
          │           │  (Original GitHub MCP)                │
          │           │  ~100 tools                           │
          │           └───────────────────────────────────────┘
          │
    Requests from Claude
```

---

## Directory Structure

```
lightweight-github-mcp/
├── package.json
├── tsconfig.json
├── config.yaml              # Tool whitelist configuration
├── src/
│   ├── index.ts             # Entry point
│   ├── server.ts            # MCP server implementation
│   ├── upstream-client.ts   # Upstream MCP client (child process management)
│   ├── config.ts            # Configuration file loading
│   └── types.ts             # Type definitions
├── dist/                    # Build output
└── README.md
```

---

## Configuration File Specification

### config.yaml

```yaml
# =====================================================
# Lightweight GitHub MCP Configuration File
# =====================================================

# Whitelist of tools to expose
# Only tools listed here will be exposed to Claude
allowedTools:
  # ----- Repository Operations -----
  - search_repositories
  - get_file_contents
  - create_or_update_file
  - push_files

  # ----- Issue Operations -----
  - create_issue
  - list_issues
  - get_issue
  - update_issue
  - add_issue_comment

  # ----- Pull Request Operations -----
  - create_pull_request
  - list_pull_requests
  - get_pull_request
  - create_pull_request_review

  # ----- Branch Operations -----
  - create_branch
  - list_branches

  # ----- Commit Operations -----
  - list_commits
  - get_commit

# Upstream MCP server configuration
upstream:
  # Execution command
  command: npx
  # Command arguments
  args:
    - "-y"
    - "@modelcontextprotocol/server-github"
```

### Configuration Loading Priority

1. Path specified by the `CONFIG_PATH` environment variable
2. `config.yaml` in the current directory
3. `config.yaml` in the project root

---

## Proxy Meta-Tools

This proxy not only filters upstream MCP tools but also provides its own meta-tools. These allow Claude to discover needed tools and guide users to add them to the whitelist.

### Meta-Tool List

| Tool Name | Description |
|-----------|-------------|
| `list_all_upstream_tools` | Get a list of all tools available in the upstream MCP |
| `list_blocked_tools` | List tools that are currently blocked (not in the whitelist) |
| `search_upstream_tools` | Search upstream tools by keyword |
| `get_tool_info` | Get detailed information about a specific tool (including its allowed status) |

### Tool Specifications

#### 1. list_all_upstream_tools

Returns a list of all tools available in the upstream GitHub MCP.

```typescript
// Input parameters
interface ListAllUpstreamToolsInput {
  // No parameters
}

// Output
interface ListAllUpstreamToolsOutput {
  total_count: number;
  allowed_count: number;
  blocked_count: number;
  tools: Array<{
    name: string;
    description: string;
    is_allowed: boolean;
  }>;
}
```

**Usage example (Claude response image):**
```
The upstream GitHub MCP has a total of 95 tools.
Currently 15 are allowed and 80 are blocked.

If you want to add a tool to the whitelist, add it to allowedTools in config.yaml.
```

#### 2. list_blocked_tools

Displays only tools that are not in the whitelist (blocked).

```typescript
// Input parameters
interface ListBlockedToolsInput {
  category?: string;  // Optional: filter by "issue", "pr", "repo", "branch", etc.
}

// Output
interface ListBlockedToolsOutput {
  count: number;
  tools: Array<{
    name: string;
    description: string;
    category: string;  // Inferred category
  }>;
  hint: string;  // How to add to the whitelist
}
```

**Usage example (Claude response image):**
```
The `add_labels_to_issue` tool is required for "Add a label to an Issue",
but it is not in the current whitelist.

To use this tool, add the following to allowedTools in config.yaml:
  - add_labels_to_issue

After adding, restart the MCP server to make it available.
```

#### 3. search_upstream_tools

Search upstream tools by keyword. Used by Claude to investigate "Is there such a feature?"

```typescript
// Input parameters
interface SearchUpstreamToolsInput {
  query: string;      // Search keyword (searches tool names and descriptions)
  include_allowed?: boolean;  // Include allowed tools in results (default: true)
}

// Output
interface SearchUpstreamToolsOutput {
  query: string;
  results: Array<{
    name: string;
    description: string;
    is_allowed: boolean;
    relevance: "high" | "medium" | "low";
  }>;
  suggestion: string | null;  // Suggestion to add to whitelist
}
```

**Usage example (Claude response image):**
```
Search results for "label":

✅ Allowed:
  (none)

🔒 Blocked:
  - add_labels_to_issue: Add labels to an issue
  - remove_label_from_issue: Remove a label from an issue
  - list_labels: List all labels in a repository

To use these, add them to config.yaml.
```

#### 4. get_tool_info

Get detailed information and allowed status for a specific tool by name.

```typescript
// Input parameters
interface GetToolInfoInput {
  tool_name: string;  // Tool name
}

// Output
interface GetToolInfoOutput {
  name: string;
  description: string;
  input_schema: object;  // JSON schema
  is_allowed: boolean;
  status: "allowed" | "blocked" | "not_found";
  how_to_enable: string | null;  // Only when blocked
}
```

**Usage example (Claude response image):**
```
Tool: create_release
Description: Create a new release in a repository
Status: 🔒 Blocked

To enable, add the following to allowedTools in config.yaml:
  - create_release

Required parameters:
  - owner (string): Repository owner
  - repo (string): Repository name
  - tag_name (string): Tag name for the release
  - name (string, optional): Release title
  - body (string, optional): Release description
```

---

### Meta-Tool Implementation Location

These tools are provided by the proxy server itself (not proxied upstream).

```typescript
// Implementation in server.ts

private setupHandlers(): void {
  this.server.setRequestHandler(ListToolsRequestSchema, async () => {
    // Combine filtered upstream tools + meta-tools
    const upstreamTools = await this.getFilteredUpstreamTools();
    const metaTools = this.getMetaTools();
    return { tools: [...metaTools, ...upstreamTools] };
  });

  this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Handle meta-tools locally
    if (this.isMetaTool(name)) {
      return await this.handleMetaTool(name, args);
    }

    // Proxy upstream tools
    if (!this.allowedTools.has(name)) {
      throw new McpError(ErrorCode.MethodNotFound, `Tool "${name}" is not allowed`);
    }
    return await this.upstreamClient.callTool(name, args);
  });
}

private getMetaTools(): Tool[] {
  return [
    {
      name: "list_all_upstream_tools",
      description: "List all tools available in the upstream GitHub MCP (both allowed and blocked). Use this to discover what tools exist.",
      inputSchema: { type: "object", properties: {}, required: [] }
    },
    {
      name: "list_blocked_tools",
      description: "List tools that are available in upstream GitHub MCP but currently blocked by the whitelist. Use this when you need a tool that isn't available.",
      inputSchema: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: "Filter by category: issue, pr, repo, branch, commit, release, etc.",
            enum: ["issue", "pr", "repo", "branch", "commit", "release", "gist", "user", "org", "other"]
          }
        },
        required: []
      }
    },
    {
      name: "search_upstream_tools",
      description: "Search for tools in the upstream GitHub MCP by keyword. Use this to find tools that might help with a specific task.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search keyword (searches tool names and descriptions)"
          },
          include_allowed: {
            type: "boolean",
            description: "Include already allowed tools in results (default: true)"
          }
        },
        required: ["query"]
      }
    },
    {
      name: "get_tool_info",
      description: "Get detailed information about a specific tool, including its parameters and whether it's currently allowed.",
      inputSchema: {
        type: "object",
        properties: {
          tool_name: {
            type: "string",
            description: "The name of the tool to get info about"
          }
        },
        required: ["tool_name"]
      }
    }
  ];
}
```

---

### Usage Guidance for Claude (for system prompt)

Recommended text to include in the proxy README or tool description:

```
## GitHub MCP Tools Discovery

This is a lightweight GitHub MCP proxy with tool whitelisting.
Not all GitHub MCP tools are enabled by default.

When you need a GitHub feature that isn't available:
1. Use `search_upstream_tools` to find relevant tools
2. Use `get_tool_info` to see tool details and parameters
3. Inform the user which tools they need to add to config.yaml
4. The user will add the tool and restart the server

Example workflow:
- User: "Add a label to this issue"
- You: (search for "label" tools, find it's blocked)
- You: "The `add_labels_to_issue` tool exists but is not enabled.
        To use it, add `- add_labels_to_issue` to your config.yaml
        and restart the MCP server."
```

---

## Main Component Specifications

### 1. index.ts (Entry Point)

```typescript
// Responsibilities:
// - Load configuration file
// - Initialize and start MCP server
// - Signal handling (graceful shutdown)

async function main(): Promise<void> {
  // 1. Load configuration
  // 2. Initialize upstream client
  // 3. Start MCP server
  // 4. Connect via stdio
}
```

### 2. server.ts (MCP Server)

```typescript
// Responsibilities:
// - Connect as MCP Server via stdio
// - Handle tools/list requests (filtering + add meta-tools)
// - Handle tools/call requests (meta-tool processing or proxy)

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

class LightweightGitHubServer {
  private server: Server;
  private allowedTools: Set<string>;
  private upstreamClient: UpstreamClient;
  private cachedUpstreamTools: Tool[] | null = null;  // Tool list cache

  // Meta-tool name constants
  private static META_TOOLS = [
    "list_all_upstream_tools",
    "list_blocked_tools",
    "search_upstream_tools",
    "get_tool_info"
  ];

  constructor(config: Config) {
    this.allowedTools = new Set(config.allowedTools);
    this.upstreamClient = new UpstreamClient(config.upstream);

    this.server = new Server(
      { name: "lightweight-github-mcp", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // tools/list handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const upstreamTools = await this.getFilteredUpstreamTools();
      const metaTools = this.getMetaToolDefinitions();
      return { tools: [...metaTools, ...upstreamTools] };
    });

    // tools/call handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Handle meta-tools locally
      if (LightweightGitHubServer.META_TOOLS.includes(name)) {
        return await this.handleMetaTool(name, args);
      }

      // Whitelist check
      if (!this.allowedTools.has(name)) {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Tool "${name}" is not allowed. Use "search_upstream_tools" to find available tools.`
        );
      }

      // Proxy to upstream
      return await this.upstreamClient.callTool(name, args);
    });
  }

  // Get upstream tool list (with cache)
  private async getAllUpstreamTools(): Promise<Tool[]> {
    if (!this.cachedUpstreamTools) {
      this.cachedUpstreamTools = await this.upstreamClient.listTools();
    }
    return this.cachedUpstreamTools;
  }

  // Get filtered upstream tools
  private async getFilteredUpstreamTools(): Promise<Tool[]> {
    const allTools = await this.getAllUpstreamTools();
    return allTools.filter(t => this.allowedTools.has(t.name));
  }

  // Meta-tool processing
  private async handleMetaTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    const allTools = await this.getAllUpstreamTools();

    switch (name) {
      case "list_all_upstream_tools":
        return this.handleListAllUpstreamTools(allTools);

      case "list_blocked_tools":
        return this.handleListBlockedTools(allTools, args.category as string | undefined);

      case "search_upstream_tools":
        return this.handleSearchUpstreamTools(allTools, args.query as string, args.include_allowed as boolean);

      case "get_tool_info":
        return this.handleGetToolInfo(allTools, args.tool_name as string);

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown meta tool: ${name}`);
    }
  }

  private handleListAllUpstreamTools(allTools: Tool[]): CallToolResult {
    const allowed = allTools.filter(t => this.allowedTools.has(t.name));
    const blocked = allTools.filter(t => !this.allowedTools.has(t.name));

    const result = {
      total_count: allTools.length,
      allowed_count: allowed.length,
      blocked_count: blocked.length,
      tools: allTools.map(t => ({
        name: t.name,
        description: t.description || "",
        is_allowed: this.allowedTools.has(t.name)
      }))
    };

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  private handleListBlockedTools(allTools: Tool[], category?: string): CallToolResult {
    let blocked = allTools.filter(t => !this.allowedTools.has(t.name));

    // Category inference and filtering
    const categorized = blocked.map(t => ({
      name: t.name,
      description: t.description || "",
      category: this.inferCategory(t.name)
    }));

    if (category) {
      categorized.filter(t => t.category === category);
    }

    const result = {
      count: categorized.length,
      tools: categorized,
      hint: "To enable a tool, add its name to the 'allowedTools' list in config.yaml and restart the server."
    };

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  private handleSearchUpstreamTools(allTools: Tool[], query: string, includeAllowed = true): CallToolResult {
    const lowerQuery = query.toLowerCase();

    let results = allTools.filter(t =>
      t.name.toLowerCase().includes(lowerQuery) ||
      (t.description || "").toLowerCase().includes(lowerQuery)
    );

    if (!includeAllowed) {
      results = results.filter(t => !this.allowedTools.has(t.name));
    }

    const output = {
      query,
      results: results.map(t => ({
        name: t.name,
        description: t.description || "",
        is_allowed: this.allowedTools.has(t.name),
        relevance: t.name.toLowerCase().includes(lowerQuery) ? "high" : "medium"
      })),
      suggestion: results.some(t => !this.allowedTools.has(t.name))
        ? "Some tools are blocked. Add them to config.yaml to enable."
        : null
    };

    return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
  }

  private handleGetToolInfo(allTools: Tool[], toolName: string): CallToolResult {
    const tool = allTools.find(t => t.name === toolName);

    if (!tool) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            name: toolName,
            status: "not_found",
            message: "This tool does not exist in the upstream GitHub MCP."
          }, null, 2)
        }]
      };
    }

    const isAllowed = this.allowedTools.has(tool.name);

    const result = {
      name: tool.name,
      description: tool.description || "",
      input_schema: tool.inputSchema,
      is_allowed: isAllowed,
      status: isAllowed ? "allowed" : "blocked",
      how_to_enable: isAllowed ? null : `Add "- ${tool.name}" to allowedTools in config.yaml and restart the server.`
    };

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  // Infer category from tool name
  private inferCategory(toolName: string): string {
    const name = toolName.toLowerCase();
    if (name.includes("issue")) return "issue";
    if (name.includes("pull") || name.includes("pr")) return "pr";
    if (name.includes("branch")) return "branch";
    if (name.includes("commit")) return "commit";
    if (name.includes("release")) return "release";
    if (name.includes("gist")) return "gist";
    if (name.includes("repo")) return "repo";
    if (name.includes("user")) return "user";
    if (name.includes("org")) return "org";
    if (name.includes("file") || name.includes("content")) return "file";
    if (name.includes("label")) return "label";
    if (name.includes("milestone")) return "milestone";
    if (name.includes("comment")) return "comment";
    if (name.includes("review")) return "review";
    if (name.includes("workflow") || name.includes("action")) return "actions";
    return "other";
  }

  // Meta-tool definitions
  private getMetaToolDefinitions(): Tool[] {
    // ... (same as getMetaTools() above)
  }

  async run(): Promise<void> {
    await this.upstreamClient.connect();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
```

### 3. upstream-client.ts (Upstream MCP Client)

```typescript
// Responsibilities:
// - Launch original GitHub MCP as a child process
// - Communicate with child process as MCP Client
// - Proxy tool list retrieval and tool execution

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn, ChildProcess } from "child_process";

class UpstreamClient {
  private client: Client;
  private process: ChildProcess | null = null;
  private config: UpstreamConfig;

  constructor(config: UpstreamConfig) {
    this.config = config;
    this.client = new Client(
      { name: "lightweight-github-proxy", version: "1.0.0" },
      { capabilities: {} }
    );
  }

  async connect(): Promise<void> {
    // Launch upstream MCP as child process
    const transport = new StdioClientTransport({
      command: this.config.command,
      args: this.config.args,
      env: {
        ...process.env,
        // GITHUB_PERSONAL_ACCESS_TOKEN is inherited from environment variables
      }
    });

    await this.client.connect(transport);
  }

  async listTools(): Promise<Tool[]> {
    const result = await this.client.listTools();
    return result.tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    return await this.client.callTool({ name, arguments: args });
  }

  async disconnect(): Promise<void> {
    await this.client.close();
  }
}
```

### 4. config.ts (Configuration Management)

```typescript
// Responsibilities:
// - Load and parse YAML file
// - Validate configuration
// - Apply default values

import { readFileSync } from "fs";
import { parse } from "yaml";

interface Config {
  allowedTools: string[];
  upstream: {
    command: string;
    args: string[];
  };
}

function loadConfig(configPath?: string): Config {
  const path = configPath
    || process.env.CONFIG_PATH
    || "./config.yaml";

  const content = readFileSync(path, "utf-8");
  const config = parse(content) as Config;

  // Validation
  if (!config.allowedTools || config.allowedTools.length === 0) {
    throw new Error("allowedTools must not be empty");
  }

  return config;
}
```

---

## Dependencies

### package.json

```json
{
  "name": "lightweight-github-mcp",
  "version": "1.0.0",
  "description": "A lightweight proxy for GitHub MCP with tool whitelisting",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "lightweight-github-mcp": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "yaml": "^2.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Claude Desktop Configuration

### claude_desktop_config.json

```json
{
  "mcpServers": {
    "github-lite": {
      "command": "node",
      "args": ["/absolute/path/to/lightweight-github-mcp/dist/index.js"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

### Environment Variables

| Variable Name | Required | Description |
|---------------|----------|-------------|
| `GITHUB_PERSONAL_ACCESS_TOKEN` | Yes | GitHub Personal Access Token |
| `CONFIG_PATH` | No | Path to configuration file (default: `./config.yaml`) |

---

## Processing Flow

### Startup Sequence

```
1. main() starts
   │
2. Load config.yaml
   │
3. Initialize UpstreamClient
   │
4. Launch upstream MCP (server-github) as child process
   │
5. Establish connection with upstream MCP
   │
6. Initialize LightweightGitHubServer
   │
7. Connect with Claude via stdio transport
   │
8. Request waiting loop
```

### tools/list Request Processing

```
Claude → tools/list request
    │
    ▼
LightweightGitHubServer.handleListTools()
    │
    ├─▶ UpstreamClient.listTools()
    │       │
    │       ▼
    │   Upstream MCP → Full tool list (~100 items)
    │       │
    │       ▼
    │   Return response (save to cache)
    │
    ├─▶ Filtering process
    │       │
    │       ├─▶ Extract only tools in allowedTools
    │       │
    │       ▼
    │   Filtered upstream tools (10-20 items)
    │
    ├─▶ Add meta-tool definitions
    │       │
    │       ▼
    │   + list_all_upstream_tools
    │   + list_blocked_tools
    │   + search_upstream_tools
    │   + get_tool_info
    │
    ▼
Claude ← Filtered tools + meta-tools list
```

### tools/call Request Processing

```
Claude → tools/call { name: "create_issue", arguments: {...} }
    │
    ▼
LightweightGitHubServer.handleCallTool()
    │
    ├─▶ Meta-tool check
    │       │
    │       ├─▶ If meta-tool: process locally with handleMetaTool()
    │       │       │
    │       │       ▼
    │       │   Claude ← Meta-tool execution result
    │       │
    │       ▼
    │   If regular tool: continue
    │
    ├─▶ Whitelist check
    │       │
    │       ├─▶ If not allowed: return error response
    │       │
    │       ▼
    │   If allowed: continue
    │
    ├─▶ UpstreamClient.callTool(name, args)
    │       │
    │       ▼
    │   Upstream MCP → Execute tool
    │       │
    │       ▼
    │   Return execution result
    │
    ▼
Claude ← Tool execution result
```

### Meta-Tool Usage Flow (Tool Discovery Scenario)

```
User: "Add a label to this issue"
    │
    ▼
Claude: (create_issue etc. are allowed but no label-related tools)
    │
    ├─▶ search_upstream_tools { query: "label" }
    │       │
    │       ▼
    │   Result: add_labels_to_issue (blocked),
    │           remove_label_from_issue (blocked), etc.
    │
    ├─▶ get_tool_info { tool_name: "add_labels_to_issue" }
    │       │
    │       ▼
    │   Result: {
    │     name: "add_labels_to_issue",
    │     status: "blocked",
    │     input_schema: {...},
    │     how_to_enable: "Add to config.yaml..."
    │   }
    │
    ▼
Claude → User:
  "To add a label to an issue, the `add_labels_to_issue` tool is required,
   but it is not currently enabled.

   To use it, add the following to allowedTools in config.yaml:
     - add_labels_to_issue

   After adding, restart the MCP server to make it available."
```

---

## Error Handling

### Error Cases

| Case | Response |
|------|----------|
| Configuration file not found | Exit with clear error message |
| Configuration file parse error | Display YAML syntax error location |
| allowedTools is empty | Validation error |
| Upstream MCP startup failure | Error message + exit |
| Upstream MCP connection timeout | Timeout error (30 seconds) |
| Call to non-allowed tool | McpError (MethodNotFound) |
| Tool execution error in upstream MCP | Return error as-is |

### Graceful Shutdown

```typescript
// Signal handling
process.on("SIGINT", async () => {
  await upstreamClient.disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await upstreamClient.disconnect();
  process.exit(0);
});
```

---

## Recommended Whitelist

Recommended sets of commonly used tools:

> **Note**: Meta-tools (`list_all_upstream_tools`, `list_blocked_tools`, `search_upstream_tools`, `get_tool_info`) are always enabled and do not need to be listed in config.yaml.

### Minimal Configuration (10 tools)

```yaml
allowedTools:
  # File operations
  - get_file_contents
  - create_or_update_file

  # Issue
  - create_issue
  - list_issues
  - get_issue

  # PR
  - create_pull_request
  - list_pull_requests

  # Branch
  - create_branch
  - list_branches

  # Search
  - search_repositories
```

### Standard Configuration (20 tools)

```yaml
allowedTools:
  # File operations
  - get_file_contents
  - create_or_update_file
  - push_files

  # Issue
  - create_issue
  - list_issues
  - get_issue
  - update_issue
  - add_issue_comment

  # PR
  - create_pull_request
  - list_pull_requests
  - get_pull_request
  - merge_pull_request
  - create_pull_request_review

  # Branch
  - create_branch
  - list_branches
  - delete_branch

  # Commit
  - list_commits
  - get_commit

  # Search
  - search_repositories
  - search_code
```

---

## Testing

### Manual Testing

```bash
# 1. Build
npm run build

# 2. Set environment variable
export GITHUB_PERSONAL_ACCESS_TOKEN="ghp_xxxxx"

# 3. Startup test (using MCP Inspector)
npx @modelcontextprotocol/inspector node dist/index.js
```

### Verification Items

- [ ] No errors on startup
- [ ] tools/list returns only configured tools
- [ ] Allowed tools execute successfully
- [ ] Non-allowed tools return errors
- [ ] Normal shutdown with Ctrl+C

---

## Future Extension Ideas

1. **Tool alias feature**: Call long tool names with shortened aliases
2. **Argument default values**: Preset commonly used repository names, etc.
3. **Execution logging**: Record which tools were called and when
4. **Multiple upstream MCP support**: Wrap MCPs other than GitHub in the same way
5. **Dynamic reload**: Apply configuration changes without server restart
