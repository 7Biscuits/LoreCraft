import { FLOOR, moves } from './combat';
import type { Fighter } from './combat';
type Point = [number, number];
/** Articulated original vector sprites: pose transitions share the combat clock. */
export function drawFighter(c: CanvasRenderingContext2D, f: Fighter, clock: number, winner: boolean, defeated: boolean): void {
  const ken = f.name === 'KEN';
  const flashing = f.flash > .055;
  const gi = flashing ? '#fff3ce' : ken ? '#d84b35' : '#f0eadb', shade = flashing ? '#f8d7b1' : ken ? '#8f2832' : '#a4b5bc', skin = flashing ? '#fff2dc' : '#edb184', shadowSkin = '#b97154';
  const glove = ken ? '#85422d' : '#c13f3e', hair = ken ? '#f5c761' : '#352d37';
  const bob = !f.attack && f.y === FLOOR && !defeated ? Math.sin(clock * 7) * 2 : 0;
  c.save(); c.translate(f.x, f.y + bob); c.scale(f.face, 1);
  if (defeated) { c.translate(-12, -13); c.rotate(-1.38); }
  const crouched = f.crouch || f.attack?.crouched;
  let hip: Point = [-5, crouched ? -31 : -58], neck: Point = [0, crouched ? -65 : -98];
  let frontElbow: Point = [22, -77], frontHand: Point = [32, -96], backElbow: Point = [-27, -69], backHand: Point = [-16, -92];
  let frontKnee: Point = [24, -30], frontFoot: Point = [34, -3], backKnee: Point = [-30, -29], backFoot: Point = [-36, -3];
  if (crouched) { frontElbow = [22, -50]; frontHand = [34, -62]; backElbow = [-22, -41]; backHand = [-3, -60]; frontKnee = [27, -17]; backKnee = [-29, -18]; }
  if (f.walking && !f.attack) {
    const stride = Math.sin(clock * 17); frontFoot[0] = 16 + stride * 25; backFoot[0] = -17 - stride * 25;
    frontKnee[0] = 12 + stride * 14; backKnee[0] = -15 - stride * 14;
    frontFoot[1] -= Math.max(0, stride) * 9; backFoot[1] -= Math.max(0, -stride) * 9;
  }
  if (f.y < FLOOR) { frontKnee = [30, -38]; frontFoot = [37, -18]; backKnee = [-27, -41]; backFoot = [-29, -18]; }
  const a = f.attack;
  if (a?.id === 'shoryuken' && a.time >= .06 && a.time < .48) {
    c.save(); c.globalAlpha = Math.max(0, 1 - a.time * 1.5);
    for (let i = 0; i < 7; i++) {
      const x = 12 + Math.sin(i * 2.1 + clock * 30) * 19, y = -20 - i * 19;
      c.fillStyle = i % 2 ? '#fff0b7' : ken ? '#ff8649' : '#80dfff';
      c.beginPath(); c.ellipse(x, y, 14 - i, 25, .35, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }
  if (a) {
    const m = moves[a.id], t = a.time;
    const extension = t < m.startup ? -.25 * Math.sin(t / m.startup * Math.PI / 2) : t < m.startup + m.active ? 1 : Math.max(0, 1 - (t - m.startup - m.active) / m.recovery);
    const h = a.crouched ? m.kind === 'kick' ? 22 : 46 : m.height;
    if (m.kind === 'punch') {
      frontHand = [30 + (m.range - 34) * extension, -h]; frontElbow = [22 + (m.range / 2 - 22) * extension, -h + 10];
      neck[0] += extension * 6;
    } else if (m.kind === 'kick') {
      frontKnee = [22 + 35 * extension, -32 - (h - 32) * extension]; frontFoot = [30 + (m.range - 30) * extension, -12 - (h - 12) * extension];
      hip[0] -= extension * 8; backHand = [-21, -80];
    } else if (m.kind === 'fireball') {
      const release = t >= m.startup ? 1 : t / m.startup;
      frontElbow = [15 + release * 22, -67]; frontHand = [5 + release * 55, -62]; backElbow = [-14 + release * 43, -62]; backHand = [-3 + release * 59, -58];
      neck[0] = -8 + release * 8;
    } else { frontElbow = [23, -100]; frontHand = [35, -144]; backHand = [2, -67]; frontKnee = [31, -42]; frontFoot = [39, -16]; }
    if (extension > .2 && m.kind !== 'fireball') {
      c.save(); c.strokeStyle = ken ? '#ffba5777' : '#a9efff88'; c.lineWidth = m.rank * 3 + 4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(8, -h + 18); c.quadraticCurveTo(m.range * .6, -h - 17, m.kind === 'uppercut' ? 35 : m.range - 3, m.kind === 'uppercut' ? -144 : -h); c.stroke(); c.restore();
    }
  }
  if (f.stun > 0) { neck[0] -= 14; frontHand = [5, -63]; backHand = [-31, -48]; hip[0] -= 6; }
  if (f.guard > 0 || (!a && f.input.x === -f.face && !f.walking)) { frontElbow = [24, neck[1] + 19]; frontHand = [20, neck[1] - 12]; backHand = [5, neck[1] - 8]; }
  if (winner) { frontElbow = [23, -114]; frontHand = [32, -145]; backHand = [-25, -55]; }
  function limb(points: Point[], width: number, color: string, highlight?: string) {
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const [w, col] of [[width + 5, '#28313e'], [width, color], ...(highlight ? [[width * .3, highlight]] : [])] as [number, string][]) {
      c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(...points[0]!); for (const p of points.slice(1)) c.lineTo(...p); c.stroke();
    }
  }
  const disc = (p: Point, r: number, color: string) => { c.fillStyle = color; c.beginPath(); c.arc(...p, r, 0, Math.PI * 2); c.fill(); };
  limb([hip, backKnee, backFoot], 20, shade); limb([[-13, neck[1] + 12], backElbow], 16, shade); limb([backElbow, backHand], 12, shadowSkin); disc(backHand, 10, glove);
  limb([hip, frontKnee, frontFoot], 23, gi, ken ? '#ec7951' : '#fff9e8');
  limb([[backFoot[0] - 3, backFoot[1]], [backFoot[0] + 11, backFoot[1]]], 11, shadowSkin);
  limb([[frontFoot[0] - 2, frontFoot[1]], [frontFoot[0] + 13, frontFoot[1]]], 12, skin);
  c.fillStyle = '#28313e'; c.beginPath(); c.moveTo(neck[0] - 21, neck[1] + 1); c.lineTo(neck[0] + 22, neck[1] + 8); c.lineTo(hip[0] + 22, hip[1] + 5); c.lineTo(hip[0] - 24, hip[1] + 5); c.closePath(); c.fill();
  c.fillStyle = gi; c.beginPath(); c.moveTo(neck[0] - 19, neck[1] + 3); c.lineTo(neck[0] + 19, neck[1] + 9); c.lineTo(hip[0] + 19, hip[1] + 2); c.lineTo(hip[0] - 20, hip[1] + 2); c.closePath(); c.fill();
  c.fillStyle = skin; c.beginPath(); c.moveTo(neck[0] - 7, neck[1]); c.lineTo(neck[0] + 13, neck[1] + 6); c.lineTo(neck[0] + 1, hip[1] - 10); c.closePath(); c.fill();
  limb([[neck[0] - 10, neck[1] + 3], [hip[0] + 4, hip[1] - 5]], 4, shade);
  limb([[hip[0] - 20, hip[1]], [hip[0] + 21, hip[1]]], 7, '#34303b'); limb([[hip[0] + 4, hip[1]], [hip[0] + 10, hip[1] + 24]], 5, '#34303b');
  limb([[neck[0] + 15, neck[1] + 14], frontElbow], 18, gi); limb([frontElbow, frontHand], 13, skin); disc(frontHand, 11, '#28313e'); disc(frontHand, 9, glove);
  limb([[neck[0], neck[1] + 5], [neck[0] + 1, neck[1] - 7]], 13, skin);
  disc([neck[0] + 1, neck[1] - 17], 18, '#28313e'); disc([neck[0] + 2, neck[1] - 17], 16, skin);
  c.fillStyle = hair; c.beginPath();
  for (const [i, p] of [[-15, -19], [-17, -31], [-9, -29], [-5, -37], [1, -31], [9, -35], [17, -26], [19, -18], [9, -22], [2, -17], [-8, -20]].entries()) { if (!i) c.moveTo(neck[0] + p[0]!, neck[1] + p[1]!); else c.lineTo(neck[0] + p[0]!, neck[1] + p[1]!); } c.closePath(); c.fill();
  if (!ken) {
    limb([[neck[0] - 15, neck[1] - 24], [neck[0] + 15, neck[1] - 24]], 4, '#c33d40');
    limb([[neck[0] - 14, neck[1] - 23], [neck[0] - 36, neck[1] - 19 + Math.sin(clock * 10) * 5], [neck[0] - 46, neck[1] - 25]], 4, '#c33d40');
  }
  limb([[neck[0] + 6, neck[1] - 20], [neck[0] + 13, neck[1] - 19]], 2, '#40313a');
  c.fillStyle = '#fff7dc'; c.fillRect(neck[0] + 8, neck[1] - 17, 5, 3); c.fillStyle = '#27333a'; c.fillRect(neck[0] + 11, neck[1] - 17, 2, 3);
  limb([[neck[0] + 9, neck[1] - 7], [neck[0] + 14, neck[1] - 8]], 2, '#9b5947');
  c.restore();
}
