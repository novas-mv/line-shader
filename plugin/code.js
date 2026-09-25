/* VARA — line shader (Figma plugin, main thread)
   ---------------------------------------------------------------------------
   The designer draws a spine with Figma's pen tool. This turns that spine into
   the site's shaded ribbon as NATIVE Figma vectors, so it stays editable and
   never has to leave Figma as a PNG.

   Why the work is split: the shading needs SVG geometry sampling
   (getPointAtLength), and the plugin main thread has no DOM. The UI iframe is
   a real browser, so it runs the site's own paintTube and posts the resulting
   SVG back here. This file only turns that into Figma nodes — it contains no
   shading maths of its own, which is what keeps it from drifting away from the
   website. The one deliberate difference is TUBE.smooth, which the plugin sets
   and the site does not; see the README.

   THE SPINE LIVES INSIDE THE RIBBON. A ribbon whose source curve was left
   loose on the canvas is a dead end: you cannot reshape it, and moving the
   ribbon leaves its curve behind. The spine is carried as a hidden, locked
   child, so the ribbon is one self-contained thing you can move, re-shade,
   reshape, or throw away. */

const GROUP = 'vara-ribbon';
const SPINE = 'vara-spine';
const DATA  = 'vara-spine';          // settings stashed on the ribbon

figma.showUI(__html__, { width: 300, height: 470 });

/* ---- finding things ----------------------------------------------------- */
function pathOf(node){
  if (node && node.type === 'VECTOR' && node.vectorPaths && node.vectorPaths.length)
    return node.vectorPaths.map(p => p.data).join(' ');
  return null;
}

/* A ribbon can be selected by clicking the group, or by clicking one segment
   inside it, or by selecting the spine after Edit. All three should mean the
   same ribbon, so walk up until we find the node carrying the settings. */
function ribbonOf(node){
  for (let n = node; n; n = n.parent){
    if (n.getPluginData && n.getPluginData(DATA)) return n;
    if (n.type === 'PAGE') break;
  }
  return null;
}

function spineIn(group){
  if (!group || !group.children) return null;
  return group.children.find(c => c.name === SPINE) || null;
}

function settingsOf(node){
  try { return JSON.parse(node.getPluginData(DATA) || '{}'); }
  catch { return {}; }
}

/* ---- what is selected --------------------------------------------------- */
function currentSpine(){
  const sel = figma.currentPage.selection;
  if (sel.length !== 1)
    return { err: sel.length ? 'Select one path or ribbon.' : 'Select a path first.' };

  const node = sel[0];
  const ribbon = ribbonOf(node);

  if (ribbon){
    const s = settingsOf(ribbon);
    const spine = spineIn(ribbon);
    const d = pathOf(spine) || s.d;
    if (!d) return { err: 'That ribbon has lost its spine. Delete and redraw it.' };
    const anchor = spine || ribbon;
    return { d, settings: s, exists: true, x: anchor.x, y: anchor.y };
  }

  const d = pathOf(node);
  if (!d) return { err: 'That is not a path. Draw one with the pen tool.' };
  return { d, exists: false, x: node.x, y: node.y };
}

/* ---- position ------------------------------------------------------------
   Everything here works in ABSOLUTE canvas coordinates, never in a parent's.
   node.x is relative to whatever currently contains the node, and appendChild
   keeps that number rather than the position on screen — so moving the spine
   into the ribbon it belongs to silently shifted it by the ribbon's own
   origin, and Edit spine handed back a curve nowhere near its ribbon. A frame
   establishes an origin and a group does not, which made the bug appear only
   in vector mode. Reading and writing through absoluteTransform sidesteps the
   distinction instead of trying to reason about it. */
function absOf(node){
  const t = node.absoluteTransform;
  return { x: t[0][2], y: t[1][2] };
}
function moveAbs(node, ax, ay){
  const a = absOf(node);
  node.x += ax - a.x;
  node.y += ay - a.y;
}

/* The SVG viewBox starts at the ribbon's own box, which is wider than the
   spine's. `offset` is that difference, so anchor + offset is where the
   imported artwork must sit for the ribbon to land ON the curve. It is stored
   so a ribbon whose spine is gone can still be rebuilt in place. */
function importSvg(svg){
  const frame = figma.createNodeFromSvg(svg);
  frame.name = GROUP;
  frame.clipsContent = false;
  return frame;
}

/* Where the curve actually is. The spine itself is the truth when it is still
   there; anchoring off the ribbon's own x is wrong for a GROUP, whose x is its
   children's bounding box and therefore moves the moment Edit spine unhides a
   spine that sticks out past the artwork. */
function anchorOf(ribbon){
  const spine = spineIn(ribbon);
  if (spine) return absOf(spine);
  const prev = settingsOf(ribbon), a = absOf(ribbon);
  return { x: a.x - (prev.offX || 0), y: a.y - (prev.offY || 0) };
}

function build(parent, svg, anchor, offset, spine, settings){
  const frame = importSvg(svg);
  parent.appendChild(frame);
  moveAbs(frame, anchor.x + offset.x, anchor.y + offset.y);
  if (spine){
    frame.appendChild(spine);
    moveAbs(spine, anchor.x, anchor.y);      // put it back where it was drawn
    spine.name = SPINE; spine.visible = false; spine.locked = true;
  }
  frame.setPluginData(DATA, JSON.stringify({ ...settings, offX: offset.x, offY: offset.y }));
  return frame;
}

function create(spineNode, svg, offset, settings){
  return build(spineNode.parent || figma.currentPage, svg,
               absOf(spineNode), offset, spineNode, settings);
}

function update(ribbon, svg, offset, settings){
  const anchor = anchorOf(ribbon);
  const spine = spineIn(ribbon);
  const frame = build(ribbon.parent || figma.currentPage, svg, anchor, offset, spine, settings);
  ribbon.remove();
  return frame;
}

/* ---- flatten ------------------------------------------------------------
   Note this CANNOT be figma.flatten(). Flattening merges the quads into one
   vector, and one vector carries one fill — which would throw away the 72
   gradients that are the whole shading. Flatten here means rasterise: export
   the group and put it back as an image, keeping the settings (spine included)
   on the node so it can be re-shaded or deleted like any other ribbon. */
/* The pixels come from the UI iframe, NOT from exportAsync. Exporting the node
   rasterises Figma's own rendering — the one that shows every quad as its own
   polygon — so flattening used to preserve the exact artifact it was meant to
   remove. The iframe is a real browser and blends the ribbon into one surface,
   so those are the pixels worth keeping. */
async function flatten(node, png, size){
  if (!png || !png.length) throw new Error('no rasterised image was supplied');
  const bytes = png instanceof Uint8Array ? png
              : (png && typeof png.length === 'number') ? new Uint8Array(png)
              : null;
  if (!bytes || !bytes.length) throw new Error('the rasterised image did not survive the hand-off');
  const img = figma.createImage(bytes);
  const art = absOf(node);                      // where the artwork sits NOW
  const spineAt = spineIn(node) ? absOf(spineIn(node)) : null;
  const r = figma.createRectangle();
  r.resize(Math.max(size && size.w ? size.w : node.width, 1),
           Math.max(size && size.h ? size.h : node.height, 1));
  /* FIT, not FILL: FILL crops to the rectangle's aspect and trims the ends off
     a ribbon whose box is not the image's shape. */
  r.fills = [{ type: 'IMAGE', imageHash: img.hash, scaleMode: 'FIT' }];
  r.name = 'vara-raster';
  const parent = node.parent || figma.currentPage;
  parent.appendChild(r);
  moveAbs(r, art.x, art.y);

  /* Carry the curve across. Flatten used to return a bare rectangle and then
     node.remove() destroyed the frame WITH the hidden spine inside it, so a
     flattened ribbon had no curve left: Edit spine did nothing, and since
     flatten is the default that meant it did nothing for almost everyone.
     Wrapping the image and the spine together keeps a flattened ribbon
     structurally identical to a vector one, so edit, update and delete all
     keep working on it. The spine must move out BEFORE the frame is removed. */
  const spine = spineIn(node);
  const g = figma.group([r], parent);
  g.name = GROUP + ' (flattened)';
  if (spine){
    g.appendChild(spine);
    if (spineAt) moveAbs(spine, spineAt.x, spineAt.y);   // reparenting must not move it
    spine.name = SPINE; spine.visible = false; spine.locked = true;
  }
  g.setPluginData(DATA, node.getPluginData(DATA));
  node.remove();
  return g;
}

/* ---- delete / edit ------------------------------------------------------
   Deleting gives the curve BACK rather than destroying it: you drew it, and
   losing it to a button press would be its own bug. */
function destroy(ribbon){
  const parent = ribbon.parent || figma.currentPage;
  const at = anchorOf(ribbon);            // absolute, and offset-aware
  let spine = spineIn(ribbon);
  if (!spine){
    const s = settingsOf(ribbon);
    if (s.d){
      spine = figma.createVector();
      spine.vectorPaths = [{ windingRule: 'NONZERO', data: s.d }];
    }
  }
  if (spine){
    parent.appendChild(spine);
    moveAbs(spine, at.x, at.y);
    spine.name = 'spine';
    spine.visible = true;
    spine.locked = false;
    spine.strokes = [{ type: 'SOLID', color: { r: .6, g: .6, b: .6 } }];
    spine.setPluginData(DATA, '');
  }
  ribbon.remove();
  return spine;
}

/* Ribbons flattened by an older build have no spine child, only the path in
   their settings. Rebuild it rather than refusing: the curve is recoverable,
   so refusing would be throwing away work the designer still has. */
function editSpine(ribbon){
  let spine = spineIn(ribbon);
  if (!spine){
    const s = settingsOf(ribbon);
    if (!s.d) throw new Error('that ribbon has lost its spine');
    const at = anchorOf(ribbon);
    spine = figma.createVector();
    spine.vectorPaths = [{ windingRule: 'NONZERO', data: s.d }];
    if (ribbon.type === 'GROUP' || ribbon.type === 'FRAME') ribbon.appendChild(spine);
    else (ribbon.parent || figma.currentPage).appendChild(spine);
    moveAbs(spine, at.x, at.y);
    spine.name = SPINE;
  }
  spine.visible = true;
  spine.locked = false;
  spine.strokes = [{ type: 'SOLID', color: { r: .6, g: .6, b: .6 } }];
  return spine;
}

/* ---- messages ----------------------------------------------------------- */
figma.ui.onmessage = async msg => {
  try {
    if (msg.type === 'need-spine'){
      figma.ui.postMessage({ type: 'spine', ...currentSpine() });
      return;
    }

    if (msg.type === 'svg'){
      const sel = figma.currentPage.selection[0];
      const ribbon = sel && ribbonOf(sel);
      let out;
      if (ribbon)                             out = update(ribbon, msg.svg, msg.offset, msg.settings);
      else if (!sel)                          { figma.notify('Select a path first.'); return; }
      else                                    out = create(sel, msg.svg, msg.offset, msg.settings);
      if (msg.settings.flatten && out.type === 'FRAME') out = await flatten(out, msg.png, msg.size);
      figma.currentPage.selection = [out];
      figma.notify(ribbon ? 'Ribbon updated.' : 'Ribbon shaded.');
      figma.ui.postMessage({ type: 'spine', ...currentSpine() });
      return;
    }

    if (msg.type === 'delete'){
      const sel = figma.currentPage.selection[0];
      const ribbon = sel && ribbonOf(sel);
      if (!ribbon){ figma.notify('Select a ribbon to delete.'); return; }
      const spine = destroy(ribbon);
      figma.currentPage.selection = spine ? [spine] : [];
      figma.notify(spine ? 'Ribbon removed, curve kept.' : 'Ribbon removed.');
      figma.ui.postMessage({ type: 'spine', ...currentSpine() });
      return;
    }

    if (msg.type === 'edit'){
      const sel = figma.currentPage.selection[0];
      const ribbon = sel && ribbonOf(sel);
      if (!ribbon){ figma.notify('Select a ribbon first.'); return; }
      const spine = editSpine(ribbon);
      figma.currentPage.selection = [spine];
      figma.notify('Spine unlocked — reshape it, then Apply.');
      return;
    }

    if (msg.type === 'close') figma.closePlugin();
  } catch (e){
    const m = e && e.message ? e.message : String(e);
    figma.notify('Failed: ' + m, { error: true });
    figma.ui.postMessage({ type: 'error', message: m });
  }
};

figma.on('selectionchange', () => figma.ui.postMessage({ type: 'spine', ...currentSpine() }));
