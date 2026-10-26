# LoreCraft

**A little lore. A whole world.** A local-first game creation studio: describe a game, play it, refine it, inspect live entities, run gameplay checks, and export a single offline HTML file.

## Run the application

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://127.0.0.1:5173/**. The studio and its playable preview run with this one command. A relay, MCP client, account, API key, and database are not required for the app.

Start with a sample prompt or try:

> A cozy forest adventure with 6 crystals, 2 forest spirits, and a portal home. Easy difficulty.

Click **Create my game**, then **Enter the world**. WASD / arrows move, Shift dashes, Space boosts automatic fire in shooters, P pauses, and R restarts. Touch controls appear on touch devices. Keyboard input belongs to the game preview; click Play to focus it.

See [DEMO.md](DEMO.md) for a short judge presentation and verification checklist.

## Creation modes and supported games

Local generation is a deterministic prompt compiler with four complete 2D rule sets:

| Genre | Goal |
| --- | --- |
| Adventure | Collect every crystal, then enter the portal. |
| Shooter | Clear the enemies with auto-aim, collect crystals, then reach the portal. |
| Survival | Stay alive until the timer ends. |
| Runner | Dodge scrolling enemies and survive the race timer. |

Five procedural visual themes are included: forest, space, dungeon, ocean, and neon. Prompts can set enemy/collectible counts, difficulty, lives, and time limits. Refinements such as “make it faster”, “no enemies”, “5 lives”, or “change it to a space shooter” preserve unspecified settings and the seed.

Local mode uses rules rather than a language model. Both modes produce validated game specifications for these supported mechanics; arbitrary 3D worlds or new mechanics require source authoring. The UI labels the active mode explicitly.

### Optional AI generation

Create a server-side `.env` based on `.env.example`:

```dotenv
OPENAI_API_KEY=your-key
OPENAI_MODEL=gpt-4.1-mini
```

Restart `pnpm dev`, then select **AI generation** in the prompt composer. The server uses the OpenAI Responses API with structured output, bounded requests, schema validation, and one response-repair attempt. A bounded build/test/repair pass verifies the resulting scene before returning it. Provider failures are shown explicitly; they do not silently substitute local results.

Credentials never enter browser storage, client bundles, project files, or exports. API requests reject other Origins, bound input size, and rate-limit generation. Real provider access requires a valid key and an available model. The integration is tested with simulated provider responses; it is not a guarantee of account access.

### Custom LLM providers

Configure a server-side `.env` with an OpenAI-compatible provider:

```dotenv
LLM_API_KEY=your-provider-key
LLM_BASE_URL=https://provider.example/v1
LLM_MODEL=your-provider-model-id
LLM_API_STYLE=chat_completions
LLM_JSON_MODE=json_schema
```

`LLM_*` values take precedence over `OPENAI_API_KEY` / `OPENAI_MODEL`. `OPENAI_BASE_URL` is also accepted when `LLM_BASE_URL` is unset. Supply the API root (including `/v1` when required), without an endpoint suffix. `responses` appends `/responses`; `chat_completions` appends `/chat/completions` and uses that protocol's messages and response shape.

Use `LLM_JSON_MODE=json_schema` for strict structured outputs. If the provider rejects it, try `json_object`; if JSON mode is unsupported too, use `prompt`. All modes still parse/validate the result and allow one repair attempt. Provider-specific native APIs require an OpenAI-compatible endpoint or gateway.

For a local compatible server, use a loopback URL such as `http://127.0.0.1:1234/v1`, its installed model ID, and a dummy key such as `local` if it does not require authentication. Remote URLs require HTTPS; credentials and query strings in base URLs are rejected. Only server configuration can choose the provider endpoint.

Restart the running dev/preview server after changes. API credentials must not use a `VITE_` prefix. `.env` and `.env.*` are ignored by Git; `.env.example` contains placeholders only. The coding agent's own LLM/provider settings are separate from LoreCraft's generation settings.

The Vite API plugin supports both `pnpm dev` and `pnpm preview`. A purely static deployment retains local generation and exports; AI mode requires a server running this API. This is a single-device creator studio, not a multi-user hosted service.

## Studio features

- Live LittleJS preview with procedural pixel art, score, hearts, countdown, portal objectives, win/loss states, and optional synthesized sound effects.
- Prompt-based creation and refinement, with each successful change stored as a revision.
- Project library, revision restoration, JSON import/export, and automatic local saves. Up to 30 projects and 50 revisions per project are retained; export important projects as backups.
- A live registry inspector for position, size, speed, creation, and deletion. Inspector edits affect the current run; Source edits create lasting design revisions.
- Exact pause/frame stepping, runtime logs, PNG screenshots, and revision-specific gameplay checkpoints.
- Ten deterministic gameplay checks: scene integrity, seed reproduction, movement, boundaries, objective reachability, swept collision, damage/loss, isolated victory, stability, and checkpoint/reset behavior. These are scenario checks, not proof that every design is fun or that a human can win under all hazards.
- Editable, validated JSON game specifications. Rejected edits preserve the current game.
- One-file HTML export with the same simulation and renderer, keyboard/touch controls, and no network or bridge dependency. Double-click the downloaded HTML file to play.

Projects and checkpoints live in this browser's localStorage. They are not cloud backups. JSON project exports contain prompts and design revisions; runtime checkpoints remain on the device.

## Architecture

`GameModule` defines `init(context)`, `update(frame)`, `render()`, `reset()`, `destroy()`, and optional `getState()`. `GameContext` exposes the registry/runtime and score operations. `AuthoredGameHost` owns the single LittleJS lifecycle in a document; starting a second host is rejected. Reload creates a fresh document. Disposal stops engine scheduling, destroys entities, and rejects subsequent runtime mutations.

Generated scenes implement the same module contract. A portable deterministic simulation drives live registry-backed LittleJS entities and a shared Canvas renderer. The studio isolates each game revision in a same-origin iframe; its postMessage controls check both Origin and source window. Standalone HTML embeds that same portable simulation, without LittleJS or the relay.

`GameRuntime` exposes structured CRUD, 2D/3D positions, sizes, speed, rotation, resets, and state snapshots over stable entity IDs. Maze Escape remains a source-authored reference game. Its obstacles are live entities, enemy speed reads the inspected value, swept movement prevents tunneling, and controlling-player deletion enters a recoverable loss.

### Source authoring and scaffolding

```sh
pnpm scaffold my-game "a space shooter with 4 enemies"
pnpm typecheck
```

The scaffolder creates `src/games/my-game/index.ts`, `config.ts`, and `assets/README.md`, then registers the module in `manifest.ts`. Existing IDs and unsafe paths are rejected. Keep each game's assets/configuration together; use relative asset imports. The browser loader validates the module contract and ID. The managed catalog reads fresh manifest metadata; adding a game does not require restarting MCP.

## MCP and managed runtime

The web studio works independently of MCP. Agent control uses:

**MCP stdio tools → GameBridgeClient → RuntimeBridgeServer → BrowserRuntimeBridge → GameRuntime**

```sh
pnpm setup:mcp
pnpm mcp
```

`setup:mcp` generates a local `.agents/mcp_config.json`, deriving the checkout path and preserving other server settings. stdout remains reserved for MCP messages.

Creation tools are `begin_game_creation` and `update_game_creation`. Call begin before authoring, publish real milestones with update, then call launch when the source is ready. Restart your coding agent’s LoreCraft MCP connection after upgrading to discover these tools.

Lifecycle tools are `list_games`, `select_game`, `launch_game`, `get_runtime_status`, `reload_game`, and `stop_game`. Launch opens the studio, validates with the fixed `pnpm build` command, starts owned Vite/relay servers, and waits for an identified ready session in a separate verification iframe. Reload validates source and starts a fresh document/session. Stop cancels builds, stops owned listeners, and requests acknowledged browser disposal. Unconfirmed browser teardown is reported in diagnostics. Unrelated servers are never adopted or killed.

The studio keeps background agent activity separate from the selected playable game. Moonlit Grove, Orbit Breaker, and Dungeon After Dark open directly from **A Little Inspiration**. **Your Games**, immediately below it, lists saved projects and registered source games. Completed agent games appear there with a Play button; completion does not replace the game being played. Newly registered games in the active creation session are withheld until runtime readiness succeeds. Game-source edits wait for an explicit managed launch/reload rather than forcing a studio-wide refresh. A same-origin browser lock limits the managed verification runtime to one studio tab. Games selected for play use independent iframes without the MCP bridge, so agent runtime controls do not interrupt them. Saved projects remain browser-local; source-game entries come from the repository manifest.

Stop an existing `pnpm dev` before using managed launch on the same port. The studio preview may be connected to a manually launched relay through **Inspector → Connect MCP**, then controlled with `pnpm mcp`.

Baseline tools: `create_entity`, `get_entity`, `list_entities`, `set_entity_position`, `set_entity_properties`, `delete_entity`, `get_game_state`, `reset_game`.

Inspection tools: `pause_game`, `resume_game`, `step_game`, `simulate_input`, `capture_screenshot`, `get_runtime_logs`, `run_gameplay_test`. Screenshots return MCP PNG image content. Frame counts are bounded to 1–600; movement components to −1…1. Generated games provide the full scenario suite; custom source games receive a basic runtime check unless they add game-specific scenarios.

For manual source-game development:

```sh
pnpm bridge
pnpm dev
```

Open `http://127.0.0.1:5173/?game=maze-escape`. Opening `/` starts the creator studio. `?game=generated-game` starts the default generated example as an agent-controlled authored game.

### Bridge security and cleanup

The relay binds `127.0.0.1`, checks bearer authentication and exact allowed Origins, and caps payload size. Vite injects the credential into `/runtime-bridge` upgrades; browser URLs do not contain it. The token now defaults outside the served checkout, under `~/.local/share/lorecraft/<checkout-hash>/bridge-token`, with private directory/file modes. Vite explicitly denies credential and private configuration directories, including the former `.lorecraft` location. Old in-checkout tokens are not reused.

Same-OS-user Node processes may omit Origin and remain trusted. The newest accepted browser tab takes over; replaced tabs stop reconnecting and pause their engine. Pending requests fail on replacement/disconnection. Heartbeats terminate silent peers. Shutdown bounds unresponsive sockets and clears pending deadlines. Browser control acknowledgement occurs after host disposal; a disconnected tab cannot acknowledge and is reported rather than falsely described as stopped.

| Environment variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL` | OpenAI-compatible server-side generation defaults |
| `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` | Custom provider settings; override OpenAI defaults |
| `LLM_API_STYLE` | `responses` or `chat_completions` |
| `LLM_JSON_MODE` | `json_schema`, `json_object`, or `prompt` |
| `BRIDGE_PORT` | Relay port; default 8787 |
| `LORECRAFT_VITE_PORT` | Managed Vite port; default 5173 |
| `MCP_BRIDGE_URL` | Node client relay URL; match custom relay ports |
| `MCP_BRIDGE_TIMEOUT_MS` | Complete request deadline; default 5000 |
| `BRIDGE_ALLOWED_ORIGINS` | Exact comma-separated Origins for a manually launched relay |
| `LORECRAFT_BRIDGE_TOKEN_FILE` | Optional shared Node token path; keep it outside served roots |

Managed launch allows its selected `http://127.0.0.1:<port>` Origin. Its build deadline is 60 seconds and readiness deadline is 15 seconds. Local config grants lifecycle tool calls 90 seconds.

## Verification and production build

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm preview
```

Repository tests cover authenticated transport, malformed responses, request deadlines, replacement, heartbeat cleanup, acknowledged controls, host disposal, gameplay mutation, MCP stdio/lifecycle, scaffolding, import/schema validation, prompt refinement, all 20 genre/theme combinations, AI response repair, credential denial over HTTP, and standalone export execution. Browser QA separately covers the user-facing creation and play flow.

`pnpm build` produces `dist/`. `pnpm preview` serves the built app on port 4173 with the optional generation API and authenticated bridge proxy. The exported game HTML runs entirely offline; the full studio can also be served statically in local-generation mode.
