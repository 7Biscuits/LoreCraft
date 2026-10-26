import type { GameSpec } from './spec.ts';
export const foundations: Record<GameSpec['genre'], { id: string; label: string; mechanics: string[]; controls: string; objective: string }> = {
  adventure: { id: 'collect-and-exit', label: 'Adventure', mechanics: ['movement', 'collision', 'collectibles', 'portal'], controls: 'WASD / arrows; Shift dash', objective: 'Collect every gem and reach the portal.' },
  platformer: { id: 'gravity-platformer', label: 'Platformer', mechanics: ['gravity', 'jump', 'platform-collision', 'collectibles'], controls: 'A/D or arrows; W/Up/Space jump', objective: 'Jump across platforms, collect gems, and reach the exit.' },
  runner: { id: 'scrolling-runner', label: 'Runner', mechanics: ['scrolling', 'dodging', 'collectibles', 'timer'], controls: 'WASD / arrows; Shift dash', objective: 'Dodge scrolling hazards until the timer ends.' },
  shooter: { id: 'arena-shooter', label: 'Shooter', mechanics: ['auto-aim', 'projectiles', 'enemies', 'portal'], controls: 'WASD / arrows; Space rapid fire', objective: 'Defeat enemies, collect gems, and reach the portal.' },
  survival: { id: 'timed-survival', label: 'Survival', mechanics: ['chasing-enemies', 'damage', 'dash', 'timer'], controls: 'WASD / arrows; Shift dash', objective: 'Stay alive until the timer ends.' },
  puzzle: { id: 'ordered-gems', label: 'Puzzle', mechanics: ['grid-movement', 'ordered-collection', 'collision', 'portal'], controls: 'WASD / arrows, one grid step at a time', objective: 'Collect the numbered gems in order, then reach the portal.' },
};
export function selectFoundation(spec: GameSpec) { return foundations[spec.genre]; }
