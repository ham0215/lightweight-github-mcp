# lightweight-github-mcp

A lightweight proxy server that wraps [github/github-mcp-server](https://github.com/github/github-mcp-server) (GitHub's official MCP server) and exposes only whitelisted tools via YAML configuration. This dramatically reduces context consumption.

## Prerequisites

- Node.js >= 18.0.0
- **Docker** (required for running upstream GitHub MCP server)

## Installation

```bash
# Install dependencies
npm install

# Build
npm run build
```

## Usage

```bash
# Run the server
npm start

# Development mode (watch)
npm run dev

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
          │          │ spawn Docker container
          │          ▼
          │  github/github-mcp-server (Docker, ~100 tools)
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

### config.yaml

```yaml
allowedTools:
  - get_file_contents
  - create_issue
  # ... only listed tools are exposed

# Using github/github-mcp-server via Docker
upstream:
  command: docker
  args:
    - "run"
    - "-i"
    - "--rm"
    - "-e"
    - "GITHUB_PERSONAL_ACCESS_TOKEN"
    - "ghcr.io/github/github-mcp-server"
```

### Config File Lookup Order

1. `CONFIG_PATH` environment variable
2. `./config.yaml` (current directory)
3. Project root `config.yaml`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_PERSONAL_ACCESS_TOKEN` | Yes | GitHub Personal Access Token |
| `CONFIG_PATH` | No | Path to config.yaml |

## Claude Desktop Configuration

Add the following to your Claude Desktop configuration file:

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

## License

MIT
