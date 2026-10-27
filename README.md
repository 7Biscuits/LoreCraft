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

Local generation includes a short presentation flow for prepared source games: prompts containing **Mario** or **Super Mario** open Super Mario; **rush**, **maze**, **escape**, or **labyrinth** open Maze Escape. Mario takes precedence when both sets appear. A roughly six-second staged animation prepares the game, saves it to **Your Games**, and opens it for play. These prompts use the existing games; they do not author new source code. Other prompts use the deterministic prompt compiler with six reusable 2D rule sets:

| Genre | Goal |
| --- | --- |
| Adventure | Collect every crystal, then enter the portal. |
| Shooter | Clear the enemies with auto-aim, collect crystals, then reach the portal. |
| Survival | Stay alive until the timer ends. |
| Runner | Dodge scrolling enemies and survive the race timer. |
| Platformer | Jump, collect gems, and reach the ground exit. |
| Puzzle | Collect numbered gems in order, then reach the portal. |

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

The studio keeps background agent activity separate from the selected playable game. **Your Games** lists browser-local saved projects and prepared or completed source games, with Play and Delete controls. The last selected game reopens from its starting point after refresh. Deleting a game removes its saved library entry; it leaves repository source intact, and a new prompt can add it again. Deleting the last game leaves an empty workspace after refresh. The inspiration section and example chips have been removed. Completed agent games appear only after runtime readiness succeeds; completion does not replace the game being played. Game-source edits wait for an explicit managed launch/reload rather than forcing a studio-wide refresh. A same-origin browser lock limits the managed verification runtime to one studio tab. Games selected for play use independent iframes without the MCP bridge, so agent runtime controls do not interrupt them. Source games continue to load from the repository manifest; library membership and selection are saved in this browser, including in static local-generation deployments.

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

### Render hosting with persistent projects

`render.yaml` describes one paid Node web service with a 1 GB persistent disk at `/var/data`.
The hosted entry point, `pnpm start`, serves only the compiled `dist/` files and the project/generation API on `0.0.0.0:$PORT`.
Build with `pnpm install --frozen-lockfile --prod=false && pnpm build` and use Node 24.

Set `LORECRAFT_PROJECT_DB=/var/data/projects.sqlite` and a random `LORECRAFT_STUDIO_PASSWORD` of at least 16 characters.
The username defaults to `lorecraft` (override with `LORECRAFT_STUDIO_USERNAME`). The browser asks for these credentials before opening the studio; `/healthz` remains available for Render readiness checks.
Keep the password in Render environment variables, never in Git. The Blueprint generates one automatically when first applied.

Hosted local generation and AI generation save design projects and revisions to SQLite on the disk. Browser storage also caches them for the preview.
Open **Game gallery** to find server projects from another browser or after clearing browser data.
Prepared Mario/Maze library selections and runtime checkpoints remain browser-local; source game code ships from the Git repository.
The disk preserves SQLite through restarts and redeploys, but is not a backup. Export important project JSON files and use SQLite-aware database backups.

This is a password-protected shared creator workspace, without separate user accounts. Everyone with its password can access its server projects.
The hosted server does not expose the local MCP relay or source-authoring lifecycle. Custom source games must be committed and pushed, then deployed.
AI mode is optional; configure its provider credentials separately in Render environment variables. Render hosting credits do not pay for AI provider usage.

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm preview
```

Repository tests cover authenticated transport, malformed responses, request deadlines, replacement, heartbeat cleanup, acknowledged controls, host disposal, gameplay mutation, MCP stdio/lifecycle, scaffolding, import/schema validation, prompt refinement, all 30 genre/theme combinations, AI response repair, credential denial over HTTP, and standalone export execution. Browser QA separately covers the user-facing creation and play flow.

`pnpm build` produces `dist/`. `pnpm preview` serves the built app on port 4173 with the optional generation API and authenticated bridge proxy. The exported game HTML runs entirely offline; the full studio can also be served statically in local-generation mode.

## Reusable game creation and persistent AI projects

Use Node **22.13 or later**. Existing browser-local projects, checkpoints, custom source games, and exports remain supported. The shared specification engine now includes adventure, platformer, runner, shooter, survival, and puzzle foundations. Platformers add gravity, jumping, solid platforms, and a ground exit; puzzles use grid movement and numbered gems that must be collected in order. Generic platformer prompts use this engine; explicit Mario prompts still select the existing Mario demo.

Open **Game gallery** to search saved projects, registered source games, and reusable starters. Filter by genre and theme, inspect mechanics/controls/history, then play. Server projects are loaded into the existing preview when selected. Background agent creation never replaces the selected playable iframe.

### Unified MCP operation

Reconnect LoreCraft in your coding agent to discover `create_game`. Example arguments:

```json
{"prompt":"A peaceful forest puzzle with six numbered crystals","mode":"local"}
```

The tool selects a foundation, validates the specification, runs deterministic gameplay checks, saves the project, reuses owned Vite/relay servers, waits for browser readiness, runs the loaded runtime’s gameplay-check operation, and returns `creation.projectId`, `revisionId`, foundation, individual checks, `runtimeChecks`, and diagnostics. Local mode assembles game data without a paid provider; `mode: "ai"` uses the existing server-side provider configuration. For `openBrowser: false`, open the URL from `get_runtime_status` while the call waits for runtime readiness.

Refine the same project without regenerating code:

```json
{"prompt":"Give the explorer six lives","projectId":"PROJECT_UUID","expectedRevision":"REVISION_UUID","patch":{"lives":6}}
```

Omit `patch` to apply a natural-language edit. Send `spec` for a complete validated specification, or `patch` for bounded field updates; these are mutually exclusive. Unspecified patch fields, seed, revision history, and saved AI instructions remain intact. Pass `instructions` to set persistent project preferences. Configuration-only creation/edit/reload does **not** invoke `pnpm build`. Custom TypeScript authoring continues to use `begin_game_creation`, `update_game_creation`, and the existing validated `launch_game` path.

### Storage and API

Durable projects use Node's built-in SQLite, with no additional package or hosted database:

- Default database: `.lorecraft/projects.sqlite` (ignored by Git and denied by Vite).
- Optional process environment: `LORECRAFT_PROJECT_DB=/absolute/path/projects.sqlite` for an isolated database shared by your dev/MCP processes.
- Versioned migrations in `src/projects/migrations/` run transactionally on first access. Migration 1 creates project/revision tables; migration 2 adds persisted AI context. Existing rows and revisions are retained.
- Writes use transactions, foreign keys, bounded revision history, and optimistic revision conflict detection. Stale edits return HTTP 409.
- Context contains the current design summary, persistent instructions, and the last eight bounded conversation turns; full prompt history remains in saved revisions. API keys are never stored with projects.
- Back up the SQLite database using SQLite's backup tooling, or stop the app before copying the database and any associated WAL files. Browser-local JSON export/import remains available.

Routes (loopback dev/preview server, same-origin writes):

| Route | Purpose |
| --- | --- |
| `GET /api/projects` | List server project metadata for the gallery |
| `GET /api/projects/:id` | Read validated project, revision history, and context |
| `POST /api/projects` | Create/refine with the same pipeline used by MCP |
| `GET /api/foundations` | Discover reusable mechanics and controls |
| `POST /api/generate` | Existing stateless generation endpoint, retained for compatibility |

AI projects created in the studio use the durable endpoint. Browser-local generation stays offline-compatible and retains its context in project JSON. `src/studio/assets.ts` holds shared procedural palettes, pixel sprites, backgrounds, animation settings, tiles, and sound definitions. Preview and standalone HTML exports use the same renderer and asset data. No executable game code is accepted from the AI provider.

Repository tests cover foundation behavior, all 30 genre/theme combinations, persistent context, migration upgrades, HTTP validation/conflicts, and MCP creation with no production build. These checks verify simulation invariants and selected deterministic scenarios; they are not a guarantee of every possible level's difficulty or artistic quality.
