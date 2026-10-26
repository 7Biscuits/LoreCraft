# Ken vs. Ryu — Arcade Duel

Source-authored local two-player fighting game using the existing LittleJS host and Canvas renderer. All art is procedural; sound cues use Web Audio. No remote assets or services are required.

Open `/?game=ken-vs-ryu&bridge=0`, or select the game from the Lorecraft gallery. Enter/click starts and rematches. P/Escape pauses; R while paused restarts the match. The first fighter to win two rounds wins the match. Rounds last 99 seconds; equal health at timeout or a double KO replays the round without awarding a win.

| Action | Ken (P1) | Ryu (P2) |
| --- | --- | --- |
| Walk | A / D | Left / Right |
| Jump | W | Up |
| Crouch | S | Down |
| Light / medium / heavy punch | F / G / H | J / K / L |
| Light / medium / heavy kick | V / B / N | U / I / O |
| Hadouken | T | Right Shift |
| Shoryuken | S + T | Down + Right Shift |
| Guard | Hold away from opponent | Hold away from opponent |

Crouching kicks require crouch + away to block. Jumping attacks require standing guard. Normal attacks do no guard damage; specials do two chip damage but cannot chip KO. Confirmed normals can cancel into a higher-strength normal or special: light → medium → heavy → special. Hit stun, recovery, range and knockback still determine whether the chain connects. Jumping over an opponent allows switching sides; fighters turn automatically when free to act.

- `combat.ts`: deterministic combat/match state, move data, hit/hurt boxes, projectiles, simultaneous trades, collisions, damage and rounds.
- `input.ts`: independent held/edge keyboard input, scroll prevention and cleanup.
- `fighterArt.ts`: articulated original fighter poses and procedural animation.
- `render.ts`: stage, effects, HUD and menu rendering.
- `audio.ts`: synthesized effects with gesture-based audio activation.
- `index.ts`: GameModule integration and runtime inspection snapshots.

Run the focused checks with `node --import tsx --test src/games/arcadeDuel.test.ts`; `pnpm test` runs the repository suite and `pnpm build` checks TypeScript and bundles all games.
