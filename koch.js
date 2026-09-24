"use strict";

// Direct port of koch.py's koch_segment()/koch_snowflake() geometry, plus a
// Canvas2D view with the same pan/zoom/animate/fill/colormap feature set —
// pure vector geometry at these depths, so it needs no shader.

function kochSegment(p1, p2) {
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
  const ax = p1[0] + dx / 3, ay = p1[1] + dy / 3;
  const bx = p1[0] + (2 * dx) / 3, by = p1[1] + (2 * dy) / 3;
  const angle = Math.PI / 3;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rx = dx / 3, ry = dy / 3;
  const peak = [ax + (cos * rx - sin * ry), ay + (sin * rx + cos * ry)];
  return [p1, [ax, ay], peak, [bx, by], p2];
}

function kochSnowflake(depth) {
  const angles = [90, 210, 330].map((d) => (d * Math.PI) / 180);
  const pts = angles.map((a) => [Math.cos(a), Math.sin(a)]);
  let segments = [[pts[0], pts[1]], [pts[1], pts[2]], [pts[2], pts[0]]];

  for (let d = 0; d < depth; d++) {
    const next = [];
    for (const [p1, p2] of segments) {
      const chain = kochSegment(p1, p2);
      for (let i = 0; i < chain.length - 1; i++) next.push([chain[i], chain[i + 1]]);
    }
    segments = next;
  }

  const verts = segments.map((s) => s[0]);
  verts.push(segments[segments.length - 1][1]);
  return verts;
}

function createKochView(canvas) {
  const ctx = canvas.getContext("2d");
  const view = { cx: 0, cy: 0, halfHeight: 1.4 };
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let cachedDepth = -1;
  let cachedVerts = null;

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
      cachedVerts = kochSnowflake(opts.depth);
      cachedDepth = opts.depth;
    }
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.beginPath();
    cachedVerts.forEach((v, i) => {
      const [sx, sy] = worldToScreen(v[0], v[1]);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.closePath();

    const [r, g, b] = sampleColor(COLORMAPS[opts.colormapIndex].stops, opts.depth / 8);
    if (opts.fill) {
      ctx.fillStyle = `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      ctx.strokeStyle = `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  return { view, resize, render, worldToScreen, screenToWorld, get dpr() { return dpr; } };
}
