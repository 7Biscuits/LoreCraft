# LoreCraft: three-minute judge demo

## Before presenting

1. Run `pnpm dev` and open http://127.0.0.1:5173/ in a wide browser window.
2. Local generation is ready immediately. Optional AI mode requires a server-side `OPENAI_API_KEY` and a server restart; never put the key in the prompt.
3. Keep an exported HTML game and project JSON as an offline backup. No database or MCP relay is needed for the presentation.

## The presentation

**0:00 — The idea**

“A little lore. A whole world. LoreCraft turns an idea into a playable arcade game you can test, refine, and take with you.”

Choose **Forest adventure**, then **Create my game**. Explain that the selected creation mode is visible: local mode compiles supported mechanics deterministically; optional AI mode interprets richer prompts into validated game data.

**0:30 — Actually play**

Click **Enter the world**. Move with WASD / arrows, dash with Shift, collect crystals, and find the portal. Score, hearts, and the timer are live. R restarts and P pauses.

**1:00 — Iterate**

Enter “change it to an ocean runner with 3 enemies and 5 lives”. Create the revision and play it. The theme, goal, scrolling mechanics, and rules change. Alternatively show the space shooter and its auto-aim.

**1:30 — Evidence, not just a preview**

Open **Playtests** and run the ten scenario checks. Open **Inspector**: the game pauses and live entities expose their IDs and properties. Save a checkpoint, change the player's speed or position, apply, then restore the checkpoint. Advance exactly one frame or take a PNG screenshot.

**2:00 — Own the result**

Open **Version history** in the sidebar (or mobile navigation), restore an earlier design, then **Export game → Playable HTML game**. Open the downloaded file: it plays without the studio, server, account, or Internet. Export JSON to preserve prompts and revisions.

## Scope, stated honestly

The demo supports four 2D arcade rule sets and five procedural themes. It is not an arbitrary 3D/code-generation platform or a cloud collaboration product. Scenario checks test defined invariants, not every possible human playthrough. AI requests require valid provider credentials; local mode is the dependable offline presentation path.

## Troubleshooting

- **No movement:** click Enter the world / Play to focus the preview. The game pauses when it loses focus.
- **Paused overlay:** press Play. Inspector intentionally pauses gameplay before live edits.
- **Port occupied:** stop another Vite server or use a different port. Managed MCP launch needs exclusive ownership of its configured ports.
- **AI unavailable:** select Local generation; it does not require a key or network.
- **Browser storage full/unavailable:** export JSON before clearing storage. Save-status and error messages report persistence failures.
