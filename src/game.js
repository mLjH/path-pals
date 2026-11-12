// ---------- game: board, play, map, progress, settings ----------
// Expects from earlier files: engine (DIRS, K, build, cellAt, isTappable, walk, solve, hintFor), LEVELS,
// art (SIDE, FRONT, BACK, sprite, GOALSVG, OBJSVG, SPARKS, HAND, ICON, STAR, arrowSvg), sound (audio, sfx, cry, CRY_WIN_MS, say).

const pick = a => a[Math.floor(Math.random() * a.length)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = id => document.getElementById(id);
const STEP = 480;

const WORLDS = [
  { id: 'meadow', size: 3 },
  { id: 'beach', size: 4 },
  { id: 'jungle', size: 5 },
  { id: 'grove', size: 6 },
  { id: 'lagoon', size: 6, bonus: true }   // bonus: each character has its own goal
];
const WORLD_LEVELS = WORLDS.map((w, wi) => LEVELS.map((l, i) => (l.world === wi ? i : -1)).filter(i => i >= 0));

// Characters. Each level picks them at random; tapping one swaps it, and the goal follows its food.
const CHARS = {
  penguin: { name: 'baby penguin', food: 'fish', snack: 'the fish' },
  toucan: { name: 'toucan', food: 'peanuts', snack: 'the peanuts' },
  hornbill: { name: 'hornbill', food: 'fig', snack: 'the fig' },
  otter: { name: 'otter', food: 'shell', snack: 'the shellfish' },
  panda: { name: 'panda', food: 'bamboo', snack: 'the bamboo' },
  shark: { name: 'shark', food: 'squid', snack: 'the squid' },
  seal: { name: 'baby seal', food: 'milk', snack: 'the milk' },
  boba: { name: 'bubble tea', food: 'straw', snack: 'its straw' }
};
const ALL_ANIMALS = Object.keys(CHARS);
function shuffled(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function pickTypes(n, avoid) {   // n different characters, preferring ones not used in the previous level
  const fresh = shuffled(ALL_ANIMALS.filter(t => !avoid.includes(t)));
  const rest = shuffled(ALL_ANIMALS.filter(t => avoid.includes(t)));
  return fresh.concat(rest).slice(0, n);
}
function sayFor(types, own) {
  if (own) return types.length === 2 ? 'Each friend has their own snack. One plan for both of them!' : 'Each friend has their own snack. One plan for everybody!';
  if (types.length === 1) return `Help the ${CHARS[types[0]].name} find ${CHARS[types[0]].snack}!`;
  return types.length === 2 ? 'One plan for both of them! Help them find their snacks.' : 'One plan for everybody! Help them find their snacks.';
}

ICON.map = `<svg viewBox="0 0 24 24" fill="#1F3A44"><rect x="3" y="3" width="7.6" height="7.6" rx="2"/><rect x="13.4" y="3" width="7.6" height="7.6" rx="2"/><rect x="3" y="13.4" width="7.6" height="7.6" rx="2"/><rect x="13.4" y="13.4" width="7.6" height="7.6" rx="2"/></svg>`;
ICON.back = `<svg viewBox="0 0 24 24" fill="none" stroke="#1F3A44" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M19.5 12h-14M11.5 5.5L5 12l6.5 6.5"/></svg>`;
const LOCK = `<svg class="lock" viewBox="0 0 24 24"><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" fill="none" stroke="#4B6B76" stroke-width="2.8"/><rect x="4.5" y="10" width="15" height="11.5" rx="3" fill="#4B6B76"/><circle cx="12" cy="15.6" r="1.9" fill="#fff"/></svg>`;

const state = {
  i: 0, level: null, arrows: [], animals: [], types: [], fails: 0, running: false, won: false, sol: null, nudge: null,
  sound: true, voice: false, hintAfter: 2, arrowMode: 'all'
};

// ---------- progress (kept in this browser only) ----------
const STORE = 'pathpals-v2';
const progress = { done: new Set(), unlockAll: false };
// Version 1 had 5 levels per world. Carry over how far the child got in each world.
function migrateV1() {
  const old = JSON.parse(localStorage.getItem('pathpals-v1') || 'null');
  if (!old) return null;
  const done = [];
  WORLDS.forEach((w, wi) => {
    const count = (old.done || []).filter(n => n >= wi * 5 && n < wi * 5 + 5).length;
    done.push(...WORLD_LEVELS[wi].slice(0, count));
  });
  return { ...old, done };
}
function loadSave() {
  try {
    let d = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (!d) { d = migrateV1(); if (d) { localStorage.setItem(STORE, JSON.stringify(d)); localStorage.removeItem('pathpals-v1'); } }
    if (!d) return;
    progress.done = new Set((d.done || []).filter(n => Number.isInteger(n) && n >= 0 && n < LEVELS.length));
    progress.unlockAll = !!d.unlockAll;
    if (typeof d.sound === 'boolean') state.sound = d.sound;
    if (typeof d.voice === 'boolean') state.voice = d.voice;
    if ([0, 2, 3].includes(d.hintAfter)) state.hintAfter = d.hintAfter;
    if (d.arrowMode === 'all' || d.arrowMode === 'needed') state.arrowMode = d.arrowMode;
  } catch (e) {}
}
function persist() {
  try {
    localStorage.setItem(STORE, JSON.stringify({
      done: [...progress.done], unlockAll: progress.unlockAll,
      sound: state.sound, voice: state.voice, hintAfter: state.hintAfter, arrowMode: state.arrowMode
    }));
  } catch (e) {}
}
const isUnlocked = i => i === 0 || progress.unlockAll || progress.done.has(i) || progress.done.has(i - 1);
function firstOpen() { for (let i = 0; i < LEVELS.length; i++) if (!progress.done.has(i) && isUnlocked(i)) return i; return -1; }

// ---------- board ----------
function tileEl(x, y) { return $('grid').querySelector(`[data-k="${K(x, y)}"]`); }
function renderBoard() {
  const L = state.level, grid = $('grid');
  snap();
  grid.style.setProperty('--cols', L.cols);
  grid.style.setProperty('--rows', L.rows);
  grid.innerHTML = '';
  for (let y = 0; y < L.rows; y++) for (let x = 0; x < L.cols; x++) {
    const c = cellAt(L, x, y), tap = isTappable(L, x, y), isStart = L.animals.some(a => a.x === x && a.y === y);
    const el = document.createElement(tap ? 'button' : 'div');
    const owner = c === 'g' ? L.animals.findIndex(a => a.goal && a.goal.x === x && a.goal.y === y) : -1;
    el.className = 'tile' + (c === 'G' || c === 'g' ? ' goal' : '') + (isStart ? ' start' : '');
    if (owner >= 0) el.dataset.owner = owner;
    el.dataset.k = K(x, y);
    let inner = `<div class="face ${(x + y) % 2 ? 'b' : 'a'}"></div>`;
    if (isStart) inner += '<div class="spot"></div>';   // marks where a character starts, until the first Go
    if (c === 'G' || c === 'g') {
      const foods = owner >= 0 ? [CHARS[state.types[owner]].food] : state.types.map(t => CHARS[t].food);
      inner += `<div class="halo"></div><div class="obj">${goalSvg(foods)}</div><div class="sparks">${SPARKS}</div>`;
    }
    else if (OBJSVG[c]) inner += `<div class="obj">${OBJSVG[c]}</div>`;
    if (tap) {
      inner += '<div class="arrow"></div><div class="hintl"></div>';
      el.setAttribute('aria-label', 'Empty square');
      attachSwipe(el, x, y);
    }
    el.innerHTML = inner;
    grid.appendChild(el);
  }
  const layer = document.createElement('div');
  layer.className = 'animals';
  layer.id = 'animals';
  grid.appendChild(layer);
  state.animals = L.animals.map((a, ai) => {
    const el = document.createElement('div');
    el.className = 'animal';
    const type = state.types[ai];
    el.style.setProperty('--idle-delay', (-Math.random() * 2.6).toFixed(2) + 's');
    el.innerHTML = `<div class="hopper"><div class="idle"><div class="flip">${sprite(type)}</div></div></div>`;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', `${CHARS[type].name}. Tap to change`);
    layer.appendChild(el);
    const o = { el, hop: el.querySelector('.hopper'), flip: el.querySelector('.flip'), sx: 1, x: a.x, y: a.y, start: a, type };
    el.addEventListener('click', () => swapAnimal(o));
    place(o, a.x, a.y, 0);
    face(o, a.dir);
    return o;
  });
  spread();
}
function renderGoal() {   // a shared goal shows everyone's food; an own goal shows its owner's food
  $('grid').querySelectorAll('.goal').forEach(t => {
    const foods = t.dataset.owner !== undefined ? [CHARS[state.animals[Number(t.dataset.owner)].type].food] : state.animals.map(o => CHARS[o.type].food);
    t.querySelector('.obj').innerHTML = goalSvg(foods);
  });
}
// Tap a character to swap it for the next one not already on the board. The goal food follows.
function swapAnimal(o) {
  if (state.running || state.won) return;
  audio();
  const taken = state.animals.filter(a => a !== o).map(a => a.type);
  const from = ALL_ANIMALS.indexOf(o.type);
  let next = o.type;
  for (let k = 1; k <= ALL_ANIMALS.length; k++) {
    const t = ALL_ANIMALS[(from + k) % ALL_ANIMALS.length];
    if (!taken.includes(t)) { next = t; break; }
  }
  if (next === o.type) return;
  o.type = next;
  state.types = state.animals.map(a => a.type);
  const view = o.flip.dataset.view;
  o.flip.innerHTML = sprite(next);
  o.flip.dataset.view = view;
  o.el.setAttribute('aria-label', `${CHARS[next].name}. Tap to change`);
  o.hop.animate([{ transform: 'scale(.55) rotate(-12deg)' }, { transform: 'scale(1.15) rotate(6deg)' }, { transform: 'scale(1) rotate(0)' }], { duration: 340, easing: 'ease-out' });
  puff(o.x, o.y);
  renderGoal();
  const idx = state.animals.indexOf(o);
  const goal = $('grid').querySelector(`.goal[data-owner="${idx}"] .obj`) || $('grid').querySelector('.goal:not([data-owner]) .obj');
  if (goal) goal.animate([{ transform: 'scale(.6)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 360, easing: 'ease-out' });
  sfx.swap();
  setTimeout(() => cry(next, 'hi'), 140);
  if (state.animals.length === 1) say(sayFor(state.types));
}
function place(o, x, y, off) { o.x = x; o.y = y; o.el.style.setProperty('--x', x + off); o.el.style.setProperty('--y', y); }
function face(o, dir) {
  if (dir === 'left') o.sx = -1; else if (dir === 'right') o.sx = 1;
  o.flip.style.setProperty('--sx', o.sx);
  o.flip.dataset.view = dir === 'up' ? 'back' : dir === 'down' ? 'front' : 'side';
}
function spread() {   // animals sharing a square stand side by side
  const groups = {};
  state.animals.forEach((o, i) => { (groups[K(o.x, o.y)] = groups[K(o.x, o.y)] || []).push(i); });
  for (const g of Object.values(groups)) g.forEach((i, j) => { const o = state.animals[i]; place(o, o.x, o.y, (j - (g.length - 1) / 2) * 0.3); });
}
// Place characters instantly (no gliding) when a board is drawn or the screen size changes.
function snap() {
  const g = $('grid');
  g.classList.add('snap');
  requestAnimationFrame(() => requestAnimationFrame(() => g.classList.remove('snap')));
}
function sizeBoard() {
  const L = state.level;
  if (!L) return;
  const st = $('stage');
  const w = st.clientWidth - 28, h = st.clientHeight - 46;
  const cell = Math.max(40, Math.floor(Math.min(w / L.cols, h / L.rows, 140))) + 'px';
  const g = $('grid');
  if (g.style.getPropertyValue('--cell') !== cell) { if (!state.running) snap(); g.style.setProperty('--cell', cell); }
}
function renderDots() {
  const lv = WORLD_LEVELS[state.level.world];
  $('dots').innerHTML = lv.map(i => {
    const cls = progress.done.has(i) || (i === state.i && state.won) ? 'done' : i === state.i ? 'now' : 'later';
    return `<svg class="star ${cls}" viewBox="0 0 24 24" aria-hidden="true">${STAR}</svg>`;
  }).join('');
}
function setCTA(mode) {
  const b = $('cta');
  b.className = 'cta ' + (mode === 'go' ? '' : 'next');
  b.innerHTML = ICON[mode === 'go' ? 'go' : 'next'];
  b.setAttribute('aria-label', mode === 'go' ? 'Go' : 'Next level');
  b.disabled = false;
  b.dataset.mode = mode;
}
function setArrow(x, y, dir) {
  state.arrows[y][x] = dir;
  const el = tileEl(x, y);
  if (!el) return;
  el.querySelector('.arrow').innerHTML = dir ? arrowSvg(dir) : '';
  el.setAttribute('aria-label', dir ? 'Arrow ' + dir : 'Empty square');
}
function getArrow(x, y) { return (state.arrows[y] && state.arrows[y][x]) || null; }

function load(i, speak) {
  state.i = i;
  state.level = build(LEVELS[i]);
  const L = state.level;
  state.types = pickTypes(L.animals.length, state.types);
  document.documentElement.dataset.world = WORLDS[L.world].id;
  state.arrows = Array.from({ length: L.rows }, () => Array(L.cols).fill(null));
  state.fails = 0; state.running = false; state.won = false; state.sol = null;
  clearTimeout(state.nudge);
  renderBoard(); sizeBoard(); renderDots(); setCTA('go');
  $('grid').classList.remove('busy', 'won', 'played');
  if (L.intro) showHint(L.intro, false);
  if (speak) say(L.say || sayFor(state.types, L.animals.some(a => a.goal)));
}

// ---------- hints ----------
function clearHint() {
  document.querySelectorAll('.hintl').forEach(h => { h.innerHTML = ''; });
  document.querySelectorAll('.tile.hinted').forEach(t => t.classList.remove('hinted'));
}
function showHint(h, withSound) {
  clearHint();
  const el = tileEl(h.x, h.y);
  if (!el) return;
  const ghost = h.dir ? `<div class="ghost">${arrowSvg(h.dir)}</div>` : '<div class="ghost clear"><i></i></div>';
  el.classList.add('hinted');
  el.querySelector('.hintl').innerHTML = `<div class="ring"></div>${ghost}<div class="hand">${HAND}</div>`;
  if (withSound) sfx.hint();
}
// The hint starts from the child's own board: the smallest change that makes it work,
// keeping their arrows wherever possible. The solver's plan is only a fallback.
function currentHint() {
  const L = state.level;
  const fix = fixFor(L, getArrow, arrowKinds());
  if (fix) return fix;
  if (!state.sol) state.sol = solve({ ...L, allowed: arrowKinds() }) || {};
  return hintFor(L, getArrow, state.sol);
}

// ---------- play ----------
function scheduleNudge() {
  clearTimeout(state.nudge);
  $('cta').classList.remove('nudge');
  if (state.running || state.won) return;
  state.nudge = setTimeout(() => {
    if (!state.running && !state.won && state.arrows.some(r => r.some(Boolean))) $('cta').classList.add('nudge');
  }, 7000);
}
// Arrow kinds a tap cycles through: all four by default, or only the ones the level needs (grown-ups setting).
const ALL_DIRS = ['right', 'down', 'left', 'up'];
function arrowKinds() { return state.arrowMode === 'needed' ? state.level.allowed : ALL_DIRS; }
function placeArrow(x, y, dir) {
  audio();
  setArrow(x, y, dir);
  sfx.tap(dir);
  clearHint();
  scheduleNudge();
}
function onTap(x, y) {
  if (state.running || state.won) return;
  const opts = [null, ...arrowKinds()];
  placeArrow(x, y, opts[(opts.indexOf(getArrow(x, y)) + 1) % opts.length]);
}
// Swipe across a square to point its arrow that way, without cycling.
let swipe = null, swipedAt = 0;
function attachSwipe(el, x, y) {
  el.addEventListener('pointerdown', e => {
    if (state.running || state.won) return;
    swipe = { el, x: e.clientX, y: e.clientY };
    try { el.setPointerCapture(e.pointerId); } catch (err) {}
  });
  el.addEventListener('pointerup', e => {
    if (!swipe || swipe.el !== el) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.hypot(dx, dy) < Math.max(18, el.clientWidth * 0.22)) return;   // a tap, handled by click
    swipedAt = performance.now();
    if (state.running || state.won) return;
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    if (arrowKinds().includes(dir)) placeArrow(x, y, dir);
  });
  el.addEventListener('pointercancel', () => { swipe = null; });
  el.addEventListener('click', () => { if (performance.now() - swipedAt < 450) return; onTap(x, y); });
}
function puff(x, y) {
  const p = document.createElement('div');
  p.className = 'puff';
  p.style.left = `calc(${x + 0.5} * var(--cell))`;
  p.style.top = `calc(${y + 0.5} * var(--cell))`;
  $('animals').appendChild(p);
  setTimeout(() => p.remove(), 600);
}
function joy(o) {
  o.hop.animate([
    { transform: 'translateY(0) scale(1,1) rotate(0deg)' },
    { transform: 'translateY(3%) scale(1.07,.91) rotate(0deg)', offset: 0.14 },
    { transform: 'translateY(-36%) scale(.95,1.07) rotate(-5deg)', offset: 0.5 },
    { transform: 'translateY(3%) scale(1.07,.91) rotate(4deg)', offset: 0.86 },
    { transform: 'translateY(0) scale(1,1) rotate(0deg)' }
  ], { duration: 560, iterations: 4, easing: 'ease-in-out' });
}
function hopAnim(o, dur = STEP * 0.9) {
  o.hop.animate([
    { transform: 'translateY(0) scale(1,1)' },
    { transform: 'translateY(-16%) scale(.96,1.05)' },
    { transform: 'translateY(0) scale(1.05,.95)' },
    { transform: 'translateY(0) scale(1,1)' }
  ], { duration: dur, easing: 'ease-out' });
}
async function run() {
  if (state.running || state.won) return;
  state.running = true;
  clearHint();
  clearTimeout(state.nudge);
  $('cta').classList.remove('nudge');
  $('grid').classList.add('busy', 'played');
  $('cta').disabled = true;
  const L = state.level;
  const sims = L.animals.map(a => walk(L, a, (x, y) => getArrow(x, y)));
  const total = Math.max(...sims.map(s => s.path.length - 1 + (s.result === 'bump' ? 1 : 0)));
  for (let n = 1; n <= total; n++) {
    const bumps = [];
    sims.forEach((s, ai) => {
      const o = state.animals[ai], prev = s.path[n - 1], cur = s.path[n];
      if (cur) {
        o.x = cur.x; o.y = cur.y;
        face(o, prev.dir); hopAnim(o); sfx.step();
        if (cur.dir !== prev.dir) setTimeout(() => { face(o, cur.dir); sfx.turn(); }, STEP * 0.7);
      } else if (n === s.path.length && s.result === 'bump') {
        bumps.push([o, prev, s.bump]);
      }
    });
    spread();                         // settle positions first, then let bumping animals lunge
    bumps.forEach(b => bump(...b));
    await sleep(STEP);
  }
  await sleep(160);
  const wins = sims.map(s => s.result === 'win');
  if (wins.every(Boolean)) await win(); else await fail(sims, wins);
}
// The animal lunges into the obstacle first. The obstacle only reacts once the animal has touched it.
function bump(o, prev, b) {
  const dx = DIRS[prev.dir].dx, dy = DIRS[prev.dir].dy;
  const bx = parseFloat(o.el.style.getPropertyValue('--x')), by = parseFloat(o.el.style.getPropertyValue('--y'));
  o.el.style.transitionDuration = '.16s';
  o.el.style.setProperty('--x', bx + dx * 0.42);
  o.el.style.setProperty('--y', by + dy * 0.42);
  setTimeout(() => {
    cry(o.type, 'hit');
    puff(b.x - dx * 0.5, b.y - dy * 0.5);
    const t = tileEl(b.x, b.y), ob = t && t.querySelector('.obj');
    if (ob) { ob.classList.remove('shake'); void ob.offsetWidth; ob.classList.add('shake'); }
    o.hop.animate([{ transform: 'scale(1,1)' }, { transform: 'scale(.9,1.08)' }, { transform: 'scale(1,1)' }], { duration: 220 });
  }, 150);
  setTimeout(() => {
    o.el.style.transitionDuration = '.22s';
    o.el.style.setProperty('--x', bx);
    o.el.style.setProperty('--y', by);
    setTimeout(() => { o.el.style.transitionDuration = ''; }, 260);
  }, 330);
}
async function fail(sims, wins) {
  if (!sims.some((s, i) => !wins[i] && s.result === 'bump')) sfx.oops();   // a bump already played the animal's own call
  say(pick(['Oops! Try again.', 'Whoops! Change a square.', 'Almost! Try again.']));
  state.animals.forEach((o, i) => {
    if (wins[i]) return;
    if (sims[i].result === 'loop') o.hop.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(720deg)' }], { duration: 800, easing: 'ease-in-out' });
    else o.hop.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-12deg)' }, { transform: 'rotate(10deg)' }, { transform: 'rotate(-6deg)' }, { transform: 'rotate(0)' }], { duration: 520 });
  });
  await sleep(950);
  state.animals.forEach(o => { o.el.style.opacity = 0; });
  await sleep(230);
  state.animals.forEach(o => { o.el.style.transition = 'none'; place(o, o.start.x, o.start.y, 0); face(o, o.start.dir); });
  spread();
  void $('grid').offsetWidth;
  state.animals.forEach(o => { o.el.style.transition = ''; o.el.style.opacity = 1; });
  state.fails++;
  state.running = false;
  $('grid').classList.remove('busy');
  $('cta').disabled = false;
  if (state.hintAfter && state.fails >= state.hintAfter) {
    const h = currentHint();
    if (h) { showHint(h, true); if (state.fails === state.hintAfter) say('Try this one!'); }
  }
  scheduleNudge();
}
function confetti() {
  const fx = $('fx'), cols = ['#2F7DE1', '#F28C28', '#D6336C', '#7048E8', '#FFD166', '#1E9E57'];
  for (let i = 0; i < 34; i++) {
    const p = document.createElement('i');
    p.className = 'piece';
    p.style.left = Math.random() * 100 + '%';
    p.style.background = cols[i % cols.length];
    p.style.animationDelay = Math.random() * 0.5 + 's';
    p.style.animationDuration = 1.5 + Math.random() * 0.9 + 's';
    fx.appendChild(p);
    setTimeout(() => p.remove(), 2800);
  }
}
function cheerCalls(types, start) {   // each animal calls in turn, never on top of each other
  let at = start;
  types.forEach(t => { const d = at; setTimeout(() => cry(t, 'win'), d); at += (CRY_WIN_MS[t] || 1000) + 150; });
}
async function win() {
  state.won = true;
  state.running = false;
  $('grid').classList.add('won');
  progress.done.add(state.i);
  persist();
  $('grid').querySelectorAll('.goal .obj').forEach(g => g.classList.add('eaten'));
  state.animals.forEach(o => { o.flip.dataset.view = 'front'; joy(o); });   // turn to face the player and jump for joy
  sfx.win(); confetti();
  say(pick(['Yay! You did it!', 'Great planning!', 'Hooray!']));
  cheerCalls(state.animals.map(o => o.type), 520);
  renderDots();
  await sleep(1300);
  setCTA('next');
}
function advance() {
  const i = state.i, wi = LEVELS[i].world, n = i + 1;
  if (n >= LEVELS.length) return showCheer('final', wi);
  if (LEVELS[n].world !== wi) return showCheer('world', wi);
  load(n, true);
}

// ---------- screens ----------
function show(id) { ['start', 'map', 'cheer'].forEach(s => { $(s).hidden = s !== id; }); }
function onGameScreen() { return $('start').hidden && $('map').hidden && $('cheer').hidden; }

function showCheer(kind, wi) {
  $('cheerParty').innerHTML = ALL_ANIMALS.map(t => FRONT[t]()).join('');
  const count = kind === 'final' ? WORLDS.length : WORLD_LEVELS[wi].length;
  $('cheerStars').innerHTML = Array.from({ length: count }, () => `<svg class="star done" viewBox="0 0 24 24" aria-hidden="true">${STAR}</svg>`).join('');
  $('cheerStars').classList.toggle('many', count > 6);
  // Calls: the characters from the last level first, then a few others, so it stays short.
  const types = [...new Set(state.types.concat(shuffled(ALL_ANIMALS)))].slice(0, kind === 'final' ? 5 : 3);
  const b = $('cheerBtn');
  b.dataset.mode = kind;
  b.dataset.world = wi;
  b.innerHTML = kind === 'final' ? ICON.map : ICON.next;
  b.setAttribute('aria-label', kind === 'final' ? 'Pick a level' : 'Next world');
  show('cheer');
  confetti(); sfx.win();
  say(kind === 'final' ? 'You finished every level! Great planning!' : 'You finished this world! On to the next one!');
  cheerCalls(types, 600);
}

function renderMap() {
  const now = firstOpen();
  $('worlds').innerHTML = WORLDS.map((w, wi) => {
    const btns = WORLD_LEVELS[wi].map(i => {
      const L = LEVELS[i], done = progress.done.has(i), open = isUnlocked(i);
      const cls = ['lvl', done ? 'done' : '', i === now ? 'now' : '', open ? '' : 'locked'].filter(Boolean).join(' ');
      const cells = L.grid.join('').split('').map(c => `<i class="${c === '.' ? '' : c}"></i>`).join('');
      const label = `Level ${i + 1}` + (L.animals.length > 1 ? `, ${L.animals.length} friends` : '') + (done ? ', finished' : open ? '' : ', locked');
      return `<button class="${cls}" data-i="${i}" aria-label="${label}"><span class="thumb" style="--n:${L.grid.length}">${cells}</span>${done ? `<svg class="badge" viewBox="0 0 24 24">${STAR}</svg>` : ''}${open ? '' : LOCK}</button>`;
    }).join('');
    const tag = w.bonus
      ? `<div class="wtag bonus" aria-label="Bonus: each friend has their own snack"><span class="duo">${GOALSVG.fish}${GOALSVG.peanuts}</span></div>`
      : `<div class="wtag" aria-label="${w.size} by ${w.size} squares"><span class="mini" style="--n:${w.size}">${'<i></i>'.repeat(w.size * w.size)}</span></div>`;
    return `<section class="world w-${w.id}">${tag}<div class="lvls">${btns}</div></section>`;
  }).join('');
  $('worlds').querySelectorAll('.lvl').forEach(b => b.addEventListener('click', () => {
    audio();
    const i = Number(b.dataset.i);
    if (!isUnlocked(i)) { b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); sfx.oops(); return; }
    show(null);
    load(i, true);
  }));
}
function openMap() {
  if (state.running) return;
  renderMap();
  show('map');
  const target = $('worlds').querySelector('.lvl.now') || $('worlds').querySelector(`.lvl[data-i="${state.i}"]`);
  if (target) target.scrollIntoView({ block: 'center' });
}

// ---------- grown-ups panel (press and hold the gear) ----------
function attachGate(g) {
  let t = null;
  const stop = () => { clearTimeout(t); g.classList.remove('holding'); };
  g.addEventListener('pointerdown', e => { e.preventDefault(); g.classList.add('holding'); t = setTimeout(() => { stop(); openSheet(); }, 900); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => g.addEventListener(ev, stop));
  g.addEventListener('contextmenu', e => e.preventDefault());
  g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSheet(); } });
}
function openSheet() { renderSheet(); $('sheet').hidden = false; }
function closeSheet() { $('sheet').hidden = true; disarmReset(); }
function renderSheet() {
  const seg = (key, opts, cur) => `<div class="seg" role="group">${opts.map(([v, label]) =>
    `<button class="chip" data-k="${key}" data-v="${v}" aria-pressed="${v === cur}">${label}</button>`).join('')}</div>`;
  $('setRows').innerHTML = [
    `<div class="setrow"><span class="lab">Sound</span>${seg('sound', [[1, 'On'], [0, 'Off']], +state.sound)}</div>`,
    `<div class="setrow"><span class="lab">Voice prompts</span>${seg('voice', [[1, 'On'], [0, 'Off']], +state.voice)}</div>`,
    `<div class="setrow"><span class="lab">Arrows to choose from</span>${seg('arrows', [[1, 'All four'], [0, 'Only the ones needed']], +(state.arrowMode === 'all'))}</div>`,
    `<div class="setrow"><span class="lab">Hint appears after</span>${seg('hint', [[2, '2 tries'], [3, '3 tries'], [0, 'Never']], state.hintAfter)}</div>`,
    `<div class="setrow"><span class="lab">Levels</span>${seg('unlock', [[0, 'Unlock in order'], [1, 'All open']], +progress.unlockAll)}</div>`
  ].join('');
  $('setRows').querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.k, v = Number(b.dataset.v);
    if (k === 'sound') state.sound = !!v;
    if (k === 'voice') { state.voice = !!v; if (!v && 'speechSynthesis' in window) { try { speechSynthesis.cancel(); } catch (e) {} } }
    if (k === 'hint') state.hintAfter = v;
    if (k === 'arrows') { state.arrowMode = v ? 'all' : 'needed'; state.sol = null; }
    if (k === 'unlock') { progress.unlockAll = !!v; if (!$('map').hidden) renderMap(); }
    persist();
    renderSheet();
  }));
  $('hintBtn').disabled = !(onGameScreen() && state.level && !state.running && !state.won);
}
let resetTimer = null;
function disarmReset() { clearTimeout(resetTimer); const b = $('resetBtn'); b.classList.remove('armed'); b.textContent = 'Reset progress'; }
$('resetBtn').addEventListener('click', () => {
  const b = $('resetBtn');
  if (!b.classList.contains('armed')) {   // two taps, since the page cannot show a confirm dialog
    b.classList.add('armed');
    b.textContent = 'Tap again to reset';
    resetTimer = setTimeout(disarmReset, 3500);
    return;
  }
  disarmReset();
  progress.done.clear();
  progress.unlockAll = false;
  persist();
  closeSheet();
  load(0, false);
  show('start');
});
$('hintBtn').addEventListener('click', () => {
  closeSheet();
  if (onGameScreen() && !state.running && !state.won) { const h = currentHint(); if (h) showHint(h, true); }
});
$('closeBtn').addEventListener('click', closeSheet);
$('sheet').addEventListener('click', e => { if (e.target === $('sheet')) closeSheet(); });

// ---------- buttons ----------
$('cta').addEventListener('click', () => { audio(); if ($('cta').dataset.mode === 'next') advance(); else run(); });
$('play').addEventListener('click', () => {
  audio();
  const i = firstOpen();
  if (i < 0) { openMap(); return; }
  show(null);
  load(i, true);
});
$('mapBtn').addEventListener('click', () => { audio(); openMap(); });
$('mapBack').addEventListener('click', () => { if (state.level) show(null); else show('start'); });
$('cheerBtn').addEventListener('click', () => {
  audio();
  const b = $('cheerBtn');
  if (b.dataset.mode === 'final') { openMap(); return; }
  const lv = WORLD_LEVELS[Number(b.dataset.world)];
  show(null);
  load(lv[lv.length - 1] + 1, true);
});
attachGate($('gear'));
attachGate($('gear2'));

// ---------- boot ----------
loadSave();
$('play').innerHTML = ICON.go;
$('mapBtn').innerHTML = ICON.map;
$('mapBack').innerHTML = ICON.back;
$('startParty').innerHTML = ALL_ANIMALS.map(t => FRONT[t]()).join('');
new ResizeObserver(sizeBoard).observe($('stage'));
window.addEventListener('resize', sizeBoard);
{ const f = firstOpen(); load(f < 0 ? 0 : f, false); }
