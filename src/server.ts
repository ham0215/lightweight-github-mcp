import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { UpstreamClient } from "./upstream-client.js";
import type {
  Config,
  ListAllUpstreamToolsOutput,
  ListBlockedToolsOutput,
  SearchUpstreamToolsOutput,
  GetToolInfoOutput,
  BlockedToolInfo,
  SearchResult,
} from "./types.js";

export class LightweightGitHubServer {
  private server: Server;
  private allowedTools: Set<string>;
  private upstreamClient: UpstreamClient;
  private cachedUpstreamTools: Tool[] | null = null;

  // Meta-tool name constants
  private static META_TOOLS = [
    "list_all_upstream_tools",
    "list_blocked_tools",
    "search_upstream_tools",
    "get_tool_info",
  ] as const;

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
      if (this.isMetaTool(name)) {
        return await this.handleMetaTool(name, args ?? {});
      }

      // Whitelist check
      if (!this.allowedTools.has(name)) {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Tool "${name}" is not allowed. Use "search_upstream_tools" to find available tools.`
        );
      }

      // Proxy to upstream
      return await this.upstreamClient.callTool(name, args ?? {});
    });
  }

  private isMetaTool(name: string): boolean {
    return (LightweightGitHubServer.META_TOOLS as readonly string[]).includes(name);
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
    return allTools.filter((t) => this.allowedTools.has(t.name));
  }

  // Meta-tool processing
  private async handleMetaTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const allTools = await this.getAllUpstreamTools();

    switch (name) {
      case "list_all_upstream_tools":
        return this.handleListAllUpstreamTools(allTools);

      case "list_blocked_tools":
        return this.handleListBlockedTools(allTools, args.category as string | undefined);

      case "search_upstream_tools":
        return this.handleSearchUpstreamTools(
          allTools,
          args.query as string,
          args.include_allowed as boolean | undefined
        );

      case "get_tool_info":
        return this.handleGetToolInfo(allTools, args.tool_name as string);

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown meta tool: ${name}`);
    }
  }

  private handleListAllUpstreamTools(
    allTools: Tool[]
  ): { content: Array<{ type: string; text: string }> } {
    const allowed = allTools.filter((t) => this.allowedTools.has(t.name));
    const blocked = allTools.filter((t) => !this.allowedTools.has(t.name));

    const result: ListAllUpstreamToolsOutput = {
      total_count: allTools.length,
      allowed_count: allowed.length,
      blocked_count: blocked.length,
      tools: allTools.map((t) => ({
        name: t.name,
        description: t.description || "",
        is_allowed: this.allowedTools.has(t.name),
      })),
    };

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  private handleListBlockedTools(
    allTools: Tool[],
    category?: string
  ): { content: Array<{ type: string; text: string }> } {
    const blocked = allTools.filter((t) => !this.allowedTools.has(t.name));

    // Category inference and filtering
    let categorized: BlockedToolInfo[] = blocked.map((t) => ({
      name: t.name,
      description: t.description || "",
      category: this.inferCategory(t.name),
    }));

    if (category) {
      categorized = categorized.filter((t) => t.category === category);
    }

    const result: ListBlockedToolsOutput = {
      count: categorized.length,
      tools: categorized,
      hint: "To enable a tool, add its name to the 'allowedTools' list in config.yaml and restart the server.",
    };

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  private handleSearchUpstreamTools(
    allTools: Tool[],
    query: string,
    includeAllowed?: boolean
  ): { content: Array<{ type: string; text: string }> } {
    if (!query) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: "Query parameter is required" }, null, 2),
          },
        ],
      };
    }

    const lowerQuery = query.toLowerCase();
    const shouldIncludeAllowed = includeAllowed !== false; // Default to true

    let results = allTools.filter(
      (t) =>
        t.name.toLowerCase().includes(lowerQuery) ||
        (t.description || "").toLowerCase().includes(lowerQuery)
    );

    if (!shouldIncludeAllowed) {
      results = results.filter((t) => !this.allowedTools.has(t.name));
    }

    const searchResults: SearchResult[] = results.map((t) => ({
      name: t.name,
      description: t.description || "",
      is_allowed: this.allowedTools.has(t.name),
      relevance: t.name.toLowerCase().includes(lowerQuery) ? "high" : "medium",
    }));

    const output: SearchUpstreamToolsOutput = {
      query,
      results: searchResults,
      suggestion: results.some((t) => !this.allowedTools.has(t.name))
        ? "Some tools are blocked. Add them to config.yaml to enable."
        : null,
    };

    return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
  }

  private handleGetToolInfo(
    allTools: Tool[],
    toolName: string
  ): { content: Array<{ type: string; text: string }> } {
    if (!toolName) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: "tool_name parameter is required" }, null, 2),
          },
        ],
      };
    }

    const tool = allTools.find((t) => t.name === toolName);

    if (!tool) {
      const result: GetToolInfoOutput = {
        name: toolName,
        status: "not_found",
        message: "This tool does not exist in the upstream GitHub MCP.",
      };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    const isAllowed = this.allowedTools.has(tool.name);

    const result: GetToolInfoOutput = {
      name: tool.name,
      description: tool.description || "",
      input_schema: tool.inputSchema,
      is_allowed: isAllowed,
      status: isAllowed ? "allowed" : "blocked",
      how_to_enable: isAllowed
        ? null
        : `Add "- ${tool.name}" to allowedTools in config.yaml and restart the server.`,
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
    return [
      {
        name: "list_all_upstream_tools",
        description:
          "List all tools available in the upstream GitHub MCP (both allowed and blocked). Use this to discover what tools exist.",
        inputSchema: { type: "object" as const, properties: {}, required: [] },
      },
      {
        name: "list_blocked_tools",
        description:
          "List tools that are available in upstream GitHub MCP but currently blocked by the whitelist. Use this when you need a tool that isn't available.",
        inputSchema: {
          type: "object" as const,
          properties: {
            category: {
              type: "string",
              description: "Filter by category: issue, pr, repo, branch, commit, release, etc.",
              enum: [
                "issue",
                "pr",
                "repo",
                "branch",
                "commit",
                "release",
                "gist",
                "user",
                "org",
                "file",
                "label",
                "milestone",
                "comment",
                "review",
                "actions",
                "other",
              ],
            },
          },
          required: [],
        },
      },
      {
        name: "search_upstream_tools",
        description:
          "Search for tools in the upstream GitHub MCP by keyword. Use this to find tools that might help with a specific task.",
        inputSchema: {
          type: "object" as const,
          properties: {
            query: {
              type: "string",
              description: "Search keyword (searches tool names and descriptions)",
            },
            include_allowed: {
              type: "boolean",
              description: "Include already allowed tools in results (default: true)",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "get_tool_info",
        description:
          "Get detailed information about a specific tool, including its parameters and whether it's currently allowed.",
        inputSchema: {
          type: "object" as const,
          properties: {
            tool_name: {
              type: "string",
              description: "The name of the tool to get info about",
            },
          },
          required: ["tool_name"],
        },
      },
    ];
  }

  async run(): Promise<void> {
    await this.upstreamClient.connect();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }

  async shutdown(): Promise<void> {
    await this.upstreamClient.disconnect();
  }

  getUpstreamClient(): UpstreamClient {
    return this.upstreamClient;
  }
}
