"use strict";

// Generic L-system + turtle engine shared by every line-turtle fractal
// (Koch, Dragon, Hilbert, Gosper, Sierpinski Arrowhead). Each fractal is
// just data: an axiom, rewrite rules, a turn angle, and which letters
// draw. The Pythagoras tree is recursive square subdivision, not a
// line turtle, and doesn't use this.

const KOCH_SNOWFLAKE = {
  axiom: "F--F--F",
  rules: { F: "F+F--F+F" },
  angleDeg: 60,
  drawSymbols: ["F"],
};

const DRAGON_CURVE = {
  axiom: "FX",
  rules: { X: "X+YF+", Y: "-FX-Y" },
  angleDeg: 90,
  drawSymbols: ["F"],
};

const HILBERT_CURVE = {
  axiom: "A",
  rules: { A: "+BF-AFA-FB+", B: "-AF+BFB+FA-" },
  angleDeg: 90,
  drawSymbols: ["F"],
};

const GOSPER_CURVE = {
  axiom: "A",
  rules: { A: "A-B--B+A++AA+B-", B: "+A-BB--B-A++A+B" },
  angleDeg: 60,
  drawSymbols: ["A", "B"],
};

const SIERPINSKI_ARROWHEAD = {
  axiom: "A",
  rules: { A: "B-A-B", B: "A+B+A" },
  angleDeg: 60,
  drawSymbols: ["A", "B"],
};

// String rewriting: every character with a rule is replaced by it, all at
// once per iteration; anything without one (+, -, [, ], placeholders)
// passes through unchanged. Built with an array join -- repeated string
// += is quadratic-ish on some engines at the ~1M-character sizes the
// deepest levels reach.
function expandLSystem(axiom, rules, iterations) {
  let s = axiom;
  for (let i = 0; i < iterations; i++) {
    const out = [];
    for (const c of s) out.push(Object.prototype.hasOwnProperty.call(rules, c) ? rules[c] : c);
    s = out.join("");
  }
  return s;
}

// Walks an expanded string with a turtle. drawSymbols letters move forward
// one step and draw; + turns left (counter-clockwise) by angleDeg, - turns
// right; [ pushes position/heading and ] pops it. Any other character is a
// placeholder and does nothing.
//
// Returns polylines -- arrays of [x, y] points -- rather than loose
// segments: consecutive draws share endpoints, so this is the same line
// work with half the points, and it's what the Canvas2D views stroke. A
// ] (jump back) starts a new polyline.
//
// Coordinates are raw turtle space unless the caller says otherwise:
// start (default [0, 0]), startHeadingDeg (default 0, i.e. +x), and step
// (default 1) let Koch and Dragon reproduce their existing geometry
// exactly; normalizePolylines fits anything else into [-1, 1].
function turtleInterpret(str, { angleDeg, drawSymbols, start = [0, 0], startHeadingDeg = 0, step = 1 }) {
  const draws = new Set(drawSymbols);
  const turn = (angleDeg * Math.PI) / 180;
  let x = start[0], y = start[1], heading = (startHeadingDeg * Math.PI) / 180;
  const stack = [];
  const polylines = [];
  let current = [[x, y]];
  for (const c of str) {
    if (draws.has(c)) {
      x += Math.cos(heading) * step;
      y += Math.sin(heading) * step;
      current.push([x, y]);
    } else if (c === "+") {
      heading += turn;
    } else if (c === "-") {
      heading -= turn;
    } else if (c === "[") {
      stack.push([x, y, heading]);
    } else if (c === "]") {
      [x, y, heading] = stack.pop();
      if (current.length > 1) polylines.push(current);
      current = [[x, y]];
    }
  }
  if (current.length > 1) polylines.push(current);
  return polylines;
}

// Scales and centers polylines so their bounding box is centered on the
// origin with its longer side spanning [-1, 1]. Keeps a curve the same
// on-screen size at every depth, whatever its growth rate per iteration.
function normalizePolylines(polylines) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const line of polylines) {
    for (const [x, y] of line) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const k = 2 / Math.max(x1 - x0, y1 - y0, 1e-12);
  return polylines.map((line) => line.map(([x, y]) => [(x - cx) * k, (y - cy) * k]));
}

// Convenience: expand + interpret one definition at a depth.
function lsystemPolylines(def, depth, turtleOpts = {}) {
  return turtleInterpret(expandLSystem(def.axiom, def.rules, depth), {
    angleDeg: def.angleDeg, drawSymbols: def.drawSymbols, ...turtleOpts,
  });
}
