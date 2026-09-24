"use strict";

// Koch snowflake: a Canvas2D view with the same pan/zoom/animate/fill/
// colormap feature set as the original koch.py port -- pure vector
// geometry at these depths, so it needs no shader.

// Geometry comes from the shared L-system engine (lsystem.js,
// KOCH_SNOWFLAKE). The turtle is placed so the result is exactly the old
// koch.py port's snowflake -- a triangle on the unit circle with vertices at
// 90/210/330 degrees, spanning x +-0.866, y -0.5..1 at depth 0 -- which
// app.js's vectorViewBox("koch") is fitted to: start at the top vertex
// heading -60 degrees, one step = edge length sqrt(3) / 3^depth.
// KOCH_SNOWFLAKE turns right at the corners (clockwise), so bumps go out
// to the left; the old code walked the triangle counter-clockwise, so
// the list is reversed to keep the same vertex order. Checked point for
// point against the old kochSegment/kochSnowflake at depths 0-8 (max
// difference 1.6e-13) before they were removed.
function kochSnowflake(depth) {
  const [verts] = lsystemPolylines(KOCH_SNOWFLAKE, depth, {
    start: [0, 1], startHeadingDeg: -60, step: Math.sqrt(3) / Math.pow(3, depth),
  });
  return verts.reverse();
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
