#!/usr/bin/env node
// Generates src/levels.json: 50 levels. 3x3: 5, 4x4: 10, 5x5: 10, 6x6: 15, plus a bonus world of 10
// where each character has its own goal.
// Levels store positions only. The game picks the characters (and so the goal food) when a level starts.
// Every level is solved by the same engine the game uses, so each one is winnable.
// The random generator is seeded, so running this again gives the same levels.
// Usage: node tools/generate-levels.js
const fs = require('fs');
const path = require('path');
const { DIRS, K, build, walk, solve, cellAt } = require('../src/engine.js');

const ORDER = ['right', 'down', 'left', 'up'];          // tap cycle order used everywhere
const OBSTACLE_MIX = [{ T: 4, R: 3, P: 3 }, { R: 6, P: 2, T: 2 }, { T: 6, R: 2, P: 2 }, { T: 5, R: 3, P: 2 }, { R: 4, T: 3, P: 3 }];
const SIZES = [3, 4, 5, 6];
const TIME_PER_LEVEL_MS = 25000;

// Level 1 is hand-made: one square to tap, shown by the ghost hand.
const TUTORIAL = {
  world: 0, grid: ['..G', 'S..', '...'],
  animals: [{ x: 0, y: 1, dir: 'right' }],
  allowed: ['up'], tappable: ['2,1'], intro: { x: 2, y: 1, dir: 'up' },
  say: 'Tap the square to show the way. Then press go!', target: [1, 1], arrows: 1
};

// n: characters sharing the plan. k: [min, max] arrows in the shortest plan.
// obs: [min, max] obstacles. maxDirs: most arrow kinds in the tap cycle (default 3).
// Inside each world difficulty rises in waves, with a party level every fifth level.
const SPECS = [
  // 3x3 meadow (5 with the tutorial). Keep these four first: their seeds match earlier versions.
  { w: 0, n: 1, k: [1, 1], obs: [1, 2], maxDirs: 1 },
  { w: 0, n: 1, k: [2, 2], obs: [1, 2], maxDirs: 2 },
  { w: 0, n: 1, k: [2, 2], obs: [1, 3], maxDirs: 2 },
  { w: 0, n: 2, k: [1, 2], obs: [0, 2], maxDirs: 2 },

  // 4x4 beach (10)
  { w: 1, n: 1, k: [2, 2], obs: [2, 3], maxDirs: 2 },
  { w: 1, n: 1, k: [2, 3], obs: [2, 4], maxDirs: 2 },
  { w: 1, n: 1, k: [3, 3], obs: [3, 4] },
  { w: 1, n: 1, k: [3, 3], obs: [3, 5] },
  { w: 1, n: 2, k: [2, 3], obs: [2, 4] },
  { w: 1, n: 1, k: [2, 3], obs: [3, 5], maxDirs: 2 },
  { w: 1, n: 1, k: [3, 3], obs: [4, 6] },
  { w: 1, n: 1, k: [3, 4], obs: [4, 6] },
  { w: 1, n: 1, k: [4, 4], obs: [4, 6] },
  { w: 1, n: 2, k: [3, 3], obs: [3, 5] },

  // 5x5 jungle (10)
  { w: 2, n: 1, k: [3, 3], obs: [4, 6] },
  { w: 2, n: 1, k: [3, 4], obs: [5, 7] },
  { w: 2, n: 1, k: [4, 4], obs: [6, 8] },
  { w: 2, n: 1, k: [4, 4], obs: [6, 9] },
  { w: 2, n: 2, k: [3, 4], obs: [5, 7] },
  { w: 2, n: 1, k: [3, 4], obs: [6, 8] },
  { w: 2, n: 1, k: [4, 4], obs: [7, 9] },
  { w: 2, n: 1, k: [4, 5], obs: [7, 10] },
  { w: 2, n: 1, k: [5, 5], obs: [8, 10] },
  { w: 2, n: 3, k: [4, 4], obs: [6, 8] },

  // 6x6 bamboo grove (15)
  { w: 3, n: 1, k: [4, 4], obs: [8, 10] },
  { w: 3, n: 1, k: [4, 5], obs: [9, 11] },
  { w: 3, n: 1, k: [5, 5], obs: [10, 13] },
  { w: 3, n: 1, k: [5, 5], obs: [10, 13], maxDirs: 4 },
  { w: 3, n: 2, k: [4, 5], obs: [8, 11] },
  { w: 3, n: 1, k: [4, 5], obs: [9, 12] },
  { w: 3, n: 1, k: [5, 5], obs: [10, 13] },
  { w: 3, n: 1, k: [5, 5], obs: [11, 14] },
  { w: 3, n: 1, k: [5, 6], obs: [11, 14] },
  { w: 3, n: 3, k: [4, 5], obs: [8, 11] },
  { w: 3, n: 1, k: [5, 5], obs: [10, 13], maxDirs: 4 },
  { w: 3, n: 1, k: [5, 6], obs: [11, 14] },
  { w: 3, n: 1, k: [6, 6], obs: [12, 15] },
  { w: 3, n: 1, k: [6, 6], obs: [12, 15], maxDirs: 4 },
  { w: 3, n: 3, k: [5, 6], obs: [9, 12] },

  // Bonus lagoon (10): each character has its own goal, but they still share one set of arrows.
  // apart: the two routes never touch, so it is two small puzzles on one board.
  // share: the routes use at least one square in common.
  // tangle: solving each character on its own and putting the arrows together does not work.
  { w: 4, size: 5, n: 2, own: true, stage: 'apart', k: [2, 3], obs: [3, 5] },
  { w: 4, size: 5, n: 2, own: true, stage: 'apart', k: [2, 4], obs: [4, 6] },
  { w: 4, size: 6, n: 2, own: true, stage: 'apart', k: [3, 4], obs: [6, 9] },
  { w: 4, size: 5, n: 2, own: true, stage: 'share', k: [2, 4], obs: [4, 6] },
  { w: 4, size: 6, n: 2, own: true, stage: 'share', k: [3, 4], obs: [6, 9] },
  { w: 4, size: 6, n: 2, own: true, stage: 'share', k: [3, 5], obs: [7, 10] },
  { w: 4, size: 5, n: 2, own: true, stage: 'tangle', k: [2, 4], obs: [4, 6] },
  { w: 4, size: 6, n: 2, own: true, stage: 'tangle', k: [3, 5], obs: [6, 9] },
  { w: 4, size: 6, n: 2, own: true, stage: 'tangle', k: [4, 5], obs: [7, 10] },
  { w: 4, size: 6, n: 3, own: true, stage: 'share', k: [3, 5], obs: [5, 8] }
];

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(a, R) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function weighted(mix, R) { const tot = Object.values(mix).reduce((a, b) => a + b, 0); let r = R() * tot; for (const [k, v] of Object.entries(mix)) { r -= v; if (r < 0) return k; } return 'R'; }

// Every set of arrow kinds, smallest first, sets without "up" first (up is the hardest to read).
const SUBSETS = [];
for (let m = 1; m < 16; m++) SUBSETS.push(ORDER.filter((_, i) => m & (1 << i)));
SUBSETS.sort((a, b) => a.length - b.length || a.includes('up') - b.includes('up'));

function candidate(spec, R) {
  const n = spec.size || SIZES[spec.w];
  const cells = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) cells.push([x, y]);
  shuffle(cells, R);
  const grid = Array.from({ length: n }, () => Array(n).fill('.'));
  if (!spec.own) { const [gx, gy] = cells.pop(); grid[gy][gx] = 'G'; }
  const animals = Array.from({ length: spec.n }, () => {
    const [x, y] = cells.pop();
    grid[y][x] = 'S';
    // Never start facing up, so the child always sees the character's face.
    const dirs = ['right', 'down', 'left'].filter(d => { const nx = x + DIRS[d].dx, ny = y + DIRS[d].dy; return nx >= 0 && ny >= 0 && nx < n && ny < n; });
    const a = { x, y, dir: dirs[Math.floor(R() * dirs.length)] };
    if (spec.own) { const [gx, gy] = cells.pop(); grid[gy][gx] = 'g'; a.goal = { x: gx, y: gy }; }
    return a;
  });
  const nObs = spec.obs[0] + Math.floor(R() * (spec.obs[1] - spec.obs[0] + 1));
  for (let i = 0; i < nObs && cells.length; i++) { const [x, y] = cells.pop(); grid[y][x] = weighted(OBSTACLE_MIX[spec.w], R); }
  return { world: spec.w, grid: grid.map(r => r.join('')), animals, allowed: ORDER.slice() };
}

function evaluate(def, spec, R) {
  const L = build(def);
  const n = L.cols;
  let gx = -1, gy = -1;
  L.cells.forEach((row, y) => row.forEach((c, x) => { if (c === 'G') { gx = x; gy = y; } }));
  for (const a of L.animals) {
    const d = DIRS[a.dir];
    if (cellAt(L, a.x + d.dx, a.y + d.dy) !== '.') return null;          // first step must be open floor
    const tx = a.goal ? a.goal.x : gx, ty = a.goal ? a.goal.y : gy;
    if (Math.abs(a.x - tx) + Math.abs(a.y - ty) < 2) return null;        // goal not right next to the start
  }
  const any = solve(L, spec.k[1]);
  if (!any) return null;
  const k = Object.keys(any).length;
  if (k < spec.k[0]) return null;
  // Use the fewest arrow kinds that still solve it in k arrows: shorter tap cycles for little fingers.
  let best = null;
  for (const sub of SUBSETS) {
    if (sub.length > (spec.maxDirs || 3)) break;
    const s = solve(build({ ...def, allowed: sub }), k);
    if (s && Object.keys(s).length === k) { best = { sub, s }; break; }
  }
  if (!best) return null;
  const final = { ...def, allowed: best.sub };
  const LF = build(final);
  const get = (x, y) => best.s[K(x, y)] || null;
  const runs = LF.animals.map(a => walk(LF, a, get));
  if (runs.some(r => r.result !== 'win')) return null;
  const arrowKeys = new Set(Object.keys(best.s));
  // Party levels: every animal has to use at least one arrow.
  if (runs.some(r => !r.path.slice(1).some(p => arrowKeys.has(K(p.x, p.y))))) return null;
  const steps = runs.reduce((s, r) => s + r.path.length - 1, 0);
  if (LF.animals.length === 1 && steps < n) return null;
  const onPath = new Set(runs.flatMap(r => r.path.map(p => K(p.x, p.y))));
  let total = 0, relevant = 0;
  LF.cells.forEach((row, y) => row.forEach((c, x) => {
    if (c === 'R' || c === 'T' || c === 'P') {
      total++;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => onPath.has(K(x + dx, y + dy)))) relevant++;
    }
  }));
  if (total && relevant / total < 0.6) return null;                    // no clutter far from the action
  // Nice to have: with no arrows, the animal bumps into an obstacle (not the edge), which shows what obstacles do.
  const naive = LF.animals.map(a => walk(LF, a, () => null));
  const hitsObstacle = naive.some(r => r.result === 'bump' && cellAt(LF, r.bump.x, r.bump.y) !== 'X');
  let score = steps + relevant * 1.5 - (total - relevant) * 2 + (hitsObstacle ? 3 : 0) + R() * 2;
  if (spec.own) {
    const st = stageOf(final, runs, k);
    if (!st || st.stage !== spec.stage) return null;
    score += st.shared * (spec.stage === 'share' ? 2 : 0);
    if (runs.some(r => r.path.slice(1, -1).some(p => LF.animals.some(o => o.goal && o.goal.x === p.x && o.goal.y === p.y)))) score -= 6;   // prefer not walking over a friend's snack
    return { def: { ...final, arrows: k, target: spec.k, stage: spec.stage }, score };
  }
  return { def: { ...final, arrows: k, target: spec.k }, score };
}

// How the characters' routes relate on an own-goal level (see the bonus specs).
function stageOf(def, runs, k) {
  const L = build(def);
  const sets = runs.map(r => new Set(r.path.slice(1).map(p => K(p.x, p.y))));
  let shared = 0;
  for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) sets[i].forEach(q => { if (sets[j].has(q)) shared++; });
  // Each character solved alone, then their arrows put together.
  const merged = {}, alone = [];
  let clash = false;
  for (const a of L.animals) {
    const s = solve(build({ ...def, animals: [a] }), 8);
    if (!s) return null;
    alone.push(Object.keys(s).length);
    for (const [q, d] of Object.entries(s)) { if (merged[q] && merged[q] !== d) clash = true; merged[q] = d; }
  }
  const get = (x, y) => merged[K(x, y)] || null;
  const together = !clash && L.animals.every(a => walk(L, a, get).result === 'win');
  const sum = alone.reduce((x, y) => x + y, 0);
  let stage = null;
  if (!together) stage = 'tangle';
  else if (shared === 0 && k === sum) stage = 'apart';
  else if (shared > 0) stage = 'share';
  return { stage, shared };
}

const levels = [TUTORIAL];
const seen = new Set([TUTORIAL.grid.join('/')]);
SPECS.forEach((spec, si) => {
  const R = rng(1000 + si * 7919);
  let best = null, valid = 0;
  const t0 = Date.now();
  for (let t = 0; t < 20000 && valid < 80 && (valid === 0 || Date.now() - t0 < TIME_PER_LEVEL_MS); t++) {
    const c = candidate(spec, R);
    if (seen.has(c.grid.join('/'))) continue;
    const e = evaluate(c, spec, R);
    if (e) { valid++; if (!best || e.score > best.score) best = e; }
  }
  if (!best) throw new Error(`No level found for spec ${si + 2} (${JSON.stringify(spec)})`);
  seen.add(best.def.grid.join('/'));
  levels.push(best.def);
  process.stderr.write(`L${si + 2} (${valid} candidates, ${((Date.now() - t0) / 1000).toFixed(1)}s)\n`);
});

const out = path.join(__dirname, '..', 'src', 'levels.json');
fs.writeFileSync(out, JSON.stringify(levels, null, 1) + '\n');
levels.forEach((l, i) => {
  console.log(`L${String(i + 1).padStart(2)} ${l.grid.length}x${l.grid.length} arrows=${l.arrows} kinds=${l.allowed.join('/')} starts=${l.animals.map(a => a.dir).join(',')}${l.stage ? ' stage=' + l.stage : ''}`);
  console.log('     ' + l.grid.join('\n     '));
});
console.log(`Wrote ${levels.length} levels to ${out}`);
