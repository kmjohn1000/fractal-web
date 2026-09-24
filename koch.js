"use strict";

// Direct port of koch.py's koch_segment()/koch_snowflake() geometry, plus a
// Canvas2D view with the same pan/zoom/animate/fill/colormap feature set —
// pure vector geometry at these depths, so it needs no shader.

function kochSegment(p1, p2) {
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
  const ax = p1[0] + dx / 3, ay = p1[1] + dy / 3;
  const bx = p1[0] + (2 * dx) / 3, by = p1[1] + (2 * dy) / 3;
  // The starting triangle ([90,210,330] degrees) winds counter-clockwise,
  // so the outward direction at each edge is to the RIGHT of travel, i.e. a
  // negative (clockwise) rotation of the forward vector -- +60 degrees was
  // shipped here and rotated every bump inward instead, producing the Koch
  // ANTI-snowflake (area converges to 2/5 of the base triangle, not 8/5).
  // Verified numerically via the shoelace formula before fixing: +60deg
  // gives area ratio 0.42 at depth 4, -60deg gives 1.58, matching the
  // textbook 8/5 growth of a real snowflake.
  const angle = -Math.PI / 3;
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
  const view = { cx: 0, cy: 0, halfHeight: 1.4, rotation: 0 };
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

  // Rotation-aware; matches app.js's screenToComplex/centerForAnchor
  // convention exactly (rotate the screen-space offset by +rotation to get
  // world axes, by -rotation for the inverse) so attachVectorViewInteraction's
  // two-finger twist and pan both work the same way the WebGL canvases do.
  function worldToScreen(x, y) {
    const wx = (x - view.cx) / view.halfHeight;
    const wy = (y - view.cy) / view.halfHeight;
    const rot = -(view.rotation || 0);
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const uvx = wx * cos - wy * sin;
    const uvy = wx * sin + wy * cos;
    const sx = canvas.width / 2 + uvx * (canvas.height / 2);
    const sy = canvas.height / 2 - uvy * (canvas.height / 2);
    return [sx, sy];
  }

  function screenToWorld(sx, sy) {
    const uvx = (sx - canvas.width / 2) / (canvas.height / 2);
    const uvy = (canvas.height / 2 - sy) / (canvas.height / 2);
    const rot = view.rotation || 0;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const wx = uvx * cos - uvy * sin;
    const wy = uvx * sin + uvy * cos;
    return [view.cx + wx * view.halfHeight, view.cy + wy * view.halfHeight];
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
