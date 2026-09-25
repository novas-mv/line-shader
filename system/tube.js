/* ============================================================================
   matte tube surface

   A stroke painted with one gradient can only change colour ALONG its length.
   The brand element is a tube, and what reads as round is the colour changing
   ACROSS it. An SVG gradient runs in one fixed direction and cannot follow a
   curve, so the ribbon is cut into short segments and each gets its own
   gradient running across the tube at that point.

   Tuned to the brand guideline plate, NOT to the glossy render: no glint, low
   contrast, very soft falloff. The 36-stop model ramp does most of the work;
   the shading only has to say "round".

   COST — read this before using it anywhere new.
   One flat stroke is 2 DOM nodes. One tube is roughly
     segs * (1 quad + 1 gradient + `stops` stop elements) + ends + mask
   which at the defaults is ~125 nodes. That is ~60x a flat stroke, so this is
   for strokes that are LARGE and OPAQUE enough to show the shading. Below
   about 0.5 opacity the across-tube ramp is not perceptible and the weight
   buys nothing — use a flat stroke there.

   Per frame it costs nothing extra: the reveal animates the returned mask
   path, exactly like a flat stroke's dashoffset, and none of the shading is
   recomputed. The caveat is RASTER, not script — a masked group of gradient
   quads is more expensive for the compositor to repaint than a single stroke,
   and that repaint happens whenever the reveal changes during a scroll.
   ========================================================================= */

const NS = 'http://www.w3.org/2000/svg';

/* segs drives the SILHOUETTE. Each segment is a straight-edged quad, so the
   outer edge of the ribbon is a polygon with `segs` sides — at 22 that edge is
   visibly faceted on a thick tube, and thicker tubes make it worse, not better.
   72 puts the facets below a pixel at the sizes these ribbons run at.
   `stops` drives the shading ACROSS the tube and 9 is already smooth, because
   the gradient interpolates between them — raising it costs nodes and buys
   nothing. If something looks chunky, it is segs, not stops. */
export const TUBE = { segs: 72, stops: 9, con: .42, wrap: .66, sss: .20, sheen: .18, smooth: 0 };



const cl01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const hx = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
const rgb = c => 'rgb(' + c.map(v => Math.round(v < 0 ? 0 : v > 255 ? 255 : v)).join(',') + ')';
const lerp = (a,b,t) => a.map((v,i) => v + (b[i]-v)*t);

function toHsl([r,g,b]){
  r/=255; g/=255; b/=255;
  const mx = Math.max(r,g,b), mn = Math.min(r,g,b), l = (mx+mn)/2;
  if (mx === mn) return [0,0,l];
  const d = mx-mn, s = l > .5 ? d/(2-mx-mn) : d/(mx+mn);
  const h = mx === r ? (g-b)/d + (g<b?6:0) : mx === g ? (b-r)/d + 2 : (r-g)/d + 4;
  return [h/6, s, l];
}
function toRgb([h,s,l]){
  if (!s) return [l*255, l*255, l*255];
  const q = l < .5 ? l*(1+s) : l+s-l*s, p = 2*l-q;
  const f = t => { t = (t+1) % 1;
    return t < 1/6 ? p+(q-p)*6*t : t < .5 ? q : t < 2/3 ? p+(q-p)*(2/3-t)*6 : p; };
  return [f(h+1/3)*255, f(h)*255, f(h-1/3)*255];
}
const deep = (c,dl,ds) => { const [h,s,l] = toHsl(c); return toRgb([h, cl01(s+ds), cl01(l-dl)]); };
const lift = (c,dl,ds) => { const [h,s,l] = toHsl(c); return toRgb([h, cl01(s-ds), cl01(l+dl)]); };

/* A ramp is 36 colours SAMPLED PER VERTEX off the traced artwork, not a set of
   brand colours, so it carries the tracing's noise: saturation swings between
   0.33 and 0.78, and a few samples (#f28d8d at t=0.11, #efa0a0 at t=0.60) are
   washed out relative to both neighbours. At the size a ribbon is drawn on the
   site that noise averages away. Blown up for print it does not — each
   desaturated sample reads as a pale band lying across the tube, which looks
   like a lighting or seam artefact and is neither.

   A [1 2 1] pass pulls a lone outlier back towards its neighbours while
   leaving the ramp's overall journey intact. Off by default: the website has
   shipped with these ramps and its colours are not mine to change. */
export function smoothRamp(stops, passes){
  let c = stops.map(v => Array.isArray(v) ? v.slice() : hx(v));
  for (let p = 0; p < passes; p++){
    const prev = c;
    c = prev.map((v, i) => {
      const a = prev[Math.max(0, i-1)], b = prev[Math.min(prev.length-1, i+1)];
      return [(a[0]+2*v[0]+b[0])/4, (a[1]+2*v[1]+b[1])/4, (a[2]+2*v[2]+b[2])/4];
    });
  }
  return c;
}

const rampAt = (stops, t) => {
  const f = cl01(t) * (stops.length-1), i = Math.min(stops.length-2, Math.floor(f));
  const a = stops[i], b = stops[i+1];
  return lerp(Array.isArray(a) ? a : hx(a), Array.isArray(b) ? b : hx(b), f-i);
};

/* u runs -1..1 ACROSS the tube.
     facing = sqrt(1-u^2)  how squarely that sliver of surface faces us
     thin   = 1 - facing   how little material is there — where light gets through
   Wrapped diffuse gives a soft terminator; the smoothstep puts the range back
   that wrapping alone flattens out. */
export function shadeAt(base, La, u){
  const kx = Math.cos(La), kz = .55, km = Math.hypot(kx,kz), Lx = kx/km, Lz = kz/km;
  const k = TUBE.con;
  const core = deep(base, .08+.30*k, .06+.26*k);
  const rim  = deep(base, .12+.34*k, .08+.28*k);
  const pale = lift(base, .12+.26*k, .10+.16*k);
  const glow = lift(deep(base, -.04, .32), .12, 0);
  const facing = Math.sqrt(Math.max(0, 1-u*u)), thin = 1-facing;
  const nl = u*Lx + facing*Lz, w = TUBE.wrap*.95 + .05;
  const dif = (t => t*t*(3-2*t))(cl01((nl+w)/(1+w)));
  const sss = Math.pow(thin, 1.5) * (.35 + .65*cl01(nl*.5+.5));
  let c = lerp(core, base, dif);
  c = lerp(c, pale, Math.pow(dif, 3.2) * TUBE.sheen * 1.2);
  c = lerp(c, glow, cl01(sss) * TUBE.sss);
  c = lerp(c, rim,  Math.pow(thin, 8) * .55 * k);
  return c;
}
function shade(base, La){
  const out = [];
  for (let i = 0; i < TUBE.stops; i++){
    const o = i/(TUBE.stops-1);
    out.push([o, shadeAt(base, La, o*2-1)]);
  }
  return out;
}

const perp = (a,b) => { const dx = b.x-a.x, dy = b.y-a.y, m = Math.hypot(dx,dy) || 1;
                        return { x: -dy/m, y: dx/m }; };

let uid = 0;

/* Paints a shaded tube for path `d` into `svg`, clearing whatever was there.
   Returns the mask path — animate ITS stroke-dashoffset to reveal the ribbon,
   exactly as you would a flat stroke's.

   widthU is the tube DIAMETER in the svg's own viewBox units, so the caller
   keeps owning the px -> viewBox conversion and must repaint on resize.
   stops  is the model's colour ramp for that stroke.
   La     is the light direction in radians. */
export function paintTube(svg, d, widthU, stops, La){
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  /* smooth ONCE for the whole ribbon, not per segment */
  if (TUBE.smooth > 0) stops = smoothRamp(stops, TUBE.smooth);
  const r = widthU/2, segs = TUBE.segs, id = 'tb' + (uid++);
  const defs = document.createElementNS(NS,'defs');
  svg.appendChild(defs);

  const probe = document.createElementNS(NS,'path');
  probe.setAttribute('d', d);
  svg.appendChild(probe);
  const L = probe.getTotalLength(), pts = [];
  for (let i = 0; i <= segs; i++) pts.push(probe.getPointAtLength(L*i/segs));
  svg.removeChild(probe);

  /* NO MASK. The first version revealed the ribbon by animating the
     stroke-dashoffset of a path inside an SVG <mask>. That is correct and it
     stutters badly: a mask forces the whole masked group — here 72
     gradient-filled quads — to be re-rastered into an offscreen buffer every
     time the mask changes, which is every scroll frame. The per-frame opacity
     write did the same thing a second time.

     The quads are already laid down in order along the path, so the reveal is
     just "show the first N of them". `reveal()` below mutates only the quads
     that crossed the boundary since the last frame — typically none or one —
     and the layer stays composited instead of being rebuilt. */
  const g = document.createElementNS(NS,'g');
  svg.appendChild(g);
  const quads = [], caps = [];

  for (let i = 0; i < segs; i++){
    const a = pts[i], b = pts[i+1];
    const na = perp(pts[Math.max(0,i-1)], b), nb = perp(a, pts[Math.min(segs,i+2)]);
    const mx = (a.x+b.x)/2, my = (a.y+b.y)/2;
    let nx = na.x+nb.x, ny = na.y+nb.y; const nm = Math.hypot(nx,ny) || 1; nx/=nm; ny/=nm;

    const gid = id + 's' + i;
    const gr = document.createElementNS(NS,'linearGradient');
    gr.setAttribute('id', gid);
    gr.setAttribute('gradientUnits','userSpaceOnUse');
    gr.setAttribute('x1', (mx+nx*r).toFixed(2)); gr.setAttribute('y1', (my+ny*r).toFixed(2));
    gr.setAttribute('x2', (mx-nx*r).toFixed(2)); gr.setAttribute('y2', (my-ny*r).toFixed(2));
    for (const [o,c] of shade(rampAt(stops, (i+.5)/segs), La)){
      const st = document.createElementNS(NS,'stop');
      st.setAttribute('offset', o.toFixed(3));
      st.setAttribute('stop-color', rgb(c));
      gr.appendChild(st);
    }
    defs.appendChild(gr);

    const q = document.createElementNS(NS,'path');
    q.setAttribute('d',
      'M' + (a.x+na.x*r).toFixed(2) + ',' + (a.y+na.y*r).toFixed(2) +
      'L' + (b.x+nb.x*r).toFixed(2) + ',' + (b.y+nb.y*r).toFixed(2) +
      'L' + (b.x-nb.x*r).toFixed(2) + ',' + (b.y-nb.y*r).toFixed(2) +
      'L' + (a.x-na.x*r).toFixed(2) + ',' + (a.y-na.y*r).toFixed(2) + 'Z');
    /* inline style, not the fill attribute: page CSS sets `fill:none` on these
       paths, and a stylesheet rule beats a presentation attribute. */
    q.style.fill = 'url(#' + gid + ')';
    q.style.stroke = 'url(#' + gid + ')';
    q.style.strokeWidth = (widthU*0.02).toFixed(2);
    q.style.display = 'none';
    g.appendChild(q);
    quads.push(q);
  }

  /* ---- the ends ---------------------------------------------------------
     These used to be a circle filled with a RADIAL gradient sampled down to
     three stops. Two things were wrong with that: three stops is a visibly
     coarser ramp than the nine the tube next to it uses, and a radial ramp
     does not line up with the linear one running across the last segment —
     so the join showed as a hard edge exactly where the eye expects the
     smoothest part of the shape.

     A round cap is a half-disc whose cross-section shading is IDENTICAL to
     the tube it closes. So the cap now takes the same axis, the same nine
     stops and the same colour as its neighbouring segment, and the join is
     seamless by construction. The silhouette does the rounding; the gradient
     only has to not contradict it. */
  [[pts[0], perp(pts[0], pts[1]), 0], [pts[segs], perp(pts[segs-1], pts[segs]), 1]]
    .forEach(([pt, n, tt], k) => {
      const gid = id + 'c' + k;
      const gr = document.createElementNS(NS,'linearGradient');
      gr.setAttribute('id', gid);
      gr.setAttribute('gradientUnits','userSpaceOnUse');
      gr.setAttribute('x1', (pt.x+n.x*r).toFixed(2)); gr.setAttribute('y1', (pt.y+n.y*r).toFixed(2));
      gr.setAttribute('x2', (pt.x-n.x*r).toFixed(2)); gr.setAttribute('y2', (pt.y-n.y*r).toFixed(2));
      for (const [o,c] of shade(rampAt(stops, tt), La)){
        const st = document.createElementNS(NS,'stop');
        st.setAttribute('offset', o.toFixed(3));
        st.setAttribute('stop-color', rgb(c));
        gr.appendChild(st);
      }
      defs.appendChild(gr);
      const ci = document.createElementNS(NS,'circle');
      ci.setAttribute('cx', pt.x.toFixed(2)); ci.setAttribute('cy', pt.y.toFixed(2));
      /* a hair over the tube radius: a cap exactly r wide leaves a one-pixel
         notch at the join where the quad's straight edge falls inside the arc */
      ci.setAttribute('r', (r*1.01).toFixed(2));
      ci.style.fill = 'url(#' + gid + ')';
      ci.style.display = 'none';
      g.appendChild(ci);
      caps.push(ci);
    });

  /* ---- the moving head ---------------------------------------------------
     Revealing whole quads leaves the leading edge as a straight chord — a
     blunt angled cut, which is exactly what a round-capped ribbon should
     never show. This circle rides the boundary, wearing the gradient of the
     segment it is sitting on, so the growing end is round at every frame.

     It is also what makes the reveal look CONTINUOUS. Quads can only appear
     one at a time, but the head is placed at the exact fractional point along
     the spine, and it is wider than one segment is long, so it covers the gap
     between the last whole quad and the true tip. The stepping disappears
     behind it. */
  const head = document.createElementNS(NS,'circle');
  head.setAttribute('r', (r*1.01).toFixed(2));
  head.style.display = 'none';
  g.appendChild(head);

  /* length of the spine, for the caller's existing easing maths */
  let len = 0;
  for (let i = 0; i < segs; i++) len += Math.hypot(pts[i+1].x-pts[i].x, pts[i+1].y-pts[i].y);

  let shown = -1, dirNow = 1;
  /* frac 0..1 along the ribbon; dir -1 reveals from the far end */
  function reveal(frac, dir){
    const k = frac < 0 ? 0 : frac > 1 ? 1 : frac;
    const exact = k * segs;
    const want = Math.floor(exact);
    if (dir !== dirNow){
      for (const q of quads) q.style.display = 'none';
      shown = 0; dirNow = dir;
    }
    if (want !== shown){
      const at = i => dir < 0 ? quads[segs-1-i] : quads[i];
      if (want > shown) for (let i = Math.max(0, shown); i < want; i++) at(i).style.display = '';
      else              for (let i = want; i < shown; i++) at(i).style.display = 'none';
      shown = want;
    }
    const root = dir < 0 ? caps[1] : caps[0], far = dir < 0 ? caps[0] : caps[1];
    root.style.display = k > 0 ? '' : 'none';
    far.style.display  = k >= 1 ? '' : 'none';

    /* the round leading edge, at the exact point along the spine */
    if (k <= 0 || k >= 1){ head.style.display = 'none'; return; }
    const i = Math.min(segs-1, want), t = exact - want;
    const a = dir < 0 ? pts[segs-i] : pts[i];
    const b = dir < 0 ? pts[segs-i-1] : pts[i+1];
    head.setAttribute('cx', (a.x + (b.x-a.x)*t).toFixed(2));
    head.setAttribute('cy', (a.y + (b.y-a.y)*t).toFixed(2));
    head.style.fill = 'url(#' + id + 's' + i + ')';
    head.style.display = '';
  }
  return { len, reveal, nodes: g.childElementCount };
}


/* ============================================================================
   THE CHEAP VERSION — concentric bands instead of segments.

   paintTube above cuts the ribbon ACROSS into `segs` quads so every one can
   carry its own gradient. That is geometrically exact and it costs ~800 DOM
   nodes a ribbon, plus a mask, which is the part that has to be re-rastered
   whenever the reveal moves during a scroll.

   This does the same job with a stack of full-length strokes on the SAME path,
   each a little narrower than the last and each nudged toward the light. The
   narrower ones sit inside the wider ones, so what you see is a set of bands
   running from the shadow edge to the lit edge — which IS a cross-section
   ramp, and it follows the curve exactly, for free, because every band is the
   real path.

   Why the fixed screen-space nudge is not a cheat: on a tube lit by a
   directional light, the lit side is always the side facing the light in
   SCREEN space, whatever direction the tube happens to be running. So
   offsetting the inner bands by a constant vector is what a directional light
   actually does, not an approximation of it.

   Each band still carries the 36-stop model ramp along its length, sampled at
   that band's depth, so colour travels in both directions exactly as in the
   segmented version.

   COST: BANDS * (1 path + 1 gradient + `along` stops) — about 85 nodes a
   ribbon at the defaults, roughly a tenth of the segmented version, and NO
   mask. What it cannot do is vary the shading along the ribbon's length
   independently of the ramp, or put a highlight that tightens into a curve.
   ========================================================================= */
/* bands is the dial that matters. Each band is a SOLID-edged stroke, so the
   step between one band's colour and the next is a hard edge — at 7 bands
   that stepping is plainly visible on a thick ribbon. 16 puts each step below
   what the eye resolves, and still lands at roughly a quarter of the
   segmented version's node count with no mask. `along` is the length ramp and
   12 is already smooth, because the gradient interpolates between the stops. */
export const STACK = { bands: 16, along: 12, offset: .58, taper: .94 };

/* Returns every band, outermost first. Animate stroke-dashoffset on all of
   them together to reveal the ribbon. */
export function paintStack(svg, d, widthU, stops, La){
  if (TUBE.smooth > 0) stops = smoothRamp(stops, TUBE.smooth);
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const defs = document.createElementNS(NS,'defs');
  svg.appendChild(defs);
  const id = 'st' + (uid++);
  const B = STACK.bands, r = widthU/2;
  /* screen direction toward the light; +y is down in SVG */
  const dx = Math.cos(La), dy = -Math.sin(La);
  const out = [];

  for (let k = 0; k < B; k++){
    const f = k/(B-1);                               // 0 outermost .. 1 innermost
    const w = widthU * (1 - STACK.taper*k/B);
    /* the visible annulus of band k sits at this depth across the tube:
       outermost band shows on the shadow edge, innermost carries the sheen */
    const u = -1 + 2*(k + .5)/B;
    const gid = id + 'b' + k;
    const g = document.createElementNS(NS,'linearGradient');
    g.setAttribute('id', gid);
    g.setAttribute('gradientUnits','objectBoundingBox');
    g.setAttribute('x1','0'); g.setAttribute('y1','0');
    g.setAttribute('x2','1'); g.setAttribute('y2','1');
    for (let i = 0; i < STACK.along; i++){
      const t = i/(STACK.along-1);
      const st = document.createElementNS(NS,'stop');
      st.setAttribute('offset', (t*100).toFixed(1) + '%');
      st.setAttribute('stop-color', rgb(shadeAt(rampAt(stops, t), La, u)));
      g.appendChild(st);
    }
    defs.appendChild(g);

    const p = document.createElementNS(NS,'path');
    p.setAttribute('d', d);
    p.setAttribute('stroke', 'url(#' + gid + ')');
    p.setAttribute('stroke-width', w.toFixed(2));
    p.setAttribute('stroke-linecap','round');
    p.setAttribute('stroke-linejoin','round');
    p.style.fill = 'none';
    if (k > 0){
      const o = STACK.offset * r * f;
      p.setAttribute('transform', 'translate(' + (dx*o).toFixed(2) + ',' + (dy*o).toFixed(2) + ')');
    }
    svg.appendChild(p);
    out.push(p);
  }
  return out;
}
