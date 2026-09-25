# Line Shader

Draw a line, get a shaded ribbon that looks three-dimensional.

**→ [Read this instead](https://novas-mv.github.io/line-shader/)** — same instructions, easier to follow, and the studio is one click away.

| | |
|---|---|
| **Studio** | <https://novas-mv.github.io/line-shader/studio/> — a web page, nothing to install |
| **Figma plugin** | [Download the ZIP](https://github.com/novas-mv/line-shader/archive/refs/heads/main.zip), then see below |

---

## Install the Figma plugin

1. [Download the ZIP](https://github.com/novas-mv/line-shader/archive/refs/heads/main.zip) and unzip it.
2. **Move the folder somewhere permanent** — Documents, not Downloads. Figma reads these files every time you run the plugin, so if the folder moves it stops working.
3. Figma → **Plugins → Development → Import plugin from manifest…**
4. Choose **`plugin/manifest.json`** inside that folder.

It appears under **Plugins → Development → Line Shader**. One time only.

## Use it

Draw a line with the **pen tool** (P), select it, run the plugin, press **Apply**.

Three controls: **Colour**, **Weight**, **Light**. Everything else is already set and folded into **Advanced**.

| Do this | What happens |
|---|---|
| Select the ribbon | The panel reloads that ribbon's settings |
| Change → **Update** | Rebuilds it in place |
| Drag it | Your curve travels inside it, so Update stays put |
| **Edit spine** | Unlocks your curve to reshape, then Apply |
| **Delete** | Removes the ribbon and gives your curve back |

## If something looks wrong

| Symptom | Fix |
|---|---|
| Pale band across the ribbon | **Advanced → Smooth ramp** → 5 or 6 |
| Rougher on canvas than in the preview | **Advanced → Vectors** is ticked; untick and Update |
| Blurry when printed large | **Advanced → Raster** → higher (4× default, 8× max) |
| Plugin vanished from Figma | The folder moved; unzip again somewhere permanent and re-import |

---

## Maintaining it

`plugin/ui.html`, `studio/` and `system/` are **generated and copied** from the site repo, which is the source of truth. The plugin inlines the site's real shading code so the two cannot drift.

```bash
./sync.sh ../site-repo
```

That regenerates the plugin, re-copies the studio and its engine, strips the project's name from everything it copies, and runs the checks. Commit the diff; Pages redeploys in about 25 seconds.

### Checks

```bash
node dev/test-crud.mjs     # lifecycle + placement, against a fake Figma API
```

and open `dev/verify.html` in a browser for the shading, geometry and wiring assertions.

**What they do not cover:** anything that only exists inside Figma. They drive the plugin's main thread and assert the UI is wired, but they cannot press a button in Figma or see where a node really lands. Two bugs shipped through exactly that gap. After any change, run the plugin once in Figma and press **Apply**, **Edit spine** and **Delete**.

### Layout

```
index.html    the page designers read
studio/       the browser studio
system/       shading engine + stroke data it loads at runtime
plugin/       what Figma imports
dev/          harnesses and the generator
sync.sh       rebuild everything from a site checkout
```
