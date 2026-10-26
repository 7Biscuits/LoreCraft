# Lorecraft

## Authoring games

Source-authored games live in `src/games/<game-id>/`. Each module implements the small `GameModule` contract in `src/games/contract.ts`: `init`, `update`, `render`, `reset`, and `destroy`. The shared host in `src/games/host.ts` owns the one LittleJS lifecycle, entity registry, runtime adapter, WebSocket bridge integration, and MCP-visible game state.

To author a game, create a directory such as `src/games/my-game/`, export a `GameModule`, and select it in `src/games/catalog.ts`. Use the supplied `GameContext` to create registry-backed entities and retrieve their live LittleJS objects for game-specific rules. Run `pnpm typecheck` and `pnpm build` to validate it. The included `maze-escape` example uses a key-and-exit objective, a chasing enemy, win/loss states, and restart handling.

Changing the active module requires Vite's normal reload today. Runtime selection/reload management is intentionally deferred to Step 6.

## Local game control

Start the bridge and game in separate terminals:

```bash
pnpm bridge
pnpm dev
```

The browser connects to `ws://127.0.0.1:8787` by default. Start the MCP process separately with `pnpm mcp`, or let Antigravity start it from `.agents/mcp_config.json`.

Antigravity IDE and CLI discover workspace MCP servers from `.agents/mcp_config.json`. Reload MCP servers after both the bridge and browser game are running. The MCP process communicates with the game only through the WebSocket bridge.

Set `MCP_BRIDGE_URL` or `MCP_BRIDGE_TIMEOUT_MS` when the bridge uses a different address or timeout.
