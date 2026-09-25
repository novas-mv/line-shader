# Line Shader

A Figma plugin that turns a pen-tool path into a shaded 3D-looking ribbon, using the same
shading code the website runs.

**Designers: you only need the [Install](#install) section.**

---

## Install

You need the plugin files on your Mac once.

1. Download this repo: green **Code** button → **Download ZIP**, then unzip it.
   (Or `git clone` if you have git.)
2. In Figma: **Plugins → Development → Import plugin from manifest…**
3. Choose **`plugin/manifest.json`** from the folder you unzipped.

It now appears under **Plugins → Development → Line Shader**. You only
do this once; it stays until you remove it.

> Keep the unzipped folder somewhere permanent (not Downloads). Figma reads the
> files from that location every time you run the plugin.

## Use

1. Draw a line with the **pen tool** (P).
2. Select it.
3. Run the plugin, pick a colour and weight, press **Apply**.

Three controls: **Colour**, **Weight**, **Light**. Everything else is already
calibrated and folded into **Advanced** — you should not need it.

### After it exists

| Do this | What happens |
|---|---|
| Select the ribbon | The panel reloads that ribbon's own settings |
| Change something → **Update** | Rebuilds it in place |
| Drag it | The curve travels inside it, so Update stays put |
| **Delete** | Removes the ribbon and hands your curve back, selected |
| **Edit spine** | Unlocks the curve to reshape, then Apply. Only in vector mode |

Delete gives the curve back rather than destroying it — you drew it.

### Raster or vectors

Apply **rasterises by default**, and that is the form you want. The vector form
is ~96 separate gradient shapes that Figma composites one at a time, so it looks
rougher than the plugin's own preview. The raster is drawn by the plugin itself,
so what you see in the preview is what lands on the canvas.

**Advanced → Vectors** if you specifically need editable shapes.
**Advanced → Raster** sets resolution, 2×–8× (default 4×). Raise it for print;
it caps at 4096px on the long edge and tells you when it does.

### If a pale band shows across a ribbon

**Advanced → Smooth ramp**, raise it to 5 or 6. Default is 3.

The brand ramps are 36 colours sampled per vertex off the traced artwork, so
they carry the tracing's noise — a couple of samples are visibly washed out.
Invisible at website size; printed large, each one reads as a pale band. Smooth
ramp averages those outliers back toward their neighbours.

---

## For whoever maintains this

`plugin/ui.html` is **generated**. The source of truth is the main site repo
(the site repo): `tools/figma-plugin/ui.template.html` plus `system/tube.js`
plus the ramps in `pages/home/data/strokes.js`. That is deliberate — the plugin
inlines the site's real shading code so the two cannot drift.

To update this repo after changing the site:

```bash
./sync.sh ../site-repo     # path to your site checkout
```

It regenerates `ui.html` in the site repo, copies the built plugin here, and
runs the checks.

### Checks

```bash
node dev/test-crud.mjs      # lifecycle + placement, against a fake Figma API
```

and open `dev/verify.html` in a browser for the shading/geometry/wiring
assertions.

**What these do not cover:** anything that only exists inside Figma. The
harnesses drive the plugin's main thread and assert the UI's wiring, but they
cannot press a button in Figma or see where a node really lands. Two bugs
shipped through exactly that gap. After any change, run the plugin once in
Figma and press **Apply**, **Edit spine** and **Delete**.

### The one deliberate difference from the website

The plugin sets `TUBE.smooth = 3`; the site leaves it `0`. The site has shipped
with the raw ramps and its colour is not the plugin's to change.
