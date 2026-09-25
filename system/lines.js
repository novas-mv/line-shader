/* ============================================================================
   section line sets

   Dynamic ribbon shapes as graphic elements: the same family of long, round-
   capped, generously curved strokes the landing page uses, but a CHEAP version
   — hand-authored beziers instead of the 23KB traced model spines, flat brand
   hues instead of 36-stop model gradients, and a LIBRARY of distinct shapes so
   no section repeats another section's line.

   Three earlier attempts were each wrong differently:
     1. generic beziers at 2.4px / .5 opacity — faint wallpaper, not graphics.
     2. the real traced spines with full model gradients — right weight, but
        576 gradient nodes per page and far more machinery than a subpage needs.
     3. the traced spines flattened — cheap enough, but only four shapes, so
        every section drew the same line again.
   This is the synthesis: many shapes, flat colour, big and confident.

   Construction follows ILLUSTRATION.md: round caps and joins, generous radii,
   open ends that bleed off the frame, no sharp corners, and the over-under
   weave via a casing painted in the page ground.

   Usage: `data-lines` on any section. Optional `data-lines="3"` pins a set.

   MOTION (DESIGN-SYSTEM.md 6): one hero stroke leads, the rest answer near-
   unison, expo-out because the value is SCRUBBED by scroll, complete by ~60%
   of the window then holds, plus a slow parallax drift.

   PERF: one shared rAF, transform + stroke-dashoffset only, off-screen
   sections culled, loop stops when scrolling settles and on visibilitychange.
   ============================================================================ */
(() => {
  const VBW = 1000, VBH = 800, VB = '0 0 ' + VBW + ' ' + VBH;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;


  /* ---- the shape library -------------------------------------------------
     Long single gestures on a 1000x800 box. Each starts and ends outside the
     box so it bleeds rather than terminating in view. */
  const SHAPES = {
    sweepA: 'M-60,620 C180,620 300,140 560,140 S900,420 1060,300',
    sweepB: 'M-60,240 C200,240 340,680 620,680 S940,380 1060,470',
    sweepC: 'M-60,460 C220,460 380,120 660,180 S960,560 1060,420',
    hookA:  'M120,-60 C120,220 420,300 420,560 S180,820 260,880',
    hookB:  'M880,-60 C880,200 560,290 560,540 S820,800 740,880',
    loopA:  'M200,740 C200,420 420,300 620,380 S760,640 600,700 S380,600 470,420',
    loopB:  'M820,60 C820,400 600,520 400,440 S260,180 420,120 S640,220 550,400',
    archA:  'M-80,540 C260,160 740,160 1080,540',
    archB:  'M-80,280 C260,660 740,660 1080,280',
    riseA:  'M420,-60 C420,180 180,260 180,440 S420,660 420,880',
    riseB:  'M580,-60 C580,180 820,260 820,440 S580,660 580,880',
    crestA: 'M-60,700 C240,700 300,240 520,260 S640,520 860,420 S1000,180 1060,240',
    crestB: 'M-60,180 C240,180 320,600 540,600 S660,340 880,440 S1010,700 1060,640',
    coilA:  'M300,780 C140,560 220,320 440,300 S700,420 640,600 S420,660 430,500',
    coilB:  'M700,40 C860,280 780,520 560,540 S300,420 360,240 S580,180 570,320',
    driftA: 'M-60,120 C300,120 420,520 760,520 S1000,300 1060,360',
  };

  /* ---- layouts ----------------------------------------------------------
     [shape, hue, sizeVW, xPct, yPct, rotDeg, strokePx, alpha, parallax]
     Stroke weights are the approved BOLD set (hero ~58px rendered at 1440) —
     the ribbons read as tubes, matching how the element is shown in the brand
     guideline, rather than as drawn lines.
     Rank 0 is the hero of the set. Sizes stay <=96vw ON PURPOSE: anything
     wider makes the document wider than the screen, which then needs an
     overflow clip somewhere, and every place to put that clip either chops the
     ribbons at a section seam or kills vertical scrolling. The paths already
     run from -60 to 1060 inside their own 1000-unit viewBox, so they still
     bleed off their box without overflowing the page.
     No shape repeats inside a set, and no two sets share a hero shape — that
     repetition is exactly what read as "the same line over and over". */
  /* [shape, hue, sizeVW, side, yPct, rotDeg, strokePx, alpha, parallax]

     COMPLETE FORMS, NOT CROPPED ONES. These used to be enormous ribbons
     anchored in a gutter with most of the shape off-frame, so what you saw was
     a fragment chopped by the viewport edge — an abrupt ending into a bleed,
     which reads as a mistake rather than as a graphic. A ribbon that leaves
     the frame has to be going somewhere; one that just stops has not earned
     the crop.

     So the whole form is now on the page. Only four shapes in the library are
     self-contained — loopA, loopB, coilA, coilB. The rest (sweeps, arches,
     rises, crests, drift, and the hooks) are authored to bleed: their paths
     run past the viewBox on purpose, which is right for a band that spans a
     hero and wrong for a deliberate object. They stay in the library, unused
     here.

     Placement is computed from each shape's own INK bounds rather than from
     its box, so the drawn form sits EDGE% from the page edge whatever its
     size — the box is mostly empty space and anchoring by it put the ink in a
     different place for every shape.

     These sit BEHIND the content (.lineset is z-index 0, everything else 1),
     so they can pass under copy without blocking it. */
  /* ONE OPACITY for every ribbon, not a ramp by rank. These used to run
     .40 / .22 / .16, which greyed the colour and muted the shading the tube
     surface exists to show — and an alpha ramp is not hierarchy anyway, the
     three rungs already do that. Full strength then proved too loud against
     the copy. So a single value, sitting back a little from the ground.
     ?lines=a:N sets it live, 0 to 1. */
  const ALPHA = (() => {
    const m = /[?&]lines=a:(\d*\.?\d+)/.exec(location.search);
    return m ? Math.min(1, Math.max(0, parseFloat(m[1]))) : 0.65;
  })();

  const LAYOUTS = [
    /* [shape, hue, sizeVW, preferredSide, strokePx, parallax]

       SIX PER BAND, one of each family and then two more accents spread down
       the gutters. Families first — SWEEP crossing the frame, RUNNER bleeding
       top and bottom down a margin, CURL complete and hand-drawn, SPINE the
       traced model stroke — then a smaller runner and curl to carry the rest
       of the margin. Never the same geometry twice in a band.

       No yPct and no fixed x: the solver above takes the first slot that does
       not pile onto what is already down. Elements DO run over the copy by
       design, up to 10% of the smaller shape; they sit behind it (.lineset is
       z-index 0) so the text always wins.

       This is the rule for every page that uses this file — which is all of
       them except home, whose ribbons are drawn by its own renderer. */
    [['sweepA',    'coral',  124, 'R', 68,  0.50],
     ['riseA',     'violet',  40, 'L', 56,  0.34],
     ['coilB',     'cyan',    32, 'R', 44,  0.28],
     ['el-green',  'green',   30, 'L', 44,  0.42],
     ['hookB',     'coral',   26, 'R', 44,  0.22],
     ['loopA',     'violet',  24, 'L', 44,  0.18]],

    [['archA',     'cyan',   128, 'L', 68, -0.50],
     ['hookB',     'green',   40, 'R', 56, -0.34],
     ['loopA',     'coral',   32, 'L', 44, -0.28],
     ['el-violet', 'violet',  30, 'R', 44, -0.42],
     ['riseB',     'cyan',    26, 'L', 44, -0.22],
     ['coilA',     'green',   24, 'R', 44, -0.18]],

    [['driftA',    'violet', 120, 'R', 68,  0.53],
     ['riseB',     'coral',   40, 'L', 56,  0.34],
     ['coilA',     'green',   32, 'R', 44,  0.28],
     ['el-cyan',   'cyan',    30, 'L', 44,  0.40],
     ['hookA',     'violet',  26, 'R', 44,  0.22],
     ['loopB',     'coral',   24, 'L', 44,  0.18]],

    [['crestB',    'green',  126, 'L', 68, -0.50],
     ['hookA',     'cyan',    40, 'R', 56, -0.34],
     ['loopB',     'violet',  32, 'L', 44, -0.28],
     ['el-coral',  'coral',   30, 'R', 44, -0.41],
     ['riseA',     'green',   26, 'L', 44, -0.22],
     ['coilB',     'cyan',    24, 'R', 44, -0.18]],

    [['sweepC',    'cyan',   122, 'R', 68,  0.47],
     ['riseA',     'green',   40, 'L', 56,  0.34],
     ['coilB',     'coral',   32, 'R', 44,  0.28],
     ['el-violet', 'violet',  30, 'L', 44,  0.39],
     ['hookB',     'cyan',    26, 'R', 44,  0.22],
     ['loopA',     'green',   24, 'L', 44,  0.18]],

    [['archB',     'coral',  128, 'L', 68, -0.49],
     ['hookB',     'violet',  40, 'R', 56, -0.34],
     ['loopA',     'cyan',    32, 'L', 44, -0.28],
     ['el-green',  'green',   30, 'R', 44, -0.40],
     ['riseB',     'coral',   26, 'L', 44, -0.22],
     ['coilA',     'violet',  24, 'R', 44, -0.18]],
  ];
;
;
;
;
;
;
;

  /* THE SHAPE POOL. Four of these are the REAL traced model spines, the same
     ones the homepage draws — each a genuinely different curl of the element,
     each with its own 36-stop ramp. Four more are the self-contained curls
     from the library above. Eight shapes, so a set of three can be built
     without the page reading as one gesture repeated, which is exactly what
     four near-identical hand curls looked like.

     The model spines carry their OWN colour, as on the homepage. The element
     is four hues; tinting a traced coral spine with a section's green accent
     throws away the ramp that makes it read as the element at all. The hand
     curls have no ramp of their own and still take the section accent. */
  let POOL = null, ST_RAMPS = null;
  function inkOf(d){
    const n = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
    const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
    return [Math.min.apply(null, xs), Math.max.apply(null, xs),
            Math.min.apply(null, ys), Math.max.apply(null, ys)];
  }
  const HAND = ['loopA','loopB','coilA','coilB'];
  function buildPool(ST){
    const P = {};
    if (ST) for (const k of ['coral','green','violet','cyan']){
      const S = ST[k];
      if (S && S.d) P['el-' + k] = { d:S.d, vb:ST._viewBox, stops:S.colors, ink:inkOf(S.d) };
    }
    for (const k of HAND) P[k] = { d:SHAPES[k], vb:VB, stops:null, ink:inkOf(SHAPES[k]) };
    /* THE FREEHAND SWEEPS, back in. These run their paths past the viewBox on
       purpose, and that is the point: a stroke that enters one edge and leaves
       by another reads as passing THROUGH the frame. The earlier complaint was
       not about bleeding, it was about fragments — a curl chopped mid-loop,
       which has not earned its crop. A sweep crossing the whole section has.
       They are placed centred and oversized so both ends are well off-frame;
       never anchored to a gutter, which is what turns a crossing back into a
       fragment. */
    for (const k of ['sweepA','sweepB','sweepC','archA','archB','driftA','crestA','crestB'])
      P[k] = { d:SHAPES[k], vb:VB, stops:null, ink:null, cross:true };
    /* GUTTER RUNNERS. hookA/B and riseA/B bleed off the TOP and BOTTOM, not
       the sides — their paths run y -60..880 in a 0..800 box. Anchored to an
       edge they run down the gutter and out of the band at both ends, which
       is how the homepage gets graphic interest into a shallow strip: the
       band does not have to be tall enough to contain them, because they were
       never meant to be contained. This is what a short section should draw
       instead of one lonely complete form in a corner. */
    for (const k of ['hookA','hookB','riseA','riseB'])
      P[k] = { d:SHAPES[k], vb:VB, stops:null, ink:inkOf(SHAPES[k]), gutter:true };
    return P;
  }

  /* how far the drawn form sits from the page edge, % of viewport width */
  const EDGE = (() => {
    const m = /[?&]lines=in:(-?\d+(?:\.\d+)?)/.exec(location.search);
    return m ? Math.min(40, Math.max(-10, parseFloat(m[1]))) : 3;
  })();
;

  /* How far the ribbon's BOX reaches into the page, as % of viewport width.
     Note it is the box, not the ink: these shapes do not fill their own
     viewBox, so at 38 the painted ribbon reads as roughly a tenth of the page,
     which is the intent. Tune by eye with ?lines=in:N — at 28 the curl falls
     off the edge and you get a faint sliver; past 45 it walks into the copy. */
  const GUTTER_IN = (() => {
    const m = /[?&]lines=in:(\d+(?:\.\d+)?)/.exec(location.search);
    return m ? Math.min(60, Math.max(2, parseFloat(m[1]))) : 38;
  })();
  /* the box is centred, so anchoring its INNER edge at GUTTER_IN puts the rest
     of the ribbon off-frame and lets the curl crop against the gutter */
  /* The intrusion takes the same responsive step the weight does. 38% of a
     1440 desktop is a gutter; 38% of a 370 phone is a third of the screen, and
     the ribbon walks straight through the copy. One lever, already decided —
     --rung-scale — rather than a second breakpoint of its own. */
  /* ---- PLACEMENT IS SOLVED, NOT DECLARED --------------------------------
     Fixed xPct/yPct kept producing the same two failures: shapes stacked on
     one edge, and whole areas of a band left empty. Both come from placing by
     hand against a band whose height is not known until it renders.

     So each element is given a ladder of candidate positions and takes the
     first that does not collide with what is already down. Collision is
     measured on the shapes' real INK boxes — the drawn extent, not the mostly
     empty viewBox — and a little overlap is allowed on purpose: 10% of the
     smaller shape, which is the difference between a composition and a pile.
     If nothing clears, the element is dropped rather than stacked. */
  /* More rungs than there are elements, so a band can spread them sparsely
     down a gutter instead of clustering at the few positions on offer. */
  const Y_SLOTS = [8, 22, 36, 50, 64, 78, 92];
  const X_SLOTS = { L:['L'], R:['R'], any:['L','R'] };

  function boxOf(SH, sizeVW, xPct, yPct, bandW, bandH){
    const vb = SH.vb.split(/[ ,]+/).map(Number);
    const vbW = vb[2], vbH = vb[3];
    const w = sizeVW/100 * innerWidth, h = w * vbH/vbW;
    const cx = xPct/100 * bandW, cy = yPct/100 * bandH;
    const ink = SH.ink || [0, vbW, 0, vbH];
    return { x0: cx - w/2 + ink[0]/vbW*w, x1: cx - w/2 + ink[1]/vbW*w,
             y0: cy - h/2 + ink[2]/vbH*h, y1: cy - h/2 + ink[3]/vbH*h };
  }
  function clash(a, b){
    const ox = Math.min(a.x1,b.x1) - Math.max(a.x0,b.x0);
    const oy = Math.min(a.y1,b.y1) - Math.max(a.y0,b.y0);
    if (ox <= 0 || oy <= 0) return 0;
    const inter = ox*oy;
    const small = Math.min((a.x1-a.x0)*(a.y1-a.y0), (b.x1-b.x0)*(b.y1-b.y0));
    return small > 0 ? inter/small : 0;
  }
  const xFor = (shape, side, sizeVW, gap) => {
    const SH = POOL[shape];
    if (SH && SH.cross) return side === 'L' ? 42 : 58;
    const ink = (SH && SH.ink) || [0,1000];
    const vbW = SH ? +SH.vb.split(/[ ,]+/)[2] : 1000;
    const fL = ink[0]/vbW, fR = ink[1]/vbW;
    const edge = (innerWidth < 640 && !gap) ? EDGE - sizeVW*0.34 : EDGE;
    return side === 'L' ? edge - fL*sizeVW + sizeVW/2
                        : 100 - edge - fR*sizeVW + sizeVW/2;
  };


;

  const clamp = (v,a,b) => (v<a?a:v>b?b:v);
  /* expo-out: moves with the scroll immediately, decelerates into place.
     Ease-in-out stalls at both ends while the finger moves linearly. */
  /* Was 2^-9t over a 0.34 window: 59% of the stroke drawn in the first tenth
     of the travel, which is what read as abrupt — the line snapped in rather
     than being drawn. Gentler exponent over a window twice as long, so the
     gesture actually has time to happen. */
  const expoOut = t => (t >= 1 ? 1 : 1 - Math.pow(2, -4.2*t));
  const win = r => (r === 0 ? [0,0.58] : [0.26+(r-1)*0.05, 0.86+(r-1)*0.04]);

  /* Reads --rung-scale (system/tokens.css), the one definition of the ladder's
     responsive step: below 640 every rung goes to 0.6 of itself, because a
     rank-0 rung is 4.7% of a 1440 desktop and 18.4% of a 370 phone. A token
     rather than a constant here because this file is a classic script on the
     seventeen subpages and cannot import what the two module call sites use.
     Falls back to 1 — full weight — if the token is missing. */
  const rungScale = () =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rung-scale')) || 1;

  /* on-screen px -> viewBox units, so a ribbon stays a ribbon at any viewport */
  const widthUnits = (sizeVW, targetPx) =>
    (targetPx * rungScale() * VBW / Math.max(1,(sizeVW/100)*innerWidth)).toFixed(2);

  const NS = 'http://www.w3.org/2000/svg';
  const drawables = [];
  let cycle = 0;

  /* ---- THE SHADED SURFACE ------------------------------------------------
     These ribbons are the brand element, so they get the same tube surface the
     homepage bands do (ILLUSTRATION.md, Tier 1.5) rather than a flat stroke.

     paintStack, not paintTube: concentric full-length strokes rather than 72
     per-ribbon segments. ~226 DOM nodes a ribbon against ~820, no <mask>, and
     the same look family. Across 42 ribbons that is the difference between
     ~9,500 nodes and ~34,000 on pages that also render a 150-row directory.
     ?lines=seg forces the segmented renderer if the difference ever matters.

     tube.js is a MODULE and this file is a classic script, so it arrives by
     dynamic import. The URL is resolved against this script's own src, because
     a document-relative path would break on pages at different depths. If the
     import fails for any reason the flat stroke is drawn instead — the same
     reason --rung-scale lives in a CSS token: a missing piece should degrade,
     never blank the page. A cached tube.js without an expected export has
     taken every ribbon on this site down once already. */
  const SCRIPT_SRC = (document.currentScript && document.currentScript.src) || '';
  const SEGMENTED = /[?&]lines=seg\b/.test(location.search);
  /* ?lines=flat pins the old flat stroke, so the surface can be judged as a
     before/after on the same page rather than from memory. */
  const FLAT = /[?&]lines=flat\b/.test(location.search);

  /* A ramp from the section's own accent. The homepage passes the model's
     36-stop ramps; here the colour is a CSS custom property, so three stops
     are synthesised around it — enough for the shading to read as a tube, and
     it keeps this file independent of the element's spine data. */
  const hx = h => [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
  const hex = c => '#' + c.map(v => Math.round(v<0?0:v>255?255:v).toString(16).padStart(2,'0')).join('');
  function hsl(c){
    let [r,g,b]=c.map(v=>v/255);
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b), l=(mx+mn)/2;
    if (mx===mn) return [0,0,l];
    const dd=mx-mn, sa = l>.5 ? dd/(2-mx-mn) : dd/(mx+mn);
    const h = mx===r ? (g-b)/dd+(g<b?6:0) : mx===g ? (b-r)/dd+2 : (r-g)/dd+4;
    return [h/6,sa,l];
  }
  function rgbOf([h,s,l]){
    if (!s) return [l*255,l*255,l*255];
    const q = l<.5 ? l*(1+s) : l+s-l*s, pp = 2*l-q;
    const f = t => { t=(t+1)%1;
      return t<1/6 ? pp+(q-pp)*6*t : t<.5 ? q : t<2/3 ? pp+(q-pp)*(2/3-t)*6 : pp; };
    return [f(h+1/3)*255, f(h)*255, f(h-1/3)*255];
  }
  const cl01 = v => v<0?0:v>1?1:v;
  /* A named BRAND hue, never the section accent. On a page with no data-zone
     --accent falls back to --cream, and a cream ribbon put through the shading
     model comes out tan — a colour that is in no part of this brand. The four
     hues are the element's own; a ribbon is one of them or it is nothing. */
  let ROOT_CS = null;
  function rampFor(hue){
    ROOT_CS = ROOT_CS || getComputedStyle(document.documentElement);
    const v = ROOT_CS.getPropertyValue('--' + hue).trim();
    const base = /^#[0-9a-f]{6}$/i.test(v) ? hx(v) : [255,138,102];
    const [h,sa,l] = hsl(base);
    return [ hex(rgbOf([h, cl01(sa-.10), cl01(l+.10)])),
             hex(base),
             hex(rgbOf([h, cl01(sa+.12), cl01(l-.12)])) ];
  }

  let TUBE = null;

  function start(){
    document.querySelectorAll('[data-lines]').forEach(sec => {
      const pin = parseInt(sec.dataset.lines, 10);
      const set = LAYOUTS[Number.isFinite(pin) ? pin % LAYOUTS.length
                                               : cycle++ % LAYOUTS.length];
      /* a band that exists only to carry the art, rather than content it has to
       keep clear of */
    const isGap = sec.classList.contains('zgap');
    /* A CROSSING NEEDS ROOM. It spans 120vw+, so on a short band — a pagehead
       is typically one headline and a standfirst — there is no y at all that
       keeps it out of the copy: it crosses the whole section by definition.
       Below this height the set drops its crossing and draws the two forms
       only, which is what a small section can carry without being blocked.
       Measured once here, not per frame. */
    const roomy = isGap || sec.getBoundingClientRect().height >= 620;
    /* ONE ELEMENT PER GUTTER. Twice now two shapes anchored to the same edge
       have landed on top of each other with the rest of the band empty, and
       twice the instinct was to separate them by yPct. That cannot work: a
       gutter element is 30-40vw, which at 1440 is 430-580px across, while the
       band it sits in may be 469px tall. No y separates two shapes each larger
       than the space between them.
       So the rule is structural instead: an edge is taken or it is free. A
       later entry wanting a taken edge is dropped. A zgap is exempt — it has
       no copy to work around, so a stack there is a composition. */
    /* HOW MANY, AND WHERE, DEPENDS ON WHAT THE BAND IS FOR.
       A title section is one headline and a standfirst and nothing else; six
       ribbons around it is not decoration, it is interference. It gets a
       short right-hand column only — the copy is ranged left, so the right is
       the side that can carry anything at all.
       A content band already has cards, rules and copy competing; three is
       the most it can take before the page reads as noise.
       A zgap has nothing in it but the art, so it gets the most. */
    const isHead = sec.classList.contains('pagehead');
    const BUDGET = isGap ? 5 : isHead ? 2 : 3;
    const placed = [];                         // ink boxes already down in this band
    /* Counted separately from `placed`, because a crossing reserves no space
       but is absolutely part of how busy a band looks — leaving it out of the
       budget let a zgap draw six when its budget was five. */
    let drawn = 0;
    const bandW = sec.getBoundingClientRect().width;
    const bandH = Math.max(1, sec.getBoundingClientRect().height);
    const host = document.createElement('div');
      host.className = 'lineset';
      host.setAttribute('aria-hidden','true');
      sec.prepend(host);

      set.forEach((spec, i) => {
        const shape = spec[0], hue = spec[1], sizeVW = spec[2];
        const strokePx = spec[4], par = spec[5], alpha = ALPHA;
        const SH = POOL[shape];
        if (!SH) return;
        /* A CROSSING ONLY GOES WHERE THERE IS NOTHING TO CROSS. Height was the
           wrong test: the news card grid is tall and completely full, and a
           sweep through it runs over three cards and three headlines at once.
           That is the busyness — not the count, the fact that a 120vw stroke
           was laid across content at all. Crossings are now confined to the
           zgap, the one band that exists to hold art and holds nothing else.
           Every other band gets margin work only: runners and curls down the
           gutters, which pass beside content rather than through it. */
        if (SH.cross && !isGap) return;

        /* take the first slot that does not pile onto what is already down */
        let xPct = null, yPct = null;
        if (drawn >= BUDGET) return;                // this band has had enough
        const sides = SH.cross ? [spec[3]]
                    : isHead   ? ['R']                  // title copy owns the left
                    : isGap    ? X_SLOTS.any
                    : X_SLOTS[spec[3]].concat(spec[3]==='L'?'R':'L');
        outer:
        for (const sd of sides){
          const x = xFor(shape, sd, sizeVW, isGap);
          for (const y of Y_SLOTS){
            const b = boxOf(SH, sizeVW, x, y, bandW, bandH);
            let worst = 0;
            for (const q of placed) worst = Math.max(worst, clash(b, q));
            if (worst <= 0.10){
              xPct = x; yPct = y;
              /* A CROSSING IS NOT AN OBSTACLE. It spans the band by design, so
                 registering its ink box as occupied marks the whole band taken
                 and every later element is refused — which is how a zone band
                 ended up drawing one shape. A sweep passing behind a curl is
                 the composition, not a collision; only the compact shapes
                 reserve space from each other. */
              if (!SH.cross) placed.push(b);
              drawn++;
              break outer;
            }
          }
        }
        if (xPct === null) return;                 // nowhere it would not pile
        const rot = (par > 0 ? 1 : -1) * (6 + (placed.length * 4) % 14);

        const d = SH.d;
        if (!d) return;

        const svg = document.createElementNS(NS,'svg');
        svg.setAttribute('viewBox', SH.vb);
        svg.setAttribute('preserveAspectRatio','xMidYMid meet');
        svg.setAttribute('aria-hidden','true');
        svg.style.width = sizeVW + 'vw';
        svg.style.left = xPct + '%';
        svg.style.top = yPct + '%';
        svg.style.opacity = alpha;
        svg.style.transform = 'translate(-50%,-50%) rotate(' + rot + 'deg)';

        /* WEAVE OFF by default. The casing is a navy path 1.55x the stroke width
           painted underneath, so a later ribbon masks an earlier one where they
           cross — over-and-under rather than stacked. At thin weights it is
           invisible machinery; at bold weights it reads as a dark outline around
           every ribbon, which is not what the brand's tubes look like.
           Re-enable per section with data-lines-weave="on". */
        const w = widthUnits(sizeVW, strokePx);
        let casing = null;
        if (sec.dataset.linesWeave === 'on'){
          casing = document.createElementNS(NS,'path');
          casing.setAttribute('d', d);
          casing.setAttribute('class','casing');
          casing.setAttribute('stroke-width', (parseFloat(w)*1.55).toFixed(2));
          svg.appendChild(casing);
        }

        if (TUBE && !FLAT){
          /* the model spines bring their own 36-stop ramp; the hand curls
             take the section's accent */
          /* the traced spines carry their own 36-stop ramp; everything else
             takes the named brand hue's, or a synthesised one if strokes.js
             never arrived */
          const stops = SH.stops || (ST_RAMPS && ST_RAMPS[hue]) || rampFor(hue);
          const La = (150 - rot) * Math.PI / 180;   // one light, held as each svg rotates
          const bands = (SEGMENTED ? null : TUBE.paintStack(svg, d, parseFloat(w), stops, La));
          let first, extra, len;
          if (bands){ first = bands[0]; extra = bands.slice(1); len = first.getTotalLength(); }
          else { const t = TUBE.paintTube(svg, d, parseFloat(w), stops, La);
                 first = null; extra = null; len = t.len; var seg = t; }
          host.appendChild(svg);
          for (const b of [first, ...(extra||[])].filter(Boolean)){
            b.style.strokeDasharray = len;
            b.style.strokeDashoffset = reduce ? 0 : len;
          }
          if (seg && reduce) seg.reveal(1, 1);
          drawables.push({ svg:svg, p:first, extra:extra, seg:seg||null, casing:null,
                           len:len, sec:sec, stops:stops, La:La,
                           sizeVW:sizeVW, strokePx:strokePx, rot:rot, par:par, d:d,
                           w:win(i), dir: i>0 && i%2===0 ? -1 : 1 });
          return;
        }

        const p = document.createElementNS(NS,'path');
        p.setAttribute('d', d);
        /* Tied to the SECTION's accent, not a per-stroke hue. The homepage mixes
           all four in one band because the element is the subject there; on a
           subpage the band already means one zone, so a green ribbon in the
           Market band just contradicts the heading. Variety comes from rank
           (weight + alpha), not from hue. `hue` is kept in the layout table for
           the few places that want an explicit cross-zone stroke. */
        p.setAttribute('stroke', sec.dataset.linesHue === 'mixed'
          ? 'var(--' + hue + ')' : 'var(--accent)');
        p.setAttribute('stroke-width', w);
        svg.appendChild(p);
        host.appendChild(svg);

        const len = p.getTotalLength();
        [p, casing].filter(Boolean).forEach(el => {
          el.style.strokeDasharray = len;
          el.style.strokeDashoffset = reduce ? 0 : len;
        });

        drawables.push({ svg:svg, p:p, casing:casing, len:len, sec:sec,
                         sizeVW:sizeVW, strokePx:strokePx, rot:rot, par:par,
                         w:win(i), dir: i>0 && i%2===0 ? -1 : 1 });
      });
    });

    /* ---- DRAW ONCE ON ENTRY, THEN STOP -------------------------------
       This used to be a scroll-scrubbed rig: a rAF loop that ran for as long
       as you kept scrolling and, every frame, read a bounding rect per ribbon
       and wrote a transform and a reveal. On a page carrying twenty-five of
       them that is real work on every frame of every scroll, forever, for a
       decoration.

       They do not need to track the finger. They need to arrive once. Each
       band now draws itself on its own clock the first time it comes into
       view — about 1.2s, ranked so the heavy stroke leads — and is then
       finished: the loop ends, the observer stops watching that band, and
       scrolling past it afterwards costs nothing. There is no scroll listener.

       Given up with it: the parallax drift, which only ever existed because a
       per-frame loop was already running. The resting transform is written
       once, here. */
    for (const d of drawables){
      d.svg.style.transform = 'translate(-50%,-50%) rotate(' + d.rot + 'deg)';
      setReveal(d, reduce ? 1 : 0);
    }

    function setReveal(d, e){
      if (d.seg){ d.seg.reveal(e, d.dir); return; }
      const off = ((d.dir<0?-1:1) * d.len * (1-e)).toFixed(1);
      d.p.style.strokeDashoffset = off;
      if (d.extra) for (let j=0;j<d.extra.length;j++) d.extra[j].style.strokeDashoffset = off;
      if (d.casing) d.casing.style.strokeDashoffset = off;
    }

    if (drawables.length && !reduce){
      const DUR = 1200, STAGGER = 160;
      const byBand = new Map();
      for (const d of drawables){
        if (!byBand.has(d.sec)) byBand.set(d.sec, []);
        byBand.get(d.sec).push(d);
      }
      const io = new IntersectionObserver(es => {
        for (const en of es){
          if (!en.isIntersecting) continue;
          io.unobserve(en.target);                     // once only
          const set = byBand.get(en.target);
          if (!set) continue;
          const t0 = performance.now();
          (function step(now){
            let done = true;
            for (let k=0;k<set.length;k++){
              const d = set[k];
              const e = expoOut(clamp((now - t0 - k*STAGGER) / DUR, 0, 1));
              setReveal(d, e);
              if (e < 1) done = false;
            }
            if (done) return;                          // finished: the loop ENDS
            requestAnimationFrame(step);
          })(performance.now());
        }
      }, { rootMargin: '0px 0px -10% 0px', threshold: 0 });
      for (const sec of byBand.keys()) io.observe(sec);

      /* radius is in viewBox units, so a resize rebuilds the geometry — on
         resize only, never per frame */
      addEventListener('resize', () => {
        for (let k=0;k<drawables.length;k++){
          const d = drawables[k];
          const w = widthUnits(d.sizeVW, d.strokePx);
          if (TUBE && (d.p || d.seg)){
            if (d.seg){ d.seg = TUBE.paintTube(d.svg, d.d, parseFloat(w), d.stops, d.La); d.len = d.seg.len; }
            else {
              const bands = TUBE.paintStack(d.svg, d.d, parseFloat(w), d.stops, d.La);
              d.p = bands[0]; d.extra = bands.slice(1); d.len = d.p.getTotalLength();
              for (const b of bands) b.style.strokeDasharray = d.len;
            }
            setReveal(d, 1);
            continue;
          }
          d.p.setAttribute('stroke-width', w);
          if (d.casing) d.casing.setAttribute('stroke-width', (parseFloat(w)*1.55).toFixed(2));
        }
      }, {passive:true});
    }

  }

  /* Draw shaded if the module is there, flat if it is not. Never nothing. */
  if (SCRIPT_SRC){
    import(new URL('./tube.js', SCRIPT_SRC).href)
      .then(m => { TUBE = (m && m.paintStack && m.paintTube) ? m : null; })
      .then(() => import(new URL('../pages/home/data/strokes.js', SCRIPT_SRC).href)
                    .then(sm => sm.STROKES)
                    .catch(() => null))
      .then(ST => {
        POOL = buildPool(ST);
        if (ST) ST_RAMPS = { coral:ST.coral && ST.coral.colors, green:ST.green && ST.green.colors,
                             violet:ST.violet && ST.violet.colors, cyan:ST.cyan && ST.cyan.colors };
      })
      .catch(e => { console.warn('lines: tube surface unavailable, drawing flat.', e); })
      .then(start);
  } else {
    POOL = buildPool(null);        // no script src to resolve against: flat, hand curls only
  }

  window.__sectionLines = drawables;     // probe for verification
})();
