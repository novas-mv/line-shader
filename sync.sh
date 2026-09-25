#!/usr/bin/env bash
# Rebuild this repo's plugin from the site repo, which is the source of truth.
#   ./sync.sh ../site-repo
set -euo pipefail
SITE="${1:?usage: ./sync.sh <path to the site checkout>}"
HERE="$(cd "$(dirname "$0")" && pwd)"

[ -f "$SITE/tools/gen-figma-plugin.py" ] || { echo "not a site checkout: $SITE" >&2; exit 1; }

python3 "$SITE/tools/gen-figma-plugin.py"
python3 "$SITE/tools/gen-figma-plugin.py" --check

cp "$SITE/tools/figma-plugin/manifest.json" "$SITE/tools/figma-plugin/code.js" \
   "$SITE/tools/figma-plugin/ui.html" "$HERE/plugin/"
cp "$SITE/tools/figma-plugin/ui.template.html" "$SITE/tools/figma-plugin/verify.html" \
   "$SITE/tools/figma-plugin/test-crud.mjs" "$HERE/dev/"
cp "$SITE/tools/gen-figma-plugin.py" "$HERE/dev/"

# the browser studio, hosted from this repo, and the engine it loads at runtime
mkdir -p "$HERE/studio" "$HERE/system" "$HERE/pages/home/data"
# Everything copied from the site is published, so the event's name comes off
# on the way in. The site's own files keep it — they are not the ones going
# public. Matched by shape rather than spelled out, so this script does not
# itself carry the name it strips.
strip() {            # strip <src> <dest>
  sed -E \
    -e 's/^([[:space:]]*)[[:alnum:]]+ [[:alnum:]]+ [0-9]{4} (—|-) /\1/' \
    -e 's/[[:alnum:]]+ — line studio/Line studio/' \
    -e 's|^// Traced .* from .*|// Traced stroke spines.|' \
    -e 's/'"'"'[[:alnum:]]+ lines: /'"'"'lines: /' \
    -e 's/__[[:alnum:]]*SectionLines/__sectionLines/' \
    -e 's/[[:alnum:]]+-\$\{key\}/line-${key}/g' \
    "$1" > "$2"
}

strip "$SITE/tools/line-studio.html" "$HERE/studio/index.html"

strip "$SITE/system/tube.js"  "$HERE/system/tube.js"
strip "$SITE/system/lines.js" "$HERE/system/lines.js"
strip "$SITE/pages/home/data/strokes.js" "$HERE/pages/home/data/strokes.js"

node "$HERE/dev/test-crud.mjs"
echo "synced from $SITE — commit the diff"
