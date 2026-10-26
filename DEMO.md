# LoreCraft: three-minute judge demo

## Before presenting

1. Run `pnpm dev` and open `http://127.0.0.1:5173/` in a wide browser window.
2. Keep **Local generation** selected. No API key, database, or MCP relay is needed for this flow.
3. Use the trash buttons in **Your Games** (or **My projects** on smaller screens) to remove earlier demo runs. Refreshing preserves the remaining library and the selected game.

## The presentation

**0:00 — An idea becomes playable**

Enter “Create a Mario platformer with coins and enemies” and click **Create my game**. The roughly six-second presentation sequence shows understanding the idea, assembling the world, preparing characters and controls, and opening the game.

This local presentation flow uses prepared source games. It does not wait for an agent to author new source code.

**0:30 — Actually play**

Mario opens directly. Move with WASD / arrows and jump with W / Up. R restarts; the toolbar pauses or resumes. Click Play if the game paused after losing focus.

**1:00 — Another game**

Enter “Create a rush game through a maze”. The same preparation flow opens **Maze Escape**. Collect the gold key, avoid the sentinel, and reach the exit. Both games are now in **Your Games**.

| Keywords | Prepared game |
| --- | --- |
| Mario, Super Mario, platformer | Super Mario Bros (World 1-1) |
| rush, maze, escape, labyrinth | Maze Escape |

Matching is case-insensitive. Mario wins if both groups appear in one prompt. Other prompts retain the existing local prompt compiler; AI mode continues to use its configured provider.

**1:30 — Show persistence**

Refresh the page. The selected game reopens from its starting point, and both saved games remain in the library. Choose Mario or Maze Escape from the library to switch games.

**2:00 — Reset for another demo**

Click a game's trash button, confirm **Delete game**, and refresh. The game stays removed. Delete the last game to return to an empty workspace. Enter its keyword again to prepare it for a new run. Deletion removes the browser-local entry and preserves the source game files.

## Existing creation and inspection features

Prompts such as “an ocean runner with 3 enemies and 5 lives” still use the deterministic generator. Select its saved world from the library to play or refine it. Generated worlds retain revision history, ten gameplay scenarios, inspector editing, checkpoints, JSON backups, and standalone HTML export.

Prepared source games expose their runtime state, entity inspector, screenshots, and available runtime checks. Their custom source code is not serialized by the studio's project/HTML exporter. Library persistence remembers which game to reopen, rather than an exact in-progress gameplay checkpoint.

## Troubleshooting

- **No movement:** click Enter the world / Play to focus the preview. The game pauses when it loses focus.
- **Paused overlay:** press Play. Inspector intentionally pauses gameplay before live edits.
- **Port occupied:** stop another Vite server or use a different port. Managed MCP launch needs exclusive ownership of its configured ports.
- **AI unavailable:** select Local generation; it does not require a key or network.
- **Browser storage full/unavailable:** preserve project JSON backups before clearing storage. Save-status and error messages report persistence failures.
