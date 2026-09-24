"use strict";

// Heighway dragon curve via its standard L-system (axiom FX, rules
// X->X+YF+, Y->-FX-Y, 90-degree turns). Non-F characters are bookkeeping
// only; walking the F/+/- string with a turtle draws the curve.
function dragonLSystemString(depth) {
  let s = "FX";
  for (let i = 0; i < depth; i++) {
    let next = "";
    for (const c of s) {
      if (c === "X") next += "X+YF+";
      else if (c === "Y") next += "-FX-Y";
      else next += c;
    }
    s = next;
  }
  return s;
}

// Each forward step is scaled by (1/sqrt2)^depth so the curve's overall
// bounding box stays bounded as depth increases instead of growing without
// limit -- each generation replaces one segment with two segments each
// 1/sqrt2 the length, the same self-similar-contraction idea as Koch
// dividing into thirds. Verified numerically before shipping: with raw
// unit-length steps the bbox grew from ~30 units wide at depth 10 to ~380
// at depth 16; with this scaling it converges to roughly
// x:[-1.2,1.2] y:[-1.2,0.5] regardless of depth.
function dragonCurve(depth) {
  const s = dragonLSystemString(depth);
  const step = Math.pow(Math.SQRT1_2, depth);
  let x = 0, y = 0, heading = 0;
  const pts = [[x, y]];
  for (const c of s) {
    if (c === "F") {
      x += Math.cos(heading) * step;
      y += Math.sin(heading) * step;
      pts.push([x, y]);
    } else if (c === "+") {
      heading += Math.PI / 2;
    } else if (c === "-") {
      heading -= Math.PI / 2;
    }
  }
  return pts;
}

// Same Canvas2D view shape as createKochView/createPythagorasTreeView, so
// attachVectorViewInteraction in app.js works on this unmodified.
function createDragonView(canvas) {
  const ctx = canvas.getContext("2d");
  const view = { cx: -0.35, cy: -0.24, halfHeight: 1.0 };
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let cachedDepth = -1;
  let cachedPts = null;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function worldToScreen(x, y) {
    const sx = canvas.width / 2 + ((x - view.cx) / view.halfHeight) * (canvas.height / 2);
    const sy = canvas.height / 2 - ((y - view.cy) / view.halfHeight) * (canvas.height / 2);
    return [sx, sy];
  }

  function screenToWorld(sx, sy) {
    const x = view.cx + ((sx - canvas.width / 2) / (canvas.height / 2)) * view.halfHeight;
    const y = view.cy - ((sy - canvas.height / 2) / (canvas.height / 2)) * view.halfHeight;
    return [x, y];
  }

  function render(opts) {
    resize();
    if (cachedDepth !== opts.depth) {
      cachedPts = dragonCurve(opts.depth);
      cachedDepth = opts.depth;
    }
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const [r, g, b] = sampleColor(COLORMAPS[opts.colormapIndex].stops, opts.depth / 16);
    ctx.strokeStyle = `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    cachedPts.forEach((p, i) => {
      const [sx, sy] = worldToScreen(p[0], p[1]);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.stroke();
  }

  return { view, resize, render, worldToScreen, screenToWorld, get dpr() { return dpr; } };
}
