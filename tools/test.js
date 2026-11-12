#!/usr/bin/env node
// Checks every level in src/levels.json with the game's own engine.
// Usage: node tools/test.js
const path = require('path');
const { DIRS, K, build, cellAt, isTappable, walk, solve, hintFor } = require('../src/engine.js');
const levels = require(path.join(__dirname, '..', 'src', 'levels.json'));

const ORDER = ['right', 'down', 'left', 'up'];
const SIZES = [3, 4, 5, 6, [5, 6]];   // the bonus world mixes 5x5 and 6x6
let bad = 0;
const fail = (i, msg) => { bad++; console.log(`  L${i + 1}: ${msg}`); };

const grids = new Set();
levels.forEach((def, i) => {
  const L = build(def);
  const ok = [].concat(SIZES[def.world]);
  if (L.rows !== L.cols || !ok.includes(L.rows)) fail(i, `grid is ${L.cols}x${L.rows}, world ${def.world} expects ${ok.join(' or ')}`);
  const key = def.grid.join('/');
  if (grids.has(key)) fail(i, 'duplicate layout'); grids.add(key);
  const own = def.animals.some(a => a.goal);
  const nG = (def.grid.join('').match(/G/g) || []).length, ng = (def.grid.join('').match(/g/g) || []).length;
  if (own) {
    if (!def.animals.every(a => a.goal && cellAt(L, a.goal.x, a.goal.y) === 'g')) fail(i, 'every character needs its own goal on a g square');
    if (nG !== 0 || ng !== def.animals.length) fail(i, 'own-goal level needs one g per character and no G');
    if (!['apart', 'share', 'tangle'].includes(def.stage)) fail(i, 'own-goal level needs a stage');
  } else if (nG !== 1 || ng !== 0) fail(i, 'needs exactly one goal');
  const starts = []; def.grid.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'S') starts.push(K(x, y)); }));
  if (starts.sort().join() !== def.animals.map(a => K(a.x, a.y)).sort().join()) fail(i, 'S markers do not match animals');
  if (def.animals.some(a => a.dir === 'up')) fail(i, 'an animal starts facing up');
  for (const a of def.animals) { const d = DIRS[a.dir]; if (cellAt(L, a.x + d.dx, a.y + d.dy) !== '.') fail(i, `${a.type} is blocked on its first step`); }
  if (!def.allowed.length || def.allowed.some(d => !ORDER.includes(d))) fail(i, 'bad arrow kinds');
  if (def.allowed.join() !== ORDER.filter(d => def.allowed.includes(d)).join()) fail(i, 'arrow kinds out of tap order');
  if (L.animals.every(a => walk(L, a, () => null).result === 'win')) fail(i, 'solvable with no arrows');
  const sol = solve(L, 8);
  if (!sol) { fail(i, 'not solvable'); return; }
  const k = Object.keys(sol).length;
  if (def.target && (k < def.target[0] || k > def.target[1])) fail(i, `shortest plan uses ${k} arrows, target ${def.target}`);
  const get = (x, y) => sol[K(x, y)] || null;
  if (!L.animals.every(a => walk(L, a, get).result === 'win')) fail(i, 'solution does not win');
  if (hintFor(L, get, sol) !== null) fail(i, 'hint shown on a solved board');
  const h = hintFor(L, () => null, sol);
  if (!h) fail(i, 'no hint on an empty board');
  if (def.animals.length < 1 || def.animals.length > 3) fail(i, 'needs 1 to 3 characters');
  if (def.animals.some(a => a.type) || def.goal) fail(i, 'characters and goal are chosen by the game, not stored in the level');
});
const perWorld = SIZES.map((_, w) => levels.filter(l => l.world === w).length);
if (perWorld.join() !== '5,10,10,15,10') { bad++; console.log('  levels per world: ' + perWorld.join()); }
if (!levels.every((l, i) => i === 0 || l.world >= levels[i - 1].world)) { bad++; console.log('  worlds out of order'); }

// Hints: following them one at a time must always lead to a win, from any board, and must keep the child's arrows.
{
  const { fixFor } = require('../src/engine.js');
  let rng = 12345;
  const rand = () => (rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648;
  let followed = 0, fallbacks = 0, worst = 0, pinpointed = 0, pinpointTotal = 0;
  const followHints = (L, board, dirs) => {
    const get = (x, y) => board[K(x, y)] || null;
    for (let step = 0; step < 40; step++) {
      if (L.animals.every(a => walk(L, a, get).result === 'win')) { worst = Math.max(worst, step); return true; }
      let h = fixFor(L, get, dirs);
      if (!h) { fallbacks++; const sol = solve({ ...L, allowed: dirs }, 8); h = hintFor(L, get, sol); if (!h) return false; }
      board[K(h.x, h.y)] = h.dir;
      followed++;
    }
    return false;
  };
  levels.forEach((def, i) => {
    const L = build(def);
    for (const dirs of [ORDER, def.allowed]) {
      if (!followHints(L, {}, dirs)) fail(i, `hints from an empty board do not reach the goal (${dirs.join('/')})`);
      for (let r = 0; r < 25; r++) {
        const board = {};
        for (let y = 0; y < L.rows; y++) for (let x = 0; x < L.cols; x++) if (isTappable(L, x, y) && rand() < 0.4) board[K(x, y)] = dirs[Math.floor(rand() * dirs.length)];
        if (!followHints(L, board, dirs)) fail(i, `hints from a random board do not reach the goal (${dirs.join('/')})`);
      }
    }
    // The child's style: an arrow on every square of the route, with one of them wrong.
    // The hint must point at that square, and fixing it must win.
    const sol = solve(L, 8), get = (x, y) => sol[K(x, y)] || null;
    const drawn = {};
    L.animals.forEach(a => walk(L, a, get).path.slice(1).forEach(p => { if (isTappable(L, p.x, p.y)) drawn[K(p.x, p.y)] = p.dir; }));
    Object.keys(drawn).forEach(k => {
      const board = { ...drawn };
      board[k] = ORDER.find(d => d !== drawn[k] && d !== 'up') || 'up';
      const g = (x, y) => board[K(x, y)] || null;
      if (L.animals.every(a => walk(L, a, g).result === 'win')) return;   // that change happened to still work
      pinpointTotal++;
      const h = fixFor(L, g, ORDER);
      if (h && K(h.x, h.y) === k) pinpointed++;
    });
  });
  console.log(`  hints: ${followed} hints followed, ${fallbacks} needed the fallback, longest chain ${worst}; wrong arrow found exactly in ${pinpointed}/${pinpointTotal} drawn routes`);
  if (pinpointed < pinpointTotal * 0.9) { bad++; console.log('  hint misses the wrong arrow too often'); }
}

// Loop detection: four arrows in a square must end as a loop, not hang.
{
  const L = build({ grid: ['....', '....', '....', '..G.'], animals: [{ type: 'penguin', x: 0, y: 0, dir: 'right' }], allowed: ORDER });
  const arr = { '1,0': 'down', '1,1': 'right', '2,1': 'up', '2,0': 'left' };
  if (walk(L, L.animals[0], (x, y) => arr[K(x, y)] || null).result !== 'loop') { bad++; console.log('  loop test failed'); }
}
console.log(bad ? `FAIL (${bad} problems)` : `ALL OK: ${levels.length} levels checked`);
process.exit(bad ? 1 : 0);
