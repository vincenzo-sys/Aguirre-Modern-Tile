# tile-crm MCP server

Local MCP server that exposes the Aguirre Modern Tile dashboard API to
Claude Desktop and Claude Code. Wraps the same HTTPS endpoints that the
web dashboard uses, so anything you do here shows up in the dashboard
instantly (and vice versa).

## Why this instead of the `tile-crm` skill?

Both call the same API. The skill is pure HTTP — works anywhere including
claude.ai on the web. This MCP gives you typed tools that Claude sees in
its tool menu (discoverable, not dependent on reading skill docs). Use
whichever you prefer; they don't conflict.

## Prerequisites

- Node 18+
- `TILE_API_KEY` env var set on your machine (ask Vincenzo for it; it
  lives in the Vercel project env as well)

## Install

```bash
cd mcp/tile-crm
npm install
```

## Wire it up to Claude Desktop

Edit `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or
`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "tile-crm": {
      "command": "node",
      "args": ["C:\\Users\\vince\\OneDrive\\Vincenzo\\Claude\\outputs\\aguirre-modern-tile\\mcp\\tile-crm\\src\\index.js"],
      "env": {
        "TILE_API_KEY": "your-key-here",
        "TILE_API_BASE_URL": "https://aguirremoderntile.com"
      }
    }
  }
}
```

Restart Claude Desktop. You should see the tile-crm tools appear in the
tools menu.

## Wire it up to Claude Code

In the project's `.mcp.json` (or user-level `~/.claude.json`):

```json
{
  "mcpServers": {
    "tile-crm": {
      "command": "node",
      "args": ["./mcp/tile-crm/src/index.js"],
      "env": {
        "TILE_API_KEY": "${env:TILE_API_KEY}"
      }
    }
  }
}
```

Then just run `claude` in the repo. The tools are automatically available
to the main loop and any sub-agents.

## Tools

| Tool | Purpose |
|------|---------|
| `create_lead` | Log a new inbound prospect (also creates customer) |
| `update_lead` | Status, notes, follow-up, lost reason |
| `get_lead` | Fetch one lead |
| `create_customer` | Direct customer insert (find-or-create) |
| `find_customers` | Search by name/email/phone fragment |
| `get_customer` | Full customer history (jobs, quotes, invoices) |
| `create_job` | New job, optional `from_lead_id` to mark lead converted |
| `list_jobs` | Filter by status, date range, assignee |
| `get_job` | One job with all fields |
| `update_job` | Status / schedule / assignment changes (triggers SMS on status) |
| `add_line_item` | Append to a job's line_items JSONB |
| `set_line_item_status` | Move a material needed → ordered → received → on_site |

## Testing

Once wired up, ask Claude something like:

> "Log a new lead: Sarah Johnson, 617-555-0142, bathroom project,
> called today, wants a quote by Friday."

Claude should use `create_lead` and return the inserted lead's UUID.
Check `https://aguirremoderntile.com/dashboard/leads` — the new row
should be there.

## When the API changes

This MCP is intentionally thin — it forwards to the same endpoints the
dashboard uses. When those endpoints change, update:

1. Fields on the relevant tool in `src/index.js`
2. Field docs in the sister skill `~/.claude/skills/tile-crm/SKILL.md`
