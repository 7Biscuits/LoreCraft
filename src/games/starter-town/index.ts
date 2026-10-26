import { mainContext, mainCanvasSize, mouseIsDown, mousePosScreen } from 'littlejsengine';
import type { EngineObject } from 'littlejsengine';
import type { GameModule, GameContext, GameFrame } from '../contract';
import { buildings, pond, TownWalker } from './world';

export class StarterTownGame implements GameModule {
  readonly id = 'starter-town';
  readonly title = 'Starter Town';
  private context?: GameContext;
  private walker = new TownWalker();
  init(context: GameContext): void { this.context = context; this.reset(); }
  reset(): void {
    this.walker = new TownWalker(); this.context?.setScore(0);
    const result = this.context?.createEntity({ id: 'explorer', type: 'player', dimension: '2d', position: { x: 11, y: 9 }, properties: { size: { x: 0.7, y: 0.7 } } });
    if (result && !result.ok) throw new Error(result.error.message);
    const player = this.context?.getObject<EngineObject>('explorer'); if (player) player.render = () => {};
  }
  update(frame: GameFrame): void {
    if (frame.restart) { this.context?.runtime.resetGame(); return; }
    let dx = frame.movement.x, dy = -frame.movement.y;
    if (mouseIsDown(0)) {
      const scale = Math.min(mainCanvasSize.x / 480, mainCanvasSize.y / 360);
      const px = (mousePosScreen.x - (mainCanvasSize.x - 480 * scale) / 2) / scale - 48;
      const py = (mousePosScreen.y - (mainCanvasSize.y - 360 * scale) / 2) / scale - 36;
      const deltaX = px - (this.walker.renderX * 16 + 8), deltaY = py - (this.walker.renderY * 16 + 8);
      dx = Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 8 ? Math.sign(deltaX) : 0;
      dy = !dx && Math.abs(deltaY) > 8 ? Math.sign(deltaY) : 0;
    }
    this.walker.update(frame.deltaSeconds, dx, dy);
    const player = this.context?.getObject<EngineObject>('explorer');
    if (player) { player.pos.x = this.walker.renderX; player.pos.y = this.walker.renderY; }
  }
  getState() { return { outcome: 'exploring', region: 'Clover Town', x: this.walker.x, y: this.walker.y, direction: this.walker.direction, steps: this.walker.steps }; }
  destroy(): void { this.context = undefined; }
  render(): void {
    const c = mainContext; if (!c) return;
    c.save(); c.fillStyle = '#223f3c'; c.fillRect(0, 0, mainCanvasSize.x, mainCanvasSize.y);
    const scale = Math.min(mainCanvasSize.x / 480, mainCanvasSize.y / 360);
    c.translate((mainCanvasSize.x - 480 * scale) / 2, (mainCanvasSize.y - 360 * scale) / 2); c.scale(scale, scale); c.imageSmoothingEnabled = false;
    const rect = (x: number, y: number, w: number, h: number, color: string) => { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), w, h); };
    const text = (value: string, x: number, y: number, size: number, color = '#f8f2d9') => { c.fillStyle = color; c.font = `bold ${size}px monospace`; c.fillText(value, x, y); };
    rect(0, 0, 480, 360, '#223f3c'); text('CLOVER TOWN', 48, 23, 15); text('A QUIET BEGINNING', 289, 23, 9, '#b8cfac');
    c.save(); c.translate(48, 36);
    for (let y = 0; y < 18; y++) for (let x = 0; x < 24; x++) {
      rect(x * 16, y * 16, 16, 16, (x + y) % 2 ? '#99c879' : '#9dcc7d');
      if ((x * 7 + y * 3) % 5 === 0) { rect(x * 16 + 3, y * 16 + 6, 2, 3, '#82b86a'); rect(x * 16 + 6, y * 16 + 8, 2, 2, '#82b86a'); }
    }
    // A connected network of sandy paths between the starting homes and lab.
    for (let y = 2; y < 17; y++) for (let x = 2; x < 22; x++) {
      if ((x >= 10 && x <= 12) || (y >= 8 && y <= 9) || (x >= 6 && x <= 7 && y >= 7 && y <= 8) || (x >= 17 && x <= 18 && y >= 7 && y <= 10) || (y === 16 && x >= 11 && x <= 18)) {
        rect(x * 16, y * 16, 16, 16, '#e3d49c');
        rect(x * 16 + (x * 3 % 11), y * 16 + (y * 5 % 13), 2, 1, '#ccbc87');
      }
    }
    const tree = (x: number, y: number) => {
      rect(x + 5, y + 17, 6, 6, '#82664b'); rect(x - 1, y + 4, 18, 14, '#326e4c');
      rect(x + 1, y, 14, 18, '#3e8553'); rect(x + 4, y - 2, 8, 20, '#4d965a');
      rect(x + 3, y + 3, 5, 4, '#72ad68'); rect(x + 1, y + 17, 14, 3, '#285c44');
    };
    for (let x = 0; x < 24; x++) { tree(x * 16, 0); tree(x * 16, 16 * 16 + 6); }
    for (let y = 1; y < 17; y++) for (const x of [0, 1, 22, 23]) tree(x * 16, y * 16);
    // Pond, banks, and small animated ripples.
    rect(pond.x * 16 - 3, pond.y * 16 - 3, pond.w * 16 + 6, pond.h * 16 + 6, '#699b60');
    rect(pond.x * 16, pond.y * 16, pond.w * 16, pond.h * 16, '#579fb8');
    for (let i = 0; i < 12; i++) {
      const xx = 51 + i * 19 % 70, yy = 198 + i * 13 % 51;
      rect(xx + Math.floor(Date.now() / 600 + i) % 3, yy, 7, 1, '#a0d8ce');
    }
    for (const b of buildings) {
      const x = b.x * 16, y = b.y * 16, w = b.w * 16, h = b.h * 16;
      rect(x + 3, y + 7, w, h, '#678c5980'); rect(x, y + 22, w, h - 22, '#f4e4b6');
      for (let yy = y + 28; yy < y + h; yy += 8) rect(x + 2, yy, w - 4, 1, '#dccb9e');
      rect(x - 3, y + 4, w + 6, 27, '#574e4a'); rect(x, y, w, 27, b.roof);
      for (let yy = y + 5; yy < y + 26; yy += 6) {
        rect(x, yy, w, 2, '#ffffff26');
        for (let xx = x + (yy % 2 ? 8 : 0); xx < x + w; xx += 16) rect(xx, yy - 4, 1, 5, '#00000019');
      }
      rect(x + w / 2 - 7, y + h - 21, 14, 21, '#816951'); rect(x + w / 2 - 5, y + h - 19, 10, 18, '#a0845d'); rect(x + w / 2 + 2, y + h - 10, 2, 2, '#f3d681');
      for (const xx of [x + 10, x + w - 25]) { rect(xx, y + 36, 15, 14, '#b29b70'); rect(xx + 2, y + 38, 11, 10, '#78aeb8'); rect(xx + 7, y + 38, 1, 10, '#f8efd1'); rect(xx + 2, y + 42, 11, 1, '#f8efd1'); }
      rect(x + w / 2 - 9, y + h, 18, 4, '#bbae87');
    }
    for (const [x, y] of [[10, 8], [12, 14]]) {
      rect(x! * 16 + 7, y! * 16 + 5, 3, 12, '#836347'); rect(x! * 16 + 2, y! * 16, 14, 10, '#826647'); rect(x! * 16 + 4, y! * 16 + 2, 10, 6, '#efdfb1'); rect(x! * 16 + 5, y! * 16 + 4, 7, 1, '#9c8158');
    }
    for (let i = 0; i < 34; i++) {
      const x = 36 + i * 31 % 310, y = 165 + i * 17 % 18;
      rect(x + 1, y + 4, 2, 5, '#548954'); rect(x - 1, y + 1, 6, 3, i % 2 ? '#f1d58b' : '#eaa39c'); rect(x + 1, y - 1, 2, 7, i % 2 ? '#f1d58b' : '#eaa39c'); rect(x + 1, y + 2, 2, 2, '#fff0cc');
    }
    const p = this.walker, px = Math.round(p.renderX * 16 + 8), py = Math.round(p.renderY * 16 + 12);
    // An original tiny explorer, drawn on the same pixel grid as the town.
    rect(px - 5, py, 10, 3, '#466b4f80');
    const stride = p.progress < 1 ? Math.sin(p.progress * Math.PI * 2) * 2 : 0;
    rect(px - 4, py - 3 + stride, 3, 5, '#345573'); rect(px + 1, py - 3 - stride, 3, 5, '#345573');
    rect(px - 5, py - 9, 10, 7, '#3f8d80'); rect(px - 6, py - 8, 2, 5, '#f2c697'); rect(px + 4, py - 8, 2, 5, '#f2c697');
    rect(px - 4, py - 17, 8, 8, '#684b3e'); rect(px - 4, py - 15, 8, 6, '#f2c697');
    rect(px - 5, py - 20, 10, 5, '#b95650'); rect(px - 4, py - 21, 8, 3, '#d87360');
    rect(px - 6, py - 16, p.direction === 'left' ? 8 : 12, 2, '#f1d2a0');
    if (p.direction !== 'up') {
      if (p.direction !== 'right') rect(px - 3, py - 12, 1, 2, '#393d42');
      if (p.direction !== 'left') rect(px + 2, py - 12, 1, 2, '#393d42');
    } else rect(px - 4, py - 14, 8, 4, '#684b3e');
    c.restore();
    text('WASD / ARROWS  Walk    ·    Hold / tap a direction', 48, 341, 9, '#e5ead0');
    text('R  Back home', 48, 354, 8, '#a9c2a3'); text('STARTING REGION', 342, 354, 8, '#a9c2a3');
    c.restore();
  }
}
export const starterTownGame = new StarterTownGame();
