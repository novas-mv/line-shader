/* Runs code.js against a fake Figma API and exercises the whole lifecycle:
   create -> flatten -> edit spine -> update -> delete.

   This exists because the plugin's failures keep being structural rather than
   visual, and none of them are reachable from a browser. flatten() destroyed
   the frame holding the hidden spine, so a flattened ribbon had no curve left
   and Edit spine silently did nothing — and flatten is the default, so that
   was almost every ribbon. A fake API catches that with no Figma round trip.

   Run:  node tools/figma-plugin/test-crud.mjs                                */
import { readFileSync, existsSync } from 'node:fs';

/* This file is used from two layouts: beside code.js in the site repo, and in
   dev/ next to a plugin/ folder in the standalone plugin repo. Resolving both
   keeps sync.sh a straight copy — the alternative was patching the copy after
   every sync, which meant the next sync silently undid it. */
const CODE = ['../plugin/code.js', './code.js']
  .map(p => new URL(p, import.meta.url))
  .find(u => existsSync(u));
if (!CODE) throw new Error('cannot find code.js beside this file or in ../plugin/');

let uid = 0;

/* Coordinate model. The first version of this fake ignored coordinate spaces
   entirely, which made it blind to the whole class of bug that actually bites:
   in Figma a node's x/y are RELATIVE to its parent's origin, and appendChild
   keeps those numbers rather than the absolute position — so reparenting a
   node into a frame moves it on the canvas. A FRAME establishes an origin; a
   GROUP is transparent and takes its parent's. Modelling that is the only way
   a harness can catch "Edit spine hands back a curve nowhere near the ribbon".

   _x/_y are parent-relative, matching Figma. absoluteTransform is derived. */
const originOf = node => {
  if (!node || node.type === 'PAGE') return { x: 0, y: 0 };
  if (node.type === 'FRAME') return absOf(node);
  return originOf(node.parent);            // GROUP is transparent
};
const absOf = node => {
  const o = originOf(node.parent);
  return { x: o.x + node._x, y: o.y + node._y };
};

const mk = (type, extra = {}) => {
  const n = {
    id: 'n' + (++uid), type, children: [], parent: null, name: '',
    _x: 0, _y: 0, width: 100, height: 100, visible: true, locked: false,
    fills: [], strokes: [], vectorPaths: null, _data: {},
    get absoluteTransform(){ const a = absOf(this); return [[1,0,a.x],[0,1,a.y]]; },
    setPluginData(k, v){ this._data[k] = v; },
    getPluginData(k){ return this._data[k] || ''; },
    appendChild(c){
      if (c.parent) c.parent.children = c.parent.children.filter(x => x !== c);
      c.parent = this; this.children.push(c);   // relative x/y kept, as Figma does
    },
    remove(){
      if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this);
      this.parent = null; this._removed = true;
    },
    resize(w, h){ this.width = w; this.height = h; },
    ...extra
  };
  if (type === 'GROUP'){
    /* A group's position is its children's bounding box, so anything that moves
       a child moves the group's reported x. Code that anchors off group.x is
       wrong the moment Edit spine unhides a spine that sticks out. */
    Object.defineProperty(n, 'x', {
      get(){ return this.children.length ? Math.min(...this.children.map(c => c._x)) : this._x; },
      set(v){ const d = v - this.x; for (const c of this.children) c._x += d; }
    });
    Object.defineProperty(n, 'y', {
      get(){ return this.children.length ? Math.min(...this.children.map(c => c._y)) : this._y; },
      set(v){ const d = v - this.y; for (const c of this.children) c._y += d; }
    });
  } else {
    Object.defineProperty(n, 'x', { get(){ return this._x; }, set(v){ this._x = v; } });
    Object.defineProperty(n, 'y', { get(){ return this._y; }, set(v){ this._y = v; } });
  }
  return n;
};

const page = mk('PAGE');
page.selection = [];
const notices = [];

globalThis.figma = {
  currentPage: page,
  showUI(){}, ui: { postMessage(){}, onmessage: null }, on(){},
  notify(m, o){ notices.push({ m, error: !!(o && o.error) }); },
  createVector(){ const n = mk('VECTOR'); page.appendChild(n); return n; },
  createRectangle(){ const n = mk('RECTANGLE'); page.appendChild(n); return n; },
  createImage(b){ if (!b || !b.length) throw new Error('empty image'); return { hash: 'h' + b.length }; },
  createNodeFromSvg(){
    const f = mk('FRAME'); f.width = 300; f.height = 200;
    for (let i = 0; i < 4; i++) f.appendChild(mk('VECTOR'));
    page.appendChild(f); return f;
  },
  group(nodes, parent){
    /* figma.group keeps children where they are on the canvas */
    const g = mk('GROUP');
    const keep = nodes.map(n => absOf(n));
    parent.appendChild(g);
    nodes.forEach((n, i) => {
      g.appendChild(n);
      const o = originOf(g);
      n._x = keep[i].x - o.x; n._y = keep[i].y - o.y;
    });
    return g;
  }
};

const ABS = n => { const t = n.absoluteTransform; return { x: t[0][2], y: t[1][2] }; };

new Function('figma', '__html__', readFileSync(CODE, 'utf8'))(globalThis.figma, '<html/>');
const send = async msg => { await globalThis.figma.ui.onmessage(msg); };

const SPINE_D = 'M 0 0 L 10 10';
const base = { d: SPINE_D, hue: 'coral', w: 68, light: 140, segs: 96,
               stops: 13, con: 42, sheen: 18, sss: 20, wrap: 66, smooth: 3 };
const png = new Uint8Array([1,2,3,4]);
const apply = flat => ({ type: 'svg', svg: '<svg/>', offset: { x: 5, y: 7 },
                         png, size: { w: 300, h: 200 },
                         settings: { ...base, flatten: flat } });

const fails = [];
let n = 0;
const ok = (name, cond, detail = '') => { n++; if (!cond) fails.push(name + (detail ? ' — ' + detail : '')); };
const spineOf = x => x && x.children && x.children.find(c => c.name === 'vara-spine');

const drawn = figma.createVector();
drawn.vectorPaths = [{ data: SPINE_D }];
page.selection = [drawn];
await send(apply(true));
const ribbon = page.selection[0];
ok('flatten produces a container, not a bare rectangle', ribbon.type === 'GROUP', ribbon.type);
ok('the flattened ribbon keeps its spine', !!spineOf(ribbon));
ok('that spine is hidden and locked', !!spineOf(ribbon) && !spineOf(ribbon).visible && spineOf(ribbon).locked);
ok('it holds a raster', ribbon.children.some(c => c.type === 'RECTANGLE'));
ok('settings survive the flatten', (JSON.parse(ribbon.getPluginData('vara-spine') || '{}')).hue === 'coral');

page.selection = [ribbon];
await send({ type: 'edit' });
const edited = page.selection[0];
ok('edit spine selects the curve', !!edited && edited.name === 'vara-spine', edited && edited.type);
ok('edit spine unhides and unlocks it', !!edited && edited.visible && !edited.locked);
ok('edit spine raised no error', !notices.some(x => x.error), JSON.stringify(notices.filter(x => x.error)));

page.selection = [ribbon];
await send(apply(true));
const updated = page.selection[0];
ok('update returns a ribbon', !!updated && updated.getPluginData('vara-spine') !== '');
ok('update keeps the spine', !!spineOf(updated));
ok('the previous ribbon is gone', ribbon._removed || ribbon === updated);

page.selection = [updated];
await send(apply(false));
const vec = page.selection[0];
ok('switching to vectors gives a frame', vec.type === 'FRAME', vec.type);
ok('the vector form keeps the spine', !!spineOf(vec));

page.selection = [vec];
await send({ type: 'delete' });
const back = page.selection[0];
ok('delete hands the curve back, visible and unlocked', !!back && back.visible && !back.locked, back && back.type);
ok('delete removed the ribbon', vec._removed);

/* ---- position, which is what the old fake could not see -----------------
   The designer drew the curve somewhere. Every operation must hand it back in
   the SAME place on the canvas. Reparenting is where this goes wrong: the x/y
   that survive an appendChild are parent-relative, so moving a spine into a
   frame silently moves it by the frame's origin. */
{
  const DRAWN = { x: 420, y: 260 };
  const near = (a, b, t = 0.51) => Math.abs(a - b) <= t;

  const frame = mk('FRAME'); frame._x = 120; frame._y = 90; page.appendChild(frame);
  const curve = figma.createVector();
  curve.vectorPaths = [{ data: SPINE_D }];
  frame.appendChild(curve);
  curve.x = DRAWN.x - 120; curve.y = DRAWN.y - 90;      // drawn inside an artboard
  const drawnAbs = ABS(curve);

  page.selection = [curve];
  await send(apply(true));
  const rib = page.selection[0];
  ok('a ribbon drawn inside a frame stays in that frame',
     rib.parent === frame, rib.parent && rib.parent.type);

  const sp = spineOf(rib);
  ok('the spine survives into the flattened ribbon', !!sp);
  ok('the spine is still where it was drawn',
     !!sp && near(ABS(sp).x, drawnAbs.x) && near(ABS(sp).y, drawnAbs.y),
     sp ? `drawn ${drawnAbs.x},${drawnAbs.y} -> now ${ABS(sp).x},${ABS(sp).y}` : 'no spine');

  page.selection = [rib];
  await send({ type: 'edit' });
  const shown = page.selection[0];
  ok('edit spine hands the curve back in the same place',
     !!shown && near(ABS(shown).x, drawnAbs.x) && near(ABS(shown).y, drawnAbs.y),
     shown ? `${ABS(shown).x},${ABS(shown).y} vs ${drawnAbs.x},${drawnAbs.y}` : 'nothing selected');

  page.selection = [rib];
  await send(apply(true));
  const rib2 = page.selection[0];
  const sp2 = spineOf(rib2);
  ok('re-applying does not walk the curve across the canvas',
     !!sp2 && near(ABS(sp2).x, drawnAbs.x) && near(ABS(sp2).y, drawnAbs.y),
     sp2 ? `${ABS(sp2).x},${ABS(sp2).y} vs ${drawnAbs.x},${drawnAbs.y}` : 'no spine');

  page.selection = [rib2];
  await send({ type: 'delete' });
  const given = page.selection[0];
  ok('delete returns the curve where it was drawn',
     !!given && near(ABS(given).x, drawnAbs.x) && near(ABS(given).y, drawnAbs.y),
     given ? `${ABS(given).x},${ABS(given).y} vs ${drawnAbs.x},${drawnAbs.y}` : 'nothing');
}

/* The same journey in VECTOR mode. This is the one that matters: the flattened
   form parks the spine in a GROUP, which is coordinate-transparent, while the
   vector form parks it in a FRAME, which establishes an origin — so only this
   path exercises the reparent shift. */
{
  const near = (a, b, t = 0.51) => Math.abs(a - b) <= t;
  const frame = mk('FRAME'); frame._x = 200; frame._y = 140; page.appendChild(frame);
  const curve = figma.createVector();
  curve.vectorPaths = [{ data: SPINE_D }];
  frame.appendChild(curve);
  curve.x = 300; curve.y = 180;
  const drawnAbs = ABS(curve);

  page.selection = [curve];
  await send(apply(false));
  const rib = page.selection[0];
  ok('vector ribbon is a frame', rib.type === 'FRAME', rib.type);
  const sp = spineOf(rib);
  ok('vector ribbon keeps its spine', !!sp);
  ok('the spine does not move when it is reparented into the ribbon frame',
     !!sp && near(ABS(sp).x, drawnAbs.x) && near(ABS(sp).y, drawnAbs.y),
     sp ? `drawn ${drawnAbs.x},${drawnAbs.y} -> now ${ABS(sp).x},${ABS(sp).y}` : 'no spine');

  page.selection = [rib];
  await send({ type: 'edit' });
  const shown = page.selection[0];
  ok('edit spine on a vector ribbon returns the curve in place',
     !!shown && near(ABS(shown).x, drawnAbs.x) && near(ABS(shown).y, drawnAbs.y),
     shown ? `${ABS(shown).x},${ABS(shown).y} vs ${drawnAbs.x},${drawnAbs.y}` : 'nothing');

  page.selection = [rib];
  await send(apply(false));
  const sp2 = spineOf(page.selection[0]);
  ok('updating a vector ribbon does not walk the curve',
     !!sp2 && near(ABS(sp2).x, drawnAbs.x) && near(ABS(sp2).y, drawnAbs.y),
     sp2 ? `${ABS(sp2).x},${ABS(sp2).y} vs ${drawnAbs.x},${drawnAbs.y}` : 'no spine');
}

const legacy = figma.createRectangle();
legacy.setPluginData('vara-spine', JSON.stringify({ ...base, offX: 5, offY: 7 }));
page.selection = [legacy];
await send({ type: 'edit' });
const rebuilt = page.selection[0];
ok('a spineless ribbon from an older build rebuilds its curve',
   !!rebuilt && rebuilt.type === 'VECTOR', rebuilt && rebuilt.type);

console.log(fails.length ? 'FAIL (' + fails.length + '/' + n + ')\n  ' + fails.join('\n  ')
                         : 'PASS — ' + n + ' checks');
process.exit(fails.length ? 1 : 0);
