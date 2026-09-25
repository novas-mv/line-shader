#!/usr/bin/env python3
"""Builds tools/figma-plugin/ui.html.

The plugin must shade exactly like the website does. Rather than keeping a
second copy of the shading maths and hoping the two stay in step, the real
system/tube.js is copied into the plugin bundle verbatim (module keywords
stripped, since the plugin UI is a classic script). Re-run this whenever
tube.js changes; check_sync() fails loudly if ui.html has fallen behind.

    python3 tools/gen-figma-plugin.py          # build
    python3 tools/gen-figma-plugin.py --check   # verify only, non-zero if stale
"""
import io, json, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
TUBE = ROOT / 'system' / 'tube.js'
STROKES = ROOT / 'pages' / 'home' / 'data' / 'strokes.js'
TPL = ROOT / 'tools' / 'figma-plugin' / 'ui.template.html'
OUT = ROOT / 'tools' / 'figma-plugin' / 'ui.html'


def engine() -> str:
    """tube.js as a classic script. Only the module keywords are removed —
    every line of maths is left exactly as the site runs it."""
    src = io.open(TUBE, encoding='utf-8').read()
    src = re.sub(r'^export\s+(function|const|let|class)\b', r'\1', src, flags=re.M)
    if re.search(r'^\s*(export|import)\b', src, flags=re.M):
        raise SystemExit('tube.js still has module syntax after stripping — '
                         'the plugin bundle would not parse. Check for a new '
                         'import or a non-leading export.')
    for needed in ('function paintTube', 'const TUBE'):
        if needed not in src:
            raise SystemExit('tube.js no longer defines "%s"; the plugin '
                             'depends on it.' % needed)
    return src


def ramps() -> str:
    """Just the colour ramps. The traced spine `d` strings are hundreds of KB
    and the plugin never draws them — the designer brings their own path."""
    src = io.open(STROKES, encoding='utf-8').read()
    m = re.search(r'export\s+const\s+STROKES\s*=\s*(\{.*\})\s*;?\s*$', src, re.S)
    if not m:
        raise SystemExit('could not find the STROKES object in strokes.js')
    data = json.loads(m.group(1))
    out = {k: {'colors': v['colors']} for k, v in data.items()
           if isinstance(v, dict) and v.get('colors')}
    if not out:
        raise SystemExit('no colour ramps found in strokes.js')
    return json.dumps(out, separators=(',', ':'))


def build() -> str:
    tpl = io.open(TPL, encoding='utf-8').read()
    for token in ('/* @@TUBE@@ */', '/* @@STROKES@@ */'):
        if token not in tpl:
            raise SystemExit('template is missing %s' % token)
    return tpl.replace('/* @@TUBE@@ */', engine()).replace('/* @@STROKES@@ */', ramps())


def syntax_check(html: str) -> None:
    """A generated bundle that does not parse fails inside Figma, where there
    is no console to read. Catch it here instead: the template once left a
    stray `{}` after the injected object and the whole UI died silently."""
    import subprocess, tempfile, os
    m = re.search(r'<script>([\s\S]*?)</script>', html)
    if not m:
        raise SystemExit('generated ui.html has no <script> block')
    fd, path = tempfile.mkstemp(suffix='.js')
    try:
        os.write(fd, m.group(1).encode('utf-8')); os.close(fd)
        r = subprocess.run(['node', '--check', path], capture_output=True, text=True)
        if r.returncode:
            raise SystemExit('generated ui.html does not parse:\n' +
                             (r.stderr or '').strip()[:800])
    except FileNotFoundError:
        print('warning: node not found, skipped the syntax check')
    finally:
        os.path.exists(path) and os.unlink(path)


if __name__ == '__main__':
    made = build()
    syntax_check(made)
    if '--check' in sys.argv:
        cur = io.open(OUT, encoding='utf-8').read() if OUT.exists() else ''
        if cur != made:
            sys.exit('STALE: tools/figma-plugin/ui.html is behind its sources. '
                     'Run: python3 tools/gen-figma-plugin.py')
        print('ui.html is in sync with tube.js and strokes.js')
    else:
        io.open(OUT, 'w', encoding='utf-8').write(made)
        print('wrote %s (%d KB)' % (OUT.relative_to(ROOT), len(made) // 1024))
