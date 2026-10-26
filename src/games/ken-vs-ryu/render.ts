import { CombatMatch, FLOOR, moves } from './combat';
import { drawFighter } from './fighterArt';
const text = (c: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color = '#fff1d2', align: CanvasTextAlign = 'left') => {
  c.textAlign = align; c.fillStyle = color; c.font = `800 ${size}px "Trebuchet MS", system-ui, sans-serif`; c.fillText(value, x, y);
};
const box = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, radius = 0) => {
  c.fillStyle = color; c.beginPath(); c.roundRect(x, y, w, h, radius); c.fill();
};
function stage(c: CanvasRenderingContext2D, time: number): void {
  const sky = c.createLinearGradient(0, 0, 0, 530); sky.addColorStop(0, '#283e68'); sky.addColorStop(.5, '#d4818b'); sky.addColorStop(1, '#ffc49b'); c.fillStyle = sky; c.fillRect(0, 0, 1200, 675);
  c.fillStyle = '#ffe2b1'; c.beginPath(); c.arc(760, 230, 72, 0, Math.PI * 2); c.fill();
  for (let layer = 0; layer < 3; layer++) {
    c.fillStyle = ['#6c6684', '#555a76', '#3f5367'][layer]!; c.beginPath(); c.moveTo(0, 390);
    for (let i = 0; i <= 12; i++) c.lineTo(i * 110, 330 - layer * 8 - Math.sin(i * 2.1 + layer) * 55 - (i % 3) * 35);
    c.lineTo(1200, 490); c.lineTo(0, 490); c.closePath(); c.fill();
  }
  c.fillStyle = '#517485'; c.fillRect(0, 378, 1200, 100);
  for (let i = 0; i < 45; i++) { c.fillStyle = i % 3 ? '#c49b9b55' : '#ffdcaa88'; c.fillRect((i * 131 + Math.sin(time + i) * 18) % 1200, 387 + i * 11 % 85, 25 + i % 5 * 10, 2); }
  // Far bank and a small pagoda silhouette.
  box(c, 80, 323, 72, 66, '#354958');
  for (let i = 0; i < 3; i++) { const y = 300 + i * 29; c.fillStyle = '#293c50'; c.beginPath(); c.moveTo(58, y + 19); c.lineTo(116, y - 5); c.lineTo(174, y + 19); c.lineTo(160, y + 24); c.lineTo(72, y + 24); c.fill(); }
  // Torii gate, carved posts and warm hanging lanterns.
  for (const x of [315, 885]) { box(c, x - 14, 207, 28, 284, '#783c44'); box(c, x - 9, 207, 8, 284, '#b56254'); box(c, x - 23, 470, 46, 17, '#333b45'); }
  box(c, 269, 195, 665, 24, '#9f514f'); box(c, 292, 242, 617, 16, '#693a45');
  c.strokeStyle = '#303944'; c.lineWidth = 13; c.beginPath(); c.moveTo(255, 184); c.quadraticCurveTo(600, 221, 945, 184); c.stroke();
  box(c, 576, 211, 48, 73, '#39424a'); text(c, '道', 600, 261, 35, '#ebc390', 'center');
  const lantern = (x: number, y: number) => {
    const sway = Math.sin(time * 1.5 + x) * 3;
    box(c, x, y - 35, 2, 35, '#3c3b45');
    const glow = c.createRadialGradient(x + sway, y + 20, 0, x + sway, y + 20, 60); glow.addColorStop(0, '#ffb26144'); glow.addColorStop(1, '#ffb26100'); c.fillStyle = glow; c.fillRect(x - 60, y - 40, 120, 120);
    box(c, x - 18 + sway, y, 38, 48, '#b94d49', 14); box(c, x - 11 + sway, y + 2, 24, 44, '#efa06a', 10);
    for (let j = 0; j < 4; j++) box(c, x - 16 + sway, y + 8 + j * 10, 34, 1, '#713b48');
    box(c, x - 11 + sway, y - 2, 25, 5, '#343943'); box(c, x - 11 + sway, y + 46, 25, 5, '#343943');
  };
  for (const x of [365, 835]) lantern(x, 272);
  // Flowering cherry trees frame the arena, with drifting petals.
  for (const side of [0, 1]) {
    c.save(); c.translate(side ? 1200 : 0, 0); c.scale(side ? -1 : 1, 1);
    c.strokeStyle = '#343b4b'; c.lineWidth = 28; c.beginPath(); c.moveTo(45, 492); c.quadraticCurveTo(95, 340, 35, 168); c.stroke();
    c.lineWidth = 15; c.beginPath(); c.moveTo(64, 300); c.lineTo(170, 206); c.lineTo(242, 192); c.moveTo(60, 256); c.lineTo(20, 200); c.stroke();
    for (let i = 0; i < 22; i++) { const x = (i * 67 % 255) - 26, y = 118 + i * 43 % 105; c.fillStyle = ['#b15e81', '#d3819a', '#eea6b1'][i % 3]!; c.beginPath(); c.ellipse(x, y, 42 + i % 4 * 5, 24, -.2, 0, Math.PI * 2); c.fill(); }
    c.restore();
  }
  for (let i = 0; i < 30; i++) {
    const x = (i * 97 + time * (16 + i % 4)) % 1250 - 25, y = (i * 61 + time * 23) % 500;
    c.fillStyle = '#ffd0c7b0'; c.beginPath(); c.ellipse(x, y, 3, 6, time + i, 0, Math.PI * 2); c.fill();
  }
  box(c, 0, 456, 1200, 25, '#464553');
  for (let i = 0; i < 20; i++) { box(c, i * 68, 442, 8, 39, '#777077'); box(c, i * 68 + 4, 439, 55, 7, '#9d8b86'); }
  const floor = c.createLinearGradient(0, 478, 0, 610); floor.addColorStop(0, '#b0a394'); floor.addColorStop(1, '#726f78'); c.fillStyle = floor; c.fillRect(0, 480, 1200, 195);
  c.strokeStyle = '#514f6055'; c.lineWidth = 2;
  for (let i = 0; i < 13; i++) { c.beginPath(); c.moveTo(600 + (i - 6) * 66, 480); c.lineTo(600 + (i - 6) * 140, 675); c.stroke(); }
  for (const y of [497, 524, 560, 610, 674]) { c.beginPath(); c.moveTo(0, y); c.lineTo(1200, y); c.stroke(); }
  box(c, 0, 578, 1200, 6, '#403d50'); box(c, 0, 584, 1200, 91, '#111a2c');
}
function hud(c: CanvasRenderingContext2D, match: CombatMatch): void {
  box(c, 25, 17, 1150, 97, '#111a2ce8', 8);
  text(c, 'KEN', 47, 47, 27, '#ffb280'); text(c, 'RYU', 1153, 47, 27, '#b9e5fa', 'right');
  text(c, 'P1', 124, 45, 12, '#a4b2c9'); text(c, 'P2', 1076, 45, 12, '#a4b2c9', 'right');
  for (let i = 0; i < 2; i++) {
    const f = match.fighters[i]!, x = i ? 670 : 47, w = 483;
    box(c, x - 2, 58, w + 4, 25, '#c8ba9b'); box(c, x, 60, w, 21, '#593740');
    const fill = w * f.health / 100;
    const gradient = c.createLinearGradient(x, 0, x + w, 0); gradient.addColorStop(0, i ? '#63c8de' : '#efab63'); gradient.addColorStop(1, i ? '#a0e2d1' : '#ffdf86');
    c.fillStyle = gradient; c.fillRect(i ? x + w - fill : x, 60, fill, 21); box(c, i ? x + w - fill : x, 61, fill, 4, '#ffffff55');
    for (let r = 0; r < 2; r++) { c.fillStyle = f.wins > r ? '#ffcf69' : '#46516a'; c.beginPath(); c.arc(i ? 1138 - r * 23 : 62 + r * 23, 98, 6, 0, Math.PI * 2); c.fill(); }
    const ready = f.cooldown <= 0;
    text(c, ready ? 'SPECIAL READY' : `SPECIAL  ${f.cooldown.toFixed(1)}s`, i ? 1010 : 143, 101, 11, ready ? '#d0dfb3' : '#929bb2');
    if (f.combo >= 2) text(c, `${f.combo} HIT COMBO`, i ? 1138 : 62, 151, 24, '#ffe09c', i ? 'right' : 'left');
    if (f.attack?.id === 'hadouken' || f.attack?.id === 'shoryuken') text(c, moves[f.attack.id].label, i ? 1120 : 80, 181, 16, i ? '#a9eaff' : '#ffb47a', i ? 'right' : 'left');
  }
  box(c, 548, 24, 104, 83, '#283249', 6); text(c, String(Math.ceil(match.timer)).padStart(2, '0'), 600, 76, 46, '#fff1d2', 'center'); text(c, `ROUND ${match.round}`, 600, 96, 11, '#b3bbcf', 'center');
  text(c, 'P1  A / D MOVE · W JUMP · S CROUCH', 30, 607, 12, '#ffbe98');
  text(c, 'F G H  PUNCHES    V B N  KICKS    T  HADOUKEN    S + T  SHORYUKEN', 30, 629, 12, '#c1cadb');
  text(c, 'P2  ← / → MOVE · ↑ JUMP · ↓ CROUCH', 1170, 607, 12, '#b9e5fa', 'right');
  text(c, 'J K L  PUNCHES    U I O  KICKS    RSHIFT  HADOUKEN    ↓ + RSHIFT  SHORYUKEN', 1170, 651, 11, '#c1cadb', 'right');
  text(c, 'HOLD AWAY TO BLOCK · LOW KICKS REQUIRE CROUCH GUARD · P / ESC PAUSE', 30, 665, 10, '#8495b2');
}
function overlay(c: CanvasRenderingContext2D, match: CombatMatch): void {
  if (match.phase === 'fight' && !match.paused) {
    if (match.phaseTime < .65) { text(c, 'FIGHT!', 600, 300, 78, '#ffda8c', 'center'); }
    return;
  }
  if (match.phase === 'intro') {
    text(c, `ROUND ${match.round}`, 600, 285, 58, '#fff1d2', 'center'); text(c, 'KEN  vs.  RYU', 600, 329, 21, '#ffd19a', 'center'); return;
  }
  if (match.phase === 'roundOver') {
    text(c, match.reason, 600, 270, 92, '#ffe0a4', 'center');
    text(c, match.winner < 0 ? 'DRAW — ROUND REPLAY' : `${match.fighters[match.winner]!.name} WINS THE ROUND`, 600, 325, 28, '#fff1d2', 'center'); return;
  }
  box(c, 0, 0, 1200, 675, '#0b1425b8');
  box(c, 225, 142, 750, 395, '#142238f5', 12); c.strokeStyle = '#d9ad6c'; c.lineWidth = 2; c.strokeRect(235, 152, 730, 375);
  if (match.paused) {
    text(c, 'PAUSED', 600, 242, 62, '#ffdb9c', 'center');
    text(c, 'P / ESC to resume', 600, 302, 23, '#d3d9e6', 'center');
    text(c, 'R to restart the match', 600, 349, 20, '#d3d9e6', 'center');
    text(c, 'Light → Medium → Heavy → Special on confirmed hits', 600, 424, 17, '#a8bad3', 'center');
  } else if (match.phase === 'matchOver') {
    const winner = match.fighters.find(f => f.wins >= 2)!;
    text(c, 'THE MATCH IS YOURS', 600, 202, 16, '#b5c4d8', 'center');
    text(c, `${winner.name} WINS`, 600, 277, 66, '#ffdc98', 'center');
    text(c, `${match.fighters[0].wins}  —  ${match.fighters[1].wins}`, 600, 337, 44, '#fff1d2', 'center');
    text(c, winner.name === 'KEN' ? '“Keep the fire alive.”' : '“The journey continues.”', 600, 387, 22, '#b6cbe0', 'center');
    box(c, 418, 436, 364, 57, '#e5b271', 5); text(c, 'ENTER / CLICK  —  REMATCH', 600, 472, 20, '#142238', 'center');
  } else {
    text(c, 'LORECRAFT  /  ARCADE SERIES 01', 600, 191, 13, '#a5bad1', 'center');
    text(c, 'KEN  vs.  RYU', 600, 258, 66, '#ffdc98', 'center');
    text(c, 'SUNSET AT THE DOJO', 600, 293, 18, '#c8d7e8', 'center');
    text(c, 'LOCAL TWO PLAYER  ·  FIRST TO TWO ROUNDS', 600, 336, 16, '#f4e6c7', 'center');
    text(c, 'Six normals. Two specials. One decisive duel.', 600, 370, 18, '#b0c3db', 'center');
    text(c, 'Hold away to guard. Crouch + special for Shoryuken.', 600, 400, 16, '#b0c3db', 'center');
    box(c, 418, 436, 364, 57, '#e5b271', 5); text(c, 'ENTER / CLICK  —  START', 600, 472, 20, '#142238', 'center');
  }
}
export function renderDuel(c: CanvasRenderingContext2D, width: number, height: number, match: CombatMatch): void {
  c.save(); c.fillStyle = '#0b1425'; c.fillRect(0, 0, width, height);
  const scale = Math.min(width / 1200, height / 675); c.translate((width - scale * 1200) / 2, (height - scale * 675) / 2); c.scale(scale, scale);
  c.save(); c.beginPath(); c.rect(0, 0, 1200, 584); c.clip();
  c.translate(Math.sin(match.clock * 130) * match.shake, Math.cos(match.clock * 117) * match.shake * .45);
  stage(c, match.clock);
  for (const f of match.fighters) { c.fillStyle = '#18253266'; c.beginPath(); c.ellipse(f.x, FLOOR + 4, 45 - Math.min(20, (FLOOR - f.y) / 10), 10, 0, 0, Math.PI * 2); c.fill(); }
  match.fighters.forEach((f, i) => drawFighter(c, f, match.clock, (match.phase === 'roundOver' || match.phase === 'matchOver') && match.winner === i, f.health <= 0));
  for (const p of match.projectiles) {
    const ken = p.owner === 0; c.save(); c.translate(p.x, p.y); c.scale(p.direction, 1);
    const glow = c.createRadialGradient(0, 0, 0, 0, 0, 55); glow.addColorStop(0, ken ? '#ffbd5bdd' : '#96efffdd'); glow.addColorStop(1, '#70dfff00'); c.fillStyle = glow; c.fillRect(-75, -55, 130, 110);
    c.fillStyle = ken ? '#ff8748' : '#38bde4'; c.beginPath(); c.moveTo(-65, -14); c.quadraticCurveTo(-8, -5, -9, -25); c.bezierCurveTo(38, -30, 40, 30, -9, 25); c.quadraticCurveTo(-8, 7, -65, 14); c.lineTo(-39, 0); c.fill();
    c.fillStyle = '#fff5cd'; c.beginPath(); c.ellipse(5, 0, 18, 14 + Math.sin(match.clock * 35) * 3, 0, 0, Math.PI * 2); c.fill(); c.restore();
  }
  for (const e of match.impacts) {
    c.save(); c.translate(e.x, e.y); const life = 1 - e.age / .4; c.globalAlpha = life;
    c.strokeStyle = e.kind === 'block' ? '#9defff' : '#ffd46e'; c.lineWidth = 3;
    for (let i = 0; i < 10; i++) { const angle = i * Math.PI / 5 + .2, inner = 8 + e.age * 80, outer = inner + 12 * life + e.power * 4; c.beginPath(); c.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner); c.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer); c.stroke(); }
    if (e.kind === 'block') { c.beginPath(); c.arc(0, 0, 22 + e.age * 40, 0, Math.PI * 2); c.stroke(); }
    else { c.fillStyle = '#fff7d5'; c.beginPath(); for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, r = (i % 2 ? 7 : 24) * life; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.fill(); }
    c.restore();
  }
  c.restore(); hud(c, match); overlay(c, match); c.restore();
}
