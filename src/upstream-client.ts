import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { UpstreamConfig } from "./types.js";

export class UpstreamClient {
  private client: Client;
  private transport: StdioClientTransport | null = null;
  private config: UpstreamConfig;
  private connected = false;

  constructor(config: UpstreamConfig) {
    this.config = config;
    this.client = new Client(
      { name: "lightweight-github-proxy", version: "1.0.0" },
      { capabilities: {} }
    );
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    // Launch upstream MCP as child process
    this.transport = new StdioClientTransport({
      command: this.config.command,
      args: this.config.args,
      env: {
        ...process.env,
        // GITHUB_PERSONAL_ACCESS_TOKEN is inherited from environment variables
      } as Record<string, string>,
    });

    await this.client.connect(this.transport);
    this.connected = true;
  }

  async listTools(): Promise<Tool[]> {
    if (!this.connected) {
      throw new Error("UpstreamClient is not connected");
    }

    const result = await this.client.listTools();
    return result.tools;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    if (!this.connected) {
      throw new Error("UpstreamClient is not connected");
    }

    const result = await this.client.callTool({ name, arguments: args });
    return result as { content: Array<{ type: string; text: string }> };
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      await this.client.close();
    } catch {
      // Ignore errors during disconnect
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
