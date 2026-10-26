# Lorecraft

## Authoring games

Source-authored games live in `src/games/<game-id>/`. Each module implements the small `GameModule` contract in `src/games/contract.ts`: `init`, `update`, `render`, `reset`, and `destroy`. The shared host in `src/games/host.ts` owns the one LittleJS lifecycle, entity registry, and runtime adapter. Startup is asynchronous; the browser bridge connects after initialization succeeds. The host calls `destroy()` when disposed and cleans up registered entities.

`update(frame)` receives elapsed seconds, a movement vector, and a restart flag. The host samples LittleJS input once (including its built-in WASD mapping); gameplay tests supply explicit frames. The optional `getState()` hook returns JSON-compatible game details under `get_game_state.result.state`. Maze Escape exposes `hasKey` and `outcome` (`playing`, `won`, or `lost`).

To author a game, create a directory such as `src/games/my-game/`, export a `GameModule`, and register its id, title, entry (`./my-game/index.ts`), and export name in `src/games/manifest.ts`. Keep game initialization, rules, objectives, and optional JSON state in the game module; store level configuration and assets alongside it. The browser loader checks the exported contract and matching game ID. Node reads only manifest metadata. Restart the MCP server after adding or removing manifest entries so its game list updates.

Use the supplied `GameContext` to create registry-backed entities and retrieve their live LittleJS objects for game-specific rules. Run `pnpm typecheck` and `pnpm build` to validate source. The included `maze-escape` example uses a key-and-exit objective, a chasing enemy, win/loss states, and restart handling.

Maze Escape uses live registry entities for obstacles, enemies, and collectibles. Creating, moving, resizing, or deleting an obstacle changes collision behavior immediately. Enemy movement reads its inspected speed, including zero. Initial walls are ordinary obstacle entities named `wall-1` through `wall-4`. The keyboard controls `player-1`; collecting any coin unlocks the gate. Reset reconstructs the initial scene.

## Managed runtime workflow (Antigravity)

Install locked dependencies with `pnpm install --frozen-lockfile`, then run `pnpm setup:mcp` and reload the workspace MCP server in Antigravity. The generated configuration allows 90 seconds for lifecycle tools (source builds are bounded to 60 seconds, browser readiness to 15 seconds). Antigravity starts `pnpm mcp` over stdio. Keep stdout reserved for MCP messages.

For managed operation, the MCP process starts and owns the existing bridge and a programmatic Vite development server. Stop manually launched `pnpm bridge`/`pnpm dev` processes before using `launch_game`; occupied ports produce a structured failure. The manager never adopts or terminates an unrelated server. It uses the project's Vite configuration and the same authenticated WebSocket proxy as manual development. No additional server process or shell interface is exposed.

The lifecycle tools are:

| Tool | Input | Behavior |
| --- | --- | --- |
| `list_games` | `{}` | List registered game IDs and titles. |
| `select_game` | `{ "gameId": "maze-escape" }` | Choose a game before launching. Stop a different running game first. |
| `launch_game` | `{ "gameId": "maze-escape", "openBrowser": true }` (both optional) | Run `pnpm build`, start owned servers, open the default browser, and wait for the selected session to report ready. A repeated launch of the same ready game is idempotent. A different ID replaces the managed game. |
| `get_runtime_status` | `{}` | Inspect selection, launch URL, session/runtime IDs, readiness, bounded diagnostics, and resource ownership. Available during launch. |
| `reload_game` | `{}` | Validate source, navigate the managed tab into a new document/session, and wait for readiness. Gameplay resets. |
| `stop_game` | `{}` | Cancel pending launch/build, unload the managed game document, and close owned Vite/bridge servers. Safe to repeat. |

Call `list_games`, optionally `select_game`, then `launch_game`. Once ready, use the eight existing entity/game tools. For example, create a coin with `create_entity`, inspect it with `get_entity`, move it with `set_entity_position`, and remove it with `delete_entity`. Edit game source, call `reload_game`, inspect state again, then call `stop_game` when finished. A controlled document reload starts LittleJS from scratch; engine initialization is never repeated in place.

If automatic browser opening fails, diagnostics contain the failure and `get_runtime_status` provides the URL to open manually. `openBrowser: false` supports clients that manage their own browser: issue launch asynchronously, read its URL with `get_runtime_status`, and open that URL before the readiness deadline. A missing browser produces `RUNTIME_TIMEOUT`; import/initialization/update/render failures report `RUNTIME_ERROR` or an error status with a message. Failed launches clean up their servers. A compile failure during reload keeps the existing session available when it is still healthy. An unexpected browser disconnection changes status to `waiting`; its ordinary bridge reconnection restores readiness. A rejected old session stays disconnected.

Stopping or closing MCP releases owned listeners and cancels its fixed build command (including the process group on macOS/Linux). Stop navigates the controlled game document to a blank page. Use only one managed MCP process per port pair. `LORECRAFT_VITE_PORT` changes the managed Vite port; `BRIDGE_PORT` changes its relay port. When changing the relay port, set `MCP_BRIDGE_URL` to the same address in the generated MCP configuration. Launch errors such as `EADDRINUSE` include diagnostics and never kill the existing listener.

Lifecycle operations return `{ ok: true, result: RuntimeLifecycleStatus }` or `{ ok: false, error: { code, message }, status }`. Status includes `state`, `selectedGameId`, `sessionId`, `runtimeId`, `url`, `message`, `diagnostics`, and `ownsServers`. Source validation executes only the fixed repository build command in this checkout. Game IDs are selected from the manifest; tools accept no commands, source code, filesystem paths, or arbitrary navigation targets.

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

Antigravity IDE and CLI discover workspace MCP servers from `.agents/mcp_config.json`. For manual development, reload MCP servers after both the bridge and browser game are running. Use the eight entity/game tools against a manually launched runtime; lifecycle status describes only the resources managed by that MCP process. The MCP process communicates with gameplay only through the WebSocket bridge.

Configuration:

- `BRIDGE_PORT`: relay port, used by both the bridge and Vite proxy. Set it in both processes when changing ports.
- `BRIDGE_ALLOWED_ORIGINS`: comma-separated exact browser Origins, replacing the default local ports 5173 and 4173. Arbitrary and `null` Origins are rejected; authenticated Node clients may omit Origin.
- `MCP_BRIDGE_URL`: MCP connection URL when changing the relay port.
- `MCP_BRIDGE_TIMEOUT_MS`: complete request deadline, including connection establishment.
- `LORECRAFT_BRIDGE_TOKEN_FILE`: optional token-file location; set the same value in bridge, Vite, and MCP processes.

The newest game tab takes over the relay. A replaced tab stays disconnected until explicitly connected again or reloaded. Unexpected network disconnections still retry. Runtime replacement fails requests sent to the previous game instead of transferring them to a new game. Shutdown closes peers and bounds how long an unresponsive peer can delay it.

## Verification

`pnpm test` covers runtime CRUD, authenticated transport, replacement/reconnection behavior, bounded shutdown and connection deadlines, MCP stdio integration, configuration generation, and deterministic Maze Escape gameplay. Lifecycle tests cover selection validation, source failures, cancellation, occupied ports, readiness failures, fresh sessions, repeated launches, and ownership cleanup. A separate MCP integration test starts real bridge/Vite servers and uses a simulated browser peer through the actual proxy; the existing MCP integration test exercises a headless LittleJS game. These automated tests are distinct from verification in a graphical browser.

`pnpm build` type-checks the application and produces the Vite bundle. Roadmap Step 5 (managed launch/reload) is implemented. Step 6 remains screenshots, input simulation, pause/resume, deterministic runtime stepping, scenarios/assertions, and richer console evidence through MCP. The autonomous build–test–fix loop and playground/save/export workflows follow those capabilities. Dedicated authoring scaffolding is still optional future work; custom source authoring remains Antigravity's responsibility.
