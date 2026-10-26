import type { FighterInput, MoveId } from './combat';
const controls = [
  { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', attacks: ['KeyF', 'KeyG', 'KeyH', 'KeyV', 'KeyB', 'KeyN'], special: 'KeyT' },
  { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', attacks: ['KeyJ', 'KeyK', 'KeyL', 'KeyU', 'KeyI', 'KeyO'], special: 'ShiftRight' },
] as const;
const ids: MoveId[] = ['lp', 'mp', 'hp', 'lk', 'mk', 'hk'];
const consumed = new Set<string>(['Enter', 'Space', 'Escape', 'KeyP', 'KeyR', ...controls.flatMap(c => [c.left, c.right, c.up, c.down, c.special, ...c.attacks])]);
export class DuelInput {
  private held = new Set<string>();
  private edges = new Set<string>();
  private clicked = false;
  private keydown = (e: KeyboardEvent) => {
    if (!consumed.has(e.code)) return;
    e.preventDefault();
    if (!e.repeat && !this.held.has(e.code)) this.edges.add(e.code);
    this.held.add(e.code);
  };
  private keyup = (e: KeyboardEvent) => { if (consumed.has(e.code)) e.preventDefault(); this.held.delete(e.code); };
  private blur = () => { this.held.clear(); this.edges.clear(); this.onBlur?.(); };
  private pointer = () => { this.clicked = true; };
  constructor(private onBlur?: () => void) {}
  attach(): void {
    window.addEventListener('keydown', this.keydown, { capture: true }); window.addEventListener('keyup', this.keyup, { capture: true });
    window.addEventListener('blur', this.blur); window.addEventListener('pointerdown', this.pointer);
  }
  detach(): void {
    window.removeEventListener('keydown', this.keydown, { capture: true }); window.removeEventListener('keyup', this.keyup, { capture: true });
    window.removeEventListener('blur', this.blur); window.removeEventListener('pointerdown', this.pointer); this.held.clear(); this.edges.clear();
  }
  sample(): { fighters: [FighterInput, FighterInput]; start: boolean; pause: boolean; restart: boolean } {
    const fighters = controls.map(c => {
      let attack: MoveId | undefined;
      for (let i = 0; i < 6; i++) if (this.edges.has(c.attacks[i]!)) attack = ids[i];
      const down = this.held.has(c.down);
      if (this.edges.has(c.special)) attack = down ? 'shoryuken' : 'hadouken';
      return { x: Number(this.held.has(c.right)) - Number(this.held.has(c.left)), down, jump: this.edges.has(c.up), attack };
    }) as [FighterInput, FighterInput];
    const result = { fighters, start: this.edges.has('Enter') || this.clicked, pause: this.edges.has('KeyP') || this.edges.has('Escape'), restart: this.edges.has('KeyR') };
    this.edges.clear(); this.clicked = false; return result;
  }
}
