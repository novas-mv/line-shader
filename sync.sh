#!/usr/bin/env bash
# Rebuild this repo's plugin from the site repo, which is the source of truth.
#   ./sync.sh ../vara-expo-2026
set -euo pipefail
SITE="${1:?usage: ./sync.sh <path to vara-expo-2026 checkout>}"
HERE="$(cd "$(dirname "$0")" && pwd)"

[ -f "$SITE/tools/gen-figma-plugin.py" ] || { echo "not a vara-expo-2026 checkout: $SITE" >&2; exit 1; }

python3 "$SITE/tools/gen-figma-plugin.py"
python3 "$SITE/tools/gen-figma-plugin.py" --check

cp "$SITE/tools/figma-plugin/manifest.json" "$SITE/tools/figma-plugin/code.js" \
   "$SITE/tools/figma-plugin/ui.html" "$HERE/plugin/"
cp "$SITE/tools/figma-plugin/ui.template.html" "$SITE/tools/figma-plugin/verify.html" \
   "$SITE/tools/figma-plugin/test-crud.mjs" "$HERE/dev/"
cp "$SITE/tools/gen-figma-plugin.py" "$HERE/dev/"

node "$HERE/dev/test-crud.mjs"
echo "synced from $SITE — commit the diff"
