<div align="center">

# LoreCraft

### A little lore. A whole world.

Turn natural-language ideas into playable 2D games. Create, customize, test, and share from your browser.

[Get started](#get-started) · [Features](#what-you-can-do) · [AI setup](#optional-ai-generation) · [Technical guide](docs/technical-guide.md) · [Demo walkthrough](DEMO.md)

![LoreCraft game creation studio](https://assets.devfolio.co/content/b672a3babb84430186e9227c0e0024ea/c0b5973e-044c-4dc5-8f86-2b90d7394bec.jpeg)

</div>

LoreCraft makes game development more accessible to beginners, students, hobbyists, and developers who want to explore an idea quickly. Describe a world, play the result, and refine it with prompts such as **“give the explorer six lives”** or **“change it to a space shooter.”** You can build a supported game without writing code, then inspect its entities and edit its design as you learn.

Reusable game foundations and procedural assets shorten the path from an idea to a playable prototype. Local generation works without an account or API key; optional AI generation interprets richer prompts using the same validated game system.

## What you can do

- **Create with natural language.** Describe the setting, goal, and challenge to generate a playable game.
- **Refine as you play.** Adjust difficulty, enemies, collectibles, lives, and themes through follow-up prompts.
- **Inspect your world.** Pause, step through frames, and edit live entity positions, sizes, and speed.
- **Test gameplay.** Run deterministic checks for movement, boundaries, collisions, objectives, and win/loss behavior.
- **Keep your progress.** Save projects, restore design revisions, capture checkpoints, and import or export project JSON.
- **Reuse games and assets.** Explore the gallery of source games and reusable foundations with shared procedural art and sound.
- **Share a playable build.** Export a standalone HTML game that opens in a browser and runs offline.
- **Persist hosted projects.** Deploy a shared studio with SQLite storage on a persistent disk.

## From idea to playable game

> A cozy forest adventure with 6 crystals, 2 forest spirits, and a portal home. Easy difficulty.

1. **Describe it.** Enter a prompt and choose local or AI generation.
2. **Play it.** Click **Create my game**, then **Enter the world**.
3. **Make it yours.** Try “make it faster,” “no enemies,” or “give me 5 lives.” Successful changes become saved revisions.
4. **Check and share.** Inspect the scene, run gameplay checks, and export the game as a single HTML file.

Controls depend on the game. Generated games use **WASD / arrow keys** to move, **Shift** to dash, **P** to pause, and **R** to restart; shooters use **Space** to boost automatic fire. Touch controls appear on touch devices. Click Play to focus the preview.

## Get started

Install **Node.js 22.13+** and **pnpm**, then run these commands from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://127.0.0.1:5173/** and enter your first prompt. The studio and playable preview run together; local generation needs no external service or credentials.

### Optional AI generation

Copy the example configuration:

```sh
cp .env.example .env
```

Set your server-side credentials in `.env`:

```dotenv
OPENAI_API_KEY=your-key
OPENAI_MODEL=gpt-4.1-mini
```

Restart `pnpm dev` and select **AI generation** in the prompt composer. Keep credentials server-side; do not prefix them with `VITE_`.

OpenAI-compatible providers and local model servers are also supported through `LLM_*` settings. See [provider configuration](docs/technical-guide.md#custom-llm-providers) for endpoints, API styles, and output modes.

## Supported game foundations

| Foundation | Gameplay |
| --- | --- |
| Adventure | Collect crystals and reach the portal. |
| Shooter | Clear enemies with auto-aim, collect crystals, and escape. |
| Survival | Stay alive until the timer ends. |
| Runner | Dodge scrolling enemies and survive the race. |
| Platformer | Jump across platforms, collect gems, and reach the exit. |
| Puzzle | Collect numbered gems in order, then reach the portal. |

Combine these with **forest, space, dungeon, ocean, and neon** themes. Prompts can customize counts, difficulty, lives, and time limits.

Local generation uses a deterministic prompt compiler. AI generation produces validated specifications for the same supported mechanics. New mechanics and arbitrary 3D games require source authoring. Explicit Mario and maze/escape prompts can open prepared source games; see [creation modes](docs/technical-guide.md#creation-modes-and-supported-games) for routing details.

## Save, host, and share

Browser-local projects remain on your device, with JSON export/import for backups. Server-backed projects store designs, revisions, and persistent AI context in SQLite. Runtime checkpoints remain browser-local.

The included [Render Blueprint](render.yaml) runs the studio with a persistent disk and password protection. This is a **shared workspace**: everyone with its password can access its server projects. Separate user accounts and per-user project isolation are not implemented. See [hosting instructions](docs/technical-guide.md#render-hosting-with-persistent-projects) for configuration and backups.

Standalone HTML exports can be shared or hosted as browser games. The full studio supports static hosting in local-generation mode; AI generation and server persistence require a backend.

## Built for creators and developers

LoreCraft uses **TypeScript, Vite, LittleJS, Canvas, SQLite, and MCP**. The browser studio supports prompt-driven creation, while MCP gives coding agents tools to create games, manage runtimes, inspect entities, and run gameplay checks.

```sh
# Configure the local MCP integration
pnpm setup:mcp
pnpm mcp

# Scaffold a custom source game
pnpm scaffold my-game "a space shooter with 4 enemies"
```

See the [MCP and runtime guide](docs/technical-guide.md#mcp-and-managed-runtime), [unified creation tool](docs/technical-guide.md#unified-mcp-operation), and [source authoring guide](docs/technical-guide.md#source-authoring-and-scaffolding).

### Development commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the studio and development API. |
| `pnpm test` | Run repository tests. |
| `pnpm typecheck` | Check TypeScript types. |
| `pnpm build` | Type-check and build into `dist/`. |
| `pnpm preview` | Preview the production build on port 4173. |
| `pnpm start` | Run the hosted server with the compiled frontend. |

Gameplay checks cover selected deterministic scenarios and simulation behavior. Playtesting is still needed to assess difficulty, balance, and fun.
