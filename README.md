# Lorecraft

## Authoring games

Source-authored games live in `src/games/<game-id>/`. Each module implements the small `GameModule` contract in `src/games/contract.ts`: `init`, `update`, `render`, `reset`, and `destroy`. The shared host in `src/games/host.ts` owns the one LittleJS lifecycle, entity registry, and runtime adapter. Startup is asynchronous; the browser bridge connects after initialization succeeds. The host calls `destroy()` when disposed and cleans up registered entities.

`update(frame)` receives elapsed seconds, a movement vector, and a restart flag. The host samples LittleJS input once (including its built-in WASD mapping); gameplay tests supply explicit frames. The optional `getState()` hook returns JSON-compatible game details under `get_game_state.result.state`. Maze Escape exposes `hasKey` and `outcome` (`playing`, `won`, or `lost`).

To author a game, create a directory such as `src/games/my-game/`, export a `GameModule`, and select it in `src/games/catalog.ts`. Use the supplied `GameContext` to create registry-backed entities and retrieve their live LittleJS objects for game-specific rules. Run `pnpm typecheck` and `pnpm build` to validate it. The included `maze-escape` example uses a key-and-exit objective, a chasing enemy, win/loss states, and restart handling.

Maze Escape uses live registry entities for obstacles, enemies, and collectibles. Creating, moving, resizing, or deleting an obstacle changes collision behavior immediately. Enemy movement reads its inspected speed, including zero. Initial walls are ordinary obstacle entities named `wall-1` through `wall-4`. The keyboard controls `player-1`; collecting any coin unlocks the gate. Reset reconstructs the initial scene.

Changing the active module requires Vite's normal reload today. Managed launching and runtime selection/reload remain roadmap Step 5.

## Local game control

After cloning or moving the checkout, generate the workspace MCP configuration:

```bash
pnpm setup:mcp
```

The script derives the absolute working directory from its own location and preserves other MCP servers and environment overrides. The generated `.agents/mcp_config.json` stays local and is excluded from Git. Run the script again after relocating the checkout.

Start the bridge and game in separate terminals:

```bash
pnpm bridge
pnpm dev
```

Open `http://127.0.0.1:5173`. The browser uses a same-origin `/runtime-bridge` WebSocket proxy. Vite attaches the local access token server-side; the token is never bundled into the game or included in a browser URL. `pnpm preview` provides the same proxy at port 4173.

The bridge binds only to `127.0.0.1:8787`, requires bearer authentication for every WebSocket upgrade, and accepts browser Origins only from the configured local Vite/preview addresses. On first start it creates a private token file at `.lorecraft/bridge-token` (excluded from Git). Node MCP clients read that same file. Local processes running as the same OS user are trusted. Start the MCP process with `pnpm mcp`, or let Antigravity start it from `.agents/mcp_config.json`.

Antigravity IDE and CLI discover workspace MCP servers from `.agents/mcp_config.json`. Reload MCP servers after both the bridge and browser game are running. The MCP process communicates with the game only through the WebSocket bridge.

Configuration:

- `BRIDGE_PORT`: relay port, used by both the bridge and Vite proxy. Set it in both processes when changing ports.
- `BRIDGE_ALLOWED_ORIGINS`: comma-separated exact browser Origins, replacing the default local ports 5173 and 4173. Arbitrary and `null` Origins are rejected; authenticated Node clients may omit Origin.
- `MCP_BRIDGE_URL`: MCP connection URL when changing the relay port.
- `MCP_BRIDGE_TIMEOUT_MS`: complete request deadline, including connection establishment.
- `LORECRAFT_BRIDGE_TOKEN_FILE`: optional token-file location; set the same value in bridge, Vite, and MCP processes.

The newest game tab takes over the relay. A replaced tab stays disconnected until explicitly connected again or reloaded. Unexpected network disconnections still retry. Runtime replacement fails requests sent to the previous game instead of transferring them to a new game. Shutdown closes peers and bounds how long an unresponsive peer can delay it.

## Verification

`pnpm test` covers runtime CRUD, authenticated transport, replacement/reconnection behavior, bounded shutdown and connection deadlines, MCP stdio integration, configuration generation, and deterministic Maze Escape gameplay. `pnpm build` type-checks the application and produces the Vite bundle. Screenshot tools, a gameplay test runner exposed over MCP, the autonomous build–test–fix loop, and playground/save/export workflows remain future work.
