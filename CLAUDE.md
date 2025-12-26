# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lightweight GitHub MCP is a proxy server that wraps `@modelcontextprotocol/server-github` and exposes only whitelisted tools via YAML configuration. This dramatically reduces context consumption (100+ tools → 10-20 tools).

## Build and Run Commands

```bash
# Install dependencies
npm install

# Build
npm run build

# Development mode (watch)
npm run dev

# Run the server
npm start

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node dist/index.js
```

## Architecture

```
Claude Desktop/Code
        │ MCP Protocol (stdio)
        ▼
┌─────────────────────────────┐
│  lightweight-github-mcp     │
│  ┌─────────┐  ┌──────────┐  │
│  │MCP      │→ │Tool      │→ │ config.yaml (allowedTools)
│  │Server   │  │Filter    │  │
│  └─────────┘  └──────────┘  │
│         ↑          │        │
│         │    ┌─────▼─────┐  │
│         │    │MCP Client │  │
│         │    └─────┬─────┘  │
└─────────┼──────────┼────────┘
          │          │ spawn child process
          │          ▼
          │  @modelcontextprotocol/server-github (~100 tools)
          │
    Claude requests
```

### Key Components

- **src/index.ts** - Entry point, config loading, server initialization
- **src/server.ts** - MCP server implementation, tool filtering, meta-tool handlers
- **src/upstream-client.ts** - Child process management for upstream GitHub MCP
- **src/config.ts** - YAML configuration loading and validation
- **config.yaml** - Tool whitelist configuration

### Meta-Tools (Always Available)

The proxy provides four built-in meta-tools that are always exposed:
- `list_all_upstream_tools` - List all upstream tools (allowed + blocked)
- `list_blocked_tools` - List blocked tools by category
- `search_upstream_tools` - Search upstream tools by keyword
- `get_tool_info` - Get details about a specific tool

These help Claude discover tools and guide users to add needed tools to the whitelist.

## Configuration

`config.yaml` structure:
```yaml
allowedTools:
  - get_file_contents
  - create_issue
  # ... only listed tools are exposed

upstream:
  command: npx
  args:
    - "-y"
    - "@modelcontextprotocol/server-github"
```

Config file lookup order:
1. `CONFIG_PATH` environment variable
2. `./config.yaml` (current directory)
3. Project root `config.yaml`

## Environment Variables

- `GITHUB_PERSONAL_ACCESS_TOKEN` (required) - GitHub PAT
- `CONFIG_PATH` (optional) - Path to config.yaml

## Claude Desktop Configuration

```json
{
  "mcpServers": {
    "github-lite": {
      "command": "node",
      "args": ["/path/to/lightweight-github-mcp/dist/index.js"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxx"
      }
    }
  }
}
```
