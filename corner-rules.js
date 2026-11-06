// Corner Rules: the chaos game on a polygon's corners with a memory. The next corner is restricted by the
// last pick (or the last two), and each rule gives a different shape. The dot shapes of ifs.js/fern.js
// pick every map independently; here the picks form a Markov chain, so the shape is a graph-directed
// IFS: a few states (the last picks), a set of allowed corners per state and the state each pick leads to.
//
// Everything the dot-shape view needs for the mode "corners" is here and hooked in with a few lines:
//   - the rules (CORNER_RULES), the dealer that hands out the next one (dealCornerRule) and the one on
//     screen (cornerDeal.id, applyCornerRule, which also points IFS_SYSTEMS.corners at the rule's polygon);
//   - compileRule: the rule as tables (allowed corners and next state per state; the stationary
//     distribution of the chain; for the sampler, the edges walked backwards);
//   - the data fern.js's ifsData() reads for the mode (IFS_SYSTEMS.corners.build): base points per state,
//     bounds, and `machine`, the tables above;
//   - the zoom sampler: cornerLeaves (the twin of ifs.js's buildLeaves, state per node) and cornerSample
//     (the twin of one runSlice sample, walking the chain backwards for the fresh digits).
//
// The sampler's maths. K_s is the set of points the game can be at while in state s. A point of K_s is
// f_k(y) with y in K_s', for each earlier state s' that allows k and moves to s on it. The address tree
// therefore runs newest pick first (as buildLeaves does) and a node is a map and a state: its children
// are the edges into that state, read backwards. With pi the chain's stationary distribution, the
// measure of the game's points in state s is the sum over those edges of
// pi(s') / |allowed(s')| / pi(s) times f_k pushing the measure of s' forward, so the weights of the
// children of a node are those backward probabilities and the roots (one per state) weigh pi(s).
// Expanding along any cut of the tree stays exact, as in buildLeaves; overlap between the copies (at
// ratio 1/2 several rules have more copies than tile the plane) costs nothing, since the measure
// just adds up there, as the game's own points do.
//
// An ES module: every top-level declaration is exported (test-hooks.js and the importing files rely on it).
import { IFS_SYSTEMS, affineBoxImage, composeAffine, ifsDataCache, ifsRandom } from "./ifs.js?v=1.70.2";

// ---------------------------------------------------------------- the rules

// n corners, numbered 0..n-1 clockwise from the top (the pentagon's order in ifs.js). allows(k, p, q) says
// whether corner k may be picked when the last pick was p and the one before q (-1: no such pick yet).
// order is how many picks the rule looks back (the state is that many last picks). The ids ride in
// share links, so they never change; new rules get new ids.
// hueSpread: the degrees the corners' hues run over, from the first to the last corner.
export const CORNER_RULES = [
  {
    id: 1, n: 4, order: 1, title: "Never the same corner twice",
    blurb: "Jump halfway to a corner of a square, never the one just used. A lacy lattice appears.",
    allows: (k, p) => k !== p,
  },
  {
    id: 2, n: 4, order: 1, title: "Never the next corner clockwise",
    blurb: "Jump halfway to a corner of a square, never the one just clockwise of the last. A pinwheel of spiky arms appears.",
    allows: (k, p, q, n) => p < 0 || k !== (p + 1) % n,
  },
  {
    id: 3, n: 4, order: 1, title: "Never the opposite corner",
    blurb: "Jump halfway to a corner of a square, never the one opposite the last. A diamond with notched holes appears.",
    allows: (k, p, q, n) => p < 0 || k !== (p + 2) % n,
  },
  {
    id: 4, n: 4, order: 2, title: "After a repeat, no neighbour",
    blurb: "Jump halfway to a corner of a square. After the same corner twice in a row, a neighbouring corner is barred. A snowflake cross with round holes appears.",
    allows: (k, p, q, n) => !(p >= 0 && p === q && (k === (p + 1) % n || k === (p + n - 1) % n)),
  },
  {
    id: 5, n: 6, order: 1, title: "Hexagon: never the opposite corner",
    blurb: "Jump halfway to a corner of a hexagon, never the one opposite the last. A hexagon with hexagonal holes appears.",
    allows: (k, p, q, n) => p < 0 || k !== (p + 3) % n,
  },
  {
    id: 6, n: 5, order: 1, title: "Pentagon: never the same corner twice",
    blurb: "Jump halfway to a corner of a pentagon, never the one just used. A ring of frilly clumps appears.",
    allows: (k, p) => k !== p,
  },
  {
    id: 7, n: 5, order: 1, title: "Pentagon: never the next corner",
    blurb: "Jump halfway to a corner of a pentagon, never the one just clockwise of the last. A lopsided star appears.",
    allows: (k, p, q, n) => p < 0 || k !== (p + 1) % n,
  },
];
// The rule the first deal gives, a link without one opens, and a link with a bad one falls back to.
export const DEFAULT_CORNER_RULE = 3;
export const cornerRuleById = (id) => CORNER_RULES.find((r) => r.id === id) || null;

// A rule id as a share link or anything else gives it: the id, or DEFAULT_CORNER_RULE for anything that
// is not one (a link with a bad rule still opens, as with a bad seed).
export function parseCornerRule(raw) {
  if (raw === null || raw === undefined || !/^\d{1,2}$/.test(String(raw))) return DEFAULT_CORNER_RULE;
  return cornerRuleById(Number(raw)) ? Number(raw) : DEFAULT_CORNER_RULE;
}

// ---------------------------------------------------------------- the dealer

// id: the rule on screen (the last dealt, or one a link or applyCornerRule set; DEFAULT_CORNER_RULE
// before any, when nothing has been shown yet: seen is false); bag: the rules still to come in this round;
// dealt: how many deals so far.
export const cornerDeal = { id: DEFAULT_CORNER_RULE, seen: false, bag: [], dealt: 0 };

export function shuffledIds(ids, rnd) {
  const a = ids.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// The next rule: from a shuffled bag that holds every rule once, so all of them come round, and never
// the rule on screen. The very first deal is DEFAULT_CORNER_RULE (the one that looks best, and the
// same for the picker's thumbnail); the rest of that round is shuffled.
export function dealCornerRule(rnd = Math.random) {
  const d = cornerDeal, all = CORNER_RULES.map((r) => r.id);
  if (d.dealt === 0) d.bag = [DEFAULT_CORNER_RULE, ...shuffledIds(all.filter((id) => id !== DEFAULT_CORNER_RULE), rnd)];
  else if (d.bag.length === 0) d.bag = shuffledIds(all, rnd);
  const onScreen = d.seen ? d.id : 0; // (nothing yet before the first rule is shown: ids start at 1)
  let i = d.bag.findIndex((id) => id !== onScreen);
  if (i < 0) { d.bag = shuffledIds(all, rnd); i = d.bag.findIndex((id) => id !== onScreen); }
  const id = d.bag.splice(i, 1)[0];
  d.dealt++;
  d.id = id;
  d.seen = true;
  return cornerRuleById(id);
}

// ---------------------------------------------------------------- the polygon

// The corner maps of a rule: jumps halfway to corner k of the regular n-gon (circumradius 1, point up),
// x -> (x + v) / 2. Cached per n, so the same array comes back (the view keeps what it was given).
export const CORNER_RATIO = 0.5;
export const cornerTransformCache = new Map();
export function cornerTransforms(n) {
  let trs = cornerTransformCache.get(n);
  if (!trs) {
    trs = Array.from({ length: n }, (_, k) => {
      const vx = Math.sin(2 * Math.PI * k / n), vy = Math.cos(2 * Math.PI * k / n);
      return { a: CORNER_RATIO, b: 0, c: 0, d: CORNER_RATIO, e: (1 - CORNER_RATIO) * vx, f: (1 - CORNER_RATIO) * vy, p: 1 / n, ci: k };
    });
    cornerTransformCache.set(n, trs);
  }
  return trs;
}

// One hue per corner, spread evenly over the corner order (the turn of the picked color, in degrees).
export function cornerHueOffsets(n) {
  const spread = 100;
  return Array.from({ length: n }, (_, k) => Math.round(-spread + 2 * spread * k / (n - 1)));
}

// ---------------------------------------------------------------- the rule as tables

// The state is the last `order` picks. A state number has digits of 0 (no pick yet) or corner + 1: p (the
// last pick) is the lowest digit, q (the one before) the next. State 0 is "nothing picked": where a run
// starts. A state is recurrent (the game can stay among such states for ever) once it has all its picks.
// Returns the machine:
//   rule, n, order, nStates, rec (recurrent: 0/1 per state)
//   allowed[s] (Int8Array of the corners the state allows), forbid[s] (bit mask of those it bars),
//   nextTab[s * n + k] (the state after picking k in s; -1 if k is barred)
//   pi[s] the stationary distribution (over the recurrent states)
//   the backward edges: those into state s are backFrom/backK/backCum from backStart[s] to backStart[s + 1]
//   (the state before, the corner, and the running sum of their probabilities, ending at 1)
//   sbox[s]: a box [x0, x1, y0, y1] that holds every point of the state, for pruning
//   poolStart/poolLen: filled by cornerData, the base points of each state
export const compiledRules = new Map();
export function compileRule(rule) {
  const cached = compiledRules.get(rule.id);
  if (cached) return cached;
  const n = rule.n, W = n + 1, order = rule.order;
  const nStates = order === 2 ? W * W : W;
  const lastPick = (s) => (s % W) - 1, beforeLast = (s) => (order === 2 ? Math.floor(s / W) - 1 : -1);
  const stepTo = (s, k) => (order === 2 ? (lastPick(s) + 1) * W + (k + 1) : k + 1);
  const rec = new Uint8Array(nStates), allowed = [], forbid = new Int32Array(nStates), nextTab = new Int16Array(nStates * n).fill(-1);
  for (let s = 0; s < nStates; s++) {
    const p = lastPick(s), q = beforeLast(s);
    rec[s] = p >= 0 && (order === 1 || q >= 0) ? 1 : 0;
    const list = [];
    for (let k = 0; k < n; k++) {
      if (rule.allows(k, p, q, n)) { list.push(k); nextTab[s * n + k] = stepTo(s, k); } else forbid[s] |= 1 << k;
    }
    allowed.push(Int8Array.from(list));
  }
  // The stationary distribution of the chain on the recurrent states (uniform choice among the allowed
  // corners), by power iteration of the lazy chain (half stay, so periodic chains converge too).
  const recStates = [];
  for (let s = 0; s < nStates; s++) if (rec[s]) recStates.push(s);
  let pi = new Float64Array(nStates);
  for (const s of recStates) pi[s] = 1 / recStates.length;
  for (let it = 0; it < 4000; it++) {
    const next = new Float64Array(nStates);
    for (const s of recStates) {
      next[s] += 0.5 * pi[s];
      for (const k of allowed[s]) next[nextTab[s * n + k]] += 0.5 * pi[s] / allowed[s].length;
    }
    pi = next;
  }
  // The edges into each recurrent state, with the probability that a point of that state came by each.
  const into = Array.from({ length: nStates }, () => []);
  for (const s of recStates) {
    for (const k of allowed[s]) {
      const t = nextTab[s * n + k];
      if (pi[s] > 1e-12) into[t].push({ from: s, k, w: pi[s] / allowed[s].length });
    }
  }
  const backStart = new Int32Array(nStates + 1), backFrom = [], backK = [], backCum = [];
  for (let s = 0; s < nStates; s++) {
    backStart[s] = backFrom.length;
    const sum = into[s].reduce((a, e) => a + e.w, 0);
    let cum = 0;
    for (const e of into[s]) { cum += e.w / sum; backFrom.push(e.from); backK.push(e.k); backCum.push(cum); }
    if (into[s].length) backCum[backCum.length - 1] = 1;
  }
  backStart[nStates] = backFrom.length;
  // A box round every state's points: the polygon's box to begin with, then each state's box can only be
  // the boxes of the states before it, mapped by the pick, joined (repeated until it settles).
  const trs = cornerTransforms(n);
  const poly = [Infinity, -Infinity, Infinity, -Infinity];
  for (const t of trs) {
    const x = t.e / (1 - t.a), y = t.f / (1 - t.d);
    poly[0] = Math.min(poly[0], x); poly[1] = Math.max(poly[1], x); poly[2] = Math.min(poly[2], y); poly[3] = Math.max(poly[3], y);
  }
  let sbox = Array.from({ length: nStates }, () => poly.slice());
  for (let it = 0; it < 24; it++) {
    sbox = sbox.map((old, s) => {
      if (!rec[s] || backStart[s] === backStart[s + 1]) return old;
      const b = [Infinity, -Infinity, Infinity, -Infinity];
      for (let i = backStart[s]; i < backStart[s + 1]; i++) {
        const t = trs[backK[i]], f = sbox[backFrom[i]];
        b[0] = Math.min(b[0], t.a * f[0] + t.e); b[1] = Math.max(b[1], t.a * f[1] + t.e);
        b[2] = Math.min(b[2], t.d * f[2] + t.f); b[3] = Math.max(b[3], t.d * f[3] + t.f);
      }
      return [Math.max(b[0], old[0]) - 1e-9, Math.min(b[1], old[1]) + 1e-9, Math.max(b[2], old[2]) - 1e-9, Math.min(b[3], old[3]) + 1e-9];
    });
  }
  const machine = {
    rule, n, order, nStates, rec, allowed, forbid, nextTab, pi, backStart,
    backFrom: Int32Array.from(backFrom), backK: Int8Array.from(backK), backCum: Float64Array.from(backCum), sbox,
    poolStart: new Int32Array(nStates), poolLen: new Int32Array(nStates), out: new Float64Array(5),
  };
  compiledRules.set(rule.id, machine);
  return machine;
}

// The corner a run picks next from state s, for a random number u in [0, 1): one of the allowed, evenly.
export function cornerPick(mach, s, u) {
  const list = mach.allowed[s];
  return list[Math.min(list.length - 1, Math.floor(u * list.length))];
}

// ---------------------------------------------------------------- the data the view reads

// A small seeded generator (mulberry32) so a rule's base points are always the same ones.
export function dataRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CORNER_BASE_POINTS = 50000;

// What ifsData() gives the view for a rule (cached per rule): the corner maps, 50,000 base points of the
// game with each one's address mix and state (grouped by state: poolStart/poolLen of the machine), the
// bounds with a margin, and the machine. The base points come from playing the game itself.
export const cornerDataCache = new Map();
export function cornerData(rule) {
  let data = cornerDataCache.get(rule.id);
  if (data) return data;
  const mach = compileRule(rule), n = mach.n, transforms = cornerTransforms(n), rnd = dataRandom(1000 + rule.id);
  const N = CORNER_BASE_POINTS;
  const px = new Float64Array(N), py = new Float64Array(N), mix = new Float32Array(N * n), st = new Uint8Array(N);
  const now = new Float32Array(n).fill(1 / n);
  let x = 0, y = 0, s = 0;
  for (let i = 0; i < N + 20; i++) { // 20 burn-in steps, as ifsPoints
    const k = cornerPick(mach, s, rnd()), t = transforms[k];
    const nx = t.a * x + t.b * y + t.e;
    y = t.c * x + t.d * y + t.f;
    x = nx;
    s = mach.nextTab[s * n + k];
    for (let q = 0; q < n; q++) now[q] = 0.5 * now[q] + (q === k ? 0.5 : 0);
    if (i >= 20) { px[i - 20] = x; py[i - 20] = y; mix.set(now, (i - 20) * n); st[i - 20] = s; }
  }
  // Grouped by state, so a state's points are one run of the base arrays.
  const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => st[a] - st[b] || a - b);
  const base = new Float64Array(N * 2), baseMix = new Float32Array(N * n);
  order.forEach((src, dst) => {
    base[dst * 2] = px[src]; base[dst * 2 + 1] = py[src];
    baseMix.set(mix.subarray(src * n, src * n + n), dst * n);
    mach.poolLen[st[src]]++;
  });
  for (let q = 1, acc = 0; q <= mach.nStates; q++) { acc += mach.poolLen[q - 1]; if (q < mach.nStates) mach.poolStart[q] = acc; }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < base.length; i += 2) {
    x0 = Math.min(x0, base[i]); x1 = Math.max(x1, base[i]);
    y0 = Math.min(y0, base[i + 1]); y1 = Math.max(y1, base[i + 1]);
  }
  const m = 0.02 * Math.max(x1 - x0, y1 - y0);
  data = { transforms, base, baseMix, bounds: [x0 - m, x1 + m, y0 - m, y1 + m], machine: mach, ruleId: rule.id };
  cornerDataCache.set(rule.id, data);
  return data;
}

// ---------------------------------------------------------------- the rule on screen

// Makes `id` the rule on screen: IFS_SYSTEMS.corners takes its polygon and hues, and ifsData("corners")
// builds the rule's data next time it is asked. The caller points the view at it (fernView.refreshSystem).
// An unknown id gives DEFAULT_CORNER_RULE. Returns the rule.
export function applyCornerRule(id) {
  const rule = cornerRuleById(id) || cornerRuleById(DEFAULT_CORNER_RULE);
  const sys = IFS_SYSTEMS.corners;
  cornerDeal.id = rule.id;
  cornerDeal.seen = true;
  sys.transforms = cornerTransforms(rule.n);
  sys.hueOffsets = cornerHueOffsets(rule.n);
  sys.ruleId = rule.id;
  ifsDataCache.delete("corners");
  return rule;
}
export const currentCornerRule = () => cornerRuleById(cornerDeal.id);
// The info card's text for the rule on screen, in SHAPE_INFO's shape (hud.js patternBar): the rule's name,
// then what the game does and what comes of it.
export const cornerAbout = () => ({ lines: [currentCornerRule().title, currentCornerRule().blurb] });

IFS_SYSTEMS.corners.build = () => cornerData(currentCornerRule());
applyCornerRule(DEFAULT_CORNER_RULE);
cornerDeal.seen = false; // (the default's data is only there so the mode has something to open on)

// ---------------------------------------------------------------- the zoom sampler

// The twin of ifs.js's buildLeaves for a rule: the same cut of the address tree, but a node is a map and
// a state, the children of a node are the edges into its state (read backwards), and the weights are the
// backward probabilities, the roots weighing the stationary distribution. Returns buildLeaves's result
// plus `states` (Uint8Array: each leaf's state), which cornerSample needs. Leaves with the same
// colors: leafRGB (the coarse digits' share) and leafS (what is left for the point's own digits).
export function cornerLeaves(ifs, viewBox, cols) {
  const mach = ifs.machine, trs = ifs.transforms;
  const viewDiag = Math.hypot(viewBox[1] - viewBox[0], viewBox[3] - viewBox[2]);
  const maps = [], weights = [], leafRGB = [], leafS = [], states = [];
  const stack = [];
  for (let s = 0; s < mach.nStates; s++) {
    if (mach.rec[s] && mach.pi[s] > 1e-12 && mach.poolLen[s] > 0) stack.push({ m: [1, 0, 0, 1, 0, 0], s, w: mach.pi[s], c: [0, 0, 0], sh: 1 });
  }
  while (stack.length) {
    const node = stack.pop();
    const img = affineBoxImage(node.m, mach.sbox[node.s]);
    if (img[1] < viewBox[0] || img[0] > viewBox[1] || img[3] < viewBox[2] || img[2] > viewBox[3]) continue;
    const diag = Math.hypot(img[1] - img[0], img[3] - img[2]);
    if (diag <= viewDiag || maps.length + stack.length >= 20000) { // IFS_LEAF_CAP
      const share = Math.max(node.sh, 0.5), k = node.sh < 1 ? (1 - share) / (1 - node.sh) : 0;
      maps.push(node.m); weights.push(node.w); states.push(node.s);
      leafRGB.push(k * node.c[0], k * node.c[1], k * node.c[2]); leafS.push(share);
      continue;
    }
    for (let i = mach.backStart[node.s]; i < mach.backStart[node.s + 1]; i++) {
      const kk = mach.backK[i], col = cols[kk], h = node.sh * 0.5;
      stack.push({
        m: composeAffine(node.m, trs[kk]), s: mach.backFrom[i], w: node.w * (mach.backCum[i] - (i > mach.backStart[node.s] ? mach.backCum[i - 1] : 0)),
        c: [node.c[0] + h * col[0], node.c[1] + h * col[1], node.c[2] + h * col[2]], sh: h,
      });
    }
  }
  const cumWeights = new Float64Array(weights.length);
  let sum = 0;
  weights.forEach((w, i) => { sum += w; cumWeights[i] = sum; });
  return { maps, cumWeights, leafRGB: Float32Array.from(leafRGB), leafS: Float32Array.from(leafS), states: Uint8Array.from(states) };
}

// The twin of one sample's base point and fresh digits in runSlice: a point of state s drawn from the
// game's own measure. It walks the chain back CORNER_FRESH_STEPS picks from s (each edge with its
// backward probability), takes a base point of the state it reached, and plays those picks forward, so
// the point is a new one every time and still lies in state s. The result is out = [x, y, r, g, b]: the
// point and the mix of its address colors (the newest pick weighing half, as in the base points).
// base/baseRGB are the view's (baseRGB: each base point's color); rnd is ifsRandom for the picks.
export const CORNER_FRESH_STEPS = 4;
export function cornerSample(mach, s, base, baseRGB, cols, transforms, out) {
  const path = mach.path || (mach.path = new Int8Array(CORNER_FRESH_STEPS));
  let st = s;
  for (let j = 0; j < CORNER_FRESH_STEPS; j++) {
    const u = ifsRandom(), lo = mach.backStart[st], hi = mach.backStart[st + 1];
    let i = lo;
    while (i < hi - 1 && u >= mach.backCum[i]) i++;
    path[j] = mach.backK[i];
    st = mach.backFrom[i];
  }
  const bi = mach.poolStart[st] + Math.floor(Math.random() * mach.poolLen[st]);
  let x = base[bi * 2], y = base[bi * 2 + 1];
  let cr = baseRGB[bi * 3], cg = baseRGB[bi * 3 + 1], cb = baseRGB[bi * 3 + 2];
  for (let j = CORNER_FRESH_STEPS - 1; j >= 0; j--) {
    const t = transforms[path[j]];
    const nx = t.a * x + t.b * y + t.e;
    y = t.c * x + t.d * y + t.f;
    x = nx;
    const col = cols[path[j]];
    cr = 0.5 * cr + 0.5 * col[0]; cg = 0.5 * cg + 0.5 * col[1]; cb = 0.5 * cb + 0.5 * col[2];
  }
  out[0] = x; out[1] = y; out[2] = cr; out[3] = cg; out[4] = cb;
}
