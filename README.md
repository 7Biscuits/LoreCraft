# Lorecraft

## Local game control

Start the bridge and game in separate terminals:

```bash
pnpm bridge
pnpm dev
```

The browser connects to `ws://127.0.0.1:8787` by default. Start the MCP process separately with `pnpm mcp`, or let Antigravity start it from `.agents/mcp_config.json`.

Antigravity IDE and CLI discover workspace MCP servers from `.agents/mcp_config.json`. Reload MCP servers after both the bridge and browser game are running. The MCP process communicates with the game only through the WebSocket bridge.

Set `MCP_BRIDGE_URL` or `MCP_BRIDGE_TIMEOUT_MS` when the bridge uses a different address or timeout.
