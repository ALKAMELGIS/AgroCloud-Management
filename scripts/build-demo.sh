#!/usr/bin/env bash
# Builds the self-contained demo (in-browser demo data, no server needed) into build-demo/.
# Used by the published demo page and by the Android APK (android-app/).
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)
TMP=$(mktemp -d)
cp src/App.js "$TMP/App.js"; cp src/index.js "$TMP/index.js"
restore() { cp "$TMP/App.js" "$ROOT/src/App.js"; cp "$TMP/index.js" "$ROOT/src/index.js"; }
trap restore EXIT
# Hash routes and no service worker: the demo runs from a static folder or inside a WebView.
sed -i 's/BrowserRouter/HashRouter/g' src/App.js
sed -i 's/^serviceWorkerRegistration.register({/serviceWorkerRegistration.unregister(); (() => ({/; s/^});$/}))();/' src/index.js
rm -rf build-demo
GENERATE_SOURCEMAP=false PUBLIC_URL=. BUILD_PATH=build-demo npx react-scripts build
cd build-demo
find . -name "service-worker*" -delete
find . -name "*.LICENSE.txt" -delete
python3 - <<'PY'
import re
s = open('index.html').read()
s = s.replace('<head>', '<head><script>' + open('../demo/demo-shim.js').read() + '</script>', 1)
s = re.sub(r'<title>.*?</title>', '<title>AgroCloud Management</title>', s)
s = s.replace('content="Al Maha Farm"', 'content="AgroCloud"')
open('index.html', 'w').write(s)
# Installable from any folder (GitHub Pages project site, iPhone "Add to Home Screen").
import json
m = json.load(open('manifest.json'))
m.update({'short_name': 'AgroCloud', 'name': 'AgroCloud Management', 'start_url': './', 'scope': './'})
json.dump(m, open('manifest.json', 'w'), ensure_ascii=False, indent=2)
PY
# Copy of the structures layer for pages that may not read ArcGIS directly.
cp ../demo/agro_structures.meta.json . 2>/dev/null || true
cp ../demo/agro_structures.geojson . 2>/dev/null || true
echo "build-demo ready"
