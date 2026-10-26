import * as z from 'zod/v4';

export const gameSpecSchema = z.object({
  version: z.literal(1),
  title: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(300),
  genre: z.enum(['adventure', 'shooter', 'survival', 'runner', 'platformer', 'puzzle']),
  theme: z.enum(['forest', 'space', 'dungeon', 'ocean', 'neon']),
  difficulty: z.enum(['easy', 'normal', 'hard']),
  seed: z.number().int().min(1).max(2147483647),
  playerSpeed: z.number().min(2).max(10),
  enemySpeed: z.number().min(0.2).max(4),
  enemyCount: z.number().int().min(0).max(12),
  collectibleCount: z.number().int().min(1).max(16),
  timeLimit: z.number().int().min(20).max(180),
  lives: z.number().int().min(1).max(10),
  level: z.object({ platforms: z.array(z.object({ x: z.number().min(1).max(23), y: z.number().min(2).max(12), w: z.number().min(.2).max(6), h: z.number().min(.2).max(2) }).strict()).max(30) }).strict().optional(),
}).strict();
export type GameSpec = z.infer<typeof gameSpecSchema>;
export const checkpointSchema = z.object({
  entities: z.array(z.object({ id: z.string().min(1).max(128), type: z.enum(['player', 'coin', 'enemy', 'obstacle', 'bullet']), x: z.number().finite(), y: z.number().finite(), w: z.number().positive().max(100), h: z.number().positive().max(100), speed: z.number().nonnegative().max(10000), hp: z.number().finite(), vx: z.number().finite(), vy: z.number().finite() })).max(300),
  elapsed: z.number().nonnegative().max(100000), score: z.number().nonnegative().max(1e9), collected: z.number().int().nonnegative().max(10000), kills: z.number().int().nonnegative().max(10000), health: z.number().int().min(0).max(10), outcome: z.enum(['playing', 'won', 'lost']),
  invulnerable: z.number().nonnegative().max(10), dashCooldown: z.number().nonnegative().max(10), shotCooldown: z.number().nonnegative().max(10), seed: z.number().int().min(0).max(4294967295), tick: z.number().int().nonnegative().max(1e9),
  effects: z.array(z.object({ x: z.number().finite(), y: z.number().finite(), life: z.number().nonnegative().max(10), color: z.string().regex(/^#[a-fA-F0-9]{6}$/) })).max(1000),
}).superRefine((state, context) => { if (new Set(state.entities.map((e) => e.id)).size !== state.entities.length) context.addIssue({ code: 'custom', message: 'Checkpoint contains duplicate entity IDs.' }); });
export interface Revision { id: string; prompt: string; spec: GameSpec; createdAt: string; source: 'local' | 'ai'; checks: { name: string; passed: boolean; detail: string }[] }
export const projectContextSchema = z.object({ summary: z.string().max(2000), instructions: z.string().max(1000), turns: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(1500) }).strict()).max(8) }).strict();
export type ProjectContext = z.infer<typeof projectContextSchema>;
export interface Project { storage?: 'server'; context?: ProjectContext; version: 1; id: string; createdAt: string; updatedAt: string; revisions: Revision[]; activeRevisionId: string }

export const examples = [
  { title: 'Moonlit Grove', label: 'Forest adventure', prompt: 'A cozy moonlit forest adventure. Play as a tiny explorer, collect 6 magical crystals, avoid forest spirits, and find the portal home. Easy difficulty.', genre: 'adventure', theme: 'forest' },
  { title: 'Orbit Breaker', label: 'Space shooter', prompt: 'A neon space shooter where a pilot fights rogue drones in an asteroid field. Auto aim, 8 enemies, collect energy cores, and escape through a wormhole.', genre: 'shooter', theme: 'space' },
  { title: 'Dungeon After Dark', label: 'Survival challenge', prompt: 'Survive 45 seconds in a haunted dungeon with chasing skeletons. Collect gold, use a dash to dodge enemies. Hard difficulty with 5 lives.', genre: 'survival', theme: 'dungeon' },
  { title: 'Coral Dash', label: 'Ocean runner', prompt: 'An underwater endless runner. A little diver dodges coral and sea creatures, collects pearls, and races for 35 seconds. Bright ocean colors.', genre: 'runner', theme: 'ocean' },
] as const;

export function compilePrompt(prompt: string, previous?: GameSpec): GameSpec {
  const text = prompt.toLowerCase();
  const hash = Array.from(prompt).reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
  const theme = /space|alien|orbit|asteroid|galax|starship|cosmic/.test(text) ? 'space' : /ocean|underwater|coral|sea\b|diver|pearl|fish/.test(text) ? 'ocean' : /dungeon|skeleton|haunt|castle|zombie|crypt/.test(text) ? 'dungeon' : /neon|cyber|robot|city|synth/.test(text) ? 'neon' : /forest|grove|cozy|garden|nature|wood|fairy/.test(text) ? 'forest' : previous?.theme ?? 'forest';
  const genre = /platform|jump|side.scroll/.test(text) ? 'platformer' : /puzzle|ordered|sequence|riddle/.test(text) ? 'puzzle' : /runner|running|race|racing/.test(text) ? 'runner' : /shoot|fight|blaster|bullet|auto.?aim/.test(text) ? 'shooter' : /surviv|horde|wave/.test(text) ? 'survival' : /adventure|explor|maze|collect/.test(text) ? 'adventure' : previous?.genre ?? 'adventure';
  const difficulty = /easy|cozy|relax|easier|beginner/.test(text) ? 'easy' : /hard|challeng|difficult|harder/.test(text) ? 'hard' : previous?.difficulty ?? 'normal';
  const titles: Record<GameSpec['theme'], Record<GameSpec['genre'], string>> = {
    forest: { platformer: 'Canopy Climber', puzzle: 'Grove Riddles', adventure: 'Moonlit Grove', shooter: 'Grove Guardians', survival: 'Wildwood Watch', runner: 'Woodland Rush' },
    space: { platformer: 'Moon Jumper', puzzle: 'Orbital Sequence', adventure: 'Starlight Expedition', shooter: 'Orbit Breaker', survival: 'Last Light Station', runner: 'Comet Rider' },
    dungeon: { platformer: 'Vault Jumper', puzzle: 'Vault Riddles', adventure: 'The Forgotten Vault', shooter: 'Crypt Keepers', survival: 'Dungeon After Dark', runner: 'Escape the Underkeep' },
    ocean: { platformer: 'Island Hopper', puzzle: 'Pearl Sequence', adventure: 'Pearlbound', shooter: 'Reef Defenders', survival: 'The Deep Below', runner: 'Coral Dash' },
    neon: { platformer: 'Neon Heights', puzzle: 'Circuit Sequence', adventure: 'Neon Odyssey', shooter: 'Chrome Rebellion', survival: 'Midnight Circuit', runner: 'Afterglow Express' },
  };
  const count = (expression: RegExp, fallback: number, min: number, max: number) => Math.min(max, Math.max(min, Number(text.match(expression)?.[1] ?? fallback)));
  const changedDifficulty = !previous || difficulty !== previous.difficulty;
  let speed = changedDifficulty ? difficulty === 'easy' ? 4.6 : 4.2 : previous.playerSpeed;
  if (/faster|speed up|more speed/.test(text)) speed += 1;
  if (/slower|slow down/.test(text)) speed -= 1;
  let enemies = changedDifficulty ? difficulty === 'easy' ? 2 : difficulty === 'hard' ? 6 : 4 : previous.enemyCount;
  if (/more enem/.test(text)) enemies += 2;
  if (/fewer enem|less enem/.test(text)) enemies -= 2;
  if (/no enem|without enem|peaceful/.test(text)) enemies = 0;
  const quoted = prompt.match(/(?:call(?:ed)?|title|named)\s+["“']([^"”']{1,60})["”']/i)?.[1];
  return gameSpecSchema.parse({ version: 1, title: quoted ?? (previous && previous.theme === theme && previous.genre === genre ? previous.title : titles[theme][genre]),
    description: previous && previous.genre === genre && previous.theme === theme ? `${previous.description.split(' Refined:')[0]} Refined: ${prompt}`.slice(0, 300) : prompt.slice(0, 300),
    genre, theme, difficulty, seed: previous?.seed ?? hash % 2147483646 + 1,
    playerSpeed: Math.max(2, Math.min(10, speed)), enemySpeed: changedDifficulty ? difficulty === 'easy' ? 0.65 : difficulty === 'hard' ? 1.5 : 1 : previous.enemySpeed,
    ...(previous?.level && previous.genre === genre ? { level: previous.level } : {}),
    enemyCount: count(/(\d+)\s+(?:enemies|enemy|drones|spirits|skeletons)/, genre === 'puzzle' ? 0 : enemies, 0, 12),
    collectibleCount: count(/(?:collect\s+)?(\d+)\s+(?:crystals|coins|pearls|gems|cores|collectibles)/, previous?.collectibleCount ?? 6, 1, 16),
    timeLimit: count(/(\d+)\s*(?:seconds?|secs?|s\b)/, previous?.timeLimit ?? (genre === 'runner' ? 35 : genre === 'survival' ? 45 : 90), 20, 180),
    lives: count(/(\d+)\s+(?:lives|hearts)/, previous?.lives ?? (difficulty === 'easy' ? 5 : 3), 1, 10),
  });
}

export function parseProject(value: unknown): Project {
  const revision = z.object({ id: z.string().max(100), prompt: z.string().max(4000), spec: gameSpecSchema, createdAt: z.string().max(60), source: z.enum(['local', 'ai']), checks: z.array(z.object({ name: z.string().max(120), passed: z.boolean(), detail: z.string().max(500) })).max(30) });
  const project = z.object({ storage: z.literal('server').optional(), context: projectContextSchema.optional(), version: z.literal(1), id: z.string().max(100), createdAt: z.string().max(60), updatedAt: z.string().max(60), activeRevisionId: z.string().max(100), revisions: z.array(revision).min(1).max(50) }).parse(value);
  if (!project.revisions.some((r) => r.id === project.activeRevisionId)) throw new Error('Project active revision is missing.');
  return project;
}
