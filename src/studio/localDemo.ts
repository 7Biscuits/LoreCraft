/** Prepared local games used for a short presentation flow. Gameplay stays in the existing hosts. */
export const localDemos = [
  { id: 'super-mario', title: 'Super Mario Bros (World 1-1)', keywords: /\b(?:super[\s-]*mario|mario|platformer)\b/i },
  { id: 'maze-escape', title: 'Maze Escape', keywords: /\b(?:rush|maze|escape|labyrinth)\b/i },
] as const;

export const localDemoStages = [
  { label: 'Understanding your idea', duration: 1100 },
  { label: 'Assembling the world', duration: 1800 },
  { label: 'Preparing characters and controls', duration: 1700 },
  { label: 'Getting your game ready to play', duration: 1200 },
] as const;

export function matchLocalDemo(prompt: string) { return localDemos.find((game) => game.keywords.test(prompt)); }
